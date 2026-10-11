# 变更提案：add-reasoning-effort-and-ip-columns

## 背景

通用日志页（`/usage-logs/common`）的表格当前不展示「推理强度」与「请求 IP」两项信息。用户排查请求时，需逐条点开详情弹窗才能看到，操作成本高。

用户诉求原文：「将推理强度也展示出来」「同时将请求的 ip 地址也展示出来」。

两项数据后端均已落库，本次为**纯前端展示层变更**，不修改 Go 代码：

- 推理强度：`service/log_info_generate.go:112` 在 `relayInfo.ReasoningEffort != ""` 时写入 `other.reasoning_effort`；前端 `types.ts:228` 已声明 `reasoning_effort?: string`
- 请求 IP：`model/log.go:75` 字段 `Ip`，JSON tag `ip`；前端 `data/schema.ts:44` 已声明 `ip: z.string().default('')`

**IP 数据的前提约束（重要）：** 日志 IP 受用户级开关 `RecordIpLog` 控制（`relaykit/dto/user_settings.go:15`，默认 `false`），仅在 `model/log.go:286-289`（error 日志）与 `352-355`（consume 日志）两处判断通过时才写入 `c.ClientIP()`，否则落空串。用户入口为「安全 → 隐私 → Record IP Address」（`web/src/features/security/components/privacy-card.tsx`）。因此**未开启该设置的用户，展示类日志的 IP 列将显示 `-`**。这是既有隐私设计的预期行为，本次不改变。

## 目标范围

**在范围内：**

- 在通用日志表格新增「推理强度」列，位置紧跟「模型」列（`model_name`）之后
- 在通用日志表格新增「请求 IP」列，位置排在「详情」列（`content`）之前
- 推理强度列复用既有 `getReasoningEffortVariant`（`lib/format.ts:173`）着色，与详情弹窗规则一致
- 请求 IP 列纳入现有 `sensitiveVisible` 脱敏开关，隐藏时显示 `••••`
- **详情弹窗的 IP 展示同步纳入脱敏**，消除「表格 `••••` / 弹窗明文」的旁路不一致
- 两列默认可见，且均支持通过既有列显隐菜单（View）关闭
- 补充回归测试，覆盖两列的取值、着色、脱敏与空值行为

**不在范围内：**

- 不修改任何 Go 代码、数据库结构或 API 契约（数据已存在）
- 不改变 `RecordIpLog` 开关语义（保持默认关闭；开启后才记录 IP）
- **不改动移动端卡片布局**（`common-log-mobile-card.tsx` 字段列表保持 `['user','channel','token','group']`）。经用户确认，本次仅覆盖桌面端表格列
- 不做 IP 地理位置解析（截图中的 CN·Beijing 本仓库无此能力，需引入外部 GeoIP 数据源，另立变更）
- 不展示请求端点（`/v1/messages`），本次仅两项
- 不改变详情弹窗中 IP 的显隐门控（`showAdminIp`，仅叠加脱敏，不扩大或缩小显示范围）
- 不修改 `audit-log-details-dialog.tsx`（审计日志为独立 feature，有其自己的 IP 展示）

## 技术方案

**复用既有实现（遵循 AGENTS.md 前端复用优先约束）：**

| 用途 | 复用对象 | 路径 |
|---|---|---|
| 推理强度着色 | `getReasoningEffortVariant(effort)` | `web/src/features/usage-logs/lib/format.ts:173` |
| 徽标渲染 | `StatusBadge` | `@/components/status-badge`（详情弹窗同款用法 `details-dialog.tsx:1120`） |
| `other` 字段解析 | `parseLogOther(log.other)` | `web/src/features/usage-logs/lib/format.ts:162` |
| 日志类型门控 | `isDisplayableLogType(type)` | `web/src/features/usage-logs/lib/utils.ts:52` |
| 脱敏状态（列） | `useUsageLogsContext().sensitiveVisible` | 既有 context，与 Token/User/Channel 列同款用法 |
| 列显隐 | TanStack Table `accessorFn` + `getCanHide()` | 既有机制 |

**能力缺口说明：** 本次不新增任何组件。两列均为 `useCommonLogsColumns` 内的内联 cell 渲染，符合 AGENTS.md「先复用、无缺口不新建」的要求。

**关键技术约束 1 — 列显隐需 `accessorFn`：** `web/src/components/data-table/toolbar/view-options.tsx:46-49` 的列显隐菜单过滤条件是 `typeof column.accessorFn !== 'undefined' && column.getCanHide()`。**只给 `id` 而不给 `accessorFn` 的列不会出现在 View 菜单中**。仓库既有先例：`channel` 列为 `id: 'channel'` + `accessorFn: (row) => row.channel`（`:388-390`），`user` 列为 `id: 'user'` + `accessorFn: (row) => row.username`（`:548-550`）。推理强度列须遵循同一模式。

**关键技术约束 2 — Hook 必须在顶部无条件调用：** 列 cell 内若需读取 context，必须**先**无条件调用 `useUsageLogsContext()`，**再**执行任何 `return null` 早退。既有 Token 列（`common-logs-columns.tsx:611-615`）正是此顺序：

```
cell: function TokenNameCell({ row }) {
  const { sensitiveVisible } = useUsageLogsContext()   // 先，无条件
  const log = row.original
  if (!isDisplayableLogType(log.type)) return null     // 后，可早退
```

反序（先 `return null` 再调 Hook）属条件调用 Hook，会触发 "Rendered fewer hooks than expected" 运行时崩溃。

**关键技术约束 3 — 弹窗不能用 context，须走 props：** `DetailsDialog` 在多个测试中被直接渲染（`reject-reason.test.tsx:65`、`usage-facts.test.tsx:81`、`quota-adjustment.test.tsx:80`），不一定位于 `UsageLogsProvider` 内，而 `useUsageLogsContext` 在 Provider 外会 `throw`（`usage-logs-provider.tsx:91`）。因此弹窗的脱敏状态须新增可选 prop 传入，调用点（`common-logs-columns.tsx:879`，位于 `DetailsCell` 内）从 context 取值后透传；prop 缺省时退化为「可见」，保持既有测试与既有行为不变。

**关键技术约束 4 — 两个既有测试文件须补 Provider：** `DetailsCell`（`common-logs-columns.tsx:809`）内新增 `useUsageLogsContext()` 后，凡以 `flexRender` 直渲 `content` 列 cell 的测试都会因缺 Provider 而 `throw`。实测受影响的是 `detail-preview.test.tsx`（`:38` 导入 `useCommonLogsColumns`、`:83` 调用、`:145` 断言 `findByRole('dialog')`）与 `quota-adjustment.test.tsx`（`:48` 导入、`:68` 调用、`:80` 直接渲染 `<DetailsDialog>`）——两者均**无** `UsageLogsProvider` 包裹。任务 3 须同时为这两个文件补上包裹；Provider 内 `sensitiveVisible` 初始值为 `true`（`usage-logs-provider.tsx:63`），故补包裹后两文件既有断言行为不变。

**空值与类型门控约定（与既有列保持一致）：**

- 非展示类日志（type∉{0,2,5,6}，即充值 1 / 管理 3 / 系统 4 / 登录 7，见 `constants.ts:92-97` 的 `LOG_TYPES`）：先 `if (!isDisplayableLogType(log.type)) return null`，两列均**不渲染任何内容**（与既有 5 处列一致：`:399、615、677、724、771`）
- 展示类但无值：渲染 `-` 占位（与 Tokens 列 `:730-732` 一致）

**改动文件（2 个生产文件 + 4 个既有测试文件，均不新建）：**

- `web/src/features/usage-logs/components/columns/common-logs-columns.tsx` — 新增两个列定义；在 `DetailsCell` 内读取 context 并透传给 `DetailsDialog`
- `web/src/features/usage-logs/components/dialogs/details-dialog.tsx` — 新增可选 prop `sensitiveVisible?: boolean`。**IP 值渲染点实为 2 处**：`:599-601`（登录审计字段，type=7）、`:719`（timing/topup 的管理员 IP）。`:507` 的 `showAdminIp` 是布尔门控变量（`!!props.log.ip && (showTiming || (props.isAdmin && isTopup))`），不渲染值，**保持不变**
- `web/src/features/usage-logs/components/__tests__/` 下 4 个既有测试文件：
  - `detail-preview.test.tsx`、`quota-adjustment.test.tsx` — 补 `UsageLogsProvider` 包裹（见技术约束 4），并扩展新列用例
  - `reject-reason.test.tsx`、`usage-facts.test.tsx` — 仅作回归（直接渲染 `DetailsDialog`，不走列 cell，无需补 Provider）

**i18n：** 无需改动。已逐语言核验 `Reasoning Effort` 与 `IP Address` 两键在全部 7 个语言文件中均存在且为有效译文：

| 语言 | Reasoning Effort | IP Address |
|---|---|---|
| en | Reasoning Effort | IP Address |
| zh | 推理强度 | IP 地址 |
| zh-TW | 推理強度 | IP 地址 |
| fr | Effort de raisonnement | Adresse IP |
| ru | Интенсивность рассуждения | IP-адрес |
| ja | 推論強度 | IPアドレス |
| vi | Cường độ suy luận | Địa chỉ IP |

**列位置决策（用户未指定，产物自主决策，已在此声明）：**

- 推理强度 → 紧跟「模型」列（`accessorKey: 'model_name'`）之后，语义相邻
- 请求 IP → 排在「详情」列（`accessorKey: 'content'`）之前，属诊断类尾列

## 预期影响

- **仅前端展示层**，不改动 API 契约、数据模型或计费逻辑
- 新增两列后表格横向宽度增加，窄屏下依赖既有横向滚动
- IP 列在用户未开启 `RecordIpLog` 时显示 `-`（默认态），这是既有隐私设计的预期结果
- 非展示类日志（充值 1 / 管理 3 / 系统 4 / 登录 7）两列均不渲染；展示类日志（0/2/5/6）无值时显示 `-`
- 详情弹窗新增可选 prop，缺省时行为与现状完全一致。既有测试中 `reject-reason`、`usage-facts` 不受影响；`detail-preview`、`quota-adjustment` 需补 `UsageLogsProvider` 包裹（补后行为不变，Provider 初始 `sensitiveVisible` 为 `true`）
- 移动端卡片布局不变，新增的两列在窄屏下不可见

## 风险

| 风险 | 应对 |
|---|---|
| 列 cell 内若先 `return null` 再调 Hook，会触发 React 运行时崩溃 | 方案明确要求 Hook 先无条件调用，并以既有 Token 列（`:611-615`）为模板；测试中覆盖非展示类日志类型以验证不崩溃 |
| 推理强度列若只给 `id` 不给 `accessorFn`，将无法通过 View 菜单关闭 | 采用 `id` + `accessorFn`，与既有 `channel`/`user` 列同构；测试中显式断言其出现在 View 菜单 |
| 弹窗改用 props 后，既有直接渲染 `DetailsDialog` 的测试可能受影响 | prop 设为可选且缺省为「可见」，缺省路径行为不变；任务 3 显式回归 `reject-reason`、`usage-facts` |
| `DetailsCell` 内新增 context 读取后，`flexRender` 直渲 content cell 的两个测试会因缺 Provider 而 throw | 任务 3 为 `detail-preview.test.tsx`、`quota-adjustment.test.tsx` 补 `UsageLogsProvider` 包裹；Provider 初始 `sensitiveVisible=true`，补后既有断言不变 |
| 现有表格列宽布局被挤乱 | 两列不设固定 `size`，交由 TanStack Table 自动分配；跑既有测试确认 |
| 既有测试因新增列而断言失败 | 任务 3 显式包含全量 `bun run test` 回归，失败项在任务内修复 |
| 用户误以为 IP 列功能损坏（默认全为 `-`） | 在提交说明中记录该前提；本次不加额外引导文案 |

# 任务清单：add-reasoning-effort-and-ip-columns

## 状态：ARCHIVED

## 任务

- [x] 在 `web/src/features/usage-logs/components/columns/common-logs-columns.tsx` 的 `useCommonLogsColumns` 中新增「推理强度」列，排在 `model_name` 列之后。列定义须为 `id: 'reasoning_effort'` **加** `accessorFn: (row) => parseLogOther(row.other)?.reasoning_effort`（缺 `accessorFn` 该列不会出现在 View 列显隐菜单，参见 `view-options.tsx:46-49` 与既有 `channel`（`:388-390`）/`user`（`:548-550`）列写法）。cell 写成 `cell: function ReasoningEffortCell({ row }) { ... }` 具名函数形式（与既有列统一），先 `const log = row.original` 与 `if (!isDisplayableLogType(log.type)) return null`，再取 `parseLogOther(log.other)?.reasoning_effort`，为空渲染 `-` 占位，否则用 `StatusBadge` 渲染并复用 `getReasoningEffortVariant` 着色。验证：`bun run typecheck` 通过；`bun run test` 中断言到徽标文本与 `variant` 取值
- [x] 在同一文件新增「请求 IP」列，排在 `content`（详情）列之前。列定义为 `accessorKey: 'ip'`，`header: t('IP Address')`。cell 写成 `cell: function IpCell({ row }) { ... }`，**首先无条件调用** `const { sensitiveVisible } = useUsageLogsContext()`，**之后**才执行 `if (!isDisplayableLogType(log.type)) return null`（顺序必须以既有 Token 列 `:611-615` 为准；反序属条件调用 Hook，会触发 "Rendered fewer hooks than expected" 崩溃）。随后：未脱敏且 `log.ip` 非空时以等宽字体展示 `log.ip`，脱敏时展示 `••••`，空串时渲染 `-` 占位。验证：`bun run typecheck` 通过；`bun run test` 中切换脱敏状态可观察到 `••••` 与明文切换，且非展示类日志不触发崩溃
- [x] 修改 `web/src/features/usage-logs/components/dialogs/details-dialog.tsx`，为 `DetailsDialogProps`（`:472-478`）新增可选 prop `sensitiveVisible?: boolean`，在该文件 **2 处** IP 值渲染点应用脱敏（脱敏时渲染 `••••`）：`:599-601`（登录审计字段，type=7）、`:719`（timing/topup 的管理员 IP）。**`:507` 的 `showAdminIp` 门控保持不变**（它是布尔变量 `!!props.log.ip && (showTiming || (props.isAdmin && isTopup))`，不渲染值；改它会与 Out of Scope「不改变 showAdminIp 门控」冲突）。**不得**在 `DetailsDialog` 内用 `useUsageLogsContext`（该组件会被无 Provider 的测试直接渲染，hook 会 throw）。在 `common-logs-columns.tsx` 的 `DetailsCell`（`:809`）内调用 `useUsageLogsContext()` 取 `sensitiveVisible`（须先于该 cell 内其他早退逻辑无条件调用，与 Token 列 `:611-615` 同序），在 `:879` 的 `DetailsDialog` 调用点透传。同时为 `detail-preview.test.tsx`（`:38`/`:83`）与 `quota-adjustment.test.tsx`（`:48`/`:68`/`:80`）的渲染函数补 `UsageLogsProvider` 包裹（两者以 `flexRender` 直渲 content cell，新增 hook 后会 throw）。验证：`bun run typecheck` 通过；`bun run test` 中 `reject-reason`、`usage-facts`、`detail-preview`、`quota-adjustment` 四个既有测试全部通过
- [x] 扩展 `web/src/features/usage-logs/components/__tests__/` 下**既有**测试文件（不新建文件）。覆盖率用例与类型覆盖要求：① 推理强度徽标文本与着色 variant，须覆盖**全部七档**以对齐验收标准 3（max / xhigh / high → orange，medium → yellow，low / minimal → green，none 及其他 → grey）；② 无 `reasoning_effort` 时显示 `-`；③ 非展示类日志（type∈{1,3,4,7}，含 System=4，见 `constants.ts:92-97`）两列均不渲染内容且不崩溃；④ IP 明文展示；⑤ 脱敏开启时 IP 显示 `••••`（列与弹窗两处均须覆盖）；⑥ `ip` 为空串时显示 `-`；⑦ 两列均出现在 View 列显隐菜单中。测试文件选择：用例 ①②③④⑥ 参照 `detail-preview.test.tsx` 的 `flexRender` 单 cell 渲染模式（其 `makeLog` 已含 `ip: ''`；**须先按任务 3 补 `UsageLogsProvider` 包裹**，否则 ip 列 cell 会 throw）；用例 ⑤ 涉及运行时切换 `sensitiveVisible`，`flexRender` 模式无法承载，须参照 `billing-source-visibility.test.tsx:39-50` 的 `LogsFixture` 壳模式（在 Provider 内以按钮调 `setSensitiveVisible`）配合 `:107-120` 的 createRouter + RouterProvider 全页渲染；用例 ⑦ 因需完整表格与 View 菜单，同样走全页渲染模式。验证：`bun run test` 相关文件全部通过
- [x] 执行前端全量校验：`bun run typecheck`、`bun run lint`、`bun run test`、`bun run build`。验证：四项命令均无 error，且 `bun run lint` 在本次改动文件上无新增问题

## 验收标准

- [ ] 通用日志表格默认展示「推理强度」列，位置紧跟「模型」列
- [ ] 通用日志表格默认展示「请求 IP」列，位置在「详情」列之前
- [ ] 推理强度按强度高低着色，与详情弹窗规则一致，七档全覆盖（max/xhigh/high 橙、medium 黄、low/minimal 绿、none/其他 灰）
- [ ] 推理强度为空时显示 `-`，不显示 `undefined` 或空白
- [ ] 请求 IP 默认明文展示，纳入既有脱敏开关，隐藏时显示 `••••`
- [ ] 请求 IP 为空串时显示 `-`
- [ ] 两列均可通过既有 View 列显隐菜单手动关闭（因带 `accessorFn`，符合 `view-options.tsx:46-49` 的过滤条件）
- [ ] 非展示类日志类型（type∈{1,3,4,7}）下，两列均不渲染内容（`return null`），且不触发 Hook 顺序错误
- [ ] 详情弹窗的 IP 展示遵循同一脱敏状态，脱敏开启时弹窗内 **2 处** IP 值（`:599-601` 登录审计、`:719` 管理员 IP）均显示 `••••`，不存在「表格脱敏 / 弹窗明文」旁路；`:507` 的 `showAdminIp` 门控未被改变
- [ ] 详情弹窗新增的 `sensitiveVisible` prop 为可选，缺省时行为与改动前一致；既有 4 个相关测试文件（`reject-reason.test.tsx`、`usage-facts.test.tsx`、`detail-preview.test.tsx`、`quota-adjustment.test.tsx`）全部通过，其中后两者已按任务 3 补 `UsageLogsProvider` 包裹
- [ ] 移动端卡片布局未改动，`common-log-mobile-card.tsx` 字段列表保持 `['user','channel','token','group']`
- [ ] 未新增任何组件，未修改后端 Go 代码与数据库结构，未改变 `RecordIpLog` 开关语义
- [ ] 未新增 i18n 键（`Reasoning Effort` 与 `IP Address` 在 7 个语言文件中均已存在且为有效译文）
- [ ] `bun run typecheck`、`bun run lint`、`bun run test`、`bun run build` 全部通过

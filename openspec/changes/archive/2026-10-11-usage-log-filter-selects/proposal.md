# 变更提案：usage-log-filter-selects

## 背景

通用日志页（`/usage-logs/common`）的筛选栏中，「模型名称」「用户名」「渠道 ID」三个字段目前是纯文本输入框，用户必须手动输入完整值才能筛选：

- 「模型名称」需精确匹配（后端 `applyExplicitLogTextFilter` 走 `=` 比较，`model/log.go:17-29`），输错一个字符即返回空结果
- 「渠道 ID」要求用户记住数字 ID，无法按渠道名称识别
- 「用户名」需精确匹配，用户无法确认系统内实际存在哪些用户名

同一筛选栏中的「分组」字段已经是下拉选择（`Combobox`，`common-logs-filter-bar.tsx:346-361`），体验不一致。本次将三个字段统一改为下拉选择。

## 目标范围

**在范围内：**

- 「模型名称」改为下拉选择，数据源为当前可用模型列表
- 「用户名」改为下拉选择，支持服务端异步搜索（管理员视图）
- 「渠道 ID」改为下拉选择，选项展示为「#ID 渠道名称」，数据源为全部渠道（管理员视图）
- 新增一个 feature 级异步组合框组件，承载上述异步搜索能力
- 新增所需 i18n 翻译键并同步至 7 个语言文件
- 补充回归测试

**不在范围内：**

- 不改动「令牌名称」「请求 ID」「上游请求 ID」三个字段（保持文本输入，无对应枚举数据源）
- 不改动「分组」「类型」「时间范围」筛选器
- 不改动后端 API 与数据库
- 不改动绘制日志、任务日志、审计日志页面的筛选栏
- 不为本次需求扩展公共组件的异步能力（`onSearch` / `loading` 等）；仅修正 `ComboboxClear` 缺失的可访问名称并导出该组件（既有调用点无一使用 `showClear`，行为不变）

## 技术方案

### 数据源

| 字段 | 接口 | 权限 | 返回形态 | 分页行为 |
| --- | --- | --- | --- | --- |
| 模型名称 | `/api/channel/models_enabled`（管理员）/ `/api/user/models`（普通用户） | ChannelRead / UserAuth | `string[]` | 无分页，全量返回 |
| 用户名 | `/api/user/search?keyword=&p=&page_size=` | AdminAuth | `{page, page_size, total, items}` 信封 | `page_size` 硬上限 **100**（`common/page_info.go:77`） |
| 渠道 ID | `/api/channel/search?keyword=&p=&page_size=` | ChannelRead | `{items, total, type_counts}` 信封 | `page_size` **默认 20**，无硬上限（`controller/channel.go:440`） |

用户名为管理员专属筛选器（`common-logs-filter-bar.tsx:446` 受 `isAdmin` 门控），渠道 ID 同理（`:457`）。模型名称对两种角色均可见，需按 `isAdmin` 选择数据源。

### 分页约束的应对

**用户名**：`common/page_info.go:77` 对 `page_size` 有硬上限 100，且不存在返回全量用户的接口。用户明确选择「异步搜索」方案：输入关键词时携带 `keyword` 参数请求服务端，由服务端过滤后返回，从而不受 100 条上限影响。

**渠道 ID**：`controller/channel.go:440` 的 `page_size` 默认值为 20 且无硬上限，`model.SearchChannels`（`model/channel.go:396`）本身不分页，返回 `[]*Channel`。为避免只加载到前 20 个渠道，实现时须显式传入足够大的 `page_size`（例如 1000），并读取响应信封的 `data.items` 字段（**不是**顶层数组）。

> **注意**：`/api/channel/search` 的响应体是 `{success, message, data: {items, total, type_counts}}` 三层结构，与 `/api/channel/models_enabled` 的 `{success, data: string[]}` 不同，实现时不可混用解析方式。

### 组件方案

公共 `Combobox`（`web/src/components/ui/combobox.tsx`）只支持静态 `options` + 前端过滤，其 `ComboboxInput` 无 `onSearch` / `loading` 等异步 props。该组件在本变更前被 28 个文件导入，生产代码中有 38 处 `<Combobox>` 根组件调用点（含测试共 48 处），直接扩展会带来大范围回归风险。

已评估的既有候选中，`web/src/components/model-group-selector.tsx` 的 `ModelSelector` 最接近本场景（同为模型选择 + 搜索），但形态不符：它是 `Button` + `Popover` 触发器、接收调用方传入的 `models: ModelOption[]` 做纯前端过滤，自身不发起任何请求，且 `ModelOption` 带有 `category` / `description` 等本场景不需要的可选字段。本需求需要的是「输入即请求服务端」的输入框形态组合框，二者无法通过复用或兼容扩展收敛。

因此**新增 feature 级组件** `AsyncCombobox`（置于 `web/src/features/usage-logs/components/`），直接复用 `@base-ui/react` 的 Combobox primitive 与项目已导出的 `ComboboxInput`、`ComboboxContent`、`ComboboxList`、`ComboboxItem`、`ComboboxEmpty`、`useComboboxAnchor`，自行管理「打开 → 请求 → 选项更新」的状态流转。不改动 `ModelSelector`。

### 公共组件的唯一修正

清空按钮的实现位于公共组件 `ComboboxClear`（`web/src/components/ui/combobox.tsx:216-231`）。它直接透传 Base UI primitive，而 primitive 的默认 `children: 'x'` 被本仓库的装饰性图标覆盖，最终**没有任何可访问名称**；同文件的 `showTrigger` 有 `triggerAriaLabel` 透传管道，清空按钮却无对应管道。该组件也未列入文件底部的 `export {}` 块。全项目此前无任何调用点使用 `showClear`，故缺陷从未暴露。

本次通过 `ComboboxInput` 的 `showClear` 首次使用该路径，须一并修正：为 `ComboboxInput` 增加可选 `clearAriaLabel` prop 并透传给 `ComboboxClear` 的 `aria-label`（默认 `t('Clear')`），同时将 `ComboboxClear` 加入该文件的 `export {}` 块。该修正不改变任何既有调用点行为——`showClear` 默认为 `false`，当前零调用点启用。

### 交互约定（用户已确认）

三个字段均为**纯下拉，禁止手输任意值**（不使用 `allowCustomValue`）。用户已确认接受由此带来的取舍：列表外的历史模型名、已删除的用户/渠道将无法筛选。

> 该约定使三个新字段与「分组」存在一处刻意的不一致：分组保留 `allowCustomValue`（可自由输入并提交任意值），三个新字段不可。这是用户在澄清阶段明确选择「纯下拉，禁止手输」的直接结果，非遗漏。

### 关键实现约束

- 请求须经 `useDebounce` 防抖（项目已有 `@/hooks/use-debounce`，参考 `web/src/features/system-settings/models/channel-selector-dialog.tsx:85`）
- 数据获取统一走 `useQuery` + `requireServerSuccess`，与同文件既有 `groupOptions` 的写法一致
- 沿用 `LogsFilterField` + `LogsFilterInput` 的尺寸与样式约定，保证与同栏其他筛选器视觉一致
- 脱敏遮罩 `sensitiveInputClass` 的现状是：用户名与分组已有，「模型名称」「渠道 ID」没有。本次须保持三者在显示/隐藏切换下的一致性——用户名沿用现有行为，模型名称与渠道 ID 按同栏约定补齐
- 筛选值仍经 `handleChange(field, value)` 写入 draft，`onKeyDown` 的 Enter 提交行为保持不变

## 预期影响

- 仅影响通用日志页筛选栏的三个字段，其余筛选器与页面功能不变
- 新增一个 feature 级组件文件；除上述 `ComboboxClear` 可访问名称修正外不触碰公共组件其他部分，无跨页面回归风险
- 新增网络请求：模型名称筛选对管理员与普通用户均可见（`common-logs-filter-bar.tsx:336` 无 `isAdmin` 门控），两类角色打开页面均增加 1 个模型列表请求；管理员额外增加 1 个渠道列表请求；用户名搜索在管理员输入关键词时按需触发
- 既有测试的 `api.get` mock 以兜底分支返回 `{quota, rpm, tpm}` 对象（`mobile-filter.test.tsx:78-85`、`group-filter.test.tsx:69-82`），新增的三个接口会命中该兜底分支并拿到**非数组** data，实现时须做类型保护，否则既有测试将抛错
- 需新增 i18n 键并同步 7 个语言文件

## 风险

| 风险 | 应对 |
| --- | --- |
| 纯下拉导致历史记录无法筛选 | 已向用户说明并确认接受；用户可改用「重置」或时间范围缩小排查范围 |
| 用户名搜索请求频繁触发 | `useDebounce` 防抖 + `useQuery` 缓存；仅在管理员视图且下拉打开时启用 |
| 渠道列表数据量大导致下拉渲染卡顿 | 复用 `Combobox` 的内置前端过滤；如实际数据量过大再评估虚拟滚动 |
| 异步组件与既有 `Combobox` 行为不一致 | 复用同一套 primitive 与样式类，测试覆盖打开、搜索、选中、清空四类行为 |

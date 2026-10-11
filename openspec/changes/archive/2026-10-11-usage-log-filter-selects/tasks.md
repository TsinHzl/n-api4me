# 任务清单：usage-log-filter-selects

## 状态：ARCHIVED

## 任务

- [x] 新增 `AsyncCombobox` feature 组件（`web/src/features/usage-logs/components/async-combobox.tsx`）：复用 `@base-ui/react` Combobox primitive 与已导出的 `ComboboxInput` / `ComboboxContent` / `ComboboxList` / `ComboboxItem` / `ComboboxEmpty` / `useComboboxAnchor`，支持 `onSearch` 异步回调与 `loading` 态，禁止自定义值输入。验证：`bun run typecheck` 通过，对应测试文件覆盖打开、搜索、选中、清空四个行为并通过
- [x] 修正公共组件清空按钮的可访问名称（`web/src/components/ui/combobox.tsx`）：为 `ComboboxInput` 增加可选 `clearAriaLabel` prop（默认 `t('Clear')`）并透传给 `ComboboxClear` 的 `aria-label`，同时将 `ComboboxClear` 加入 `export {}` 块。验证：`bun run typecheck` 通过，既有 `Combobox` 调用点测试无新增失败
- [x] 在 `common-logs-filter-bar.tsx` 增加三个数据源查询：模型列表按 `isAdmin` 选择 `/api/channel/models_enabled` 或 `/api/user/models`；渠道列表走 `/api/channel/search` 并显式传大 `page_size`、读取 `data.items`；用户名走 `/api/user/search`（按关键词防抖）。验证：`bun run typecheck` 通过，管理员视图下三个请求均正常返回、普通用户视图下模型请求正常返回，且渠道数超过 20 时下拉仍完整
- [x] 将「模型名称」输入框替换为 `AsyncCombobox`，选项为模型列表。验证：下拉可展开并选中模型，选中后点击「搜索」能筛出对应日志
- [x] 将「渠道 ID」输入框替换为 `AsyncCombobox`，选项标签为「#ID 渠道名称」。验证：下拉展示渠道名与 ID，选中后筛选结果与手输该 ID 一致
- [x] 将「用户名」输入框替换为 `AsyncCombobox`，输入关键词触发服务端搜索。验证：输入部分用户名后下拉出现匹配项，选中后筛选结果正确
- [x] 新增 i18n 翻译键（如 `No user found.` / `No channel found.`）并同步至 7 个语言文件。验证：`bun run i18n:sync` 执行后 7 个 locale 文件均含新键且无缺失告警
- [x] 补充回归测试（`web/src/features/usage-logs/components/__tests__/`）：覆盖下拉打开、关键词搜索、选中写值、清空四个行为。同时更新既有受影响测试（`group-filter.test.tsx`、`mobile-filter.test.tsx`、`log-type-filter.test.tsx`）的 `api.get` mock，使其对新增的三个接口返回数组而非兜底的 `{quota, rpm, tpm}` 对象。验证：`bun run test` 中相关测试文件全部通过，且既有三个测试文件无新增失败
- [x] 执行前端全量校验：`bun run typecheck`、`bun run lint`、`bun run test`、`bun run build`。验证：四项命令均无 error

## 验收标准

- [ ] 「模型名称」「用户名」「渠道 ID」三个字段均为下拉选择，无法手动输入任意值
- [ ] 模型名称下拉列出当前可用模型，选择后能正确筛选
- [ ] 渠道 ID 下拉展示「#ID 渠道名称」，选择后能正确筛选
- [ ] 用户名下拉输入关键词后返回服务端搜索结果，不受 100 条上限影响
- [ ] 渠道 ID 下拉在渠道总数超过 20 时仍完整展示全部渠道（不被默认 `page_size=20` 截断）
- [ ] 三个字段的脱敏遮罩与同栏其他字段在显示/隐藏切换下保持一致
- [ ] 公共组件 `web/src/components/ui/combobox.tsx` 仅新增 `clearAriaLabel` 透传管道并将 `ComboboxClear` 加入导出块，其余部分未改动，生产代码 38 处既有 `<Combobox>` 调用点行为不变
- [ ] 未改动 `web/src/components/model-group-selector.tsx`，其既有调用点行为不变
- [ ] 7 个语言文件均包含新增翻译键
- [ ] `bun run typecheck`、`bun run lint`、`bun run test`、`bun run build` 全部通过

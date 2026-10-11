# 项目上下文

## 技术栈

- **后端**：Go 1.26（根模块与 `tokenkit/`）、Go 1.25.1（`relaykit/`），Gin Web 框架，GORM v2 ORM
- **前端**：React 19、TypeScript、Rsbuild 2、TanStack Router/Query/Table、Zustand、Base UI、Tailwind CSS 4
- **数据库**：主库支持 SQLite / MySQL ≥ 5.7.8 / PostgreSQL ≥ 9.6（三者必须同时支持）；独立日志库另支持 ClickHouse
- **缓存**：Redis（go-redis）+ 内存缓存
- **鉴权**：浏览器会话、API Token 与个人访问令牌、JWT、WebAuthn/Passkey、TOTP、OAuth/OIDC；Casbin 授权位于 `service/authz/`
- **扩展**：moejs 执行的 JavaScript 任务插件；Electron 桌面封装
- **前端包管理器**：Bun（优先于 npm/yarn/pnpm）

## 架构约定

- Go 网关承担管理 API、上游中转、计费与后台任务，横跨 `router/`、`middleware/`、`controller/`、`service/`、`model/`、`relay/`
- `relaykit/` 是独立 Go 模块，负责协议 DTO 与转换；传输、鉴权、数据库访问、计费留在宿主。**必须可独立构建**，不得依赖根模块
- `tokenkit/` 是独立 Go 模块，负责文本与图像 token 计数估算；不得依赖根模块，也不得依赖 `relaykit/`
- JavaScript 任务插件位于 `plugins/tasks/`，经 `pkg/jsplugin/` 运行
- `web/` 是 React 前端；`electron/` 是桌面封装

## 目录结构

| 目录 | 职责 |
| --- | --- |
| `router/`、`middleware/`、`controller/` | HTTP 路由、访问校验与 API 处理 |
| `relay/` | 上游适配与请求调度 |
| `service/`、`model/` | 业务逻辑与持久化 |
| `relaykit/` | 可独立构建的协议 DTO 与转换 Go 模块 |
| `tokenkit/` | 可独立构建的 token 计数 Go 模块 |
| `plugins/tasks/` | JavaScript 任务插件 |
| `web/` | Web 控制台（见 `web/AGENTS.md`） |
| `electron/` | 桌面封装与打包 |

## 开发约定

- **JSON**：根模块内所有 marshal/unmarshal 必须走 `common/json.go` 的包装函数，禁止直接调用 `encoding/json`
- **数据库**：所有数据库代码必须同时兼容 SQLite、MySQL ≥ 5.7.8、PostgreSQL ≥ 9.6；schema 变更须在三种数据库上验证，且需验证全新库与升级库两条路径
- **Go 风格**：使用 `any` 替代 `interface{}`；优先 `for i := range n`、`strings.Cut`、`slices.Contains`、`maps.Copy`、内置 `min`/`max`；改动后执行 `gofmt`
- **前端组件复用**：新增 UI 前必须检索 `web/src/components/` 与相关 feature，优先复用项目业务封装；新增替代实现需说明能力缺口
- **i18n**：前端文案必须经 `useTranslation()` 的 `t()`；语言文件为 `web/src/i18n/locales/{lang}.json`（en、zh、zh-TW、fr、ru、ja、vi 共 7 个），扁平 JSON，键为英文源串
- **数字格式化**：复用 `@/lib/format` 与 `@/lib/currency`；界面语言码传入 `Intl.*` 前必须经 `toIntlLocale()` 转换
- **测试**：后端 `make test`；前端在 `web/` 下执行 `bun run typecheck`、`bun run lint`、`bun run test`、`bun run build`。修改 `relaykit/` 后须在 `relaykit/` 下执行 `GOWORK=off go build ./...`
- **分支与提交**：遵循 Conventional Commits
- **受保护信息**：项目名称与 QuantumNous 相关的署名、品牌、元数据不得修改或移除

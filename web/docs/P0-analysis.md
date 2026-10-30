> 历史记录：本文对应之前的双容器阶段。当前架构已改为单仓库、单镜像、单容器，参见仓库 docker/NUXT.md。

# Go 前台接管改造分析报告（P0）

调研日期：2026-10-30。两个项目工作区：service 无未提交改动；web 为空目录。

## 真实入口与兼容方案

- `main.go` 用 `embed.FS` 嵌入整个 `frontend` 与 `docs`；React 源码不在此仓库，现有构建产物必须保留。
- `cmd/run_server.go: NewServer` 读取配置并创建 Gin HTTP Server；支持主端口、私有端口、独立 webgui/share 端口。
- `internal/routers/router.go: NewRouter` 注册静态资源、WebGUI、OAuth、分享、业务 API。`NewWebGuiRouter` / `NewShareRouter` 为独立端口入口。
- `router_static.go: registerWebGuiRoutes` 的 `/` 原行为是跳转 `/webgui`；`/webgui/` 返回嵌入的 index.html。React 内部通过状态切换用户、Vault、笔记、文件、设置和管理视图（构建 JS 中可见组件），不是服务端 `/app` 路由。后台原地址保持。
- `registerStaticFiles` 托管 `/assets/*`、`/static/*`、`/user_static/*`、配置开启的本地存储目录以及 `/attachments/:uid/:vault/*filepath`。
- `registerShareRoutes` 的 `/share/:side/:token` 返回独立 share.html。原分享授权要求 token + 资源 id；不能仅凭新 `/s/:token` 猜测 id，新页面通过 `?id=` 提供 id。旧链接继续使用原 React 页面。
- 不存在 React SPA 全局 fallback；`NoRoute(middleware.NoFound())` 返回原有错误。
- `/oauth/authorize` 及 OAuth metadata 保持 Go 实现。

## API 契约

- `router_api.go`：登录 `POST /api/user/login`，JSON `credentials/password`（可选 tokenId），要求 `x-client: webgui`。
- `handler_user.go` + `user_dto.go`：响应为 `{code,status,message,data}`，data 包含 uid/email/username/token/tokenId 等。前台只返回白名单用户字段，不返回 token。
- `user_auth_token.go` 接受 `Authorization: Bearer <token>`，也兼容 Token header。Nuxt 使用现有 Bearer 契约及固定 webgui client 与稳定服务端 UA。
- `/api/user/info` 用户信息，`GET /api/vault` 返回 Vault 列表，`GET /api/notes?vault=...&page=...&pageSize=...&sortBy=mtime&sortOrder=desc` 返回 `{list,pager}`。
- `/api/share/note`、`/api/share/file` 为 Share-Token 受控只读接口，查询参数含 id/password；本阶段不改分享业务、不增加数据库。
- WebSocket 是 `/api/user/sync`；MCP 是 `/api/mcp`、`/api/mcp/sse`、`/api/mcp/message`。全部由 Go 原路由处理。

## 修改范围（编码前确定）

1. 新增 `internal/config/web.go`；`internal/app/config.go: AppConfig/LoadConfig` 增加 web.frontend 配置、Docker 环境变量覆盖与校验。
2. 新增 `internal/routers/router_frontend.go`：标准库 ReverseProxy + 明确路径白名单，在 `NewRouter` 中于现有静态路由前接入。只接管 `/`、`/login`、`/kb[/...]`、`/s[/...]`、`/app[/...]`、`/_nuxt/*`、`/api/frontend/*`。最后两个是 SSR 静态文件与 BFF 必需路径，原 API 不进入代理。
3. 保留 `router_static.go`、原有后台、分享、同步与 MCP 处理函数；独立 WebGUI/Share 端口不接管。禁用时中间件直接通过，完全恢复旧入口。
4. `config/config.yaml` 增加默认禁用配置；新增代理/配置/真实路由回归测试。
5. 新建 Nuxt 4 app/ 约定工程；HttpOnly 加密 session、同源写请求检查、白名单 BFF、workspace SSR、分享框架、明确标识的知识库演示数据。
6. 新增双容器 Compose 与本地构建 Go Dockerfile，不覆盖现有挂载路径及旧 Compose。Go target 可用环境变量指定 Docker DNS 地址；Nuxt API 地址只在服务端使用。

## 部署与构建现状

- `docker/Dockerfile` 复制预构建 Go 二进制并经 entrypoint 启动，持久化 `/fast-note-sync/config` 与 `/fast-note-sync/storage`。现有 `docker/docker-compose.yaml` 引用 app-network 但未定义网络。新增独立可运行 Compose，保留旧文件作为已有部署参考。
- `.github/workflows/release.yml`、alpha-release 工作流构建 Go 和镜像，现有嵌入 React 构建产物保持。新 Go 本地构建文件便于上线尚未发布的代理版本；不能直接拿旧 latest 镜像假定支持新配置。
- `scripts/quest_install.sh` 安装 Go 程序并生成 systemd `fast-note.service`；无需让 Go 管理 Node 进程。补充独立 Nuxt systemd 示例和启动文档。
- 不启动或停止用户现有服务，不修改现有生产数据。

## 风险与验收边界

根路径与旧跳转冲突已分析，采用显式中间件接管并保留 `/webgui/`；任何未知路径仍由 Go 原行为处理。Nuxt 不可用时页面返回 503 与旧版入口（按 fallback 控制），BFF/资源返回 502/504，不向 SPA 重定向。超时与取消限制在 Nuxt 请求内。配置目标只能为 HTTP(S) origin，避免路径拼接错误；部署时必须避免将 target 指向 Go 自身。

测试分为：配置与路由单测、Go 原有单测、Nuxt 类型检查/生产构建、真实 Go+Nuxt 临时数据端到端与停服回归。Obsidian 多设备同步需要真实插件和设备，若环境不具备会明确标注未执行，不以模拟结果冒充。

> 历史记录：本文对应之前的双容器阶段。当前架构已改为单仓库、单镜像、单容器，参见仓库 docker/NUXT.md。

# 验证与实施记录

验证日期：2026-10-30（Asia/Shanghai）。Go 基线提交 `7a6c7879`，工作目录中保留未提交改动；前台为原空目录新建工程。未提交、推送或替换用户现有生产容器。

## 分阶段交付

| 阶段 | 修改文件 | 新功能 | API 变化 | 部署变化 | 测试结果与边界 |
| --- | --- | --- | --- | --- | --- |
| P0 | `docs/P0-analysis.md`，并已先行输出独立报告 | 确认真实路由、嵌入资源、认证和旧分享契约 | 无 | 明确两个独立服务 | 完成源码调研后才开始实现 |
| P1 | `nuxt.config.ts`、`package*.json`、`tsconfig.json`、`app/` | Nuxt 4 SSR 首页、登录页、工作区、知识库演示、分享页、明暗主题 | 无 Go API 变化 | 独立 Node 构建 | 类型检查与生产构建通过，浏览器首页与登录页无警告/错误日志 |
| P2 | `server/`、`shared/`、`app/stores/auth.ts` | 服务端会话、白名单 BFF、Go Client、中文错误、密码校验、JSON/二进制下载 | 新增 `/api/frontend/*`，原 API 不变 | 新增 session 密钥、文件持久卷、API origin 配置 | 12 个契约场景通过（Node 共报告 13 个测试，含父测试） |
| P3 | `internal/config/web*.go`、`internal/app/config.go`、`internal/app/config_frontend_test.go`、`internal/routers/router.go`、`router_frontend*.go`、`config/config.yaml` | 白名单反向代理、可信转发头、超时、故障页、默认禁用回滚开关 | 仅新前台路径转发 | Go 支持 YAML 和 Docker 环境变量指定 Nuxt 端口 | 代理/配置/真实路由注册测试通过，原同步和业务处理函数未修改 |
| P4 | Go `docker/` 新文件、Nuxt `Dockerfile`、`.env.example`、`deploy/`、`README.md` | 双容器、健康检查、独立重启、systemd 示例 | 无 | 保留 Go 默认 9000、原 config/storage 挂载；Nuxt 3000 仅内网 | 两个镜像构建通过，Compose 校验通过 |
| P5 | `tests/frontend.test.mjs`、`tests/docker-smoke.mjs`、Go 新增测试 | 可重复的契约与双容器回归 | 无 | 测试使用随机 Compose 项目和临时数据 | Go 43 个测试包通过；双容器 14 项检查通过；真实 Obsidian 多设备操作需人工完成 |

## 测试环境与命令

- 本机 macOS arm64；前台测试使用 Node 22.23.4。Nuxt 4.6.3、Vue 3.5.44、Nuxt UI 4.12.0；依赖由 package-lock.json 锁定。
- Go 测试使用官方 Go 1.26.10 Linux arm64 容器，启用 CGO 并安装 gcc/musl-dev。初次使用无 C 编译器的容器时，原仓库 go-sqlite3 测试因环境失败；补齐测试环境后全部通过，没有修改业务代码绕过测试。
- `CGO_ENABLED=1 go test ./...`：43 个测试包全部通过，覆盖原认证、笔记/附件/分享服务、MCP、WebSocket、DAO 等已有测试。
- 新增配置及代理测试：默认关闭、显式 false、环境覆盖、错误配置、路径边界、保留 Query/Cookie/Host、过滤伪造转发信息、网关故障、超时、原路由注册。
- `npm run typecheck`、`npm run build`、`npm test` 均通过；契约服务使用真实 Go DTO/header/envelope 规则。Go 业务错误同样返回 HTTP 200，客户端以 `status/code` 判断成功失败。
- `docker build -f docker/Dockerfile.source -t fast-note-sync-service:nuxt-local .`（service 目录）与 `docker build -t fast-note-sync-web:local .`（web 目录）成功。
- 构建两个镜像后在 web 目录执行 `npm run smoke:docker`。脚本只创建临时账号、数据和 Compose 项目，结束后关闭测试容器并删除该项目的临时卷与目录。

## 契约测试场景

1. SSR 首页、静态资源、登录、知识库演示标记、未知知识库 404、分享页框架。
2. 匿名 API 返回 401，工作区跳转登录。
3. 同源 Origin 与输入验证。
4. 登录错误显示中文。
5. HttpOnly/SameSite Cookie，响应不泄漏 Go token。
6. 已登录用户/Vault/分页笔记与 SSR，不泄漏 token。
7. 分享密码、PNG 文件、JSON 文件（即使内容形似业务错误 envelope）。
8. 篡改 Cookie 被拒绝。
9. 重复登录使旧 Cookie 对应的服务端存储键失效。
10. 退出调用 Go 撤销接口，旧 Cookie 失效。
11. 上游 token 失效后清除 Nuxt 会话。
12. 上游不可用时返回受控错误，隐藏内部网络异常信息。

## 真实双容器检查

1. Go 原公开入口返回 Nuxt SSR。
2. React 后台、旧分享和 Nuxt 静态资源共存。
3. 原登录、用户信息、Vault、笔记创建/读取/修改 API。
4. 原图片上传、下载与内容一致性。
5. Nuxt 真实登录、HttpOnly 会话与真实工作区 SSR。
6. Nuxt 重启后会话仍可用。
7. 原分享授权/密码与 Nuxt 二进制分享附件下载。
8. 无认证 MCP/WebSocket 请求仍由 Go 原路由处理。
9. 临时受限令牌下，认证 SSE HEAD 返回 event-stream，StreamableHTTP initialize 返回 result。
10. 原 `/api/user/sync` WebSocket HTTP Upgrade 成功。
11. 原笔记删除 API。
12. Nuxt 真实退出使会话失效。
13. 只停止 Nuxt 后 Go 健康检查、原后台、用户 API 仍正常。
14. Nuxt 停止时设环境开关 false，Go 根路径恢复 302 `/webgui`。

## 消融检查结果

- 不创建空组件目录、通用仓储层、任意 URL 转发器或重复 response/auth 包装层；只保留实际页面和接口需要的工具函数。
- 会话存储仅保存 token 与有效期，移除重复的用户信息存储；用户响应采用白名单，tokenId 不进入前端。
- Go Dockerfile 去掉全模块预下载阶段，按实际编译需要拉取依赖，保留模块/编译缓存，避免不相关依赖拖慢构建。
- 不为当前纯文本预览加入尚无调用的 Markdown AST/Shiki 依赖；完整 renderer、双链、编辑器与发布管理按清单留到后续。
- 保留原 embed React 资源和原路由处理函数，通过单一可关闭中间件接管明确路径，不重写旧后台或分享授权。
- 已统一源码格式，未引入额外运行时设计层。

## 未覆盖与后续人工验收

真实 Obsidian 插件的多设备同步、冲突场景与图片同步未执行：当前没有提供可操作的多设备插件环境。现有 Go 同步单测、原 REST 数据操作、WebSocket 升级和路由兼容验证已通过，但不替代真实插件端到端验收。

公开知识库目前只有明确标识的 `/kb/demo` 演示数据；新分享链接需 `/s/:token?id=:resourceId`，正文是安全转义的文本预览。原 `/share/:side/:token` 保持原 React 行为。Nuxt 与旧后台的登录会话独立，切换后台可能需重新登录。完整 Markdown/双链/知识库发布尚未实现，符合首阶段排除项。

文件会话存储为单实例方案；自然到期的闲置文件暂不自动清理（过期会话已被拒绝），可按 expiresAt 定期清理。

未在当前 macOS 主机启动 systemd；已提供 Linux unit 和部署步骤。Docker 以 arm64 本地镜像完成实测，其他架构需在 CI 或目标主机构建验证。

# Fast Note Sync Web

Nuxt 4 SSR 前台，现已合入 fast-note-sync-service 仓库的 `web/`。镜像和部署入口统一在仓库根项目，不再维护独立前台 Dockerfile、Compose 或 systemd 服务。完整部署与回滚见 [单容器说明](../docker/NUXT.md)。

项目整体功能、旧数据复用和发布方式见[中文项目说明](../docs/README.zh-CN.md)。生产容器只通过 Go 的 9000 入口访问，Nuxt 的 3000 端口仅监听容器内回环地址，无需端口映射。

## 前台开发

需要 Node 22.22.3+（22.x）或 24.15+。在此目录执行：

```sh
npm ci
cp .env.example .env
openssl rand -hex 32
# 将随机值填入 .env 的 FNS_SESSION_PASSWORD，本地 HTTP 设 FNS_SESSION_SECURE=false
npm run dev
```

另一个终端在仓库根目录启动 Go 1.26：

```sh
FNS_WEB_FRONTEND_ENABLED=true FNS_WEB_FRONTEND_TARGET=http://127.0.0.1:3000 go run . run
```

访问 Go 9000，Go 代理新前台、`/_nuxt/` 和 `/api/frontend/`。浏览器不接触内部 API 地址或长期 Go token。

```sh
npm run typecheck
npm run build
npm test
# 先在仓库根目录 docker build -f docker/Dockerfile -t fast-note-sync-service:local .
npm run smoke:docker
```

生产 Node 单独调试需显式提供进程环境（例如 node --env-file=.env .output/server/index.mjs），不会自动读取 `.env`。Docker 已自动配置内部地址、生成/复用密钥并管理进程。

## 当前页面

- `/`：响应式门户，支持明暗主题。
- `/login`：复用 Go 账号，通过服务端 BFF 登录、退出及处理过期。
- `/app`：真实用户信息、Vault 列表、按 Vault 读取的最近笔记。
- 不提供演示知识库，`/kb/*` 返回 404。
- `/s/:token?id=:resourceId`：原分享授权、密码校验、只读文本预览。原 `/share/:side/:token` 继续使用旧 React。

各页面使用独立 TDK 和社交元信息；无密码分享的标题/摘要由服务端预取，预取不计 PV。所有分享、登录和个人工作台均默认禁止搜索收录。密码分享在未解锁时不输出笔记标题/摘要。生产 canonical 可配置 `FNS_SITE_URL`，本地开发用 `NUXT_PUBLIC_SITE_URL`。浏览统计复用 Go 既有分享记录与原后台，口径和延迟见[统计说明](../docker/NUXT.md#分享浏览统计与-tdk)。

完整 Markdown Renderer、AST/Shiki、双链、编辑器和知识库发布管理仍留在后续阶段，不为当前文本预览加入未使用的依赖或包装层。

`docs/P0-analysis.md` 和 `docs/verification.md` 是历史双容器阶段记录；当前架构和测试结果以 `docs/single-container-verification.md` 为准。

# Nuxt 前台：单仓库、单镜像、单容器

Go 和 Nuxt 已合并到 fast-note-sync-service 仓库。前台源码在 `web/`，原 `frontend/` 仍是嵌入 Go 的 React 构建产物，不删除、不覆盖。原独立 fast-note-sync-web 目录已迁移进来。

本次单容器实现的首次镜像发布尚未完成。当前可从源码构建；Docker Hub 拉取命令需在对应版本发布成功后使用。项目功能和页面入口见[中文项目说明](../docs/README.zh-CN.md)。

本分支产品版本从 1.0.0 开始；数据库迁移使用独立的上游兼容基线 3.6.1，保留既有迁移顺序和记录。Docker 部署通过镜像升级，勿使用原后台面向上游二进制发布包的自升级入口。

## 部署

在仓库根目录执行。首次测试若直接使用 HTTP：

```sh
FNS_SESSION_SECURE=false docker compose -f docker/docker-compose.yaml up -d --build
```

生产 HTTPS 可直接运行：

```sh
docker compose -f docker/docker-compose.yaml up -d --build
```

访问原 9000 入口。默认数据挂载依旧是 `/data/fast-note-sync/config` 与 `/data/fast-note-sync/storage`。本地构建镜像默认命名 `fast-note-sync-service:local`。使用源码时执行上述 build；使用本仓库 Docker Hub 产物时按下一节拉取明确的版本标签。上游镜像不代表本仓库的单容器实现。

可选持久环境配置：

```sh
cp docker/.env.example docker/.env
# 调整 FNS_DATA_DIR、FNS_PUBLIC_PORT、FNS_SESSION_SECURE 等
docker compose --env-file docker/.env -f docker/docker-compose.yaml up -d --build
```

已有 Go 或双容器部署迁移时，先备份数据并停止旧容器，然后只启动这里的单服务 Compose；不能让两个 Go 实例并发使用同一数据库。原有笔记、附件、用户和数据库结构不变。本次自动验证只使用临时数据，未替换现有生产容器。

如原部署有外层 nginx、独立 webgui/share 端口或私有 9001 端口，保持原服务配置，并将所需端口/网络设置合入 Compose。示例仅映射统一入口 9000；原 Dockerfile 的 9001 声明仍保留。外层 HTTPS 代理应正确传递 Host/X-Forwarded-Proto，Go trusted-proxies 沿用实际可信代理 IP/CIDR。

## GitHub Actions 构建与 Docker Hub 发布

`.github/workflows/docker.yml` 是唯一的镜像发布入口，参考健康档案的 Docker 预览流程。推送 `master` 自动执行，也可以在 Actions → Docker Hub → Run workflow 中选择 `master` 手动执行。其他分支的手动执行会跳过，不发布镜像。

在当前 GitHub 仓库 Settings → Secrets and variables → Actions 配置：

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| Secret | `DOCKERHUB_USERNAME` | Docker Hub 登录用户名，例如 `timorm` |
| Secret | `DOCKERHUB_TOKEN` | 对目标镜像仓库有写入权限的访问令牌 |
| Variable（可选） | `DOCKERHUB_IMAGE` | `命名空间/仓库名`，默认 `timorm/fast-note-sync-service` |

Secrets 必须对当前仓库可用，其他仓库的 Secrets 不会自动继承。GitHub Actions 只保留 Docker Hub 流水线，移除原 Go Release、Alpha Release、fnOS FPK 打包和 CNB 同步工作流，不创建二进制发布包或 GitHub Release，也不依赖 GHCR/CNB 凭据。Go/Nuxt 测试和容器检查仅作为镜像发布前的校验步骤保留。

`amd64`、`arm64` 使用两个 runner 并行构建，各自执行临时数据集成与故障恢复检查。Go 与 Nuxt 构建阶段由 BuildKit 并行调度：Go 在宿主架构上交叉编译，Nuxt 在宿主架构上生成可跨架构使用的纯 JS 产物；若输出出现原生库，构建会失败。QEMU 保留，用于 arm64 最终镜像安装依赖和运行检查，不用于 Go/Nuxt 编译。

Go 测试、Nuxt 类型检查与测试合并进 Docker 构建缓存层，移除宿主机重复的 npm 安装和 Nuxt 构建。两种架构分别保存 Actions 缓存；Go 只复制相关源码，前台改动不会使 Go 缓存失效；版本标签写在系统依赖安装之后，提交号和构建时间变化不会触发重新安装系统依赖。每个 runner 仅编译一次，检查通过后再次调用 Buildx 复用本地缓存层、按 digest 上传镜像，不再编译，也不重复上传构建缓存；两边全部成功后才合并发布版本标签。只上传 digest 文件用于合并，不生成 Go 二进制发布包、GitHub Release、SBOM 或 provenance 附件。当前不构建 ARMv7。

标签读取 `internal/app/version.go` 的 Go 应用版本（当前为 `1.0.0`），不取前台脚手架版本；只发布版本标签，不更新 `latest`、分支别名或创建 Git tag/Release。相同版本再次推送 master 会更新该版本镜像；需要固定某次构建时使用 Actions 摘要中的 digest。新的 master 推送会取消尚未完成的旧流水线；单次流水线内两种架构并行。

确认对应版本已在 Actions 成功发布后，服务器可执行：

```sh
export FNS_IMAGE=docker.io/timorm/fast-note-sync-service:1.0.0
docker compose -f docker/docker-compose.yaml pull
docker compose -f docker/docker-compose.yaml up -d --no-build
```

如使用 `docker/.env`，将 `FNS_IMAGE` 写入该文件，并在以上命令加入 `--env-file docker/.env`。直接 HTTP 同样需要 `FNS_SESSION_SECURE=false`。已有容器迁移时沿用原 config/storage 目录，并先停止旧实例。

## 运行结构

- 一个 Dockerfile 多阶段构建 Go 二进制与 Nuxt SSR 产物，最终镜像包含 Node 运行时。
- 一个 Compose service、一个运行容器；原 Go 监听 9000，Nuxt 强制监听 `127.0.0.1:3000`，不公开 Node 端口。
- 访问 `/` 打开 Nuxt 门户，`/login` 登录新前台，`/app` 查看工作台；注册、管理与插件配置仍在 `/webgui/`。新旧前台登录会话独立。
- `tini -g` 转发信号、回收子进程；`docker/entrypoint.sh` 启动 Go 和 Node，直接输出日志。
- Node 以 `node` 用户运行。Node 退出后等待 2 秒再启动，不重启 Go。Node 卡死时 Go 的代理超时返回友好错误，Go 旧后台和 API 继续工作。
- Go 退出时入口脚本关闭 Node 并退出容器，由 Docker `restart: unless-stopped` 策略恢复。正常 stop 不触发自动重启；Compose 留出 35 秒让 Go 优雅关闭。
- Go 健康检查 `/api/health` 独立于 Nuxt；`/api/frontend/health` 用于检查前台是否可用。前台故障不把核心同步服务判定为故障。
- Docker 发布流程继续使用 `docker/Dockerfile`，现在从源码构建，不再下载不使用的 Go 构建产物。VERSION/BUILD_DATE/GIT_COMMIT 仍注入镜像标签和 Go 二进制的版本信息。

## 配置与会话

### 分享浏览统计与 TDK

分享笔记成功读取时累计一次 PV，复用原分享记录的 `viewCount` 和 `lastViewedAt`，在原后台的分享管理及 `/api/shares` 查看。权限校验、密码错误、无效分享、元信息预览和附件请求不计数；正常刷新或再次成功读取会再次累计。这是成功读取次数，不是独立访客 UV，也不区分能执行页面脚本的机器人；不接入第三方追踪器。旧历史计数保留，不追溯修正之前可能重复累计的数据。

沿用约 5 分钟的内存聚合落库机制，正常关闭时也会写入；定时写入失败会保留增量等待重试。异常强制终止仍可能丢失尚未落库的数据，不把它当作精确审计计数。

首页和各前台页面输出独立标题、描述、关键词及 Open Graph/Twitter 元信息。无密码分享通过 `/api/share/meta` 获取已授权笔记的标题和摘要，在 SSR HTML 中输出，元信息请求不增加 PV。Nuxt 元信息接口不接受 URL 中的密码；密码分享未解锁时使用通用标题和描述，不在 SSR 元信息中泄露笔记正文。普通分享与密码分享始终设置 `noindex, nofollow`，同时禁用缓存；当前演示知识库、登录页及个人工作台也禁止收录。未来公开知识库的收录策略需要随发布功能单独实现。

在 Docker 环境文件中设置 `FNS_SITE_URL=https://notes.example.com`，用于首页 canonical；本地 Nuxt 使用 `NUXT_PUBLIC_SITE_URL`。未配置时不生成 canonical，不从请求 Host 推断站点域名。分享链接不生成携带 Token 的 canonical。

容器默认配置：

```text
FNS_WEB_FRONTEND_ENABLED=true
FNS_WEB_FRONTEND_TARGET=http://127.0.0.1:3000
FNS_API_BASE_URL=http://127.0.0.1:9000
FNS_SESSION_DIR=/fast-note-sync/storage/web-sessions
FNS_SESSION_SECURE=true
```

Go 现有 YAML `web.frontend` 配置继续保留，原生 Go 运行时仍默认关闭。Docker 环境变量优先于 YAML，target 仍可配置，但单容器通常使用默认 loopback 地址。timeout/fallback 行为不变。若改变 Go 的容器内监听端口，需要同步调整 FNS_API_BASE_URL 和健康检查；外部端口通过 FNS_PUBLIC_PORT 调整无需改变内部配置。

未提供 FNS_SESSION_PASSWORD/NUXT_SESSION_PASSWORD 时，入口脚本自动生成随机密钥写入 `config/.web-session-key`，权限 0600。重启或升级会复用此文件；不打印、不提交密钥。显式环境密钥仍优先，至少 32 字符。会话 token 仅存在服务端，持久化在原 storage 挂载下的 `web-sessions/`。浏览器只持有加密签名的 HttpOnly 会话 Cookie。

直接 HTTP 测试应设 FNS_SESSION_SECURE=false；HTTPS 生产使用 true。Nuxt 与原 React 后台登录会话独立。自然过期的闲置会话文件暂不自动清理，可按记录 expiresAt 清理；过期会话已被拒绝。

如果之前已实际部署双容器，保留原笔记 config/storage 即可迁移；原 Nuxt 会话若不迁移只会要求重新登录，不影响笔记数据。要保留其登录状态，需要沿用原会话密钥并把原 Nuxt 会话卷中的记录放到新的 storage/web-sessions/，保证 node 用户可读写。

## 日志、升级、回滚

```sh
docker compose -f docker/docker-compose.yaml logs -f
# 同时升级 Go 和 Nuxt
docker compose -f docker/docker-compose.yaml up -d --build
# 正常停止全部进程
docker compose -f docker/docker-compose.yaml stop
```

使用环境文件时，在以上命令加入 `--env-file docker/.env`。回滚前台入口，在环境文件设 `FNS_WEB_FRONTEND_ENABLED=false` 后重新创建容器：

```sh
docker compose --env-file docker/.env -f docker/docker-compose.yaml up -d --no-build
```

此时不启动 Node，`/` 恢复跳转 `/webgui`，Go 同步/后台/旧分享照常工作。原生 Go YAML 默认为关闭；Docker 默认开启，所以不能只改 YAML 而忽略环境覆盖。

此方案统一升级两个部分，不再提供单独前台镜像或独立 systemd unit。

## 验证

在 `web/` 运行 `npm run typecheck`、`npm run build`、`npm test`。构建好根仓库单镜像后运行 `npm run smoke:docker`；脚本只创建随机 Compose 项目与临时数据，测试结束清理该项目。

覆盖真实 Go API、SSR、Cookie、分享与附件、MCP、WebSocket，以及两个进程的启停、Node 故障恢复、Go 故障触发容器重启、关闭前台不启动 Node。详细结果见 `web/docs/single-container-verification.md`。

真实 Obsidian 多设备同步仍需实际插件和设备进行人工回归。公开知识库仍为明确标识的 demo，新分享页仍为安全转义的文本预览，首阶段业务范围没有扩大。

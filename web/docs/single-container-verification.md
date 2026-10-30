# 单容器改造与验证记录

日期：2026-10-30（Asia/Shanghai）。当前方案为单仓库、单镜像、单容器，替代上一阶段的双容器部署。

本页下方“分享统计与 TDK 增补”记录后续验证；首次改造部分的测试数量与发布工作流描述为当时记录，当前发布入口以 docker/NUXT.md 为准。

## 已完成的调整

- 将 `/Users/10877/community/fast-note-sync-web/` 整体迁入 `/Users/10877/community/fast-note-sync-service/web/`。代码和依赖锁文件保留，原独立目录不再使用。
- 默认 `docker/Dockerfile` 同时构建 Go 与 Nuxt，最终只生成 `fast-note-sync-service:local` 一个部署镜像。
- 默认 `docker/docker-compose.yaml` 只有一个 service，保留原 config/storage 持久化位置；Nuxt 仅绑定容器内 127.0.0.1:3000。
- `tini -g` 与简短入口脚本管理两个进程。Node 使用非 root 的 node 用户，异常退出 2 秒后单独重启；Go 退出则停止 Node 并退出容器，由 Docker 恢复。
- 会话密钥默认自动生成至 config/.web-session-key，权限 0600；会话文件写入原 storage/web-sessions，不再新增独立数据卷。
- 原 Go 业务逻辑、React 资源、认证、同步和分享授权保持；代理配置和关闭开关继续保留。Go 原生二进制仍默认关闭前台接管，可独立运行。
- 发布工作流继续使用默认 Dockerfile；源码构建会注入 VERSION/BUILD_DATE/GIT_COMMIT，不再下载已不使用的预构建产物。

## 消融结果

移除独立前台 Dockerfile、双服务 Compose、第二个服务网络配置、独立会话卷、独立 systemd unit，以及临时的 Dockerfile.source。只保留一套默认 Dockerfile/Compose。

保留 tini 用于信号转发和子进程回收，保留 gosu 用于 Node 降权；不引入通用 supervisor 框架或在 Go 中增加进程管理逻辑。入口只负责启动、清理和固定间隔重启，不增加额外配置层。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 合并后 Nuxt 类型检查、生产构建 | 通过 |
| Nuxt 生产契约测试 | 12 个场景通过，Node 报告 13 个测试含父测试 |
| Go 全量测试（Go 1.26.10，CGO 开启） | 43 个测试包通过 |
| 单镜像 Docker 构建 | 成功，arm64 本地实测 |
| 默认 Compose 配置检查 | 通过，只有一个服务 |
| 两份发布工作流 YAML | 解析通过，三个发布目标均引用 docker/Dockerfile |
| bash 入口脚本语法与 git diff --check | 通过 |
| 单容器真实联调 | 21 项全部通过 |

21 项检查覆盖：单服务/单容器数量、Go 公开入口的 Nuxt SSR、旧 React/旧分享/静态资源共存、IP 绑定拒绝不同客户端、原登录/用户/Vault/笔记 API、图片上传下载、Nuxt 登录与真实工作区、两个进程干净停止、自动密钥与登录状态跨重启保留、分享密码及附件、未认证路由兼容、认证后的 MCP SSE 响应与 StreamableHTTP 初始化、WebSocket 升级、笔记删除、退出失效、Nuxt 卡死时 Go 仍正常、Node 崩溃单独恢复、Node 非 root 且容器未重启、Go 崩溃触发容器恢复、关闭前台后不启动 Node、关闭后的正常 stop。

宿主机到 Docker 的请求在早期测试中出现来源地址变化。测试夹具显式模拟固定反代客户端 IP，并额外验证不同 IP 返回原错误码 312；Go 的 IP 绑定配置保持开启，未修改或放宽认证逻辑。

## 实测边界

未替换现有生产容器，未提交或推送代码，未触发真实镜像发布。临时测试容器、网络与数据目录已清理。镜像其他架构及远程 GitHub Actions 发布仍需 CI/目标环境验证。

真实 Obsidian 插件多设备同步仍需人工验收；本轮保留原 Go 同步单测与 WebSocket/API 验证，不以此冒充多设备端到端测试。首阶段业务范围不变：公开知识库为 demo，分享为受控文本预览，完整 Markdown/双链/发布管理尚未加入。

## 变更入口

- 仓库根 README.md、docs/README.zh-CN.md：新部署入口。
- docker/Dockerfile、Dockerfile.dockerignore、entrypoint.sh、docker-compose.yaml、.env.example、NUXT.md：单镜像构建与部署。
- .github/workflows/release.yml、alpha-release.yml：移除无用下载，沿用默认 Dockerfile。
- web/：迁入的完整前台源码、构建配置、测试与说明。
- web/tests/docker-smoke.mjs：单容器生命周期及原 API 真实回归。

## 分享统计与 TDK 增补

- 将计数从重复执行的分享权限校验移至成功读取笔记的 HTTP 处理器。元信息请求、密码错误、缺失笔记和附件请求不增加 PV。保持原统计字段、5 分钟聚合及正常退出落库；定时写入失败会重新保留增量，等待重试。
- 新增 Go `/api/share/meta` 与 Nuxt `/api/frontend/shares/meta`，只返回授权后的标题、纯文本摘要，不返回正文；Nuxt 预览不接受 URL 密码。新分享页服务端预取无密码分享元信息，密码分享使用通用 SSR 元信息。
- 首页及各页面输出独立 TDK、Open Graph/Twitter 元信息。所有分享、演示知识库、登录与工作台默认不收录；分享及接口禁用缓存。首页 canonical 仅使用管理员配置的公开站点域名。
- Go 相关 service/API/middleware 测试通过，覆盖单次计数、预览不计数、失败读取不计数、写入失败并发增量合并重试。
- Nuxt 类型检查、生产构建通过；生产契约测试 13 个子场景通过（Node 报告 14 个测试，含父测试）。
- 重新构建单容器镜像，22 项真实容器检查通过。新增检查验证密码分享 SSR 不泄露正文、公开分享 SSR 元信息、元信息不计 PV、笔记读取累计一次及正常重启后的持久统计、附件不计 PV。
- 消融：复用原计数和后台，不新增数据库表、UV 指纹、第三方追踪器或通用埋点框架；多页面只共用一个轻量 SEO composable。
- 尚未重新提交或发布生产镜像，原生产数据未操作。PV 是成功读取次数，API/可执行脚本的机器人也可能累计；强制终止可能丢失未落库增量。历史可能重复累计的数据不追溯修改。

## 移除打赏模块

- 移除各语言 README 中的打赏入口、打赏名单及支付图片；保留上游署名、插件链接和许可证。历史更新日志不追溯改写。
- 原 React 看板移除打赏组件与名单请求，移除各语言打赏文案，并去掉对应空列。更新 HTML、普通 JS、gzip 和 Brotli 资源，通过 import map 与重导出兼容已有缓存引用。后台构建产物的维护方式见 frontend/README.md。
- 移除 /api/support、内存名单加载与排序、定时获取名单任务、名单处理脚本及仅供这些脚本使用的 npm 依赖；同步清理 OpenAPI 和 REST 文档。
- Go 全量 43 个包测试通过；合并镜像重新构建成功；真实容器联调增至 23 项通过，验证所有语言模块在 identity/gzip/br 编码下不含打赏逻辑，旧接口与图片按原错误协议返回 Not Found API。
- 浏览器实际登录临时后台，确认看板无打赏卡片、系统设置和用户管理正常显示。截图保存至本次任务输出目录；测试未使用生产数据。
- 消融后不保留空组件、隐藏开关或仍运行的后台打赏任务。未修改应用版本与数据库结构，未重新提交、推送或发布。

## GitHub Linux runner 权限修复

首次 1.0.0 构建在容器集成测试中发现：Linux bind mount 保留容器 UID，宿主机 runner 无法读取 root 所有、0600 权限的会话密钥，也无法直接删除 root 所有日志目录。此前 macOS Docker Desktop 的本地测试未暴露这一差异。

测试改为在运行容器内以 root 读取密钥指纹、长度和权限，仅比较这些结果以确认重启持久化，不把密钥明文传回宿主机。清理时先停止并移除测试服务，再使用无网络的临时容器清空本次 mkdtemp 目录，然后删除空目录；不使用 sudo、不改变生产文件权限。清理错误单独报告，不覆盖原始测试错误。生产入口与会话权限未修改。

修复后，macOS 宿主机和 Linux UID 1001 的非 root runner 均完成 24 项容器检查。Linux 复现使用 Docker named volume 内的真实 Linux 文件系统承载临时数据，保留 root 所有权与 0600 密钥权限，读取及清理均通过；临时容器和数据卷已清理。

按当前发布范围，`.github/workflows` 仅保留 `docker.yml`；原 Go 正式版/测试版发布、fnOS 打包和 CNB 同步工作流全部移除。镜像发布前的测试仍作为校验保留。

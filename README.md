# Fast Note Sync Service

基于 [haierkeys/fast-note-sync-service](https://github.com/haierkeys/fast-note-sync-service) 扩展的 Obsidian 自托管同步服务。本项目保留原同步服务，新增 Nuxt 4 前台与分享体验，采用**单仓库、单镜像、单容器**部署。

笔记同步需配合 [Obsidian Fast Note Sync 插件](https://github.com/haierkeys/obsidian-fast-note-sync)。

本分支从 **1.0.0** 开始独立版本编号，基于上游 3.6.1；数据库迁移仍沿用上游兼容基线，不因产品重新编号而降级。

## 相对上游的调整

| 调整 | 说明 |
| --- | --- |
| Nuxt 4 前台 | 新增门户、账号登录、个人工作台，读取真实笔记库和最近笔记；源码位于 `web/` |
| 单容器部署 | 一个镜像包含 Go 与 Nuxt，Go 对外提供 9000 入口，内部代理 Nuxt；3000 端口无需对外暴露 |
| 分享体验 | 新增分享文本预览，复用原有权限、密码和有效期校验，保留原分享链接 |
| 浏览统计 | 修复分享重复计数，成功读取笔记记一次 PV；元信息预览、失败访问与附件请求不计数，约 5 分钟落库，在原后台查看 |
| TDK 与预览 | 补齐页面标题、描述、关键词和社交分享元信息；密码分享未解锁时不泄露正文，所有分享默认禁止搜索收录 |
| 镜像构建 | GitHub Actions 只保留 Docker Hub 流程，并行构建和校验 amd64 / arm64，合并推送版本镜像；不打包 Go 二进制或 fnOS，不更新 `latest` |
| 界面精简 | 移除上游打赏入口、名单与后台更新任务，保留上游署名和许可证 |

原 React 后台、REST API、WebSocket、MCP 和数据存储继续沿用。当前 `/kb/demo` 为演示知识库，新分享页仅提供只读文本预览；完整 Markdown 渲染、在线编辑与知识库发布管理尚未实现。

## 快速部署

从源码构建完整镜像：

```sh
git clone https://github.com/timor-m/fast-note-sync-service.git
cd fast-note-sync-service
# 直接 HTTP 测试；HTTPS 生产环境使用 FNS_SESSION_SECURE=true。
FNS_SESSION_SECURE=false docker compose -f docker/docker-compose.yaml up -d --build
```

访问 `http://服务器IP:9000`：

- `/`：新前台；`/login`、`/app`：登录与个人工作台。
- `/webgui/`：原管理后台，负责注册、管理和复制插件配置。
- `/s/:token?id=:resourceId`：新分享页；原 `/share/:side/:token` 继续可用。

默认复用 `/data/fast-note-sync/config` 和 `/data/fast-note-sync/storage`。迁移前备份并停止旧容器，保留原挂载、数据库连接及自定义网络配置；不要让两个 Go 实例同时使用同一 SQLite 数据库。

镜像目标为 `timorm/fast-note-sync-service`，请在 [Actions](https://github.com/timor-m/fast-note-sync-service/actions) 确认对应版本发布成功后再拉取；上游镜像不包含本项目整合的 Nuxt 前台。镜像部署、环境变量、迁移和回滚见[部署说明](docker/NUXT.md)。

## 详细文档

- [完整项目说明](docs/README.zh-CN.md)
- [单容器部署、镜像发布与浏览统计](docker/NUXT.md)
- [前台开发](web/README.md) · [验证记录](web/docs/single-container-verification.md)
- [配置示例](config/config.yaml) · [REST API](docs/REST_API.md) · [MCP 接入](docs/README.zh-CN.md#-mcp-模型上下文协议-支持)

本分支问题请提交至[当前仓库 Issues](https://github.com/timor-m/fast-note-sync-service/issues)。感谢上游作者及贡献者，许可条款见 [LICENSE](LICENSE)。

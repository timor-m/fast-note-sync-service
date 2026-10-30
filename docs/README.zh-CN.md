# Fast Note Sync Service

[简体中文](README.zh-CN.md) / [English](../README.md)

面向 Obsidian 的自托管笔记同步服务，集成 Nuxt 4 前台、原 React 管理后台、REST API 和 MCP。本仓库基于 [haierkeys/fast-note-sync-service](https://github.com/haierkeys/fast-note-sync-service) 扩展，将 Go 与 Nuxt 合并为**一个镜像、一个容器**部署。

笔记同步需配合 [Obsidian Fast Note Sync 插件](https://github.com/haierkeys/obsidian-fast-note-sync)。本分支的问题请提交至[当前仓库 Issues](https://github.com/timor-m/fast-note-sync-service/issues)。

## 当前功能

- **笔记同步**：沿用原有笔记、附件、目录、配置、历史记录、回收站、备份和存储集成，以及 WebSocket 同步能力。
- **Nuxt 前台**：响应式门户、账号登录、读取真实笔记库和最近笔记的个人工作台，以及复用原 Go 分享权限和密码校验的分享入口。
- **原管理后台**：`/webgui/` 保留 React 后台，继续负责注册、插件配置和管理操作；原 `/share/:side/:token` 分享链接继续可用。
- **接口集成**：REST API、MCP StreamableHTTP/SSE，以及原有 SQLite、MySQL、PostgreSQL 支持继续由 Go 提供。

前台首页仅保留工作区入口，已移除管理后台导航与演示知识库；原后台仍可通过 `/webgui/` 直接访问。新 `/s/:token?id=:resourceId` 分享页目前提供只读文本预览；完整 Markdown 渲染、双链、在线编辑和知识库发布管理仍待后续实现。OIDC 登录继续在原 WebGUI 中使用，新登录页目前采用账号密码登录。

分享浏览统计复用原后台：每次成功读取笔记累计一次 PV，元信息预览、失败访问及附件请求不计数，约 5 分钟聚合落库。页面提供独立 TDK 和社交分享元信息，无密码分享在服务端输出标题与摘要，密码分享使用通用预览信息；所有分享链接默认禁止搜索收录。统计口径、限制和站点域名配置见[浏览统计与 TDK](../docker/NUXT.md#分享浏览统计与-tdk)。

## 快速开始：从源码构建

Docker 构建会同时生成 Go 服务和 Nuxt 前台，无需单独部署前端容器：

```sh
git clone https://github.com/timor-m/fast-note-sync-service.git
cd fast-note-sync-service
# 直接 HTTP 测试；HTTPS 生产部署应使用 FNS_SESSION_SECURE=true。
FNS_SESSION_SECURE=false docker compose -f docker/docker-compose.yaml up -d --build
```

访问 `http://服务器IP:9000`。HTTPS 生产环境保持默认的 `FNS_SESSION_SECURE=true`。需要持久配置时，参考 [docker/.env.example](../docker/.env.example) 创建 `docker/.env`，并在 Compose 命令中加入 `--env-file docker/.env`。

对外入口为 Go 的 **9000 端口**。Nuxt 只监听**容器内部的 `127.0.0.1:3000`**，无需映射 3000。原配置若使用其他独立服务端口，再按实际需求增加映射。

| 路径 | 用途 |
| --- | --- |
| `/` | Nuxt 门户首页 |
| `/login`、`/app` | 新登录页和个人工作台 |
| `/webgui/` | 原 React 管理后台与注册入口 |
| `/s/:token?id=:resourceId` | 新分享文本预览 |
| `/share/:side/:token` | 原分享页面 |
| `/api/*` | 原业务、同步与 MCP 接口 |
| `/api/frontend/*` | Nuxt 服务端接口适配层 |

首次使用时，在允许注册的情况下进入 `/webgui/` 注册账号，再从后台复制 API 配置到 Obsidian 插件。已有账号也可以通过 `/login` 登录新前台；Nuxt 与 React 的登录会话相互独立。

## 旧数据复用与升级

默认挂载路径沿用原项目：

| 宿主机目录 | 容器目录 | 内容 |
| --- | --- | --- |
| `/data/fast-note-sync/config` | `/fast-note-sync/config` | 原服务配置及新增前台会话密钥 |
| `/data/fast-note-sync/storage` | `/fast-note-sync/storage` | 默认数据库、附件及新增前台会话 |

切换前备份数据并停止旧容器，沿用完整的原目录、数据库连接配置、外部数据库网络和自定义存储挂载。本次前台整合未修改原数据库模型；若同时升级 Go 服务版本，仍会执行原项目已有的启动迁移逻辑。不要让两个 Go 实例同时操作同一 SQLite 数据库。新增会话文件位于 `storage/web-sessions`，自动生成的会话密钥位于 `config/.web-session-key`。

原数据位于其他位置时，用 `FNS_DATA_DIR` 指向包含原 `config` 和 `storage` 的父目录。迁移、反向代理、会话与回滚操作详见[单容器部署说明](../docker/NUXT.md)。

## GitHub 构建与 Docker Hub 镜像

[Docker Hub 工作流](../.github/workflows/docker.yml) 在推送 `master` 时自动运行，也支持选择 `master` 手动运行。先执行 Go/Nuxt 测试、类型检查和完整镜像的单容器集成检查，再推送 `linux/amd64`、`linux/arm64` 镜像。

GitHub Actions 只保留这条流水线，不再运行 Go 二进制发布、fnOS FPK 打包或 CNB 同步，也不自动创建 GitHub Release。

- 仓库 Secrets：`DOCKERHUB_USERNAME`、`DOCKERHUB_TOKEN`。
- 可选仓库 Variable：`DOCKERHUB_IMAGE`，默认 `timorm/fast-note-sync-service`。
- 标签取自 `internal/app/version.go`，当前为 `1.0.1`；同时推送版本标签和 `latest`，指向同一个双架构镜像。同版本重新构建会更新该标签，可使用工作流摘要中的 digest 固定某次构建。

**本次单容器实现的首次镜像发布尚未完成。** 在[本仓库 Actions](https://github.com/timor-m/fast-note-sync-service/actions) 确认对应版本发布成功前，请使用上面的源码构建方式。镜像发布后，在仓库根目录执行：

```sh
export FNS_IMAGE=docker.io/timorm/fast-note-sync-service:1.0.1
docker compose -f docker/docker-compose.yaml pull
docker compose -f docker/docker-compose.yaml up -d --no-build
```

直接 HTTP 部署时，还需在 `up` 命令或环境文件中设置 `FNS_SESSION_SECURE=false`。上游 Docker 镜像、一键安装脚本及 Go 二进制发布包不包含本仓库整合的 Nuxt 前台。

## 开发与验证

| 目录 | 职责 |
| --- | --- |
| `internal/`、`cmd/`、`pkg/` | 原 Go 服务与业务接口 |
| `web/` | Nuxt 4 SSR 前台与服务端接口适配 |
| `frontend/` | 嵌入 Go 的原 React 构建资源 |
| `docker/` | 统一 Dockerfile、入口脚本、Compose 和部署说明 |

本地开发需要 Go 1.26 和符合 `web/package.json` 要求的 Node 版本。两进程开发方式见[前台开发说明](../web/README.md)；使用 Docker 构建时会提供所需工具链和运行环境。

```sh
go test ./...
cd web
npm ci
npm test
npm run typecheck
npm run build
```

构建 `fast-note-sync-service:local` 后，在 `web/` 执行 `npm run smoke:docker`，使用临时数据检查原接口兼容、SSR、分享、附件、MCP、WebSocket 和进程恢复。详情见[单容器验证记录](../web/docs/single-container-verification.md)。真实 Obsidian 多设备同步仍需要插件和实际设备回归。

## 文档与上游

- [配置示例](../config/config.yaml)、[Nginx 反代示例](../scripts/https-nginx-example.conf)。
- [REST API](REST_API.md)、[OpenAPI](swagger.yaml)、[WebGUI OIDC](runbook/OIDC.zh-CN.md)。
- [上游更新日志](CHANGELOG.zh-CN.md)；本分支新增能力以本页和单容器部署说明为准。
- [上游项目](https://github.com/haierkeys/fast-note-sync-service)、[许可证](../LICENSE)。其他已有语言 README 尚未同步本分支的部署变化，仍主要描述上游版本。

## 🧰 MCP (模型上下文协议) 支持

FNS 现已原生支持 **MCP (Model Context Protocol)**，并同时提供 **SSE** 和 **StreamableHTTP** 两种传输协议。

您可以将 FNS 作为 MCP 服务端直接接入 Cherry Studio、Cursor、Claude Code、hermes-agent 等兼容的 AI 客户端。接入后，AI 即可具备读写私人笔记和附件的能力。同时，所有由 MCP 产生的修改，都会通过 WebSocket 实时同步到您的各个设备终端。

如需使用 Stytch 配置受 OAuth 保护的 MCP 部署，请阅读 [MCP OAuth 与 Stytch 运行手册](runbook/mcp-oauth-stytch.zh-CN.md)。

### 通用请求头参数

无论使用哪种传输模式，均支持以下请求头：

- **鉴权 Header**：`Authorization: Bearer <您的 API Token>`（在 WebGUI 的复制 API 配置中获取）
- **可选 Header**：`X-Default-Vault-Name: <笔记库名称>`（用于指定 MCP 操作的默认笔记库，若工具调用时未指定 `vault` 参数，则使用此值）
- **可选 Header**：`X-Client: <客户端类型>`（用于连接 MCP 的客户端类型，如：Cherry Studio / OpenClaw）
- **可选 Header**：`X-Client-Version: <客户端版本>`（用于连接 MCP 的客户端版本，如：1.1）
- **可选 Header**：`X-Client-Name: <客户端名称>`（用于连接 MCP 的客户端名称，如：Mac）

---

### 接入配置：StreamableHTTP 模式（推荐）

StreamableHTTP 是 MCP 生态的标准传输协议，单个端点即可完成请求，对防火墙更友好，被较新的 MCP 客户端（如 Claude Code、hermes-agent）原生支持。

- **接口地址**：`http://<您的服务器IP或域名>:<端口>/api/mcp`
- **请求方式**：`POST`（发送请求/通知）、`GET`（监听服务端推送）、`DELETE`（终止会话）

#### 示例：Claude Code / hermes-agent / Cursor 等

*(注：请将 `<ServerIP>`、`<Port>`、`<Token>` 和 `<VaultName>` 替换为您自己的实际信息)*

```json
{
  "mcpServers": {
    "fns": {
      "url": "http://<ServerIP>:<Port>/api/mcp",
      "type": "http",
      "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer <Token>",
        "X-Default-Vault-Name": "<VaultName>",
        "X-Client": "<Client>",
        "X-Client-Version": "<ClientVersion>",
        "X-Client-Name": "<ClientName>"
      }
    }
  }
}
```

---

### 接入配置：SSE 模式（向后兼容）

SSE 模式为旧版传输协议，仍完整保留以保持向后兼容，适用于仅支持 SSE 的 MCP 客户端（如 Cherry Studio）。

- **接口地址**：`http://<您的服务器IP或域名>:<端口>/api/mcp/sse`

#### 示例：Cherry Studio / Cline 等

*(注：请将 `<ServerIP>`、`<Port>`、`<Token>` 和 `<VaultName>` 替换为您自己的实际信息)*

```json
{
  "mcpServers": {
    "fns": {
      "url": "http://<ServerIP>:<Port>/api/mcp/sse",
      "type": "sse",
      "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer <Token>",
        "X-Default-Vault-Name": "<VaultName>",
        "X-Client": "<Client>",
        "X-Client-Version": "<ClientVersion>",
        "X-Client-Name": "<ClientName>"
      }
    }
  }
}
```

## 🔗 客户端 & 客户端插件 & 协作项目

* Obsidian Fast Note Sync 插件
  * [Obsidian Fast Note Sync Plugin](https://github.com/haierkeys/obsidian-fast-note-sync) / [cnb.cool 镜像库](https://cnb.cool/haierkeys/obsidian-fast-note-sync)
* 三方客户端
  * [FastNodeSync-CLI ](https://github.com/Go1c/FastNodeSync-CLI) 一款基于 Python 和 FNS WebSocket 同步协议实现的双向实时同步的命令行客户端, 适用于无 GUI 的 Linux 服务器环境（如 OpenClaw），实现与 Obsidian 桌面/移动端等价的同步能力。
  * [go-fast-note-sync](https://github.com/erichll/go-fast-note-sync) 一款基于 Go 和 FNS WebSocket 同步协议的 Go CLI 后台同步守护进程，主要面向 Linux 无头（headless）环境，同时也支持 macOS 和 Windows。
  * [Fast-note-sync-docker](https://github.com/youpingfang/obsidian-note-sync-docker) 一款基于 Docker ， Python ， FNS WebSocket 同步协议 的 快速容器化部署方案，实现 笔记库和配置文件到远程服务器。
* 协作项目
  * [Share to Save](https://github.com/chenxiccc/Obsidian-Share-to-Save) 是一款 Obsidian 插件，将分享的网页 URL 自动下载为 Markdown 笔记。

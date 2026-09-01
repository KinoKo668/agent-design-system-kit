# MCP-001：本地 Stdio Server

## 1. 目标

MCP-001 建立第一条能被 Codex、Claude、Cursor 等 MCP Host 启动和发现的本地协议入口：

```text
MCP Host
→ 启动 hatchkit-mcp 子进程
→ initialize / server discover
→ 读取 Server Instructions
→ tools/list
→ hatchkit_status
→ 安全加载并校验本地 Catalog
```

当前只暴露健康与 Catalog 完整性状态，不提前实现 Brief、Token、Component、Resolve 或 Figma 写入 Tool。

## 2. 协议与依赖

- 使用 `@modelcontextprotocol/server` `2.0.0`；
- 使用本地 stdio Transport，不启动 HTTP 端口；
- 支持旧版 `initialize` 流程与 2026-07-28 现代协商；
- 使用 Zod 4 声明 Tool 输入和结构化输出；
- 正式 Server Package 仍只依赖 Workspace 中的 Core，不依赖 CLI 或 Figma Plugin。

MCP SDK 版本遵循 [ADR-001](ADR-001-工程技术栈与Monorepo方案.md)。实现接口以 [MCP 官方 TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) 为准。

## 3. Server 身份与 Instructions

初始化返回稳定身份：

```json
{
  "name": "hatchkit",
  "version": "0.0.0"
}
```

Server Instructions 的前 512 个字符完整包含最重要的治理约束：

- 这是本地只读设计系统控制面；
- 查询前先调用 `hatchkit_status`；
- 只使用准确登记的组件身份与 Variant；
- 不得发明、近似绘制或静默回退旧资产；
- 查询成功不等于获得 Figma 写入授权；
- 能力缺失时必须停止并提交结构化变更申请。

Codex 会在初始化时读取 MCP `instructions`。配置与能力依据 [OpenAI 官方 Codex MCP 文档](https://developers.openai.com/codex/mcp/)。

## 4. `hatchkit_status`

该 Tool 每次调用都会重新使用 REG-001 Loader 读取当前磁盘，不依赖进程启动时缓存。

成功结果使用 Toolkit Result `1.0.0`，包含：

- `status: ready`；
- Server 名称、版本、stdio 与只读状态；
- Catalog Project ID；
- Brief、Token Set、Component、Registry 数量；
- Root 内的相对来源路径。

Tool Annotation 固定为：

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

Catalog 无效时返回 MCP Tool Error，正文仍是统一 Toolkit Failure。错误不包含本机绝对路径和底层系统异常。

## 5. 正确示例 Catalog

四份正确资产位于独立目录：

```text
design-system/hatch-demo/
├── briefs/hatch-demo.brief.json
├── tokens/button-foundation.tokens.json
├── components/button.component.json
└── registry/components.registry.json
```

故意错误的 Schema Fixture 继续保留在 `design-system/examples/`，不会被正式 Loader 当成 Catalog 读取。Loader 不增加任何按文件名忽略错误的例外规则。

## 6. 启动

先构建：

```bash
pnpm build
```

查看启动参数：

```bash
pnpm --silent hatchkit:mcp --help
```

正式 Host 使用以下命令启动：

```bash
node packages/mcp-server/dist/bin.js \
  --project hatch-demo \
  --root design-system/hatch-demo
```

也可以使用 `HATCHKIT_PROJECT_ID` 和 `HATCHKIT_DESIGN_SYSTEM_ROOT`。两者不是凭据，仅用于本地启动配置。

## 7. Codex 项目配置

仓库提供无凭据模板：

```text
config/codex-mcp.example.toml
```

在仓库根目录运行：

```bash
mkdir -p .codex
cp config/codex-mcp.example.toml .codex/config.toml
```

`.codex/` 继续由 Git 忽略，避免以后误提交个人 Host 设置。重启 Codex 后，可使用 `/mcp` 查看 Server；CLI 用户也可以运行：

```bash
codex mcp list
codex mcp get hatchkit
```

OpenAI 官方文档确认 Codex CLI 与 IDE Extension 共享 MCP 配置，并支持受信任项目中的项目级 `.codex/config.toml`。

## 8. Stdio 安全边界

- stdout 只允许 MCP 协议消息；
- 帮助文本只在显式 `--help` 时输出；
- 参数错误和 Transport 错误只写 stderr；
- stderr 不包含异常对象、绝对路径、凭据或 Figma Locator；
- Server 不读取网络凭据，不访问网络，不监听端口；
- `hatchkit_status` 不写 Git、不写 Figma、不创建运行时状态。

## 9. 验证

正式测试覆盖：

- Server 身份、Instructions 与长度限制；
- `tools/list` 能发现唯一只读状态 Tool；
- 真实 Catalog 返回 `ready` 与四类资产计数；
- 错误 Root 返回 Tool Error 且不泄漏绝对路径；
- 参数、环境变量与 Help 行为。

构建后还会运行真实子进程 stdio 冒烟测试：

```bash
pnpm mcp:smoke
```

该测试先验证 Help 与错误启动不会污染协议 stdout 或泄漏本机路径，再使用官方 MCP Client 分别完成旧版与现代协议协商、读取 Instructions、列出 Tool 并调用 `hatchkit_status`。它属于统一 `pnpm check` 门禁。

## 10. 当前不做

MCP-001 不实现：

- Brief、Token 与 Component 查询 Tool；
- Resolve 与 Change Request Tool；
- Codex Agent 自动选择 Tool 的端到端契约；
- HTTP MCP Server、OAuth 或远程部署；
- Figma Bridge 与 Writer。

其中 Brief、Token 与 Component Search 已在 MCP-002 完成；其余分别进入 MCP-003、MCP-004 与 FIG 系列任务。

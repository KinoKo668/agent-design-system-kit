# Agent Host 接入说明

## 1. 目的与支持边界

Hatchkit 通过本地 `stdio` MCP Server 向 Agent 提供设计系统查询、建库、Instance 插入与审计能力。第一版不要求公网服务器。只读查询只需要 Agent Host 与 Hatchkit；启用 Figma 能力时，Agent Host、Hatchkit、Figma Desktop、Bridge 与 Figma Plugin 必须运行在同一台可信电脑上。

本文覆盖：

- Codex CLI、Codex IDE 与 ChatGPT Desktop；
- Claude Code；
- Cursor IDE 与 Cursor CLI；
- Google Antigravity、Antigravity IDE 与 Antigravity CLI。

ChatGPT 网页端不会读取本地 Codex 配置，因此不能直接启动当前本地 `stdio` Server。网页端若要使用 Hatchkit，需要未来提供受认证的远程 MCP 或 Plugin；这不属于 `v0.1.0-alpha.1` 范围。[OpenAI 官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

## 2. 所有 Host 共用的启动合同

先在仓库根目录安装、校验并构建：

```bash
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install --frozen-lockfile
pnpm check
```

只读 Server 的共用启动参数是：

```text
command: /ABSOLUTE/PATH/TO/node
args:
  /ABSOLUTE/PATH/TO/hatchkit/packages/mcp-server/dist/bin.js
  --project
  hatch-demo
  --root
  /ABSOLUTE/PATH/TO/hatchkit/design-system/hatch-demo
```

必须使用绝对路径，避免不同 Host 的工作目录、Shell 初始化和 Node 版本解析产生差异。Node.js 必须符合根 `package.json` 的 `engines` 范围。

连接后先调用 `hatchkit_status`。只有 `status: valid` 时才能继续查询；默认只读模式不会暴露任何 Figma 写入或 Figma 页面审计 Tool。

## 3. Codex 与 ChatGPT Desktop

Codex CLI、Codex IDE 和 ChatGPT Desktop 在同一 Codex Host 上共享 MCP 配置。Codex 支持用户级 `~/.codex/config.toml`，也支持可信项目中的 `.codex/config.toml`。[OpenAI 官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

仓库已经提供只读模板：

```bash
mkdir -p .codex
cp config/codex-mcp.example.toml .codex/config.toml
```

若从仓库外启动 Host，把模板中的 `command`、脚本路径、`cwd` 与 `--root` 改为绝对路径。验证：

```bash
codex mcp list
codex mcp get hatchkit
```

也可以在 ChatGPT Desktop 中打开 **Settings → MCP servers → Add server**，选择 `STDIO`，填入同一启动合同，保存后重启。OpenAI 明确说明 ChatGPT Desktop、Codex CLI 与 IDE Extension 共用配置；项目级配置只会在项目受信任时加载。[OpenAI 配置说明](https://learn.chatgpt.com/docs/config-file/config-basic)

## 4. Claude Code

Claude Code 支持本地 `stdio` Server。个人本地配置可直接执行：

```bash
claude mcp add --transport stdio hatchkit -- \
  /ABSOLUTE/PATH/TO/node \
  /ABSOLUTE/PATH/TO/hatchkit/packages/mcp-server/dist/bin.js \
  --project hatch-demo \
  --root /ABSOLUTE/PATH/TO/hatchkit/design-system/hatch-demo
```

验证：

```bash
claude mcp list
claude mcp get hatchkit
```

Claude Code 也允许把团队共享配置写入项目根目录 `.mcp.json`，并会在首次交互会话中要求用户批准项目级 Server。不要把 Writer Session Token 写进这个可提交文件。[Anthropic 官方 MCP 文档](https://code.claude.com/docs/en/mcp)

## 5. Cursor

Cursor 支持项目级 `.cursor/mcp.json` 与用户级 `~/.cursor/mcp.json`。建议先使用本机用户级配置；若提交项目级配置，必须保持只读且不包含密钥。[Cursor 官方 MCP 文档](https://docs.cursor.com/context/model-context-protocol)

```json
{
  "mcpServers": {
    "hatchkit": {
      "command": "/ABSOLUTE/PATH/TO/node",
      "args": [
        "/ABSOLUTE/PATH/TO/hatchkit/packages/mcp-server/dist/bin.js",
        "--project",
        "hatch-demo",
        "--root",
        "/ABSOLUTE/PATH/TO/hatchkit/design-system/hatch-demo"
      ]
    }
  }
}
```

在 Cursor 设置中启用 `hatchkit`，或使用 CLI 验证：

```bash
cursor-agent mcp list
cursor-agent mcp list-tools hatchkit
```

Cursor Agent CLI 会读取与 IDE 相同的 `mcp.json` 配置。[Cursor CLI 官方说明](https://docs.cursor.com/en/cli/using)

## 6. Google Antigravity

Antigravity 支持本地和远程 MCP Server。产品形态与版本的全局路径不同：Antigravity／IDE 可以从 **Settings → Customizations → MCP Servers** 打开原始配置；Antigravity CLI 的全局配置位于 `~/.gemini/antigravity-cli/mcp_config.json`，Workspace 配置位于 `.agents/mcp_config.json`。[Google Antigravity 入门](https://codelabs.developers.google.com/getting-started-google-antigravity) · [Google Antigravity CLI MCP 说明](https://codelabs.developers.google.com/genai-for-dev-antigravity-cli)

CLI Workspace 示例：

```json
{
  "mcpServers": {
    "hatchkit": {
      "command": "/ABSOLUTE/PATH/TO/node",
      "args": [
        "/ABSOLUTE/PATH/TO/hatchkit/packages/mcp-server/dist/bin.js",
        "--project",
        "hatch-demo",
        "--root",
        "/ABSOLUTE/PATH/TO/hatchkit/design-system/hatch-demo"
      ],
      "env": {}
    }
  }
}
```

重启 Antigravity 后执行 `/mcp`，确认 `hatchkit` 已连接，并只启用当前任务需要的 Tool。

## 7. 临时启用 Writer

先启动带 Git Approval 校验的 Bridge：

```bash
pnpm hatchkit:figma-bridge -- --project hatch-demo --root design-system/hatch-demo
```

Bridge 每次启动都会显示短期 Session Token。只有在准备执行经批准的 Figma 操作时，才给本机 Hatchkit MCP 进程同时注入：

```text
HATCHKIT_FIGMA_BRIDGE_URL=http://127.0.0.1:38451
HATCHKIT_FIGMA_BRIDGE_TOKEN=<当前 Bridge Session Token>
```

不同 Host 均可用其本机、未提交的 MCP 配置或启动环境传入这两个值。禁止把 Token 放入：

- 仓库内 `.codex/config.toml`、`.mcp.json`、`.cursor/mcp.json` 或 `.agents/mcp_config.json`；
- 命令行参数、Issue、PR、日志、截图或聊天记录；
- 任何团队共享配置。

两项环境变量缺少任意一项时，Hatchkit 会拒绝启动；URL 不是 `http://127.0.0.1` 回环 Origin 时也会失败关闭。Session 结束后应删除本机临时配置并重启 Host。

Writer 出现后，执行顺序固定为：

```text
hatchkit_status
→ hatchkit_ensure_variables
→ hatchkit_ensure_component
→ hatchkit_resolve_component
→ hatchkit_insert_*_instance
→ hatchkit_audit_styles
  + hatchkit_audit_components
  + hatchkit_audit_registry_drift
```

公开 Demo 没有可用于真实写入的 Approval Record，所以即使连接成功，写入仍应被 Bridge 阻断。不得通过伪造 Approval 绕过该结果。

## 8. 通用验收清单

- Host 显示 `hatchkit` 已连接；
- `hatchkit_status` 返回 `status: valid`；
- 默认模式只显示只读查询与 Change Request Tool；
- 相同精确查询在不同 Host 返回一致资产身份；
- 未建立 Writer Session 时看不到 Figma 写入 Tool；
- Writer 配置不在 `git status` 或任何日志中出现；
- 无真实 Approval 时，写请求在进入 Figma Queue 前失败关闭；
- 完成真实写入后运行三类审计，并保存不含凭据的验收证据。

## 9. 文档版本说明

以上 Host 行为依据 2026-09-01 获取的官方文档。Host 配置格式属于外部接口，升级客户端后若行为不同，应先复查对应官方文档，再修改本说明和契约测试。

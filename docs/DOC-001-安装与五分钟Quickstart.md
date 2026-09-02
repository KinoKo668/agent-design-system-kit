# DOC-001：安装与五分钟 Quickstart

> 当前版本是面向开发者的本地优先 Alpha。五分钟流程可以完整验证 Catalog、Button 查询／解析和自动化 Agent 主链路，但公开 Demo 没有真实人工 Approval Record，因此不会引导你绕过门禁写入真实 Figma 文件。

## 1. 你会得到什么

完成“只读五分钟流程”后，你会确认：

- Hatchkit 能加载并校验 Git 中的 Brief、三套 UI Direction、Token、Button Contract 与 Registry；
- CLI 能准确搜索 Button 并解析一个 Contract 中真实存在的 Variant；
- Agent 面向的 MCP 黄金路径和失败矩阵均可复现；
- 全程不需要云服务器、数据库、账号或 Figma 文件。

可选的后半部分会连接 Figma Development Plugin 与本地 Bridge，但只做连接诊断，不执行未经审批的写入。

## 2. 前置要求

- Git；
- Node.js `24.20.0`，仓库根目录 `.nvmrc` 已固定该版本；
- Corepack；
- Figma Desktop，仅在执行可选 Plugin 连接时需要。

项目支持 Node.js `>=22.22 <27`，但首次使用建议与 CI 主版本保持一致。pnpm 固定为 `11.24.0`，不要改用 npm 或未固定的全局 pnpm 生成 Lockfile。

## 3. 安装

```bash
git clone https://github.com/KinoKo668/hatchkit.git
cd hatchkit
nvm use
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm build
pnpm --silent hatchkit --version
```

没有使用 nvm 时，请自行确认 `node --version` 为 `v24.20.0`，然后从 `corepack enable pnpm` 开始。

## 4. 五分钟只读 Button 演示

### 4.1 校验公开 Catalog

```bash
pnpm --silent hatchkit validate \
  --project hatch-demo \
  --root design-system/hatch-demo \
  --brief briefs/hatch-demo.brief.json \
  --direction-review directions/hatch-demo.direction-review.json \
  --token-set tokens/button-foundation.tokens.json \
  --component components/button.component.json \
  --registry registry/components.registry.json
```

成功时 JSON 中应包含 `"status": "valid"`，并且 Brief、Direction Review、Token Set、Component、Registry 各有一份。

### 4.2 精确搜索 Button

```bash
pnpm --silent hatchkit search \
  --project hatch-demo \
  --root design-system/hatch-demo \
  --brief briefs/hatch-demo.brief.json \
  --direction-review directions/hatch-demo.direction-review.json \
  --token-set tokens/button-foundation.tokens.json \
  --component components/button.component.json \
  --registry registry/components.registry.json \
  --term Button
```

结果应只有一个 `button@1.0.0`，并显示 `figma-ready`。Hatchkit 不会把拼写相似但不准确的名称猜成 Button。

### 4.3 解析真实 Variant

```bash
pnpm --silent hatchkit resolve \
  --project hatch-demo \
  --root design-system/hatch-demo \
  --brief briefs/hatch-demo.brief.json \
  --direction-review directions/hatch-demo.direction-review.json \
  --token-set tokens/button-foundation.tokens.json \
  --component components/button.component.json \
  --registry registry/components.registry.json \
  --asset-id button \
  --variant appearance=primary \
  --variant state=default
```

结果应解析为 `appearance-primary/state-default`。结果中的审批与 Figma 审计 Warning 是正确行为：查询成功不等于获得写入授权。

### 4.4 运行 Agent 主链路回归

```bash
pnpm qa:golden
pnpm qa:failures
```

第一条通过真实的进程内 MCP Client／Server 验证状态、搜索、解析、幂等 Instance 编排与三类审计。第二条验证缺失、断线、冲突和精确重放不会造成重复 Figma 派发。两条都是自动化 Harness，不会打开或修改 Figma。

至此，只读五分钟流程完成。

## 5. 把 Hatchkit 接入 Agent

先保持只读。仓库提供 Codex 项目配置模板：

```bash
mkdir -p .codex
cp config/codex-mcp.example.toml .codex/config.toml
```

重启 Codex 后检查 `hatchkit` MCP Server，并先让 Agent 调用 `hatchkit_status`。CLI 用户也可以检查：

```bash
codex mcp list
codex mcp get hatchkit
```

其他支持本地 stdio MCP 的 Agent Host，应配置以下进程；当 Host 的工作目录不是仓库根目录时，必须把脚本和 Catalog 改成绝对路径：

```text
command: node
args:
  packages/mcp-server/dist/bin.js
  --project
  hatch-demo
  --root
  design-system/hatch-demo
```

默认只读配置只提供 Status、Brief、Direction、Token、Component Search／Resolve 和 Change Request，不暴露 Figma Writer 或 Audit Tools。

## 6. 可选：连接 Figma Development Plugin

### 6.1 构建并导入 Plugin

先确认已经执行 `pnpm build`。在 Figma Desktop 中选择：

```text
Plugins → Development → Import plugin from manifest…
```

选择仓库中的：

```text
packages/figma-plugin/manifest.json
```

### 6.2 启动诊断 Bridge

在仓库根目录运行：

```bash
pnpm hatchkit:figma-bridge
```

终端会显示一次性的 Session Token。不要重定向、保存、截图或提交它。打开 Figma 中的 **Hatchkit Writer**，把 Token 粘贴到 Connection 区域并点击 **Connect**；界面显示 Connected 即完成本地连接验证。

诊断模式没有 Git Approval Verifier，会主动拒绝所有 Figma 写入。连接测试不要求绑定文件，也不要为了“看到成功”随意创建 Approval Record。

### 6.3 文件绑定警告

File Binding 会把 Project ID 和 UUID 永久写入当前 Figma 文件的 Shared Plugin Data。当前版本没有自动 Rebind。只有在你明确准备执行独立测试文件验收时才点击 **Bind current file**，不要在正式设计文件中试用。

公开 `hatch-demo` Registry 使用固定测试绑定 `00000000-0000-4000-8000-000000000001`。随机生成其他 UUID 后再运行 Demo 审计会正确得到 `FILE_BINDING_MISMATCH`。

## 7. 可选：Writer-enabled Agent Host

Variables／Component 建库、Instance 插入与依赖 Figma 的三个 Audit Tool，只有在 MCP Host 同时注入以下两个环境变量时才出现：

```text
HATCHKIT_FIGMA_BRIDGE_URL=http://127.0.0.1:38451
HATCHKIT_FIGMA_BRIDGE_TOKEN=<Bridge 本次启动显示的 Token>
```

正式写入还必须使用带 Git 校验的 Bridge：

```bash
pnpm hatchkit:figma-bridge -- --project hatch-demo --root design-system/hatch-demo
```

安全边界：

- Token 只能放在当前本地进程环境中，不能放进 Git 配置、命令行参数、日志或截图；
- Bridge 只监听 Loopback；MCP Writer URL 只接受 `http://127.0.0.1`；
- 公开 Demo 没有可信人工 Approval Record，所以正式写入仍会失败关闭；
- 不要伪造 Approval 来通过演示；真实 Approval 需要受保护分支、人工 Review 和准确内容摘要；
- FIG-003 至 FIG-006 的真实 Figma Desktop 双次运行与设计师视觉验收尚未完成。

获得真实 Approval 后，Agent 的建库顺序必须是：

```text
hatchkit_ensure_variables
→ hatchkit_ensure_component
→ hatchkit_resolve_component
→ hatchkit_insert_button_instance / hatchkit_insert_icon_instance / hatchkit_insert_input_instance
→ hatchkit_audit_styles + hatchkit_audit_components + hatchkit_audit_registry_drift
```

建库 Tool 必须提供准确 `assetId`、`assetVersion` 和稳定 `requestId`。Approval、摘要、Figma Node ID 与 File Binding 由 Git 自动重建，不能作为 Tool 参数传入。详细合同见 [Agent 建库 Tools](MCP-005-Agent建库Tools.md)。

## 8. 常用验证命令

```bash
pnpm check
pnpm mcp:smoke
pnpm figma:bridge-smoke
pnpm figma:smoke
```

`pnpm check` 会执行格式、Lint、类型、全部测试、构建、MCP、Bridge 与 Figma Bundle 门禁。`./spikes/run-m0-checks.sh` 只用于历史 M0 回归，不代表正式产品验收。

## 9. 预期限制

当前 Alpha 已能证明严格 Catalog、Registry 驱动的 Button、单 Writer、幂等、三类审计和系统失败边界；尚未提供图形化安装器、完整组件库、云服务、多 Agent 同时写入、真实公开 Approval 样例或完整 Figma 视觉验收。

遇到问题时先保留结构化 Error Code 和 Recovery Instruction，不要删除 Marker、重绑文件、修改 Operation Log 或绕过审批。请查看 [故障排查手册](DOC-002-故障排查手册.md) 和 [当前架构与运行边界](DOC-002-当前架构与运行边界.md)。

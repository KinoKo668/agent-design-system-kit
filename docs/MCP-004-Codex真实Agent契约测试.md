# MCP-004：Codex 真实 Agent 契约测试

## 1. 目标

MCP-004 不再只用 MCP SDK 模拟 Host，而是启动已登录的真实 Codex CLI，让模型自主完成一次 Button 查询与解析：

```text
自然语言任务
→ Codex Agent
→ hatchkit_status
→ hatchkit_search_components
→ hatchkit_resolve_component
→ 结构化决策
```

验收重点不是“模型回答看起来合理”，而是证明 Agent 确实调用了正确 Tool、没有绕过 MCP 读取仓库、没有执行 Shell、没有修改工作区，并正确保留审批与审计门禁。

## 2. 场景

正式场景要求 Codex：

1. 检查 Hatchkit 状态；
2. 搜索准确名称 `Button`；
3. 解析 `button` 的 `appearance=secondary`、`state=disabled` Variant；
4. 判断当前查询是否授权 Figma 写入；
5. 返回符合 JSON Schema 的最终结果。

权威输入与预期位于：

```text
packages/mcp-server/contracts/
├── codex-button-ready.prompt.md
├── codex-button-ready.output.schema.json
└── codex-button-ready.expected.json
```

## 3. 运行

先确保 Codex CLI 已安装并登录，然后执行：

```bash
pnpm mcp:codex-contract
```

脚本会先构建项目，再启动真实 Codex。成功输出：

```text
Hatchkit Codex Agent contract passed: status → search → resolve, no shell or workspace changes.
```

可选环境变量：

| 变量                        | 用途                                                  |
| --------------------------- | ----------------------------------------------------- |
| `HATCHKIT_CODEX_BIN`        | 显式指定 Codex CLI；不设置时逐一验证 PATH 中的候选    |
| `HATCHKIT_CODEX_MODEL`      | 显式选择当前账号可用模型；默认使用 Codex CLI 默认模型 |
| `HATCHKIT_CODEX_TIMEOUT_MS` | 正整数超时，默认 180 秒                               |

脚本不会保存或打印登录凭据。

## 4. Codex 隔离配置

Harness 使用官方非交互入口 `codex exec`，并设置：

- `--ignore-user-config`：不依赖个人 Codex MCP 配置；
- `--ephemeral`：不持久化这次测试会话；
- `--sandbox read-only`：禁止 Agent 写工作区；
- `--json`：输出 JSONL 事件流用于机器断言；
- `--output-schema`：限制最终回答结构；
- `--output-last-message`：把最终 JSON 写入临时目录用于精确比较；
- 只启用 Status、Component Search 与 Component Resolve 三个 Hatchkit Tool；
- MCP Tool Approval Mode 为 `auto`，因为三者均已声明只读。

非交互模式和结构化输出依据 [OpenAI 官方 Codex Non-interactive 文档](https://developers.openai.com/codex/noninteractive/)，MCP 配置依据 [OpenAI 官方 Codex MCP 文档](https://developers.openai.com/codex/mcp/)。

## 5. 事件级断言

脚本解析 Codex `--json` 的每一行，并要求完成的 MCP Tool 顺序严格等于：

```json
["hatchkit_status", "hatchkit_search_components", "hatchkit_resolve_component"]
```

同时拒绝以下 Agent 行为事件：

- `command_execution`；
- `shell_command`；
- `file_change`；
- `web_search`。

每次 MCP 调用还必须满足：

- `server = hatchkit`；
- `status = completed`；
- `error = null`。

最后必须出现 `turn.completed`。

## 6. 最终决策断言

Codex 的最终 JSON 必须与权威预期完全一致：

```json
{
  "assetId": "button",
  "assetVersion": "1.0.0",
  "status": "figma-ready",
  "selectedVariantId": "appearance-secondary/state-disabled",
  "nextAction": "verify-approval-and-audit-then-insert-instance",
  "mayWriteFigma": false,
  "requiredWarningCodes": ["APPROVAL_GUARD_REQUIRED", "FIGMA_AUDIT_REQUIRED"],
  "contractSourcePath": "components/button.component.json",
  "registrySourcePath": "registry/components.registry.json"
}
```

关键判断是 `mayWriteFigma: false`。即使 Registry 标记为 Ready 且 Resolve 返回 Locator，Agent 也不能把查询结果误解为写入授权。

## 7. 工作区与诊断安全

- 调用前后使用 NUL 分隔的完整 Git Status 快照比较；
- 保留原有未跟踪文件没有问题，但状态必须完全不变；
- 最终输出和临时文件写到系统临时目录，结束后只删除该次创建的精确临时目录；
- stdout/stderr 捕获总量限制为 8 MiB；
- 超时会终止 Codex 子进程；
- 失败诊断会遮盖 Workspace 与用户目录；
- PATH 中损坏的 Codex 安装会被 `--version` 探针跳过，不会误报为 Agent 失败。

## 8. 为什么不放入普通 CI

`pnpm check` 和 GitHub Actions 必须保持无账号、无网络模型调用、可确定复现。因此普通 CI 继续覆盖：

- Core 与 MCP 单元测试；
- In-Memory MCP Client；
- 真实本地 stdio 子进程；
- Node 24／22 构建和历史回归。

真实 Codex Agent 契约需要登录态、可用模型和外部服务，因此作为发布前或 MCP 行为变更后的显式集成门禁运行。Harness 自身进入格式与 Lint 门禁，但不会在每次 CI 中发起模型调用。

## 9. 当前证据

2026-09-01 已在真实 Codex CLI 中通过：

- Agent 只调用三个允许的 Hatchkit Tool；
- 调用顺序正确；
- 没有 Shell、文件修改或 Web Search；
- 最终结构与预期完全一致；
- 工作区状态前后相同。

## 10. 当前不做

MCP-004 不验证：

- Approval Record 的真实读取；
- Figma Plugin 连接；
- Locator 回读与修复；
- Variables 或 Main Component 写入；
- Instance 插入；
- Change Request 外部持久化。

MCP 查询阶段至此完成。下一步进入 FIG-001，建立最小 Figma Plugin UI。

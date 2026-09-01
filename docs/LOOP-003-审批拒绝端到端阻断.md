# LOOP-003：审批拒绝端到端阻断

## 1. 结论

LOOP-003 已证明：Agent 即使能发现并调用 `hatchkit_insert_button_instance`，只要审批不是当前准确内容的完整可用批准，命令就会在进入 Writer Queue 之前失败，Plugin 不会收到命令，Figma 不会发生写入。

验证覆盖完整调用边界：

```text
MCP Client
→ hatchkit_insert_button_instance
→ Git Catalog 重载与 Registry／Variant 规划
→ Local Writer Client
→ 认证 Figma Bridge
→ Approval Verifier
─X→ Writer Queue
─X→ Figma Plugin
```

“零排队”是本任务的关键证据。它比“Plugin 最后没有改动”更强：未批准命令根本没有进入可被派发的状态。

## 2. 阻断矩阵

| 错误代码                     | 代表状态                 | Agent 应采取的动作               |
| ---------------------------- | ------------------------ | -------------------------------- |
| `APPROVAL_REQUIRED`          | 找不到准确直接审批       | 提交真实人工评审                 |
| `APPROVAL_IN_REVIEW`         | 必需角色尚未完成决定     | 等待审批，不重复写入             |
| `APPROVAL_CHANGES_REQUESTED` | 审批要求修改             | 创建修订版本并重新提交           |
| `APPROVAL_INCOMPLETE`        | 角色、验证或证据不完整   | 补齐缺失审批条件                 |
| `APPROVAL_REJECTED`          | 当前版本被拒绝           | 不重试原版本，创建新版本         |
| `APPROVAL_STALE`             | 摘要、依赖或计划已过期   | 重载 Git，重新生成并评审准确内容 |
| `APPROVAL_SUPERSEDED`        | 当前批准已被更新版本取代 | 解析并使用最新批准版本           |
| `APPROVAL_REVOKED`           | 已批准内容后来被撤销     | 停止使用并评估既有影响           |

这些错误沿用 Core 的统一 `category`、`recovery.action` 与 `retry` 定义。Local Writer Client 会校验 Bridge 返回的错误元数据，不能把错误代码和恢复策略随意拼接。

## 3. 证据分层

审批安全不是只依赖一类测试：

1. Approval Record 单元测试验证状态从人工决定、必需角色、P0 检查、终止事件和上游依赖推导；
2. Git Approval Verifier 测试验证每次写入重新加载 Snapshot，并阻断缺失直接审批、撤销依赖、摘要漂移和客户端计划篡改；
3. Bridge 测试验证无 Verifier 时默认拒绝，Verifier 错误发生在 Queue Submit 之前；
4. LOOP-003 集成测试验证 MCP Tool、Registry Plan、HTTP Client、Bridge 和 Queue 组合后仍保持相同安全结论。

这样可以区分“某个函数会返回错误”和“Agent 的真实入口确实无法绕过错误”。

## 4. 真实缺失审批场景

公开 `design-system/hatch-demo` 刻意不包含伪造的人工 Approval Record。集成测试使用真实目录和真实 `createGitApprovalVerifier`：

- Tool 可以从 Ready Registry 生成 Button Instance Plan；
- Bridge 重新加载同一 Git Catalog；
- 找不到 `approval.component.button.1.0.0`；
- 返回 `APPROVAL_REQUIRED`；
- Queue 的 `operations`、`queuedOperationIds` 和 `inFlightOperationId` 均为空。

这证明 Ready Registry 只是资产可定位状态，不等于写入授权。

## 5. 其他不可用状态

评审中、要求修改、不完整、拒绝、过期、被取代和撤销状态已经在 Core 与 Git Verifier 层验证真实状态推导。LOOP-003 再把每个标准错误注入 Bridge 授权边界，逐项断言：

- MCP 返回 Tool-level Error；
- Agent 能读取准确错误代码和恢复动作；
- Bridge 授权函数只调用一次；
- Writer Queue 没有 Operation；
- 没有 Plugin Owner，也没有 Figma 派发。

这里不复制另一套审批实现或伪造 GitHub Review；集成测试验证的是已经过单元验证的审批结果能否穿过整个 Agent Loop 且保持 fail-closed。

## 6. 失败与重试语义

- 审批类失败不创建 Operation，因此不会消耗 `requestId`，审批外部状态修正后可以用同一页面请求再次调用；
- `IN_REVIEW`、`INCOMPLETE` 等状态必须等待外部变化，不允许轮询期间偷偷排队；
- `REJECTED` 与 `REVOKED` 不允许对原批准盲目重试；
- `STALE` 必须从当前 Git 重新规划，不能重放旧客户端 Plan；
- 错误结果没有成功态 `structuredContent`，避免 Agent 将失败当成已插入资产继续设计页面。

## 7. 自动验证结果

新增集成测试共 8 个场景：

- 1 个真实 Git Catalog 缺少审批场景；
- 7 个标准不可用审批状态的完整边界传播场景。

每个场景均验证零排队、零在途和零 Plugin 连接。测试不需要 Figma 账号、网络模型调用或伪造人工身份，可稳定进入普通 CI。

## 8. 当前边界与下一步

LOOP-003 完成自动化的负向黄金路径，但不代替真实 GitHub 受保护分支、真实 Reviewer 身份和设计师指定 Figma 文件的外部验收。

后续审计主线：

- `AUD-001`：已完成未登记 Variable 与硬编码样式发现；
- `AUD-002`：已完成 Instance、Variant 与组件来源审计；
- `AUD-003`：审计 Registry 与 Figma 差异；
- `LOOP-004`：扩展三套 UI 方向的生成、评审与持久化决策。

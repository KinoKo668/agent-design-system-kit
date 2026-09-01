# MCP-003：组件解析与变更申请 Tools

## 1. 目标

MCP-003 把页面 Agent 使用组件前最关键的两步接入 MCP：

```text
准确 Component + Variant 请求
→ 精确 Resolve
→ 返回 Contract、Registry Entry、Variant 与后续门禁

Resolve 证明真实能力缺失
→ 重新 Resolve
→ 生成 Proposed Change Request
→ 停止页面实现，等待人工分诊
```

Resolve 和 Change Request 都是只读决策操作，不会写 Git、Registry、Contract 或 Figma。

## 2. Tool 清单

| Tool                                | 用途                                               |
| ----------------------------------- | -------------------------------------------------- |
| `hatchkit_resolve_component`        | 精确解析一个 Active Component 与 Variant           |
| `hatchkit_request_component_change` | 对真实能力缺口生成确定性的 Proposed Change Request |

加上 MCP-001 与 MCP-002，当前 Server 共暴露六个只读 Tool。

## 3. Component Resolve

### 3.1 输入

```json
{
  "assetId": "button",
  "assetVersion": "1.0.0",
  "variantSelections": {
    "appearance": "secondary",
    "state": "disabled"
  }
}
```

- Project ID 由 Server 启动配置绑定；
- `assetId` 必须是准确稳定 ID；
- `assetVersion` 可省略，但不会自动使用 Superseded 或 Revoked 版本；
- `variantSelections` 只接受 Contract 中登记的 Property 和 Option；
- 未提供的 Variant Property 使用 Contract 默认值；
- 不执行拼写纠正、近似匹配或旧版本回退。

### 3.2 成功结果

Resolve 返回：

- 完整 Button Component Contract；
- 唯一 Active Registry Entry；
- 标准化后的 Variant Selection；
- 准确 Selected Variant 与稳定 Slot；
- Contract 和 Registry 的 Git 相对来源；
- 状态与下一动作；
- Approval 与 Figma Audit 警告。

Ready 结果：

```text
status     = figma-ready
nextAction = verify-approval-and-audit-then-insert-instance
```

Unbuilt 结果：

```text
status     = ensure-required
nextAction = verify-approval-then-ensure-library-asset
```

### 3.3 Locator 边界

与搜索摘要不同，精确 Resolve 可以返回 Registry 中的 Figma Locator，因为后续 Writer 需要用它打开和审计准确资产。但 Locator 只是审计输入，不是写入授权：

- 必须先验证权威 Approval Record；
- Ready 资产必须回读真实 Figma 节点和托管标记；
- Unbuilt 资产必须走幂等 Ensure；
- 当前 Tool 不创建 Writer Command，也不加入写入队列。

### 3.4 失败

| 场景                               | 结果                               |
| ---------------------------------- | ---------------------------------- |
| 输入字段非法                       | MCP Input Validation Tool Error    |
| 没有准确 Active 身份               | `IDENTITY_NOT_FOUND`               |
| 多个 Active 身份                   | `IDENTITY_CONFLICT`                |
| Property、Option 或 Variant 不存在 | `VALIDATION_FAILED` + JSON Pointer |
| Catalog 损坏                       | 保留 Loader／Core 的明确错误       |

失败结果不返回 Locator。

## 4. Component Change Request

### 4.1 输入

```json
{
  "assetId": "button",
  "assetVersion": "1.0.0",
  "variantSelections": {
    "appearance": "tertiary",
    "state": "default"
  },
  "submission": {
    "requestId": "00000000-0000-4000-8000-000000000031",
    "requestVersion": "1.0.0",
    "submittedAt": "2026-09-01T16:50:00Z",
    "submittedBy": {
      "type": "agent",
      "id": "codex"
    },
    "summary": "Add a Tertiary Button appearance",
    "rationale": "The current appearances cannot express this emphasis level.",
    "intendedUse": "Low-emphasis action in the settings footer."
  }
}
```

调用方必须提供 UUID、时间和提交内容。Server 不读取时钟、不生成随机数，也不替 Agent 编造需求理由。调用方重试时必须复用原始 Submission，才能保持结果和后续持久化身份一致。

### 4.2 先重新解析

Change Request Tool 不相信旧的失败结果。每次调用都重新加载 Catalog 并重新 Resolve：

- 如果能力已经存在，返回 `outcome: resolved`，不制造多余申请；
- 如果确实缺少 Component，生成 `create-component`；
- 如果缺少已登记组件的 Property、Option 或 Variant，生成 `extend-component`；
- 如果请求版本不可用但存在其他登记版本，生成 `review-component-availability`；
- 身份冲突、Catalog 损坏或无效输入不会被伪装成新需求。

### 4.3 申请结果

```text
outcome    = change-request-required
status     = proposed
nextAction = human-triage
```

申请保存：

- 请求的准确身份、版本与 Variant；
- 稳定 Error Code、Issue Code 与 JSON Pointer；
- 已存在候选的逻辑身份、审批引用、生命周期、Figma 状态与 Git 相对来源；
- 人类可读 Summary、Rationale 与 Intended Use；
- 固定 Prohibited Actions。

申请不会包含完整 Contract、Registry Entry、Figma Locator 或 Writer Command。

## 5. 强制禁止动作

所有合法申请都包含：

```json
[
  "create-visual-approximation",
  "fallback-to-inactive-component",
  "invent-unregistered-property-or-variant",
  "enqueue-figma-write"
]
```

因此 Agent 收到申请后必须停止当前页面中的近似实现，并把申请交给人工分诊。

## 6. 确定性与幂等

Core 使用调用方提供的 Submission，不依赖运行时间和随机状态。相同 Catalog、Query 与 Submission 会产生完全相同的结构化结果。

MCP 测试会连续调用两次 Change Request Tool 并比较完整响应。这个阶段只证明结果确定性，不代表申请已经持久化到 Git 或外部任务系统。

## 7. 协议与安全边界

- 两个 Tool 都声明只读、非破坏、幂等和封闭世界；
- 输入为 Strict Object，未知字段会被拒绝；
- Project ID 由 Server 配置绑定；
- 每次调用重新校验磁盘 Catalog；
- 成功使用严格结构化输出 Schema；
- 输入 Schema 失败由官方 SDK 返回 Tool Error；
- 领域失败保存 Toolkit Failure 且不泄漏绝对路径；
- Server 不访问网络、不保存申请、不发送消息、不创建 GitHub Issue。

## 8. 验证

正式测试覆盖：

- 默认与指定 Button Variant 精确解析；
- Ready 状态、下一动作、Approval Guard 与 Figma Audit 警告；
- Resolve 的 Not Found 和绝对路径隐私；
- 缺失 Component 的 Create Request；
- 缺失 Variant 的 Extend Request 与准确证据；
- 已存在能力返回 Resolved，不制造申请；
- 相同调用两次返回完全一致结果；
- 非法 UUID 在 MCP 输入边界失败；
- Change Request 不包含 Locator 或 Writer Command；
- 真实 stdio 子进程在旧版与现代协议下调用全部六个 Tool。

统一验证命令：

```bash
pnpm check
```

## 9. 当前不做

MCP-003 不实现：

- 自动保存 Change Request 文件；
- 自动创建 GitHub Issue 或发送协作消息；
- Change Request 的评审、批准与状态迁移；
- 权威 Approval Record 查询；
- Figma Locator 实际回读、修复或写入；
- Writer Command、Queue 或 Instance 插入。

MCP-004 已使用真实 Codex Agent 验证完整查询决策；Figma 写入能力随后进入 FIG 系列任务。

# MCP-005：Agent 建库 Tools

## 1. 目标

MCP-005 把已经完成的 Variables 与 Component Set Writer 正式暴露给 Agent，同时保持 Git Approval、Figma File Binding 和单一 Writer 边界不变。

Writer-enabled MCP 新增两个 Tool：

- `hatchkit_ensure_variables`；
- `hatchkit_ensure_component`。

它们只负责把当前 Git 中已经定义并批准的设计系统资产收敛到 Figma，不生成新的视觉方向、不替代人类审批，也不接受 Agent 自行提供安全事实。

## 2. 标准调用顺序

```text
查询 Token 与 Component
→ 人类完成准确版本的 Approval Record
→ hatchkit_ensure_variables
→ hatchkit_ensure_component
→ Registry 原子收敛为 Ready
→ resolve Component Variant
→ hatchkit_insert_*_instance
→ 样式、组件来源和 Registry 漂移审计
```

必须先确保 Component 所依赖的 Variables。Component Writer 会验证真实 Variable 是否存在，不会为了继续运行而创建硬编码样式。

## 3. Agent 可以提交什么

两个 Tool 都只接受：

- `assetId`：Git Catalog 中的准确稳定 ID；
- `assetVersion`：准确完整 SemVer，建库写入不会自动猜测版本；
- `requestId`：本次意图和所有准确重试共用的 UUID；
- `waitTimeoutMs`：等待已连接 Plugin 的时间，默认 30 秒。

Agent 不能提交：

- Approval ID 或 Approval 状态；
- 内容摘要；
- Figma Node ID、Component Key 或 Variable ID；
- File Binding ID；
- Writer Command Type；
- Component Profile 或 Variant 数量。

这些字段全部由 MCP 每次从经过完整性校验的当前 Git Snapshot 重建。

## 4. Variables Ensure

`hatchkit_ensure_variables` 会：

1. 精确解析 Token Set ID 与版本；
2. 重新计算 Token Set 的规范内容摘要；
3. 从引用该 Token Set 的 Active Component Registry 中推导唯一 Figma File Binding；
4. 生成确定性的 `FigmaVariablePlan`；
5. 生成 `variables.ensure` Writer Command；
6. 由 Bridge 重新验证 Token Approval 及完整上游审批链；
7. 由 Plugin 创建、更新或确认同一 Major Variable Collection；
8. 返回 Collection 身份、实际动作和 Variable 计数。

没有 Active Component 引用、出现多个文件绑定、版本不存在或审批不可用时都会失败关闭。

## 5. Component Ensure

`hatchkit_ensure_component` 会：

1. 从 Active Registry 精确解析 Component ID 与版本；
2. 加载准确 Contract 和 Token Set；
3. 根据冻结 Profile 自动选择正式 Plan：
   - `button-v1` → `components.button.ensure`；
   - `icon-v1` → `components.icon.ensure`；
   - `input-v1` → `components.input.ensure`；
4. 从 Registry 取得 Approval ID 与 File Binding；
5. 由 Bridge 从 Git 重建并逐字比较完整计划；
6. 由 Plugin 审计 Variables、稳定 Marker、版本和冲突，再串行收敛 Main Component Set；
7. Figma 成功后由 Bridge 原子提交 Registry Ready Locator；
8. 返回 Component Set Node ID、稳定 ID、实际动作与 Variant 计数。

同一 `requestId` 只能对应同一完整意图。相同请求可以恢复或重试；更换资产、版本或计划后必须使用新的 UUID。

## 6. 安全与失败边界

- 默认只读 MCP 不暴露这两个 Tool；
- Writer-enabled 只代表能够连接本地 Bridge，不代表已经获得批准；
- Bridge 在进入 FIFO Queue 前重新读取 Git 并验证 Approval；
- Plugin 只写当前已绑定文件，并且每次实际写入都重新审计；
- Figma 成功但 Registry 最终化失败时返回 `PARTIAL_WRITE`，保留 Figma 资产并要求使用相同请求恢复；
- 不自动删除、Detach、Swap、Rebind，也不把不匹配的旧资产强制覆盖。

公开 `hatch-demo` 没有可信人类 Approval Record，因此直接调用建库 Tool 会在 Queue 前失败。这是正确的安全行为，不应通过伪造 Approval 绕过。

## 7. 验收证据

自动测试覆盖：

- Token 与 Component 身份不存在时零 Writer 调用；
- Button、Icon、Input 三种 Profile 的准确命令路由；
- File Binding、Approval ID、摘要和 Command Type 均由 Git 派生；
- 相同请求生成逐字相同的 Writer Envelope；
- Writer Result 类型、稳定身份和 Operation 状态不匹配时拒绝报告成功；
- Tool 只在 Writer-enabled Server 中出现，并带有幂等、非破坏性写入标记；
- Bridge Approval Verifier、Plugin Writer、Registry Finalizer 和双 Node CI 继续作为端到端门禁。

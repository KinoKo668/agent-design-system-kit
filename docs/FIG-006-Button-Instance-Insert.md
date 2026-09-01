# FIG-006：Button 真实 Instance 插入

## 1. 结论

FIG-006 已建立第一条“查询 Registry 后复用真实组件”的正式写入能力。页面写入不再根据 Token 重画 Button，也不根据名称猜测组件；Core 必须先从 Ready Registry 解析准确 Contract、Variant 与 Figma Locator，Plugin 再审计真实 Main Component，最后调用 Figma `ComponentNode.createInstance()`。

第一版明确限定在同一个已绑定的 Figma Library 文件中插入 Instance。跨文件使用必须等待 Library 发布并取得真实 `componentSetKey`，不能把只在当前文件有效的 Node ID 当作跨文件 Key。

## 2. 确定性插入计划

Core 新增 `createFigmaButtonInstancePlan(snapshot, request)`。请求包含：

- 项目、Button ID 与可选准确版本；
- `Appearance`、`State` 的 Contract 内部 Option ID；
- 页面可见 Label；
- 页面坐标；
- 调用方分配的稳定 Instance ID，例如 `screen-checkout/submit`。

规划器只接受唯一 Active、Ready Registry Entry，并输出：

- Component 版本、摘要、Approval ID 与 File Binding；
- Component Set 的稳定身份、Major、Registry Node ID；
- 完整四 Variant 稳定身份清单；
- 选中 Variant 的 Slot、稳定身份与 Canonical Figma Name；
- Contract Option 到 Figma Property Value 的准确映射；
- `project/instance/<instanceId>` 形式的逻辑 Instance 身份；
- 有界 Label 与有限坐标。

Unbuilt、未知 Variant、非法 Label、越界坐标、错误版本与非唯一 Active 解析都不会产生 Writer Command。

## 3. 写前可信重建

`instances.button.insert` 必须携带准确 Component Approval。Bridge 每次写入前重新加载 Git Snapshot，并用命令中的请求型字段重新运行规划器：

- Label、坐标和 Instance ID 是本次页面请求，不是假装由 Component Approval 决定的设计事实；
- Contract、Registry、File Binding、Variant 身份、Property Name／Value、版本与摘要必须由当前 Git 重建；
- 客户端篡改 Figma Name、Variant、Locator 或稳定身份时返回 `APPROVAL_STALE`；
- Target File Binding 必须同时等于计划和 Ready Registry 中的绑定。

Plugin 边界还有一份不依赖 Zod 的严格校验，拒绝未知字段、非法身份、错误审批命名空间和协议漂移。

## 4. Figma 实际审计

Plugin 按以下顺序解析 Main Component：

1. 先读取 Registry `nodeId`；
2. Node ID 失效时，扫描所有页面上的 Hatchkit Shared Plugin Data；
3. 只接受唯一、`phase: applied`、版本／摘要／Approval／Major 全部准确的 Component Set；
4. Set 必须恰好包含计划列出的四个托管 Variant；
5. 选中 Variant 的稳定 Slot、Marker 和 Canonical Name 必须一致；
6. `Appearance`、`State` Variant Property 和唯一 `Label` TEXT Property 必须存在且包含目标值。

零个候选返回 Not Found，多个候选返回 Identity Conflict。同名未托管组件永远不会被自动接管。

## 5. 创建、幂等与漂移

首次插入：

1. 从准确 Variant 调用真实 `createInstance()`；
2. 立即写入 `phase: creating` 的 Instance Marker；
3. 将节点放入当前页面；
4. 写入 Label、坐标和可读节点名称；
5. 验证 Instance 未 Detached 且 Main Component 准确；
6. 最后写入 `phase: applied` Marker。

相同稳定 Instance ID 与相同计划再次执行时，会审计现有 Instance 并返回 `unchanged`，不再次写 Property、坐标或 Marker。

如果节点已创建但后续失败，Operation 返回 `PARTIAL_WRITE`。相同命令与幂等键重试时会找到 `creating` Marker，继续完成并返回 `recovered`，不会创建第二个 Instance。

如果已 Applied 的 Instance 被人工改变 Label、坐标、Main Component 或 Marker，Writer 会报告漂移或身份冲突，不会静默覆盖设计师修改。需要变更时应提交新的页面计划或显式迁移。

## 6. Locator 修复

Registry Node ID 失效但 Shared Plugin Data 能唯一找到准确 Component Set 时，Instance 可以安全创建。Writer Result 会返回当前真实 Set Node ID；Bridge 复用 FIG-005 的原子 Registry 最终化，把 Locator 修复到新 ID。

若 Figma 插入成功但 Registry 修复失败，Operation 进入 `partial`。重试会先复用已创建 Instance，再重试 Registry 原子提交，因此两侧最终可以收敛而不重复节点。

## 7. 自动验证

自动测试覆盖：

- Ready Registry 到准确 Variant、Property、Label、坐标和稳定身份的确定规划；
- Unbuilt、未知 Variant 与非法请求阻断；
- Core Schema 与 Plugin 轻量协议一致；
- Git Guard 重建计划并拒绝客户端 Variant 篡改；
- 真实 Instance Port Adapter 可通过 Figma 类型构建；
- 首次创建、第二次零写入 `unchanged`；
- 中断后 `recovered` 且不重复；
- 重复稳定身份、漂移和错误 Main Component 阻断；
- Registry Locator 失效后的稳定身份扫描与原子修复。

## 8. 当前边界与下一步

FIG-006 不包含：

- 跨文件 Published Library 导入；
- 自动发布 Component 或获取真实 Component Key；
- Auto Layout 页面容器内的语义位置；
- Responsive Constraint、Prototype Interaction 或业务数据绑定；
- Agent 可直接调用的一键“查询并插入”MCP Tool。

下一项 FIG-007 将集中审查 FIG-003 至 FIG-006 的幂等、冲突、恢复与破坏性变更保护；随后 LOOP-002 才把 Registry 查询、确认与 Writer Command 串成 Agent 可调用的单次流程。

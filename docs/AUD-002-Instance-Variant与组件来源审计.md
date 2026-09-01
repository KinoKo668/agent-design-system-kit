# AUD-002：Instance、Variant 与组件来源审计

## 1. 目标

AUD-002 建立第二条只读 Figma 合规审计链路。Agent 可以调用 `hatchkit_audit_components`，核验当前页面中的组件实例是否仍然来自 Git Registry 登记的准确 Main Component Set 与 Variant。

本任务只报告问题，不 Detach、不 Swap Component、不自动改变 Variant。

## 2. Git 是组件来源允许清单

Core 从当前已验证的设计系统快照中选择唯一文件绑定下所有 Active 且 Ready 的 Registry Entry，并结合准确 Component Contract 生成 Audit Plan。每个来源包含：

- Component 资产 ID、版本与内容摘要；
- Registry 登记的 Component Set Node ID；
- 按项目、资产和 Major 版本生成的 Component Set 稳定身份；
- 每个批准 Variant 的稳定身份、Slot、Figma 名称与准确 Variant Properties。

Plugin 不按节点名称猜测来源。Main Component 与 Component Set 必须带有 Hatch 写入的 Applied Marker，并且稳定身份必须出现在本次 Git Plan 中。

## 3. 当前检查规则

Plugin 只读扫描当前页面中的：

- 所有真实 Figma `INSTANCE` Node；
- 所有仍带 Hatch Component Instance Marker 的非 Instance Node，用于发现受管理 Instance 被 Detach 或替换后的状态。

报告包含五类错误：

| Code                                | 含义                                                                              | 恢复方向                              |
| ----------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------- |
| `DETACHED_OR_APPROXIMATE_COMPONENT` | 受管理组件不再是真实 Instance，或真实 Instance 已失去 Main Component              | 用 Registry 中的真实 Instance 替换    |
| `UNREGISTERED_COMPONENT_SOURCE`     | Main Component Set 没有受信 Marker，或不在当前 Registry 允许清单                  | 从当前 Active Ready Registry 重新插入 |
| `UNREGISTERED_VARIANT`              | Component Set 合法，但实际 Main Component Variant 未登记                          | 选择 Contract 中批准的 Variant        |
| `VARIANT_PROPERTY_MISMATCH`         | Variant 稳定身份与当前 Variant Properties 不一致                                  | 恢复准确的批准属性组合                |
| `INSTANCE_PROVENANCE_MISMATCH`      | Hatch Instance Marker 损坏、仍在 Creating，或与实际 Component Set／Variant 不一致 | 通过 Registry 驱动流程重新插入        |

每条 Finding 都包含准确 Node ID、名称、类型、实际来源证据、期望身份和恢复说明。结果按 Node 与错误码稳定排序。

## 4. 端到端流程

```text
Agent 调用 hatchkit_audit_components
→ MCP 重载并验证 Git 设计事实
→ Core 生成 Component Set／Variant 来源允许清单
→ Bridge 认证并排入单 Writer 传输
→ Plugin 只读扫描当前页面 Instance 与托管 Marker
→ 返回 passed 或 violations-found
```

`audit.components.scan` 使用 `read_only_diagnostic`。Bridge 保留回环认证、单 Plugin 所有权、FIFO、幂等恢复和操作日志，但明确不调用写入 Approval Verifier。

## 5. 信任与幂等边界

- 组件名称、图层外观和相似像素不是身份依据；
- Main Component、Component Set、Variant 与托管 Instance Marker 会交叉核对；
- `requestId` 表示一次页面快照，相同 ID 只用于恢复同一次调用；页面变化后必须使用新的 UUID；
- 当前最多扫描 10,000 个候选 Node，并最多返回 10,000 条 Finding；
- 无 Ready 来源或跨多个 Figma 文件的范围失败关闭；
- 报告统计必须与 Finding 和涉及 Node 数完全一致，否则协议拒绝结果。

## 6. 第一版明确不覆盖

- 没有 Hatch Marker 的普通 Frame 是否在视觉上模仿某个组件。仅凭像素或名称判断会产生高误报，第一版不把猜测当证据；
- 跨文件 Published Component 的 Key／Team Library 真实性。当前 MVP 仍采用同一已绑定 Library 文件；
- Registry Locator、Figma Node 缺失和版本漂移的双向审计，这属于 `AUD-003`；
- 自动修复、自动 Swap、Detach 或删除，继续由 Writer 安全策略禁止。

## 7. 实现与体积边界

Core 保存权威 Plan、Observation、Finding 与 Result Schema。Figma Plugin 使用与 Core 结果做对照测试的轻量分类实现，避免把 Zod 审计运行时打入主线程。

新增协议后，Figma UI 改为生产压缩且不内嵌 Source Map，避免仅调试元数据占用发布体积；主线程继续输出独立 Source Map。Icon Writer 接入后，Bundle Smoke 对主线程执行 128 KiB 原始体积与 32 KiB gzip 双门禁，对 UI 执行 300 KiB 上限。双指标既约束 Figma 实际加载文件，也防止只靠调高原始上限掩盖代码膨胀。

自动测试覆盖 Git 来源计划、真实 Instance、受管理 Detach、外部 Component Set、未知 Variant、属性漂移、Marker 漂移、错误文件绑定、Core／Plugin 分类一致性、轻量协议对照、Bridge 只读绕过写审批、MCP Tool 发现与完整报告返回。

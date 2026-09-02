# AUD-003：Registry 与 Figma 双向差异审计

## 1. 目标

AUD-003 建立 Git Registry 与 Figma Library 的全文件双向核对。Agent 可以调用 `hatchkit_audit_registry_drift`，判断 Git 认为应当存在的资产是否仍在 Figma 中，也判断 Figma 中的 Hatch 托管资产是否仍有 Registry 记录。

该命令只读取并报告，不创建、修改、删除或迁移 Figma 资产。

## 2. 权威计划

Core 从当前验证通过的设计系统快照中选择同一 Figma 文件内所有 Active 且 Ready 的组件，并生成准确计划：

- Component Set：稳定 ID、版本、内容摘要、Node ID、发布 Key 和完整 Variant 稳定 ID 集合；
- Token Collection：稳定 ID、版本、可用内容摘要和完整 Variable 稳定 ID 集合；
- 文件绑定：Project ID 与唯一 File Binding ID；
- 扫描范围固定为 `entire-file`。

Token Collection 只包含这些 Ready Component 实际引用的 Token Set，避免把与当前发布资产无关的草稿误当成缺失。

## 3. 全文件只读扫描

Figma Plugin 在读取节点前调用 `loadAllPagesAsync()`，然后盘点：

- 所有本地 Variable Collection 及其 Variables；
- 所有页面中的 Component Set 及其 Variant Components；
- Hatch Managed Marker 的稳定身份、阶段、版本与内容摘要；
- Component Set 的实际 Node ID 与 Key。

未带 Hatch Marker 的普通设计内容不会被登记成受管理资产。存在 Marker 但内容损坏、字段不完整或角色错误时，会明确报告为无效 Marker。

## 4. Finding 类型

| Code                              | 含义                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| `REGISTRY_ASSET_MISSING_IN_FIGMA` | Git 中的 Ready 资产在 Figma 全文件中不存在                 |
| `FIGMA_ASSET_MISSING_IN_REGISTRY` | Figma 中存在托管资产，但当前 Git 计划没有对应身份          |
| `FIGMA_ASSET_DUPLICATE`           | 同一稳定身份对应多个 Figma 物理资产                        |
| `FIGMA_MARKER_INVALID`            | 托管 Marker 损坏、不完整或角色不合法                       |
| `FIGMA_ASSET_VERSION_MISMATCH`    | Figma 阶段或版本与 Registry 不一致                         |
| `FIGMA_ASSET_DIGEST_MISMATCH`     | Applied／Target Digest 与 Git 内容摘要不一致               |
| `FIGMA_LOCATOR_MISMATCH`          | Component Set 的 Node ID 或 Key 与 Registry Locator 不一致 |
| `FIGMA_CHILD_SET_MISMATCH`        | Variable 或 Variant 的稳定身份集合不完整或出现额外成员     |

结果按稳定 ID、物理 ID 和错误码稳定排序；Summary 必须与 Findings 的实际数量完全一致。

## 5. 调用链路与安全边界

```text
Agent 调用 hatchkit_audit_registry_drift
→ MCP 重载并验证 Git Catalog
→ Core 生成全文件精确计划
→ Bridge 认证、排队并记录 Operation
→ Plugin 加载全部页面并只读盘点
→ 返回 passed 或 violations-found
```

`audit.registry-drift.scan` 使用 `read_only_diagnostic`，不会调用写入 Approval Verifier。相同 `requestId` 只用于恢复同一次审计；Git 或 Figma 状态变化后必须使用新的 UUID。

自动测试证明扫描链路没有调用任何 `setSharedPluginData` 或其他 Mutation API。当前计划最多包含 500 个 Token Collection、500 个 Component Set；Figma 观察最多包含 5,000 个托管资产，报告最多包含 10,000 条 Finding。

## 6. 第一版边界

- 内容摘要来自 Writer 最后成功写入的托管 Marker。AUD-003 能发现版本、摘要、身份、Locator 和子资源集合漂移，但不会重新计算每个 Variable 值或 Component 几何结构；真实属性分别由 Ensure 审计及后续更深层视觉审计负责。
- 当前 MVP 要求一个计划只对应一个已绑定 Figma Library 文件，不跨 Team Library 聚合。
- 审计不会自动修复。缺失、重复和冲突必须进入明确的 Ensure 或 Migration 流程并经过人工决策。

## 7. 实现验证

Core 保存权威 Schema、计划生成与分类算法；Plugin 使用与 Core 结果逐项对照的轻量实现。Input Writer 接入后，主线程当前受 160 KiB 原始体积与 32 KiB gzip 双门禁约束；测试覆盖双方缺失、重复身份、无效 Marker、版本／摘要／Locator／子集合冲突、错误文件绑定、全页加载、零写入、协议严格校验、Bridge 只读授权边界、MCP Tool 编排和成功结果重放。

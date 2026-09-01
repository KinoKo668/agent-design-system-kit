# FIG-007：Writer 幂等、冲突与恢复保护

## 1. 结论

FIG-007 已完成对 Variables、Button Component、Registry 最终化和 Button Instance 四段正式 Writer 的统一安全审查，并补齐写入结果缓存可能绕过恢复再审计的缺口。

Hatchkit 的“回滚保护”不是在失败后自动删除 Figma 节点，而是：

- 写前尽量发现冲突，保持零修改；
- 写中立即留下稳定 `creating` Marker；
- 写后只有完整审计通过才提交 `applied`／Registry Ready；
- 部分失败保留可识别资产，用原命令与幂等键继续收敛；
- 删除、Detach、Component Swap 与降级只能进入独立、人工批准的迁移流程。

## 2. 三层幂等

### Queue 幂等

Bridge 使用 `idempotencyKey hash + commandFingerprint`：

- 同键同命令返回原 Operation；
- 同键不同命令返回 `IDEMPOTENCY_CONFLICT`；
- 同 Operation ID 不同命令返回 `OPERATION_ID_CONFLICT`；
- `partial`／`interrupted` 只有在调用方明确重交原请求后才重新排队；
- FIFO、单在途租约和唯一 Plugin Writer 阻止并发写入。

### Figma 资产幂等

每个 Writer 使用项目、资产、Major、Role、Slot 或 Instance ID 组成稳定身份。名称只用于显示和冲突提示。

- Variables：第二次运行返回 30 个 `unchanged`，不创建第二个 Collection／Variable；
- Button：第二次运行返回同一 Set 与四个 `unchanged` Variant；
- Instance：同一稳定 ID 第二次运行返回 `unchanged`，Property、坐标和 Marker 均保持零写入；
- `creating` 状态重试会返回恢复结果，不创建第二份资产。

### Git Registry 幂等

Registry 最终化只允许当前唯一 Dispatched Command 触发。准确 Ready Entry 返回 `unchanged`；同物理轨道 Node ID 变化只修复 Locator。文件更新使用独占锁、乐观快照、提交前身份复核、原子替换与重载验证。

## 3. 写入成功缓存修复

Plugin 曾缓存所有成功 Result。这对 `writer.ping` 安全，但对真实写入存在风险：Figma 成功、Registry 最终化失败后，原幂等请求重新派发时可能直接返回旧成功结果，从而跳过 Figma 当前状态审计。

现在缓存策略固定为：

| 结果                                       | 是否缓存 | 原因                                       |
| ------------------------------------------ | -------- | ------------------------------------------ |
| `writer.ping` 成功                         | 是       | 无 Figma 写入，可安全重放                  |
| Variables／Button／Instance 成功           | 否       | 重投必须重新进入幂等 Writer 并读取真实状态 |
| `PARTIAL_WRITE` 等可恢复失败               | 否       | 必须允许相同请求继续恢复                   |
| `IDENTITY_CONFLICT` 等 `do_not_retry` 失败 | 是       | 同 Operation 内直接返回稳定终态            |

Queue 仍负责终态去重；正常成功 Operation 不会被再次派发。取消写入成功缓存只影响结果丢失、租约重投和部分恢复路径，确保这些路径重新审计而非盲信内存。

## 4. 冲突优先级

所有 Writer 遵循相同顺序：

1. Schema、项目、审批、摘要和 File Binding；
2. 稳定身份数量与托管 Marker 完整性；
3. 未托管同名资产和物理容器污染；
4. 版本倒退、同版本不同摘要与 Major 轨道；
5. 真实结构、属性、Variable Binding、Variant、Label 与 Instance 来源；
6. 只有预检通过才创建或收敛。

多个稳定身份候选始终返回 `IDENTITY_CONFLICT`，不会自动选择；未托管同名对象返回 `UNMANAGED_ASSET`，不会名称接管；同版本不同摘要返回 `CONTENT_DIGEST_CONFLICT`，不会覆盖。

## 5. 禁止破坏性自动回滚

正式 Writer Port 刻意不暴露节点／Variable 删除、Instance Detach 或 Component Swap 方法。新增 TypeScript AST 回归门禁，扫描六个正式 Writer 与 Figma Adapter 源文件，禁止：

- `remove`／`removeAsync`；
- `deleteVariable`／`deleteVariableCollection`；
- `detachInstance`；
- `swapComponent`；
- JavaScript `delete` 表达式。

如果未来需要删除或替换，必须建立版本化 Migration Plan、影响范围、人工审批、独立命令与可审计结果，不能偷偷扩展现有 Ensure／Insert。

## 6. 验证矩阵

自动测试已经直接覆盖：

- 相同幂等键重放、不同 Fingerprint 冲突、Operation ID 冲突；
- FIFO、租约到期重投、断开回队、进程重启 Interrupted；
- Variables、Button 与 Instance 首次创建、第二次不重复；
- 三类 Writer 的 partial Marker 恢复；
- 未托管资产、重复稳定身份、损坏结构、版本／摘要漂移；
- Registry 并发源变更、锁保护、原子替换、Locator 修复；
- 写入成功不缓存、Ping 成功缓存、可恢复失败不缓存；
- 正式 Writer 源码不存在破坏性 Figma API。

真实 Desktop 验收仍需可信 Approval 和用户指定的独立文件；自动合同不伪造该外部证据。

## 7. 下一步

FIG-003 至 FIG-007 的正式构件已经具备串联基础。下一项 LOOP-002 将提供 Agent 可调用的单次流程：解析 Registry、展示将要插入的准确组件与 Variant、确认页面请求、生成受审批保护的 Writer Command、等待结果并返回审计状态。

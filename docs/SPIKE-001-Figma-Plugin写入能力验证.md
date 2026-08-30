# SPIKE-001：Figma Plugin 写入能力验证

- 状态：验证通过
- 实现目录：`spikes/figma-writer/`
- 依赖：DIR-001、ARCH-001

## 1. 验证目标

验证本地 Figma Plugin 是否能够完成 DIR-001 所需的最小写入能力：Variables、Button Component Set、真实 Instance、稳定身份和建库幂等。

本实验不决定正式工程技术栈，也不连接 MCP Server。

## 2. 固定范围

- Button 仅有 Medium 尺寸；
- `Appearance`：Primary、Secondary；
- `State`：Default、Disabled；
- 共 4 个 Variant；
- 1 个可编辑 `Label` Text Property；
- 1 个真实 Instance；
- 连续执行两次不得产生重复设计系统资产。

## 3. 实现策略

插件为 Page、Variable Collection、Variable、Component Set 和演示 Instance 写入稳定逻辑 ID。再次运行时优先按稳定 ID 定位，必要时只接管唯一的精确名称匹配；出现多个匹配项时停止并报告身份冲突。

实验 Token 分为 Primitive 与 Semantic 两层。Semantic 颜色使用 Variable Alias 引用 Primitive，所有 Variable 都设置明确 Scope 和 Web Code Syntax。实验资产默认隐藏发布，避免误当成正式组件库。

## 4. 验证门禁

只有同时满足以下条件，SPIKE-001 才能标记完成：

1. 真实 Figma Design 文件第一次运行成功；
2. Component Set 有且仅有 4 个预期 Variant；
3. 页面节点是 Main Component 创建的真实 Instance；
4. 第二次运行没有重复 Collections、Variables、Component Set 或演示 Instance；
5. 实际结果记录在 `spikes/figma-writer/test-results.md`。

## 5. 验证结果

已在 Kite 空间的专用 Figma Design 文件完成真实验证：

- 两组 Collection 和 24 个 Variable 创建成功；
- 语义颜色 Alias、Scope 和 Web Code Syntax 校验通过；
- Button Component Set 包含 4 个预期 Variant；
- Label、Appearance 和 State 可由真实 Instance 设置与读取；
- 本地开发插件可以接管现有实验资产并写入稳定身份；
- 本地插件第二次运行返回 `created: []`；
- 最终绑定、唯一性、Instance 来源、启用状态对比度和最小目标高度审计通过。

实验发现 `OPACITY` Variable 使用百分数语义、Shared Plugin Data namespace 禁止连字符、统一边框宽度绑定可能按四边字段返回、Paint 审计必须读取 Variable 解析值。这些规则已经记录到验证报告，并应进入后续正式 Writer 与 Audit Engine 的测试用例。

## 6. 结论

SPIKE-001 通过，不需要修改 ARCH-001。下一步可以进入 SPIKE-002，验证本地 Plugin 与 MCP 进程之间的通信方式。

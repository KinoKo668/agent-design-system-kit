# COMP-002：Input 契约与 Figma 组件链路

- 当前状态：Contract、Token、Figma 幂等建库与 Registry 回写已实现；页面 Instance 插入待后续步骤完成
- 实现起点：2026-09-01
- 依赖：LOOP-003、SCH-002、SCH-004、REG-002、FIG-007

## 1. 目标

COMP-002 把文本输入框从 Agent 临时绘制的“边框加文字”升级为可校验、可查询、可审批和可复用的设计系统资产。

第一版只实现单行文本 Input，并冻结完整的可访问状态矩阵：

```text
State: Default / Focused / Error / Disabled
×
Content: Empty / Filled
= 8 个准确 Variant
```

每个 Variant 都保留始终可见的 Label、输入文字和就近 Supporting Text。Placeholder 不能代替 Label；Error 必须同时提供错误文字，不能只改变边框颜色。

## 2. 第一版范围

正式资产身份：

```text
input/text@1.0.0
profile: input-v1
```

包含：

- `State` 和 `Content` 两个 Figma Variant 属性；
- `Label`、`Text`、`Supporting text` 三个文本属性；
- 320px 组件宽度、48px 字段高度、12px 水平内边距、6px 垂直间距；
- Surface、Border、文字颜色、Border Width、Radius、尺寸和三类 Typography 的准确 Token Binding；
- 8 个稳定 Variant ID 与 Slot ID；
- 可见焦点、就近错误、禁用状态和 4.5:1 正文对比度要求。

暂不包含：

- 前缀／后缀 Icon；
- 密码显隐按钮；
- 多行 Textarea；
- Select、Combobox、日期或数字专用输入；
- 自动验证业务逻辑和真实键盘输入行为。

这些能力需要新的兼容 Contract 版本或独立组件，Agent 不得在当前 Input 上自行添加近似属性。

## 3. Token 与视觉规则

`input-foundation.tokens.json` 保存 Input 所需的独立基础决策：

- 背景、Label、Value、Placeholder、Helper、Error、Disabled 与四类 Border 颜色；
- 48px 字段高度，满足不低于 44px 的交互目标；
- Default 1px、Focused 2px 的 Border Width，使焦点不仅依赖颜色；
- 8px Radius、12px Padding 和 6px Gap；
- Label、Value 和 Supporting Text 三个 Typography Token。

Component Contract 只引用 Semantic Token，不直接保存未经治理的颜色或尺寸。

## 4. 当前机器链路

```text
Input Token Set + Input Contract
→ 严格内容摘要
→ 独立 unbuilt Registry
→ 通用 Loader 与跨引用校验
→ CLI / MCP 精确 Search
→ State + Content 精确 Resolve
→ ensure-required 或结构化 Change Request
```

获得真实人类审批后，写入链路继续执行：

```text
Git 中的 Input Contract + Token Set + Approval
→ 服务端重新生成并逐字比对 FigmaInputPlan
→ Plugin 再次独立校验命令与 8 Variant 矩阵
→ 单 Writer 串行创建或更新 Input Component Set
→ 写入 Label / Text / Supporting text 三个文本属性
→ 绑定颜色、尺寸和三组 Typography Variables
→ 审计 Figma Marker
→ 原子回写 Registry Ready Locator
```

Writer 会先验证文件绑定与全部 Token Variable，再创建任何节点；相同版本不同摘要、降级、重复身份、缺失 Variable、未受管同名资产和不完整 Variant 集合都会失败关闭。重复执行同一计划不会复制节点。

公开样例保持 `unbuilt`，因为尚未有真实人类 Component Approval，也没有在用户指定的独立 Figma Desktop 文件中完成建库与视觉验收。当前 Agent 可以理解并查询 Input，但不能把它冒充为可插入的真实 Figma Instance。

## 5. 验收标准

当前阶段已经验证：

- 8 个 State × Content Variant 完整且身份唯一；
- Variant Token Binding 与状态语义完全匹配；
- Placeholder、错误、焦点与 Disabled 可访问性规则不可被 Fixture 绕过；
- 错误 Token、缺失 Token、错误类型和未知 Schema 版本均失败关闭；
- 通用 Component 联合类型、Catalog Loader、CLI 与 MCP 可以查询和解析 Input；
- 公开输出不泄露未 Ready 的 Figma Locator。

已完成：

1. 确定性的 `FigmaInputPlan`；
2. `components.input.ensure` Writer Protocol 与 Plugin Adapter；
3. 8 Variant、文本属性和 Variable Binding 的幂等建库；
4. Registry Ready 原子最终化。

后续关闭 COMP-002 仍需：

1. Input Instance Plan、MCP 插入 Tool 与写后来源审计；
2. 真实审批、Figma Desktop 双次运行、重开定位和设计师视觉验收。

## 6. Plugin 包体预算

Input 是主线程中的第三类完整组件 Writer。接入前主线程为 129,521 bytes；完成独立协议校验、8 Variant Writer 与真实 Figma Adapter 后为 156,923 bytes，gzip 为 31,362 bytes。

因此原始体积门禁从 128 KiB 调整为 160 KiB，同时继续保留更严格的 32 KiB gzip 门禁和 300 KiB UI 门禁。调整只覆盖新增的可执行能力，不移除压缩门禁、不内嵌 Source Map，也不以无限制增大预算掩盖膨胀。

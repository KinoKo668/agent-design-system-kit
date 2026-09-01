# FIG-004：Button Component Set Ensure

## 1. 结论

FIG-004 已把正式 Button Component Contract 和准确 Token 依赖转换为确定性的 Figma 写入计划，并接入认证 Bridge、Git Approval Guard、FIFO 单 Writer 与 Plugin 主线程。

自动化实现会创建或收敛：

- 1 个 `Button` Main Component Set；
- 4 个 `Appearance × State` Variant；
- 1 个 `Label` TEXT Component Property；
- 每个 Variant 中 1 个与 `Label` 属性关联的文本层；
- 布局、颜色、边框、圆角、尺寸、透明度与文字属性的准确 Variable Binding。

相同批准内容重复执行不会创建新 Component、Variant 或 Label。Writer 会读取实际属性和绑定；完全一致时返回 `unchanged`。

## 2. 确定性写入计划

Core 新增 `createFigmaButtonPlan`。输入必须同时满足：

1. Button Contract 与 Token Set Schema 正确；
2. 所有 Token Reference 存在且类型匹配；
3. Component 和 Token 的可信摘要与文件一致；
4. Token Set 能生成准确的 Figma Variable Plan。

计划固定包含 Component Set 与 4 个 Variant 的稳定身份、Component Property、Canonical Figma Name、Variable Binding、直接值回退和 Typography 策略。严格 Plan Schema 会拒绝重复 Variant、非法组合、非规范名称、跨 Token Collection 的 Variable、错误 Major 身份和未知字段。

## 3. Figma 结构

Component Set 的稳定身份为：

```text
projectId/component/button/component-set/major-<major>
```

Variant 在根身份后追加 Contract `slotId`，Figma 名称固定为：

```text
Appearance=Primary, State=Default
Appearance=Primary, State=Disabled
Appearance=Secondary, State=Default
Appearance=Secondary, State=Disabled
```

Variant 按 `Appearance` 分列、`State` 分行排列。Writer 使用 Figma 官方的 [`createComponent`](https://developers.figma.com/docs/plugins/api/figma/#createcomponent) 和 [`combineAsVariants`](https://developers.figma.com/docs/plugins/api/figma/#combineasvariants) 创建真实 Main Component 结构，不用普通 Frame 冒充组件。

## 4. Token 与 Typography 映射

视觉字段先写安全直接值，再绑定 FIG-003 已创建并审计的 Variable：

| Contract 目标              | Figma 字段                   |
| -------------------------- | ---------------------------- |
| `container.height`         | `height`                     |
| `container.padding-inline` | `paddingLeft + paddingRight` |
| `container.radius`         | `cornerRadius`               |
| `container.fill`           | Solid Paint `color`          |
| `container.border-color`   | Stroke Paint `color`         |
| `container.border-width`   | `strokeWeight`               |
| `container.opacity`        | `opacity`                    |
| `label.fill`               | Label Solid Paint `color`    |

文字层绑定 `fontFamily`、`fontSize`、`fontWeight` 和 `letterSpacing` 四个 Variable。DTCG 的 `lineHeight: 1.43` 是无单位倍数，不是 `1.43px`；第一版将它解析为 Figma `143%` 并记录 `resolved-percent` 策略，不绑定单位不兼容的 Number Variable。完整字体回退栈仍以 Git Token 为权威，Figma 使用首选字体 `Inter` 和回退字重 `Medium`。

## 5. 写前安全门禁

`components.button.ensure` 必须携带：

- `approval.component.<asset>.<version>` 命名空间的 Component Approval；
- 与计划来源完全一致的项目、资产、版本和摘要；
- 准确的 Token Approval 上游依赖；
- 已人工绑定的目标 Figma Library 文件；
- Operation ID 与幂等键。

Bridge 不信任客户端计划。每次写入前，它会重新读取 Git 中的 Component Contract、Token Set 和两级 Approval，重新运行规划器，再用 Canonical JSON 对比整个计划。即使伪造计划满足 Schema，只要与 Git 重建结果有一个字段不同，也会以 `APPROVAL_STALE` 拒绝且不进入队列。

Plugin 会再次执行不依赖 Zod 的轻量严格校验，阻止未知字段、错误审批命名空间、非法 Variant 矩阵或跨 Collection Variable 到达 Figma API。

## 6. 身份、冲突与恢复

Component Set、Variant 和 Label 使用 Shared Plugin Data 的 `component-set`、`component-variant` 和 `component-layer` Role。名称只用于显示和冲突提示，绝不用于自动 Adopt。

写入前检查：

- 文件绑定与项目；
- 所有依赖 Variable 的唯一身份、版本、摘要和类型；
- Component Set、Variant 和 Label 的重复身份；
- 同名未托管资产；
- 降级、同版本不同摘要和 partial write；
- Set 必须恰好包含 Contract 的 4 个托管 Variant；
- 每个 Variant 必须恰好包含 1 个托管 Label。

新建或升级先写 `phase: creating`。真实属性、Component Property、Variable Binding 和结构审计全部通过后，最后才写 `phase: applied + assetVersion + appliedDigest + approvalId`。中途异常返回 `PARTIAL_WRITE` 和已完成步骤；相同请求依据稳定标记恢复，不自动删除节点。

## 7. 已验证内容

自动测试覆盖：

- 确定生成 1 个 Set 和准确 4 个 Variant；
- Typography 的 4 个 Variable Binding 和 `143%` 行高；
- 节点透明度保留 `0.48`，同时引用 Figma 百分比语义 Variable；
- 初次执行创建 4 个 Variant、4 个 Label 和 1 个 TEXT Property；
- 第二次执行全部 `unchanged`，无重复资产或标记改写；
- 未托管同名 Set 拒绝自动接管；
- Token Variable 摘要漂移在创建节点前阻断；
- Component Approval 不能冒用 Token Approval 命名空间；
- Bridge 拒绝 Schema 合法但与 Git 不同的客户端计划；
- 生产 IIFE 压缩后保持在 100 KiB 门禁以内并保留 Source Map。

## 8. 当前边界与下一步

FIG-004 的正式代码、协议、Adapter、恢复路径与自动测试已经完成。真实 Figma Desktop 双次运行仍需要：

1. 真实设计与技术审批角色批准准确 Token 和 Component 版本；
2. 用户指定独立验证文件，由设计师完成文件绑定；
3. 先完成 FIG-003 Variables 双次真实 Ensure；
4. 再完成 Button 双次 Ensure，由设计师检查视觉和 Component Property。

在外部条件满足前，不创建假审批、不使用隐藏旁路，也不写入用户的正式 Library。

后续 FIG-005 已把成功返回的 `componentSet.nodeId` 与稳定资产身份原子登记进 Registry，并将登记失败纳入 `PARTIAL_WRITE` 恢复链路。详见 [FIG-005](FIG-005-Registry-Atomic-Ready.md)。下一项 FIG-006 将只依据 Ready Registry 插入真实 Button Instance。

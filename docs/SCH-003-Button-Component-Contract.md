# SCH-003：Button Component Contract

- 状态：已实现
- 实现日期：2026-09-01
- Schema 版本：`1.0.0`
- Contract Profile：`button-v1`
- 依赖：DIR-001、ADR-002、CORE-001、SCH-002
- 适用范围：Git 中的 Button 规则、Registry 上游输入、Figma Component Set Writer 与页面查询

## 1. 目标

Button Component Contract 是 Agent 和 Figma Writer 共同读取的“组件说明书”。它回答：

- 这个组件有哪些可编辑属性；
- 哪些 Variant 组合真实存在；
- 每个 Variant 应绑定哪些 Token；
- Figma 节点应使用什么稳定身份；
- 页面 Agent 可以请求什么，不能临时创造什么。

Token 只定义颜色、尺寸和字体等设计决定，不能单独说明如何组合成 Button。Contract 也不保存原始颜色或像素值，只引用 SCH-002 已登记的 Semantic Token。

## 2. 为什么第一版是 Button 专用 Profile

SCH-003 不提前设计一个声称适用于所有组件的万能格式。第一版只实现 DIR-001 已冻结且经过 Spike 验证的 `button-v1`：

- 稳定逻辑 ID：`button`；
- Figma 类型：Component Set；
- 固定尺寸：Medium；
- 属性：Label、Appearance、State；
- Variant：Primary／Secondary × Default／Disabled；
- 无 Icon、Loading、Hover、Pressed、Focused 或其他尺寸。

这样可以先证明完整 Button 链路。未来 Input、Icon 或更完整 Button 必须通过新 Profile 或兼容的 Schema 版本扩展，不能让 Writer 猜测未定义行为。

## 3. 文档身份

```json
{
  "schemaVersion": "1.0.0",
  "assetType": "component",
  "projectId": "hatch-demo",
  "assetId": "button",
  "assetVersion": "1.0.0",
  "name": "Button",
  "profile": "button-v1",
  "componentKind": "component-set"
}
```

完整逻辑身份：

```text
ads://hatch-demo/component/button@1.0.0
```

- `assetId` 和可见名称在本 Profile 中分别固定为 `button` 与 `Button`；
- `schemaVersion`、`assetVersion` 与 Toolkit Release 相互独立；
- 未知 Schema 版本返回 `SCHEMA_VERSION_UNSUPPORTED`；
- `contentDigest` 在草稿阶段可省略，进入审批时必须由后续摘要服务生成并核对。

## 4. Token Source

Contract 显式声明它依赖哪一版 Token Set：

```json
{
  "assetType": "token-set",
  "projectId": "hatch-demo",
  "assetId": "button-foundation",
  "assetVersion": "1.0.0"
}
```

第一版要求 Contract 与 Token Source 属于同一项目。引用使用准确 `assetId + assetVersion`，不会通过文件路径或文件名猜测。

Token 是否已批准不写进 Contract。后续 Approval Record 和 Registry 必须验证 Token Source 的准确版本已批准，才能允许 Button 进入正式 Figma Library。

## 5. Component Properties

Contract 有且仅有三项属性：

| 稳定 ID | 类型 | Figma 名称 | 默认值／选项 |
| --- | --- | --- | --- |
| `label` | Text | `Label` | 必填，默认 `Button` |
| `appearance` | Variant | `Appearance` | `Primary`、`Secondary`；默认 Primary |
| `state` | Variant | `State` | `Default`、`Disabled`；默认 Default |

稳定 ID 面向 Agent 和代码，使用小写 kebab-case。`figmaName` 与 `figmaValue` 是 Writer 必须创建和审计的精确可见值。

Schema 会拒绝：

- 缺少、重复或增加未批准属性；
- 属性类型错误；
- 大小写不敏感的重复 Figma 名称或选项值；
- 默认选项不存在；
- `Tertiary`、`Pressed` 等不属于 Button v1 的选项。

## 6. Variant Matrix 与稳定 Slot

Contract 必须完整包含四个组合：

| Appearance | State | Variant ID | Figma 托管 Slot |
| --- | --- | --- | --- |
| Primary | Default | `appearance-primary/state-default` | `variant/appearance-primary/state-default` |
| Primary | Disabled | `appearance-primary/state-disabled` | `variant/appearance-primary/state-disabled` |
| Secondary | Default | `appearance-secondary/state-default` | `variant/appearance-secondary/state-default` |
| Secondary | Disabled | `appearance-secondary/state-disabled` | `variant/appearance-secondary/state-disabled` |

Variant ID 和 Slot 由选择值确定，不能使用数组下标。即使设计师在 Figma 中移动或重新排序 Variant，Writer 仍能依靠稳定 Slot 找到同一个资产。

Schema 会拒绝缺失组合、重复组合、额外状态、错误名称、错误 ID 和错误 Slot。

## 7. 布局与无障碍语义

第一版布局固定为：

- 水平 Auto Layout；
- 主轴 Hug Contents；
- 高度由 Token 决定；
- 主轴和交叉轴内容居中。

无障碍字段明确：

- 语义角色是 `button`；
- `label` 是可见文本与可访问名称来源；
- `state = disabled` 表示不可用状态。

这不是完整无障碍审计。SCH-003 只确保 Writer 和后续审计知道应该检查哪个属性，不能证明最终页面的文案、对比度或交互全部合规。

## 8. Token Binding

每条 Binding 只有两个字段：

```json
{
  "target": "container.fill",
  "token": "{semantic.color.action-primary-background}"
}
```

Contract 禁止保存 `#3366ff`、`40px` 等原始视觉值，也禁止直接引用 Primitive Token。所有 Binding 必须使用 `{semantic...}`。

### 共享 Binding

所有 Variant 共同使用：

| Target | 期望类型 |
| --- | --- |
| `container.height` | `dimension` |
| `container.padding-inline` | `dimension` |
| `container.radius` | `dimension` |
| `label.typography` | `typography` |

### Variant Binding

每个 Variant 必须包含 `container.fill` 和 `label.fill`：

- Secondary 额外要求 `container.border-color` 与 `container.border-width`；
- Disabled 额外要求 `container.opacity`；
- 不适用于该 Variant 的 Target 不允许出现。

Target 在同一作用域内不可重复。Target 到 Token Type 的映射是代码中的冻结事实，Writer 不得根据 Token 名称猜测类型。

## 9. 两层校验

### Contract 内部校验

```ts
const result = validateButtonComponentContract(input);
```

检查身份、属性、选项、Variant 矩阵、Slot、布局、Binding 位置和 Semantic Alias 语法。

### Contract + Token Set 校验

```ts
const result = validateButtonComponentContractWithTokenSet(
  contract,
  tokenSet,
);
```

在内部校验通过后继续检查：

1. Token Source 的项目、资产 ID 与版本准确匹配；
2. 每个 Alias 在 Token Set 默认 Mode 中真实存在；
3. Token `$type` 与 Binding Target 要求一致；
4. Token Set 自身必须先通过 SCH-002 的 Mode、Alias 和分层校验。

失败返回 `VALIDATION_FAILED`，并给出 JSON Pointer，例如：

```text
/variants/0/bindings/1/token
```

Agent 可以据此指出具体损坏的 Variant 和 Binding，而不是只说“Button 有问题”。

## 10. Figma Writer 映射

后续 Writer 应按 Contract 执行：

1. 使用 `componentKind` 建立或复用一个 Component Set；
2. 创建 Label Text Property；
3. 创建 Appearance 与 State Variant Property；
4. 依据四个稳定 Slot 建立或复用 Variant；
5. 应用共享与 Variant Binding；
6. 使用 Token Source 解析的 Figma Variables，不复制原始值；
7. 回读属性、Variant、Slot 和 Variable Binding 后才标记为 `applied`。

Contract 不保存 Figma Node ID、Component Key、Page 名称或坐标。这些属于 Registry 的物理定位信息，不是组件规则。

## 11. 内容摘要与版本

`toButtonComponentContractDigestSubject` 明确列出所有会影响审批的字段，并排除 `contentDigest` 自身。属性顺序、Variant 顺序、Token Source、布局、无障碍语义和全部 Binding 都进入摘要。

依据 ADR-002：

- 兼容视觉修正：Patch；
- 新增可选属性或 Variant 且不改变默认行为：Minor；
- 删除／重命名属性或 Variant、改变默认语义：Major；
- 任何内容变化都会改变摘要，并要求相应审批重新绑定。

## 12. Fixture 与公共代码入口

- `design-system/examples/components/button.component.json`：正确 Button v1 Contract；
- `design-system/examples/components/invalid-button.component.json`：故意包含错误默认值、未批准选项、重复 Binding、非法状态、错误 Slot 和缺失 Variant；
- `design-system/examples/tokens/button-foundation.tokens.json`：跨资产引用校验使用的 Token Set。

`@agent-design-system-kit/core` 导出：

- `buttonComponentContractSchema` 与推导类型；
- `validateButtonComponentContract`；
- `validateButtonComponentContractWithTokenSet`；
- `toButtonComponentContractDigestSubject`；
- Binding Target、Target Type 和版本常量。

正式测试直接读取公开 Fixture，并覆盖内部错误、跨资产缺失引用、类型错误和摘要投影。

## 13. 当前不做

SCH-003 不实现：

- Figma Component Set 真实写入；
- Registry 与 Figma 物理资产定位；
- Component Approval Record；
- 页面放置请求与 `placementId`；
- Hover、Pressed、Focused、Loading、Icon 和其他尺寸；
- 响应式 Button、交互原型和动画；
- 通用 Component Contract 平台；
- React、Vue、SwiftUI 或 Code Connect 映射；
- 完整内容、对比度和交互无障碍审计。

这些能力属于 SCH-004、FIG、LOOP、AUD 和后续组件扩展任务。

## 14. 完成标准

- Label、Appearance、State 三项属性可以严格校验；
- 四个 Variant 组合、名称、ID 和稳定 Slot 可以严格校验；
- 共享与逐 Variant Token Binding 完整且不重复；
- Primitive 引用被拒绝；Semantic 引用存在性和类型可结合 Token Set 校验；
- 正确／错误 Fixture 均由正式测试直接读取；
- 内容摘要投影明确排除 `contentDigest`；
- Node 24 与 Node 22 的统一质量门禁通过。

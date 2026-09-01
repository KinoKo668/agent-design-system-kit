# SCH-002：基础 Token Schema 与 DTCG 子集

- 状态：已实现
- 实现日期：2026-09-01
- Schema 版本：`1.0.0`
- DTCG 基线：`2025.10`
- 依赖：ADR-002、CORE-001、SEC-001
- 适用范围：Git 中的 Token Set、CLI／MCP 校验入口、Figma Variables 写入的上游输入

## 1. 目标

Token Set 负责保存已批准的颜色、字体、尺寸、间距、圆角和透明度等设计决定。它不是 Button 组件，也不是 Figma 页面。

SCH-002 建立第一版可执行约束：

- Agent 不能自行创造 Token 类型、路径或 Alias 语法；
- Primitive、Semantic、Component 三层依赖关系可以自动检查；
- Alias 必须存在、类型一致并且不能形成循环；
- 不同 Mode 必须保留同一套 Token 身份与元数据；
- Button 垂直链路所需的颜色、尺寸、字体与禁用态参数都有公开样例；
- 后续 Figma Writer 可以从确定的数据生成 Variables，而不依赖聊天上下文。

## 2. 标准基线与存储格式

本项目采用 W3C Design Tokens Community Group 发布的稳定版技术报告，而不是 Draft：

- [Design Tokens Format Module 2025.10](https://www.designtokens.org/tr/2025.10/format/)
- [Design Tokens Color Module 2025.10](https://www.designtokens.org/tr/2025.10/color/)
- [Design Tokens Resolver Module 2025.10](https://www.designtokens.org/tr/2025.10/resolver/)

Hatch `1.0.0` 是一个 **DTCG 兼容子集的版本化封装**，不是完整 DTCG 文档的原样复制：

- 保留 DTCG 的 `$type`、`$value`、`$description`、`$deprecated` 与花括号 Alias 语义；
- 使用 `path` 数组保存 Token 路径，便于做分层、重复和 JSON Pointer 校验；
- 使用 `modes[]` 明确表达当前项目需要的 Mode；
- 增加 Hatch 的稳定资产身份、版本和摘要字段；
- 只支持 MVP 真正需要且能稳定映射到 Figma 的类型与值。

根结构：

```json
{
  "schemaVersion": "1.0.0",
  "assetType": "token-set",
  "projectId": "hatch-demo",
  "assetId": "button-foundation",
  "assetVersion": "1.0.0",
  "name": "Button foundation",
  "description": "...",
  "dtcgVersion": "2025.10",
  "defaultMode": "light",
  "modes": [],
  "contentDigest": "sha256:..."
}
```

完整逻辑身份为：

```text
ads://hatch-demo/token-set/button-foundation@1.0.0
```

`contentDigest` 在草稿阶段可省略；进入审批时由后续摘要服务计算并核对。

## 3. Token 路径与三层模型

每个 Token 使用 3–12 段的小写 kebab-case 路径：

```json
{
  "path": ["semantic", "action", "primary", "background", "default"],
  "$type": "color",
  "$description": "Default background for primary actions.",
  "$value": "{primitive.color.brand-600}"
}
```

第一段必须是：

| 层级 | 作用 | 允许的依赖 |
| --- | --- | --- |
| `primitive` | 保存原始设计值 | 必须是直接值，不允许 Alias |
| `semantic` | 表达用途和语义 | 必须通过 Alias 派生；可引用 Primitive 或 Semantic，不可引用 Component |
| `component` | 表达组件局部决定 | 必须通过 Alias 派生；只能引用 Semantic 或 Component，不可绕过语义层直连 Primitive |

这一约束让组件未来换品牌色或 Mode 时，主要修改 Primitive／Semantic，而不是逐个修改 Button、Input 和页面。

## 4. 支持的 DTCG 类型

| `$type` | 直接值 | MVP 用途 |
| --- | --- | --- |
| `color` | sRGB Color Object | 背景、文字、边框、图标颜色 |
| `dimension` | `{ "value": number, "unit": "px" \| "rem" }` | 高度、间距、圆角、边框宽度、字号、字距 |
| `fontFamily` | 字符串或非空字体回退数组 | 标签与正文的字体族 |
| `fontWeight` | `1–1000` 或 DTCG 命名字重 | 字重 |
| `number` | 数字 | 行高、透明度等无单位值 |
| `typography` | 字体族、字号、字重、字距、行高组合 | 可复用文本样式语义 |

所有类型也可以把整个 `$value` 写成 Alias；Typography 的五个属性还可以分别使用类型正确的 Alias。

### Color

第一版只接受 sRGB：

```json
{
  "colorSpace": "srgb",
  "components": [0.2, 0.4, 1],
  "alpha": 1,
  "hex": "#3366ff"
}
```

- 三个 `components` 与可选 `alpha` 均在 `0–1`；
- 可选 `hex` 必须是六位十六进制，并与 sRGB 分量一致；
- `hex` 只是兼容和人工阅读字段，不能成为另一个独立颜色来源。

### Typography

```json
{
  "fontFamily": "{primitive.font.family.sans}",
  "fontSize": "{primitive.font.size.control-label}",
  "fontWeight": "{primitive.font.weight-semibold}",
  "letterSpacing": "{primitive.font.letter-spacing.control-label}",
  "lineHeight": "{primitive.font.line-height.control-label}"
}
```

`lineHeight` 使用正数 `number`；其余属性分别要求 `fontFamily`、`dimension`、`fontWeight` 和 `dimension` 类型。

## 5. Alias 解析规则

Alias 使用 DTCG 花括号语法：

```text
{primitive.color.brand-600}
```

校验器会在每个 Mode 内独立检查：

1. 引用的 Token 必须存在；
2. 引用目标的 `$type` 必须与使用位置一致；
3. 依赖方向必须遵守三层模型；
4. 直接 Alias 与 Typography 属性 Alias 都进入依赖图；
5. 任何长度的循环引用都会被拒绝并定位到产生循环的 `$value`。

第一版不跨 Mode 解析 Alias，也不允许引用另一个 Token Set。跨资产引用应由后续 Registry 设计统一处理，不能通过私有路径语法提前绕开。

## 6. Mode 规则

Token Set 至少包含一个 Mode，最多八个。`defaultMode` 必须引用真实 Mode ID，Mode ID 不可重复。

默认 Mode 是身份基线。其他 Mode 必须与它保持：

- 完全相同的 Token 路径集合；
- 相同的 `$type`；
- 相同的 `$description`；
- 相同的 `$deprecated` 状态。

Mode 之间只允许 `$value` 不同。这保证 `semantic.action.primary.background.default` 在 Light 和 Dark 中仍然是同一个设计决定，而不是两个碰巧同名的对象。

## 7. Button 垂直链路覆盖

正确 Fixture 包含 31 个 Token，覆盖：

- Primary 默认／禁用背景和文字；
- Secondary 默认／禁用背景、文字和边框；
- Medium 控件高度、水平内边距、边框宽度与圆角；
- Label 字体族、字号、字重、字距和行高；
- 禁用态透明度；
- 六种已支持 `$type` 及 Primitive → Semantic Alias。

SCH-003 可以直接用这些稳定路径定义 Button Component Contract，不需要重新决定颜色和尺寸格式。

## 8. Figma 映射边界

SCH-002 只定义上游事实，不在 `core` 中调用 Figma API。后续 Writer 应采用确定映射：

| Hatch Token | Figma 表达 |
| --- | --- |
| `color` | `COLOR` Variable |
| `dimension` | `FLOAT` Variable，并保留 Hatch 单位元数据 |
| `number` | `FLOAT` Variable |
| `fontFamily` | `STRING` Variable |
| `fontWeight` | `FLOAT` 或 `STRING` Variable，按原值类型确定 |
| `typography` | 解析后的组合样式；不能假装成单一 Figma Variable |

`rem` 到 Figma 像素值的换算基准尚未冻结。Writer 在没有项目换算配置时必须拒绝含 `rem` 的写入，不能默认猜测 `1rem = 16px`。

## 9. 校验结果与公共入口

公共入口：

```ts
const result = validateTokenSet(input);
```

成功时返回 `ToolkitResult<TokenSet>`。失败时返回统一错误：

- 未知 Schema 版本：`SCHEMA_VERSION_UNSUPPORTED`；
- 内容不合法：`VALIDATION_FAILED`；
- 诊断列表：`context.details.issues`；
- 字段位置：JSON Pointer，例如 `/modes/0/tokens/3/$value`。

`@agent-design-system-kit/core` 导出 Schema、推导类型、校验器、Alias 解析器、sRGB Hex 转换器和摘要投影。Zod Schema 与 TypeScript 类型仍保持单一来源。

## 10. 内容摘要投影

`toTokenSetDigestSubject` 明确列出会影响审批的所有根字段，并排除 `contentDigest` 自身。Mode 顺序、Token 顺序、路径、类型、描述、弃用状态和值全部进入摘要输入。

添加 Token、Mode 或 Alias 一般要求次版本升级；移除、重命名、改类型或破坏语义要求主版本升级。仅修改值虽然可使用修订版本，也会改变摘要并使旧批准失效。

## 11. Fixture

- `design-system/hatch-demo/tokens/button-foundation.tokens.json`：Button 最小基础 Token Set；
- `design-system/examples/tokens/invalid-aliases.tokens.json`：故意包含默认 Mode 丢失、重复路径、非法分层、断裂 Alias、类型不匹配、循环和跨 Mode 不一致。

正式测试直接读取两份 JSON，避免文档示例与运行时 Schema 漂移。

## 12. 当前不做

SCH-002 不实现：

- 完整 DTCG 文件导入／导出；
- DTCG Group、Group 继承、扩展和 JSON Pointer 引用；
- Resolver Module 的独立 Resolver Document；
- Display P3、Lab、LCH 等其他颜色空间；
- 跨 Token Set Alias；
- `rem` 换算配置与 Figma Variables 写入；
- Token 编辑器、可视化预览或 Web 前端；
- Token 审批记录和自动迁移。

这些能力必须在真实需求出现后以版本化扩展加入，不能让第一版 Schema 提前承诺尚未验证的行为。

## 13. 完成标准

- 六种基础 Token 类型与 Alias 都可以校验；
- Color、字体、尺寸、间距、圆角和透明度覆盖 Button 验收合同；
- 重复路径、断裂引用、类型错误、分层错误和循环引用均返回准确路径；
- 多 Mode 的路径、类型和元数据保持一致；
- 正确与错误 Fixture 均由正式测试直接覆盖；
- 内容摘要投影明确排除 `contentDigest`；
- Node 24 与 Node 22 的统一质量门禁通过。

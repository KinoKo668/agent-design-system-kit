# COMP-001：Icon 契约与 Figma 组件链路

## 1. 目标

COMP-001 把 Icon 从“Agent 临时绘制的图形”升级为可校验、可登记、可查询并可由单一 Writer 建立的设计系统资产。第一条正式切片固定为 `Icon / Check`，用于证明通用组件架构不只服务 Button。

## 2. v1 冻结范围

| 项目       | 决策                                                     |
| ---------- | -------------------------------------------------------- |
| 资产       | `icon/check@1.0.0`                                       |
| 尺寸       | Small 16、Medium 24、Large 32                            |
| 默认尺寸   | Medium 24                                                |
| 光学网格   | 24 × 24                                                  |
| 图形       | `M5 12.5L10 17.5L19 7.5`                                 |
| 描边       | 2px、Round Cap、Round Join；随尺寸按光学网格等比缩放     |
| 颜色       | `{semantic.color.icon-default}`                          |
| 无障碍默认 | 装饰性；语义使用必须由消费方提供可访问名称               |
| 点击目标   | 由消费组件负责，最小 44px；不能靠放大 Glyph 冒充点击区域 |

Icon Token 定义颜色与尺寸决策，Icon Contract 定义图形、Variant 和使用规则，两者都不等于 Figma 节点。

## 3. 已实现链路

```text
Icon Token Set + Icon Contract
→ 严格跨引用与摘要校验
→ Component Registry 查询／精确解析
→ 确定性 FigmaIconPlan
→ components.icon.ensure
→ 3 个 Main Component Variant + Vector Glyph
→ 写后 Marker
→ Registry 原子 Ready 最终化
```

实现包括：

- `icon-v1` 严格 Contract Profile，只接受完整的三尺寸矩阵、固定 Check 几何和语义 Token；
- 通用 Component Contract 联合类型，使查询、Registry 和审计同时理解 Button 与 Icon；
- 独立 Icon Token Set 和独立 Registry 文件，Loader 会合并并校验全部来源；
- CLI 与 MCP 可按 `icon/check`、`Icon / Check` 或 `componentKind=component-set` 查询，并明确返回 `ensure-required`；
- `FigmaIconPlan` 从已验证的 Contract 与 Token Set 推导 Component Set、Variant、尺寸、缩放几何、Variable 身份和无障碍元数据；
- Figma Plugin Writer 创建真实 `VectorNode` Glyph，把 frame 宽高和 stroke color 绑定到准确 Variable；
- 同一批准内容重试时不重复创建，部分写入可按稳定 Marker 恢复；
- 同名未托管资产、重复稳定身份、陈旧 Variable、降级或同版本摘要冲突均失败关闭；
- Bridge 写前从 Git 重建完整 Icon Plan，成功后使用同一 Registry 原子最终化流程。
- 主线程新增完整 Icon Adapter 后采用 128 KiB 原始体积与 32 KiB gzip 双门禁；当前仍远低于 Figma UI 的 300 KiB 上限，并保留独立 Source Map。

## 4. 稳定身份

```text
hatch-demo/component/icon/check/component-set/major-1
├── variant/size-small
├── variant/size-medium
└── variant/size-large
```

每个 Variant 内只有一个托管 `Glyph` Layer。Component、Variant 和 Glyph 都写入包含 Project、Asset、Major、Role、Slot、版本与摘要的 Shared Plugin Data Marker。节点名称只用于人类阅读，不承担身份识别。

## 5. 当前诚实边界

公开样例的 Icon Registry 状态仍为 `unbuilt`，因为仓库没有伪造人类 Approval Record，也没有在用户指定的独立 Figma Desktop 文件里完成真实写入和视觉验收。因此：

- Agent 可以查询并理解 Icon Contract；
- Resolver 会返回 `ensure-required`，不会提供虚假的 Node ID；
- `components.icon.ensure` 已进入正式 Writer Protocol 和 Plugin 主线程，但尚未暴露为公开 MCP Tool；
- Icon Instance 插入尚未实现，页面 Agent 不能把 `unbuilt` Icon 当成可复用的真实 Instance；
- 完成真实审批、Variables 写入、两次 Icon Ensure、重开定位和设计师验收后，Registry 才能进入 `ready`。

## 6. 验收标准

自动门禁必须证明：

1. Contract、Token、Registry 与摘要严格有效；
2. 查询可以唯一找到三种尺寸，并在未建库时阻止插入；
3. Plan 的稳定身份和 Variable 所属关系不可由客户端篡改；
4. Writer 只创建一个 Component Set、三个 Variant 和每个 Variant 一个 Glyph；
5. 相同操作第二次执行为物理无变化；
6. 陈旧依赖、重复身份、同名未托管资产和损坏结构不会污染 Figma；
7. Node.js 24 与 22 的完整质量门禁通过。

外部验收仍需设计师确认 16／24／32 三个尺寸的光学重量、对齐和视觉清晰度。

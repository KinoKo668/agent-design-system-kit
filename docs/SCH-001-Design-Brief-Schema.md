# SCH-001：Design Brief Schema

- 状态：已实现
- 实现日期：2026-08-31
- Schema 版本：`1.0.0`
- 依赖：ADR-002、CORE-001、SEC-001
- 适用范围：Git 中的 Design Brief、CLI／MCP 校验入口、UI 方向生成的上游输入

## 1. 目标

Design Brief 负责回答“为什么这样设计”，不是描述 Button 怎么画。它把产品与品牌背景转换成不同 Agent、不同会话和不同协作者都能读取的同一份输入。

SCH-001 建立第一份正式业务 Schema，要求：

- 产品问题、目标用户、关键场景和设计约束不能只存在于聊天记录；
- Agent 收到非法 Brief 时得到准确字段路径和恢复动作；
- Brief 使用稳定身份、资产版本和 Schema 版本；
- 场景引用的用户必须真实存在，ID 不允许重复；
- 开源 Fixture 不包含个人 Figma 文件定位信息；
- 后续内容摘要能基于明确的字段投影计算。

## 2. 文档身份

根级身份字段遵循 ADR-002：

```json
{
  "schemaVersion": "1.0.0",
  "assetType": "brief",
  "projectId": "hatch-demo",
  "assetId": "product-foundation",
  "assetVersion": "1.0.0"
}
```

完整逻辑身份为：

```text
ads://hatch-demo/brief/product-foundation@1.0.0
```

- `projectId` 是单个小写 ASCII kebab-case 片段；
- `assetId` 可以用 `/` 连接多个 kebab-case 片段；
- `assetVersion` 必须是完整 SemVer，不能写成 `1.0`；
- `schemaVersion` 当前只接受准确的 `1.0.0`；
- 未知版本返回 `SCHEMA_VERSION_UNSUPPORTED`，不会猜测字段含义。

## 3. 必需内容

| 字段 | 作用 | 关键规则 |
| --- | --- | --- |
| `title` | Brief 的可见名称 | 非空、无首尾空格、最多 120 字符 |
| `product` | 产品摘要、问题和价值主张 | 三项均必需 |
| `goals` | 设计工作应推动的目标 | 至少一项；ID 唯一；包含可观察的成功信号 |
| `audiences` | 目标用户 | 至少一项；ID 唯一；每项至少一个需要 |
| `scenarios` | 关键使用场景 | 至少一项；必须引用存在的 `audienceIds` |
| `brand` | 品牌属性、原则和明确避免项 | 属性 2–8 个，大小写不敏感去重 |
| `platforms` | 目标平台、设备形态和输入方式 | 平台 ID 唯一；能力列表不可重复 |
| `constraints` | 业务、品牌、法律、技术等约束 | 至少一项；ID 唯一 |
| `accessibility` | 标准与项目具体要求 | 标准和要求均不可为空 |
| `references` | 可选公开参考 | 仅 HTTPS；禁止个人 Figma 文件 URL |
| `contentDigest` | 可选的已计算内容摘要 | 仅接受 `sha256:<64 lowercase hex>` |

所有对象使用严格模式：没有登记的字段会返回错误，而不是被静默丢弃。这可以尽早发现 Agent 拼错字段名或不同工具自行创造格式。

## 4. 数据结构

### Product

- `summary`：一句话说明产品是什么；
- `problem`：当前用户问题或工作流问题；
- `valueProposition`：产品提供的独特价值。

### Goal

每个 Goal 包含稳定 `id`、目标 `statement` 和 `successSignal`。成功信号不要求在此阶段变成分析指标，但必须让设计师知道如何判断目标是否被满足。

### Audience 与 Scenario

Audience 描述目标人群、背景和需要。Scenario 描述一个设计必须支持的关键场景，并通过 `audienceIds` 引用一个或多个 Audience。

引用关系由 Schema 做语义校验：

```text
scenario.audienceIds
        │
        └── 必须存在于 audiences[].id
```

这能防止删除或重命名 Audience 后留下表面合法、实际断裂的场景。

### Brand

- `attributes`：品牌希望给人的直接感受；
- `principles`：设计决策应遵守的原则；
- `avoid`：明确禁止的表达与误导。

`avoid` 被设为必需字段，因为“不要变成什么”通常与“希望是什么”同样能帮助 Agent 排除错误 UI 方向。

### Platform

每个平台记录：

- 稳定 ID 和可见名称；
- `kind`：Web、iOS、Android、Figma Plugin 等运行环境；
- `formFactors`：Desktop、Mobile、Tablet、Watch、Headset 等形态；
- `inputMethods`：Keyboard、Pointer、Touch、Voice 等输入方式。

这些信息是后续布局密度、组件状态、目标尺寸和交互设计的输入，不代表 SCH-001 已经实现平台组件库。

### Constraint 与 Accessibility

Constraint 使用稳定 ID 和类别表达强制边界。Accessibility 独立存在，确保无障碍不是可省略的附加说明；项目可以选择 WCAG、Apple HIG、Material Design 或自定义基线，并补充具体要求。

## 5. 校验结果

公共入口：

```ts
const result = validateDesignBrief(input);
```

成功时返回版本化 `ToolkitResult<DesignBrief>`。失败时返回 `VALIDATION_FAILED`，并在 `context.details.issues` 中提供机器可读诊断：

```json
{
  "code": "custom",
  "path": "/scenarios/0/audienceIds/0",
  "message": "Unknown audience id 'missing-audience'."
}
```

路径采用 JSON Pointer：

- `/product`：缺少整个 Product；
- `/goals/1/id`：第二个 Goal 的 ID 重复；
- `/unexpectedField`：出现未登记根字段；
- `/references/0/url`：第一条参考链接不安全或不合法。

错误信息不要求 Agent 解析自然语言来判断类型；它应读取统一 Error Code 和准确路径，再向用户解释需要修改的字段。

## 6. 内容摘要投影

`toDesignBriefDigestSubject` 明确列出会影响审批的字段，并排除 `contentDigest` 自身。产品问题、目标、用户、场景、品牌、平台、约束、无障碍与参考资料都进入投影；数组顺序保留。

SCH-001 只定义投影，不在 Schema 内隐式计算 SHA-256。后续摘要服务必须按照 ADR-002 使用 RFC 8785 JCS 与 SHA-256，并核对保存的 `contentDigest`。

Draft 可以在尚未计算摘要时通过结构校验；进入评审或批准流程前必须生成并校验摘要。审批状态和审批人不写进 Brief，而由独立 Approval Record 绑定 Brief 的完整身份、版本和摘要。

## 7. Fixture

仓库提供两份真实 JSON Fixture，并由正式测试直接读取：

- `design-system/examples/briefs/hatch-demo.brief.json`：正确的最小公开 Brief；
- `design-system/examples/briefs/invalid-cross-references.brief.json`：故意包含重复 ID、断裂引用、重复能力和私有 Figma URL。

错误 Fixture 不是可复制模板，只用于证明系统会拒绝危险或自相矛盾的数据。

## 8. 公共代码入口

`@agent-design-system-kit/core` 导出：

- `designBriefSchema` 与推导出的 `DesignBrief` 类型；
- `validateDesignBrief`；
- `toDesignBriefDigestSubject`；
- `DESIGN_BRIEF_SCHEMA_VERSION`、`DESIGN_BRIEF_ASSET_TYPE`；
- 可供后续 Schema 复用的稳定 ID、SemVer 与内容摘要基础 Schema。

Zod 4 是运行时 Schema 与 TypeScript 类型的唯一来源，禁止再手写一份可能漂移的 Brief 接口。

## 9. 当前不做

SCH-001 不实现：

- Brief 编辑器或表单 UI；
- 自动通过聊天生成完整 Brief；
- UI 方向生成与选择；
- Approval Record Schema；
- 内容摘要算法与 Git 状态校验；
- Brief 多版本迁移；
- Token、Component 或 Registry Schema。

这些能力分别属于后续 Loop、Approval、Registry 和 Schema 任务。

## 10. 完成标准

- 正确公开 Fixture 可以解析成类型安全的 Design Brief；
- 错误 Fixture 返回重复 ID、断裂引用和不安全 URL 的准确路径；
- 缺失字段、未知字段、非法身份、非法版本与非法摘要均被拒绝；
- 未知 Schema 版本返回专用版本错误；
- 摘要投影明确排除 `contentDigest`；
- Schema 与类型从 `core` 公共入口导出；
- Node 24 与 Node 22 的统一质量门禁通过。

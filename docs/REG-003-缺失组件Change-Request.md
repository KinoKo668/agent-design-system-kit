# REG-003：缺失组件 Change Request

- 状态：已实现
- 实现日期：2026-09-01
- Schema 版本：`1.0.0`
- 依赖：DIR-001、DIR-002、REG-001、REG-002、CORE-001
- 适用范围：组件或 Variant 无法精确解析后的阻断结果、后续 CLI 与 MCP Tool

## 1. 目标

REG-003 把“找不到准确组件”从一句自然语言错误转换为一份可以交给设计师和技术负责人处理的结构化需求单。

```text
精确解析成功
→ 返回已登记组件

精确解析失败且属于真实能力缺口
→ 返回 Change Request
→ 停止页面实现
→ 等待人工分诊
```

Change Request 不是 Component Contract、设计稿或 Writer Command。它只记录用户需要什么、系统为何无法满足、当前有哪些登记资产，以及下一步应该由谁判断。

## 2. 哪些情况生成申请

`resolveComponentOrRequestChange` 只把以下失败转换为申请：

| 场景                                                       | `changeKind`                    |
| ---------------------------------------------------------- | ------------------------------- |
| 项目中从未登记该 Component ID                              | `create-component`              |
| Component 存在，但请求了未登记 Property、Option 或 Variant | `extend-component`              |
| Component 存在，但请求版本不是可解析的 Active 版本         | `review-component-availability` |

以下情况不会生成申请，而是保留原错误：

- Query 本身不符合 Schema；
- 请求的 `projectId` 不是当前 Snapshot 项目；
- Registry 出现多个 Active 匹配；
- Snapshot 内部关系损坏；
- 不是已登记的 Variant 能力缺口，而是其他校验错误。

这样可以避免用“新需求”掩盖项目配置、身份冲突或输入错误。

## 3. 标准调用

```ts
const result = resolveComponentOrRequestChange(
  snapshot,
  {
    projectId: "hatch-demo",
    assetId: "button",
    variantSelections: {
      appearance: "tertiary",
      state: "default",
    },
  },
  {
    requestId: "<uuid>",
    summary: "Add a Tertiary Button appearance",
    rationale: "Current appearances cannot express this emphasis level.",
    intendedUse: "Low-emphasis action in the settings footer.",
    submittedBy: { type: "agent", id: "codex" },
    submittedAt: "2026-09-01T15:45:00Z",
  },
);
```

如果 Button 能准确解析，函数返回：

```text
outcome = resolved
```

并完整保留 REG-002 的 Approval Guard 与 Figma Audit 警告。

如果 Tertiary 未登记，返回：

```text
outcome   = change-request-required
changeKind = extend-component
nextAction = human-triage
```

## 4. Change Request 身份

每份申请包含：

- `requestId`：调用方创建的 UUID，用于跨 CLI／MCP 重试保持同一申请；
- `requestVersion`：申请内容版本，默认 `1.0.0`；
- `projectId`：准确项目；
- `requestType = component-change-request`；
- `status = proposed`。

第一版只创建 Proposed 请求，不擅自进入 In Review、Approved 或 Rejected。正式状态推进需要后续人工工作流。

同一个调用方应在重试时复用原 `requestId`、时间和提交内容。Core 函数不读取时钟、不生成随机数，也不访问文件；相同 Snapshot 与输入会得到完全相同的结果。

## 5. 需求与证据

申请保存三组事实。

### 人类可读需求

- `summary`：简短标题；
- `rationale`：为什么现有系统不能满足；
- `intendedUse`：准备在哪个产品场景使用；
- `submission`：真实提交主体与提交时间。

Agent 可以提交需求，但不能代表设计师作出批准决定。

### 原始精确查询

`sourceQuery` 保存：

- 项目和 Component ID；
- 调用方明确指定的版本；
- 原始 Variant Selection。

系统不把 `tertiary` 自动改成 `secondary`，也不把拼错的 Component ID改写成看起来最接近的名字。

### 解析证据

`resolutionEvidence` 保存稳定 Error Code、Issue Code 和 JSON Pointer。`existingCandidates` 保存同一 Component ID 已登记版本的：

- 身份、版本与摘要；
- Approval 引用；
- Lifecycle 与 Figma 状态；
- Contract 和 Registry 相对来源路径。

候选证据可以让人工判断应该新建、扩展、升级还是重新启用，而不是重复建设现有资产。

## 6. 强制禁止动作

每份合法申请都必须按固定顺序包含：

```json
[
  "create-visual-approximation",
  "fallback-to-inactive-component",
  "invent-unregistered-property-or-variant",
  "enqueue-figma-write"
]
```

Schema 使用固定 Tuple，而不是任意字符串数组。缺少、改名、调序或增加未登记动作都会校验失败。

Change Request Schema 同时使用严格对象，拒绝 `writerCommand`、`componentContract`、`registryEntry`、`figmaLocator` 等偷偷夹带的执行产物。

因此，生成申请本身不会：

- 创建 Token；
- 创建或修改 Component Contract；
- 添加 Registry Entry；
- 创建 Figma Main Component；
- 插入页面 Instance；
- 进入 Writer Queue。

## 7. 内容摘要

`toComponentChangeRequestDigestSubject` 明确列出全部需求、查询与证据字段，并排除：

- `contentDigest` 自身；
- `submission.submittedAt` 运行时间。

提交者身份会进入摘要，时间不会。这样不同 JSON 排版或重新记录提交时间不会改变需求内容；修改目标、Variant、理由、现有候选或禁止动作会改变摘要。

第一版输出可以暂不带 `contentDigest`。未来持久化或送审时，应由文件系统适配层使用 REG-001 的确定性 JSON 与 SHA-256 计算并保存。

## 8. 隐私和来源边界

申请中的候选只包含 Git 相对来源路径和逻辑状态，不包含：

- Figma Node ID；
- Component Key；
- File Binding ID；
- Figma 私有 URL；
- Bridge Session Token 或其他凭据。

如果 Registry 冲突，系统返回原 `IDENTITY_CONFLICT`，而不是把物理定位信息复制进申请。

## 9. Fixture 与公共代码入口

公开 Fixture：

- `design-system/examples/change-requests/tertiary-button.change-request.json`：合法的 Button Tertiary 扩展请求；
- `design-system/examples/change-requests/invalid-component.change-request.json`：故意包含项目、目标、证据和 Change Kind 冲突。

`@agent-design-system-kit/core` 导出：

- `componentChangeRequestSchema`；
- `componentChangeRequestSubmissionSchema`；
- `validateComponentChangeRequest`；
- `toComponentChangeRequestDigestSubject`；
- `resolveComponentOrRequestChange`；
- Change Kind、可申请 Variant Issue、Prohibited Actions、Request 与 Outcome 类型。

正式测试覆盖：正确／错误 Fixture、未知 Writer 字段、摘要投影、成功解析、缺失组件、Tertiary Variant、不可用版本、确定性、输入错误、项目错配与 Registry 歧义。

## 10. 当前不做

REG-003 不实现：

- 自动写入 Git 文件或创建 GitHub Issue；
- 自动修改 Contract、Token 或 Registry；
- 自动生成设计方案或 Figma 预览；
- Change Request 的评审、批准、拒绝和版本迁移；
- CLI 与 MCP 协议入口；
- Figma Writer 或任何页面写入。

CLI-001 已提供本地 `validate`、`search`、`resolve` 与 `request-change` 入口；MCP-003 已向 Agent 暴露 Resolve 与 Change Request Tool。

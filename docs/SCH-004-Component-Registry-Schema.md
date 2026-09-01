# SCH-004：Component Registry Schema

- 状态：已实现
- 实现日期：2026-09-01
- Schema 版本：`1.0.0`
- 依赖：DIR-001、DIR-002、ARCH-001、ADR-002、SCH-003
- 适用范围：Git 中的 Component Registry、Registry Loader／Resolver、Figma Writer 回写与审计

## 1. 目标

Component Registry 负责回答：

> Git 中哪个准确版本的 Component Contract，经过哪一条人工审批，对应 Figma 中哪一条物理资产轨道，现在能否用于新页面。

它不是另一份 Component Contract，也不保存视觉值。Registry 只建立跨系统关系：

```text
Component Contract 身份、版本与摘要
                 │
                 ├── Approval ID
                 ├── Lifecycle
                 └── Figma File Binding + Managed Asset Locator
```

页面 Agent 必须先解析 Registry。只根据 `Button` 名称、Node ID 或聊天记忆寻找组件都不合法。

## 2. 根结构

```json
{
  "schemaVersion": "1.0.0",
  "registryType": "component-registry",
  "projectId": "hatch-demo",
  "entries": []
}
```

- Registry 属于一个准确 `projectId`；
- 第一版只登记 `asset.type = component`；
- `entries` 至少一项，最多 5000 项；
- 对象使用严格 Schema，未知字段不会被静默保存；
- 未知版本返回 `SCHEMA_VERSION_UNSUPPORTED`。

Registry 是可更新的映射账本，不是新的设计资产，因此第一版没有独立 `assetVersion`。Git 历史保存 Registry 的修改过程；其中引用的 Component Contract 必须使用完整版本与摘要。

## 3. Entry 的稳定事实

```json
{
  "asset": {
    "type": "component",
    "id": "button",
    "version": "1.0.0",
    "contentDigest": "sha256:<64-hex>"
  },
  "approvalId": "approval.component.button.1.0.0",
  "lifecycle": "active",
  "lifecycleReason": null,
  "figma": {},
  "supersedes": null,
  "replacedBy": null
}
```

`asset` 指向准确 Component Contract：

- `id` 对应 Contract `assetId`；
- `version` 对应 Contract `assetVersion`；
- `contentDigest` 对应经过规范化和 SHA-256 计算的 Contract 内容；
- 同一 `id + version` 不允许重复。

Registry 不通过 Git 文件名、Figma 名称或数组位置识别组件。

## 4. Approval Reference

每个 Entry 必须引用准确的审批记录：

```text
approval.component.<asset-id>.<asset-version>
```

Button 1.0.0 的引用固定为：

```text
approval.component.button.1.0.0
```

Registry 不保存 `approved: true`。单个布尔值无法证明谁批准了什么内容，也无法在摘要变化后自动失效。

SCH-004 只校验 Approval ID 与资产身份一致。Approval Record 的角色、决定、校验结果和当前派生状态将在后续审批 Schema／Guard 中验证；在此之前，存在 Registry Entry 不代表审批已经真实完成。

## 5. Lifecycle

第一版支持：

| 状态 | 新页面是否可用 | 规则 |
| --- | --- | --- |
| `active` | 取决于 Figma 是否 Ready | 同一逻辑组件最多一个 Active 版本 |
| `superseded` | 否 | 必须说明原因并提供更高的 `replacedBy` |
| `revoked` | 否 | 必须说明撤销原因；已有使用进入审计范围 |

Active Entry：

- `lifecycleReason` 必须为 `null`；
- `replacedBy` 必须为 `null`；
- 可以通过 `supersedes` 指向较低版本。

非 Active Entry 必须填写 `lifecycleReason`。`supersedes` 只能指向较低版本，`replacedBy` 只能指向较高版本；如果关系两端都在 Registry 中，必须互相对应。

版本比较遵守 SemVer 2.0.0，包括预发布标识优先级，Build Metadata 不影响排序。

## 6. Figma Binding 状态

Registry 只持久化两种安全状态。

### Unbuilt

```json
{
  "status": "unbuilt",
  "fileBindingId": "<uuid>",
  "channel": "library",
  "majorVersion": 1,
  "role": "component-set",
  "slotId": "root"
}
```

表示 Contract 已进入 Registry，但目标 Figma Library 资产尚未完成构建。Resolver 不能把它用于插入 Instance；建库流程可以据此发起 `ensure`。

### Ready

Ready 在 Unbuilt 字段之外要求：

```json
{
  "status": "ready",
  "appliedVersion": "1.0.0",
  "appliedDigest": "sha256:<digest>",
  "locator": {
    "nodeId": "100:200",
    "componentSetKey": "<optional-published-key>"
  }
}
```

只有 Writer 完成真实属性、Variant、Token Binding 与身份审计后，才能原子写入 Ready：

- `majorVersion` 必须等于 Contract 主版本；
- `appliedVersion` 必须等于 Registry 资产版本；
- `appliedDigest` 必须等于 Registry 内容摘要；
- `role` 和 `slotId` 对 Button 根资产固定为 `component-set + root`。

创建中、部分写入或审计失败不允许写成 Ready。此时 Figma 托管标记保留 `phase: creating`，操作返回 `PARTIAL_WRITE`，Registry 仍保持 Unbuilt 或旧的最后成功状态。

## 7. 稳定物理轨道与 Locator

物理轨道由以下事实定义：

```text
projectId
+ fileBindingId
+ channel
+ asset ID
+ majorVersion
+ role
+ slotId
```

同一 Component 的同一 Major 兼容更新可以复用物理轨道；新 Major 默认并存。

`nodeId` 与 `componentSetKey` 只是 Locator：

- Node 被移动或 Registry Locator 失效时，可扫描 Shared Plugin Data 重新定位；
- 找到唯一对象后可以修复 Locator；
- 找不到返回 `IDENTITY_NOT_FOUND`；
- 找到多个返回 `IDENTITY_CONFLICT`；
- 不允许根据名称自动接管。

Schema 会阻止同一个 Locator 或发布 Key 被分配给不同组件／不同 Major 轨道。同一组件同一 Major 的历史版本可以保留相同 Locator 记录，但非 Active 版本永远不能用于新插入。

Ready 只表示“这条映射最后一次成功应用的版本”。它不是当前 Figma 节点仍然无漂移的证明；使用前仍需读取真实节点审计。

## 8. Registry 与 Contract 联合校验

```ts
const result = validateComponentRegistryWithButtonContract(
  registry,
  buttonContract,
);
```

联合校验要求：

1. Registry 与 Contract 属于同一项目；
2. Registry 中存在准确 `assetId + assetVersion`；
3. Contract 已具有经过验证的 `contentDigest`；
4. Registry 保存的摘要与 Contract 摘要完全一致。

摘要缺失或不匹配时返回准确 JSON Pointer，例如：

```text
/entries/0/asset/contentDigest
```

这会阻止“Contract 内容已改，但旧 Registry 和旧审批仍被继续使用”。

## 9. Registry Resolver 的后续读取规则

SCH-004 只定义数据，不实现搜索。REG-001／REG-002 必须按以下顺序读取：

1. 加载所有 Registry 文件并通过 Schema；
2. 校验 Contract、Token、Approval 的跨文件引用；
3. 按 `projectId + asset.type + asset.id` 查询；
4. 只选择唯一 Active Entry；
5. `unbuilt` 返回需要 Ensure，不伪装成可插入；
6. `ready` 返回物理轨道与 Locator，同时声明仍需 Figma 实际审计；
7. 零结果返回结构化 Not Found；多结果返回 Identity Conflict。

Resolver 不得自动回退到 Superseded、Revoked 或名字相近的组件。

## 10. 安全边界

Registry 可以保存 Figma 物理定位信息，但这些字段：

- 不是身份凭据，也不能替代文件绑定验证；
- 不得包含 Figma PAT、Bridge Session Token 或用户 Cookie；
- 不得原样进入日志、Telemetry 或公开错误信息；
- 公开 Fixture 只能使用明显的虚构 ID 和 Key。

生产错误应返回逻辑身份和字段路径；真实 `fileBindingId`、Node ID、Component Key 必须经过 SEC-001 脱敏。

## 11. Fixture 与公共代码入口

- `design-system/hatch-demo/registry/components.registry.json`：一个 Active、Ready 的 Button 映射，所有物理 ID 均为虚构值；
- `design-system/examples/registry/invalid-components.registry.json`：故意包含审批错配、版本／摘要漂移、非法生命周期、错误历史关系、重复 Active 与跨组件 Locator 冲突。

`@agent-design-system-kit/core` 导出：

- `componentRegistrySchema` 与推导类型；
- `componentRegistryEntrySchema`；
- `componentRegistryFigmaBindingSchema`；
- `validateComponentRegistry`；
- `validateComponentRegistryWithButtonContract`；
- Schema、Registry Type、Lifecycle 与 Figma 状态常量。

正式测试同时覆盖 Ready、Unbuilt、同 Major 历史关系、Contract 摘要关联、项目错配、缺失资产和 SemVer 优先级。

## 12. 当前不做

SCH-004 不实现：

- 文件发现、加载、写回和原子替换；
- Component 搜索、排序与唯一解析；
- Approval Record Schema 和角色决定校验；
- Figma API 查询、Shared Plugin Data 扫描与 Locator 修复；
- Registry 写入锁和并发控制；
- 代码组件、Code Connect 或多平台实现映射；
- Token Registry 与跨 Token Set Alias；
- 自动删除、自动回退或自动接管 Figma 资产；
- 审计结果、运行日志和 Operation 队列的持久化。

这些能力分别属于 REG、LOOP、FIG、AUD 和后续扩展任务。

## 13. 完成标准

- Contract 身份、版本、摘要与 Approval ID 可以关联；
- Active、Superseded、Revoked 及版本关系可以校验；
- Unbuilt 与 Ready Figma 状态边界明确；
- File Binding、Major 轨道、根 Slot 与 Locator 可以校验；
- Ready 的应用版本和摘要必须与 Contract 映射一致；
- 不同物理轨道不能复用同一 Locator；
- 正确／错误 Fixture 由正式测试直接读取；
- Node 24 与 Node 22 的统一质量门禁通过。

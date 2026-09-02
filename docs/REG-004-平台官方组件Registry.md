# REG-004：平台官方组件 Registry

- 状态：Schema 与联合校验已实现；等待真实 Library Key 验证
- 实现日期：2026-09-02
- Schema 版本：`1.0.0`
- 任务：PLAT-003
- 依赖：ADR-003、SCH-003、SCH-004、SCH-005

## 1. 目标

Platform Component Registry 保存“产品语义组件的准确 Variant，对应哪个官方 Figma 发布组件”。它独立于现有 Hatchkit Managed Component Registry，避免把外部只读资产误写成 Hatch 自己创建和拥有的 Component Set。

## 2. 两阶段状态

### Cataloged

表示已确定 Vendor Library 与目标平台，但尚未完成真实 Figma Component Key 和人工映射评审。此状态不可插入。

```json
{ "status": "cataloged" }
```

### Ready

表示真实 Figma Library 已验证，每个 Contract Variant 都有唯一发布 Component Key，并且平台映射已经人工批准。

```json
{
  "status": "ready",
  "libraryKey": "published-library-key",
  "verifiedAt": "2026-09-02T12:00:00Z",
  "mappings": [
    {
      "variantId": "appearance-primary/state-default",
      "componentKey": "published-component-key",
      "componentName": "Button"
    }
  ],
  "propertyMappings": [
    {
      "contractPropertyId": "label",
      "figmaPropertyName": "Label#123:456",
      "figmaPropertyType": "TEXT",
      "support": "writable"
    }
  ]
}
```

## 3. Entry 关系

每个 Entry 同时引用：

- 准确 Component Contract 身份、版本与摘要；
- 准确 Platform Target 身份、版本与摘要；
- Platform Target 中存在的官方 `libraryId` 与 Vendor；
- `external-reference-only` 授权边界；
- Lifecycle；
- Platform Binding Review；
- Figma Library 与 Variant Mapping 状态。
- 稳定 `bindingId`、`bindingVersion` 和可复算 `contentDigest`；
- Contract Property 到 Figma Component Property 的显式可写／不支持映射。

联合校验要求 Ready Mapping 完整覆盖 Contract 的所有 Variant，不允许缺失、重复或额外 Variant。所有必填文本 Property 必须有可写映射；调用者只能修改明确登记为 `writable` 的 Property。

## 4. 生命周期与唯一性

同一个 Component 与 Platform Target 最多只有一个 Active Entry。Revoked 或 Superseded Entry 必须说明原因，且不能用于新页面。

Ready Entry 必须具有 `review.status = approved` 和按 Binding 身份、版本确定生成的 `approval.platform-binding.*` 引用。审批必须准确依赖对应 Component 与 Platform Target，且摘要与当前 Entry 一致。Cataloged Entry 可以保持 `unreviewed`，用于调查和准备，不产生写入授权。

## 5. 隐私与授权

Registry 只保存发布 Key 和来源元数据，不保存官方组件节点内容、截图、矢量、Token 副本或用户凭据。Key 是 Locator，不是许可，也不是身份验证手段；Writer 仍需依赖当前 Figma 用户的实际访问权限。

## 6. 公共入口

`@agent-design-system-kit/core` 导出：

- `platformComponentRegistrySchema`；
- `platformComponentRegistryEntrySchema`；
- `vendorFigmaBindingSchema`；
- `validatePlatformComponentRegistry`；
- `validatePlatformComponentRegistryWithAssets`；
- 对应类型与版本常量。

## 7. 下一步

PLAT-004 与 PLAT-005 必须在用户拥有访问权的 Figma 文件中获取真实 Library／Component Key，并验证它们是否可以稳定导入。真实 Key 未验证前，公开 Catalog 不得伪装为 Ready。

# PLAT-004：Apple 官方 UI Kit 验证手册

- 状态：自动化准备完成，等待真实 Figma 人工验证
- 日期：2026-09-02
- 适用：iOS／iPadOS 26 Stable、iOS／iPadOS 27 Preview

## 目标

把 Apple 官方 UI Kit 从“可参考的资源”变成 Hatchkit 可安全调用的外部依赖。Hatchkit 不复制或重新发布 Apple 文件，只登记来源、版本、发布 Key、属性能力和人工审批证据。

## 前置条件

1. 设计师从 [Apple Design Resources](https://developer.apple.com/design/resources/) 打开对应官方 Figma UI Kit；
2. 在用于验证的 Figma Design 文件中启用该 Library，并由用户接受适用许可；
3. iOS 26 与 iOS 27 Preview 使用不同 Platform Target，不混为同一默认轨道；
4. 先用 `cataloged` Registry Entry，真实 Key 未确认前不得改成 `ready`。

## 每个组件的验证记录

- 官方 Kit 名称、版本、Stable／Preview 通道和来源 URL；
- Figma Library Key；
- 每个 Contract Variant 对应的发布 Component Key 与准确组件名；
- 每个文本属性的 Figma Property Name，以及 `writable` 或 `unsupported`；
- 导入结果是否为 `remote = true`；
- 创建的节点是否仍是 Instance，Main Component Key 是否一致；
- 修改允许属性后，视觉和结构是否仍符合官方组件；
- Kit 更新后 Key、属性名和 Variant 是否发生变化。

## 通过标准

同一准确 Key 可连续导入并产生真实远程 Instance；属性写入只使用已登记的可写映射；iOS 26 Stable 不依赖 iOS 27 Preview；失败时不创建替代组件。完成后生成 Platform Binding Approval，并将 Entry 升级为 `ready`。

## 当前需要人工完成的内容

Hatchkit 已实现 Schema、解析、审批、Writer、幂等和审计，但无法代替用户启用受许可约束的 Apple Library。需要设计师在真实 Figma 账号中提供 Library Key、Button 等首批 Component Key 和属性检查结果。

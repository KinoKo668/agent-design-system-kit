# PLAT-007：平台组件来源审计

- 状态：代码与本地模拟测试已实现，等待真实 Figma 验收
- 日期：2026-09-02

`hatchkit_audit_platform_components` 以只读方式扫描当前绑定页面中带 Hatchkit 官方来源标记的节点，并与 Git 中 Active／Ready Platform Binding 对照。

当前检查：

- Instance 被 Detach 或失去 Main Component；
- 实际远程 Component Key 与批准 Key 不一致；
- Binding 已失效或未登记；
- 内容摘要、Library、审批阶段或项目来源被修改；
- Platform Target 身份／版本不一致；
- Apple→Android 或 Google→iOS／iPadOS 的跨平台误用。
- 官方 Marker 的 `assetType` 或必要来源字段被篡改；
- Plugin 返回的 Findings 与汇总计数不一致。

审计仅接受 `design-page` 角色的绑定文件，不会修改或自动删除节点。发现问题时返回准确 Node、实际值、期望值和恢复说明。

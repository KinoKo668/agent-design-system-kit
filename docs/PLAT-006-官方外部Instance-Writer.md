# PLAT-006：官方外部 Instance Writer

- 状态：代码与本地模拟测试已实现，等待真实 Figma 验收
- 日期：2026-09-02

## 能力

`hatchkit_insert_platform_instance` 会先按准确 Platform Target、Component Contract 和 Variant 解析已批准的官方映射，再把确定性计划提交给本地单 Writer。Plugin 使用发布 Component Key 调用 Figma 导入能力并创建真实 Instance。

写入门禁包括：

- Platform Binding Approval 与内容摘要一致；
- 当前 Figma 文件必须以 `design-page` 角色绑定，组件库写入仍限定为 `design-system-library`；
- 只接受 Registry 登记的准确 Component Key；
- 导入的 Main Component 必须为远程资产；
- 只修改批准为 `writable` 的 Property；
- 禁止 Component Mutation、Detach、Fallback 和近似替代；
- 写后再次读取 Main Component，确认远程状态与 Key；
- 相同请求幂等返回，不重复插入。

如果 Property Mapping 已过期，Plugin 会删除尚未写入页面的临时 Instance 并安全失败；如果在写入页面后中断，保留 `creating` Marker，使用相同请求重试时会重新审计远程来源并收敛为 `applied`，不会重复创建。

Library 未启用或账号无权访问时返回 `CREDENTIAL_REQUIRED`，不会改用自建组件。

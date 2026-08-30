# SPIKE-002 验证记录

- 状态：通过
- 验证日期：2026-08-30
- Figma 测试文件：Kite 空间中的专用 Design 文件（文件 Key 与节点 ID 不写入公开仓库）

## 自动化验证

- [x] 未携带 Session Token 的命令被拒绝
- [x] `technical-spike` 审批旁路只能用于 SPIKE-002，且必须声明目标稳定 ID
- [x] HTTP 命令能够到达模拟 Plugin 并返回结果
- [x] WebSocket 命令能够到达模拟 Plugin 并返回结果
- [x] 同一幂等键和同一命令返回原 Operation
- [x] 同一幂等键绑定不同命令时返回冲突
- [x] 同一时间只有一个命令在途，队列保持 FIFO
- [x] 未确认命令在租约过期后按原 Operation 重投
- [x] 7 项自动化测试全部通过

## Figma Desktop 真实验证

- [x] 开发插件通过 `localhost` 网络权限导入
- [x] HTTP 长轮询连接成功
- [x] HTTP `bridge.ping` 返回当前文件和页面上下文
- [x] HTTP `bridge.create_marker` 创建稳定身份标记
- [x] 相同幂等键重试没有再次进入 Plugin
- [x] WebSocket 连接成功
- [x] WebSocket `bridge.ping` 返回成功
- [x] WebSocket `bridge.create_marker` 更新原标记，`created === false`
- [x] 最终画布中只有一个 SPIKE-002 标记

## 方案结论

HTTP 长轮询与 WebSocket 都可行。MVP 选择 HTTP 长轮询，因为它允许 Bearer Header、调试简单、重连状态更少，并且低频串行写入不需要持久双向连接。WebSocket 需要把浏览器侧认证信息放入连接 URL 或子协议，并增加心跳和重连复杂度，暂不采用。

## 发现的限制

1. Figma Desktop 的 `devAllowedDomains` 在本次真实导入中接受 `localhost`，但拒绝等价的 `127.0.0.1` URL 写法。
2. Plugin UI 可以访问浏览器网络 API，Figma 主线程仍需通过 `postMessage` 接收命令并执行画布写入。
3. 进程内 FIFO 足以完成 MVP 实时写入；崩溃恢复仍必须依赖幂等键、Figma 稳定身份和后续审计。

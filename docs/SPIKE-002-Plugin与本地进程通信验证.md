# SPIKE-002：Plugin 与本地进程通信验证

- 状态：验证通过
- 验证日期：2026-08-30
- 实现目录：`spikes/figma-bridge/`
- 依赖：ARCH-001、SPIKE-001

## 1. 验证目标

验证同一台 Mac 上的本地进程能否可靠地把结构化命令发送到 Figma Plugin，并得到结构化执行结果。实验同时比较 HTTP 长轮询与 WebSocket，覆盖认证、单 Writer、FIFO、超时重投和幂等重试。

本实验不实现正式 MCP Server，也不决定 Monorepo 和依赖工具。

## 2. 最小协议

Agent 侧提交的 Writer Command 至少包含：

```json
{
  "schemaVersion": "0.1",
  "operationId": "op-uuid",
  "idempotencyKey": "caller-stable-key",
  "projectId": "spike-002",
  "target": { "stableId": "spike-002/marker/local-bridge" },
  "approval": { "mode": "technical-spike", "reference": null },
  "source": { "client": "spike-002-cli" },
  "command": {
    "type": "bridge.create_marker",
    "payload": { "label": "SPIKE-002" }
  }
}
```

Plugin 返回：

```json
{
  "schemaVersion": "0.1",
  "operationId": "op-uuid",
  "ok": true,
  "result": {
    "markerStableId": "spike-002/marker/local-bridge",
    "created": true
  }
}
```

Bridge 负责保存短期状态、串行派发命令、记录当前租约，并把 Plugin Result 转换为 Agent 可查询的 Operation Result。

`technical-spike` 是仅允许在 `projectId = spike-002` 中使用的实验标记，不能用于正式 Writer 绕过 DIR-002 审批。正式 Approval Reference 的 Schema 由后续工程任务定义。

## 3. 传输方案比较

| 维度 | HTTP 长轮询 | WebSocket |
| --- | --- | --- |
| Figma Desktop 可行性 | 通过 | 通过 |
| 命令和结果模型 | 天然请求／响应 | 需要自定义消息和确认帧 |
| Session Token | `Authorization` Header | 浏览器 API 不能设置自定义 Header，实验只能放在连接 URL |
| 断线处理 | 下一次 Poll 自动恢复 | 需要心跳、重连和连接状态机 |
| 本地调试 | 可直接使用普通 HTTP 工具 | 需要 WebSocket 客户端或控制台 |
| 低频串行写入成本 | 足够低 | 持久连接收益有限 |
| MVP 结论 | **采用** | 可行，但暂不采用 |

## 4. 冻结决定

MVP 的 `MCP ↔ Figma Plugin` 通信采用本机 HTTP 长轮询：

1. 本地服务只绑定 `127.0.0.1`；
2. Figma 开发插件访问 `http://localhost:38451`；
3. 服务启动时生成 192-bit 随机会话 Token；
4. 除健康检查外，所有请求必须携带 Bearer Token；
5. 同一时间只允许一个 Plugin Instance 占有 Writer Session；
6. Bridge 只派发一个在途命令，其他命令保持 FIFO；
7. 命令使用短期租约，未确认时按原 `operationId` 重投；
8. 同一幂等键与同一命令返回原 Operation；同一键绑定不同命令时拒绝执行。

选择 HTTP 不是因为 WebSocket 不可用，而是因为当前写入低频且必须串行，HTTP 的认证、观察和失败恢复更简单。

## 5. Figma 网络约束

Figma 要求插件在 Manifest 中声明网络范围，并支持为开发服务器单独配置 `devAllowedDomains`。真实导入时，Desktop 拒绝了 `http://127.0.0.1:38451` 的开发域名配置，改用 `http://localhost:38451` 后成功；本地服务仍绑定回环地址。

Plugin UI 运行在 iframe 中，通过 `postMessage` 把命令交给拥有 Figma Plugin API 权限的主线程，再把结果发回 iframe。相关规则参见 Figma 官方的 [Plugin Manifest](https://developers.figma.com/docs/plugins/manifest/) 与 [Creating a User Interface](https://developers.figma.com/docs/plugins/creating-ui/) 文档。

## 6. 队列与本地日志

MVP 的 FIFO Writer Queue 保持在 MCP 进程内，不尝试在进程重启后继续执行一段已经失去上下文的函数。崩溃恢复依赖：

- 调用方保留原幂等键并重新提交；
- Plugin 用稳定逻辑身份重新定位 Figma 资产；
- 审计读取 Figma 实际状态，而不是相信上次内存状态。

正式版本应输出经过脱敏的 Operation Result 或追加式运行记录，用于解释和审计；它不是数据库，也不应保存 Session Token。具体文件格式、保留周期和重启恢复规则由 ADR-002 冻结。

## 7. 验证结果

- 7 项自动化测试全部通过；
- HTTP 长轮询在真实 Figma Desktop 插件中完成 `ping` 和最小写入；
- WebSocket 在同一插件中完成 `ping` 和最小写入；
- HTTP 首次创建的标记被 WebSocket 命令按稳定身份更新，没有重复节点；
- 相同幂等键重复提交返回第一次 Operation Result，没有第二次进入 Plugin；
- 未认证请求、实验范围隔离、幂等键冲突、FIFO 阻塞和租约重投测试通过；
- 没有把 Session Token、Figma 文件 Key 或节点 ID写入仓库。

## 8. 结论

SPIKE-002 通过。ARCH-001 的本地优先和单 Writer 架构不需要重构，通信候选已收敛为 HTTP 长轮询。SPIKE-001 与 SPIKE-002 的关键工程风险均已解除，下一步进入 ADR-001，冻结正式 Monorepo、语言、包管理和测试工具。

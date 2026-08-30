# SPIKE-002：Figma Local Bridge

这是一个不依赖第三方包的隔离实验，用于比较 HTTP 长轮询与 WebSocket，并验证本地进程能否驱动真实 Figma Plugin。

## 包含内容

- `bridge.js`：绑定本机回环地址的临时命令桥和单 Writer FIFO；
- `client.js`：模拟未来 MCP Control Plane 的本地调用端；
- `code.js`：执行 `ping` 和稳定身份标记写入的 Figma 主线程；
- `ui.html`：HTTP／WebSocket 连接、重连和结果回传 UI；
- `tests/bridge.test.js`：认证、传输、FIFO、幂等和租约测试。

实验代码不代表 ADR-001 已经选择 CommonJS 或无依赖开发方式。

## 本地运行

1. 启动 Bridge：

   ```bash
   node bridge.js
   ```

2. 在 Figma Desktop 中从本目录的 `manifest.json` 导入开发插件。
3. 运行 `Agent Design System Kit — SPIKE-002`。
4. 把 Bridge 输出的临时 Session Token 粘贴到插件，选择 HTTP 或 WebSocket 并连接。
5. 在另一个终端执行：

   ```bash
   export ADS_BRIDGE_TOKEN='<temporary-token>'
   node client.js ping
   node client.js marker 'SPIKE-002 / Local Bridge OK' 'my-stable-idempotency-key'
   ```

Session Token 不应写入文件、Git 或长期环境配置。

## 本地检查

```bash
node --check bridge.js
node --check client.js
node --check code.js
node --test tests/bridge.test.js
```

## 有意保留的限制

- 只提供两个实验命令，不连接正式 Token、Contract 或 Registry；
- 队列和幂等记录在进程重启后丢失；
- 没有正式 MCP Tool；
- 没有生产级日志、指标或自动端口发现；
- WebSocket 实现仅用于可行性比较，不进入 MVP 正式路径。

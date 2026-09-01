# FIG-002：Plugin Bridge 与单 Writer 队列

## 1. 任务结论

FIG-002 已把 M0 的通信实验重建为正式工程能力：本地进程可以通过经过认证的 HTTP 长轮询，把严格的 Writer Command 串行交给唯一一个 Figma Plugin 实例，并获得可查询、可恢复、经过脱敏的 Operation Result。

本阶段只开放无写入的 `writer.ping`。它用于证明整条控制链路，不会创建 Variable、Component、Instance 或其他 Figma 节点。真实 Variables 写入从 FIG-003 开始。

## 2. 正式边界

```text
调用方
  ↓ POST /v1/operations
本地 Bridge + FIFO Queue
  ↓ POST /v1/plugin/next（HTTP 长轮询）
Figma Plugin UI
  ↓ postMessage
Figma Plugin 主线程
  ↓ writer.ping（不写入）
Plugin UI
  ↓ POST /v1/plugin/results
Operation Log + 可查询结果
```

冻结规则：

- 服务只绑定 `127.0.0.1`，Plugin 使用 `http://localhost:38451`；
- 不引入 WebSocket；
- 每个 Bridge 会话只有一个 Plugin Writer；
- 队列严格 FIFO，同一时间最多一个在途 Operation；
- 命令租约到期或 Writer 意外断开时，只重投原 Operation；
- 相同幂等键与相同命令返回原 Operation；相同键绑定不同命令时返回冲突；
- Plugin Result 必须携带当前 `pluginInstanceId`，其他实例不能代报结果；
- FIG-002 不允许 `technical-spike`、审批绕过字段或真实 Figma 写入命令。

## 3. Session Token

Bridge 启动时使用密码学安全随机源生成 192-bit Session Token：

- 默认八小时失效；
- Plugin 明确断开或 Server 停止后立即失效；
- 只通过 `Authorization: Bearer ...` Header 传递；
- URL Query、命令参数、配置文件、Figma Storage、Operation Log 和 Git 中均禁止保存；
- 使用 SHA-256 摘要和常量时间比较验证，错误凭据不会进入队列；
- Plugin 输入成功连接后立即清空，Token 只留在当前 Browser Client 内存。

`hatchkit-figma-bridge` 只在交互式终端启动时显示一次 Token，供操作者立即粘贴到 Plugin。不要重定向、截图或复制到聊天、Issue、配置与日志中。

## 4. HTTP Contract

| 方法与路径                   | 认证 | 用途                                      |
| ---------------------------- | ---- | ----------------------------------------- |
| `GET /v1/health`             | 否   | 返回非敏感连接、排队与过期状态            |
| `POST /v1/plugin/connect`    | 是   | 由一个 Plugin Instance 取得 Writer 所有权 |
| `POST /v1/plugin/next`       | 是   | 长轮询下一条 FIFO Command                 |
| `POST /v1/plugin/results`    | 是   | 当前 Plugin 回报结构化结果                |
| `POST /v1/plugin/disconnect` | 是   | 释放 Writer 并使本次 Token 失效           |
| `POST /v1/operations`        | 是   | 提交严格 Writer Command                   |
| `POST /v1/operations/get`    | 是   | 按 Operation ID 查询状态与结果            |

所有有内容的请求必须使用 JSON。请求体最多 64 KiB；Header、连接与请求超时也设置了明确上限。所有 JSON 响应使用 Core 的统一 Toolkit Result，不返回堆栈或凭据。

Operation ID 放在 JSON Body 而不是 URL 路径，避免访问日志意外收集未来可能关联到项目的数据。任何 Query 参数都会被 `UNSAFE_CREDENTIAL_SOURCE` 拒绝。

## 5. Queue、幂等与恢复

Bridge 内部记录：

- `queued`：已进入 FIFO；
- `dispatched`：已交给唯一 Writer，租约正在计时；
- `succeeded`／`failed`／`partial`：终态；
- `interrupted`：进程上次停止时尚未完成。

操作日志是按天追加的 NDJSON，默认位于被 Git 忽略的 `.agent-design-system-kit/runtime/operations/`：

- 文件权限为 `0600`，目录不接受符号链接；
- 单文件最多 8 MiB，单条记录最多 256 KiB；
- 只恢复最近 30 天的幂等索引；
- 原始幂等键只保存 SHA-256 摘要；
- Session Token、Authorization、个人路径与敏感 Figma 标识经过递归脱敏；
- 上次的 `queued`／`dispatched` Operation 在启动时转为 `interrupted`，不会静默自动执行；
- 调用方必须以原幂等键明确重交，系统才会恢复排队。

## 6. Plugin 行为

正式 Plugin UI 新增 Session Token 输入、连接与断开控制，并显示：

- 当前文件与页面；
- 连接或有界重连状态；
- 当前 Operation、步骤与结果；
- 稳定错误码和下一步恢复动作。

UI 和 Figma 主线程之间仍使用版本化、严格校验的 `postMessage`。主线程只接受 `writer.ping`，并缓存最近 100 个已完成 Operation，确保租约重投不会重复执行。Plugin Bundle 使用轻量深校验；自动测试会把它与 Core 的权威 Zod Schema 对照，避免合同漂移。

`writeAuthorized` 在 FIG-002 始终为 `false`。连接成功不等于获得 Figma 写入授权。

## 7. 本地运行

先构建并启动 Bridge：

```bash
pnpm build
pnpm hatchkit:figma-bridge
```

然后在 Figma Desktop 导入 `packages/figma-plugin/manifest.json`，运行 **Hatchkit Writer**，把终端一次性显示的 Token 粘贴到输入框并连接。

当前正式冒烟测试会在临时端口和临时目录中自动完成认证、提交 `writer.ping`、派发、回执与结果查询：

```bash
pnpm figma:bridge-smoke
pnpm figma:smoke
```

## 8. 验证范围

自动测试覆盖：

- 缺失、错误与过期凭据；
- URL Query 凭据来源阻断；
- 单 Plugin 所有权与回执实例绑定；
- FIFO、单在途、租约重投与断开回队；
- 幂等重放、幂等冲突与 Operation ID 冲突；
- 进程重启后的 Interrupted 状态与显式恢复；
- JSON Content-Type、Body 上限与严格未知字段拒绝；
- Token 和原始幂等键不进入 Operation Log；
- Plugin Browser Client 的 Header 认证、协议解析与恢复提示；
- Core Zod Schema 与 Plugin 轻量验证的一致性；
- 构建后真实 HTTP Bridge 冒烟与 Figma Bundle 体积门禁。

360 × 568 真实浏览器渲染检查确认：Header 与 Footer 固定，连接表单和状态信息清晰，较长内容在中间区域滚动。

## 9. 明确不做

FIG-002 不包含：

- Variables、Component、Instance 或页面写入；
- Approval Record 的创建与正式写入授权；
- Figma PAT、云服务器、数据库或账号系统；
- WebSocket、多 Writer 或跨机器队列；
- 进程中断后的静默自动续写。

下一步 FIG-003 将在这条单 Writer 链路上增加基础 Variables 的确定性 `ensure`，并继续遵守审批、稳定身份、幂等与审计边界。

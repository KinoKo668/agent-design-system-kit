# Workspace Packages

正式工程保持四个初始 Package：

```text
core
├── cli
├── mcp-server
└── figma-plugin
```

- `core`：环境无关的领域模型、统一结果与错误、Schema、身份、审批、Registry 与审计逻辑；
- `cli`：人工与自动化命令入口；
- `mcp-server`：Agent MCP 接口、本地 Bridge 与单 Writer 编排；
- `figma-plugin`：Figma 文件内唯一正式 Writer。

依赖只能从三个入口 Package 指向 `core`。`core` 不得导入 `node:*`、Figma 全局对象或 DOM；其他入口 Package 之间也不得互相依赖。

当前 `core` 已实现统一结果、错误、恢复动作、结构化日志、递归脱敏、Design Brief Schema、基础 Token Schema、Button v1 Component Contract、Component Registry Schema、Approval Record Schema、审批状态与依赖链校验、跨资产内存快照与内容摘要校验、Brief／Token 查询、组件搜索、唯一解析、缺失组件 Change Request、Writer Protocol，以及确定性的 Figma Variable、Button、Button Instance 与 Style Audit Plan；`cli` 已实现可显式载入 Approval 来源的 validate、search、resolve 与 request-change 只读命令；`mcp-server` 已实现受管理 JSON 的本地安全发现、审批与内容摘要验证、六个默认只读 Tool、可选的 Button Instance 写入与只读 Style Audit Tool，以及认证 HTTP Bridge、每次写入前重读 Git 的 Approval Verifier、单 Writer FIFO Queue、租约、等待客户端和脱敏 Operation Log；`figma-plugin` 已实现 Writer UI、内存 Token 连接、长轮询、安全 `writer.ping`、需要人工二次确认且禁止自动改绑的文件绑定入口，Variables、Button Main Component Set 与 Registry 驱动真实 Button Instance 的稳定身份、幂等审计和部分恢复，以及当前页面硬编码样式／未登记 Variable 的只读扫描。未配置本地 Writer 凭据、Bridge Verifier 或准确真实审批时都会阻断写入。

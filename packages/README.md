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

当前 `core` 已实现统一结果、错误、恢复动作、结构化日志、递归脱敏、Design Brief Schema、基础 Token Schema、Button v1 Component Contract、Component Registry Schema、跨资产内存快照与内容摘要校验、Brief／Token 查询、组件搜索、唯一解析与缺失组件 Change Request；`cli` 已实现显式来源文件的 validate、search、resolve 与 request-change 只读命令；`mcp-server` 已实现受管理 JSON 的本地安全发现、内容摘要验证、本地 stdio 协议入口、初始化治理说明以及 Status、Brief、Token、Component Search、Resolve 与 Change Request 六个只读 Tool，并由真实 Codex Agent 契约 Harness 验证；`figma-plugin` 已实现最小 Writer UI、版本化状态消息与构建产物检查。Plugin Bridge 和实际 Writer Command 尚未实现。

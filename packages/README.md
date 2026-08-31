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

当前 `core` 已实现统一结果、错误、恢复动作、结构化日志和递归脱敏契约；其余源码仍主要是可编译的边界哨兵，不代表对应产品功能已经实现。

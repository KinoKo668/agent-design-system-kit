# Agent Design System Kit

## 项目定位

这是一个本地优先、低运营成本、面向源码开放社区的 Agent 原生设计系统工具包。

目标是让 Codex、Claude、Cursor、Antigravity 等 Agent 在新项目开始时，能够按照接近专业 UI 设计团队的流程完成：

1. 产品与品牌信息整理；
2. UI 方向探索和人工定调；
3. Design Token 建设；
4. Figma Component 建设；
5. 组件契约与 Figma 资产登记；
6. 后续页面设计中的组件查询与复用；
7. 设计一致性和无障碍审计。

## 核心原则

- 这不是提示词合集，而是设计系统生产和治理工具。
- GitHub 保存规则、Token、组件契约、决策和版本历史。
- Figma 保存视觉资产、Main Components 和页面设计稿。
- Agent 应先查询组件 Registry，再插入真实 Figma Instance。
- Token 定义颜色、间距、字体、圆角等设计决定，不等于组件或设计稿。
- 找不到合适组件时，Agent 应提出变更申请，不得擅自创造近似样式。
- Figma 写入由单一 Writer 串行执行，其他 Agent 可以并行研究和审查。
- 关键视觉方向、组件范围和重大变更必须经过人工审批。
- 第一版采用本地 MCP Server，不依赖自建云服务器。

## 当前阶段

项目已完成 M0 架构与风险冻结、M1 工程骨架、M2 Schema／Registry／只读查询，以及 M3 的 MCP 查询、最小 Figma UI 和 FIG-002 Plugin Bridge。`core` 已提供统一结果、错误、恢复动作、日志、脱敏、设计资产 Schema／查询与严格 Writer Protocol；`cli` 已提供只读 validate、search、resolve 与 request-change；`mcp-server` 已提供六个只读 MCP Tool、认证 HTTP Bridge、单 Writer FIFO、租约、幂等恢复和 30 天脱敏 Operation Log；`figma-plugin` 已提供内存 Token 连接、长轮询、版本化消息和只读 `writer.ping` 回执。下一项是 FIG-003 基础 Variables 的确定性创建或更新。

开始工作前请先阅读：

- `README.md`
- `docs/项目背景与当前决策.md`
- `docs/Agent设计系统术语入门.md`
- `docs/ADR-001-工程技术栈与Monorepo方案.md`
- `docs/ADR-002-稳定身份版本幂等与迁移策略.md`
- `docs/DEMO-001-MVP演示脚本与成功标准.md`
- `docs/CORE-001-统一结果错误与日志模型.md`
- `docs/SEC-001-本地凭据与日志脱敏策略.md`
- `docs/SCH-001-Design-Brief-Schema.md`
- `docs/SCH-002-基础Token-Schema与DTCG子集.md`
- `docs/SCH-003-Button-Component-Contract.md`
- `docs/SCH-004-Component-Registry-Schema.md`
- `docs/REG-001-文件加载与完整性校验.md`
- `docs/REG-002-组件搜索与精确解析.md`
- `docs/REG-003-缺失组件Change-Request.md`
- `docs/CLI-001-本地只读命令.md`
- `docs/MCP-001-本地Stdio-Server.md`
- `docs/MCP-002-只读设计资产查询Tools.md`
- `docs/MCP-003-组件解析与变更申请Tools.md`
- `docs/MCP-004-Codex真实Agent契约测试.md`
- `docs/FIG-001-最小Figma-Plugin-UI.md`
- `docs/FIG-002-Plugin-Bridge与单Writer队列.md`

工程规则：

- 使用 Node.js 24 LTS 和根目录固定的 pnpm 11；
- Package 之间必须使用 `workspace:*`；
- `cli`、`mcp-server`、`figma-plugin` 只能单向依赖 `core`；
- `core` 禁止依赖 `node:*`、Figma 全局对象和 DOM；
- 正式 Node Package 使用 ESM；
- 提交前必须在 Node.js 24 下运行 `pnpm check`，依次通过格式、Lint、类型、测试与构建；
- Figma 主线程源码由 esbuild 打包为 IIFE，禁止把未打包的跨 Package ESM 当作 Plugin 产物；
- Figma Plugin Bundle 必须使用轻量深校验；不得把 Core 的 Zod 运行时 Schema 打进主线程或 UI；
- 不得把 Spike 代码直接搬入正式 Package，必须按正式 Contract 重建并测试。

## 第一条验证链路

```text
产品 Brief
→ 三套 UI 方向
→ 设计师选择
→ 基础 Token
→ Icon / Button / Input
→ 写入 Figma
→ 页面 Agent 查询并复用
→ 自动合规审计
```

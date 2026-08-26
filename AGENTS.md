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

项目处于概念定义、术语统一和 MVP 范围设计阶段，尚未进入正式编码。

开始工作前请先阅读：

- `README.md`
- `docs/项目背景与当前决策.md`
- `docs/Agent设计系统术语入门.md`

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

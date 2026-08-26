# Agent Design System Kit

一个本地优先、跨 Agent、面向新项目的源码开放设计系统工具包。

## 项目目标

帮助 Codex、Claude、Cursor、Antigravity 等 Agent 完成从 UI 定调、Design Token、Figma Components 到后续页面复用与一致性审计的完整流程。

## 当前阶段

项目已进入 MVP 架构与风险冻结阶段，当前执行范围参见 [DIR-001：Button 垂直验证链路](docs/DIR-001-Button垂直验证链路.md)。

## 许可证与商业使用

本项目以 [PolyForm Noncommercial License 1.0.0](LICENSE.md) 公开源码：非商业用途可以依照许可证使用、修改和分发；商业使用必须事先获得版权所有者的书面许可，具体参见[商业授权说明](COMMERCIAL-LICENSE.md)。

由于许可证限制商业使用，本项目属于 **Source Available（源码开放）**，不是 OSI 定义的 Open Source Software。

## 目录

- `docs/`：产品说明、术语和设计方法文档
- `design-system/`：Token、组件契约、设计方向和状态账本
- `packages/`：核心程序、CLI、MCP Server 和 Figma Plugin
- `skills/`：Agent 工作流程与专业技能
- `adapters/`：Codex、Claude、Cursor、Antigravity 适配层

## 入门资料

- [Agent 设计系统术语入门](docs/Agent设计系统术语入门.md)
- [项目背景与当前决策](docs/项目背景与当前决策.md)
- [DIR-001：Button 垂直验证链路](docs/DIR-001-Button垂直验证链路.md)

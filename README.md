# Agent Design System Kit

一个本地优先、跨 Agent、面向新项目的源码开放设计系统工具包。

## 项目目标

帮助 Codex、Claude、Cursor、Antigravity 等 Agent 完成从 UI 定调、Design Token、Figma Components 到后续页面复用与一致性审计的完整流程。

## 当前阶段

项目已进入 M1 工程骨架阶段，根 pnpm Workspace 与冻结 Lockfile 已建立，下一步创建四个正式 Package。Button 范围参见 [DIR-001：Button 垂直验证链路](docs/DIR-001-Button垂直验证链路.md)，端到端验收目标参见 [DEMO-001：MVP 演示脚本与成功标准](docs/DEMO-001-MVP演示脚本与成功标准.md)。

## 本地工程基线

- 主要开发版本：Node.js `24.20.0` LTS；
- 兼容范围：Node.js `>=22.22 <27`；
- 包管理器：pnpm `11.24.0`；
- 包管理器由根 `packageManager` 字段和 Corepack 固定；
- 所有 Workspace 共用根目录唯一的 `pnpm-lock.yaml`。

首次进入工程：

```bash
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm build
```

使用 nvm 时可先执行 `nvm use`，它会读取仓库中的 `.nvmrc`。

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
- [DIR-002：人工审批门禁与状态模型](docs/DIR-002-人工审批门禁与状态模型.md)
- [ARCH-001：系统边界与端到端数据流](docs/ARCH-001-系统边界与端到端数据流.md)
- [SPIKE-001：Figma Plugin 写入能力验证](docs/SPIKE-001-Figma-Plugin写入能力验证.md)
- [SPIKE-002：Plugin 与本地进程通信验证](docs/SPIKE-002-Plugin与本地进程通信验证.md)
- [ADR-001：工程技术栈与 Monorepo 方案](docs/ADR-001-工程技术栈与Monorepo方案.md)
- [ADR-002：稳定身份、版本、幂等与迁移策略](docs/ADR-002-稳定身份版本幂等与迁移策略.md)
- [DEMO-001：MVP 演示脚本与成功标准](docs/DEMO-001-MVP演示脚本与成功标准.md)

<p align="center">
  <img src="docs/brand/hatch-logo.png" width="240" alt="Hatch 吉祥物守护着一个金色组件方块">
</p>

<h1 align="center">Hatch</h1>

<p align="center"><strong>为每个新项目，孵化一套 Agent 可以信赖的设计系统。</strong></p>

<p align="center">
  一个本地优先、Agent 原生的设计系统生产与治理工具包，连接产品 Brief、设计决策、GitHub 与 Figma。
</p>

<p align="center">
  <a href="README.md">English</a>
  ·
  <a href="#hatch-解决什么问题">项目介绍</a>
  ·
  <a href="#当前状态">当前状态</a>
  ·
  <a href="#开始使用">开始使用</a>
</p>

## Hatch 解决什么问题

AI Agent 可以快速画出一个页面，真正困难的是让它在不同会话、不同工具和不同协作者之间，始终遵守同一套设计决定。

设计上下文一旦丢失，颜色和间距会逐渐漂移，组件会被重复绘制，Figma 与代码也会失去对应关系。Hatch 希望把专业设计团队的方法转化为 Agent 可以执行、检查和恢复的流程：

- 从产品定位出发探索多个 UI 方向；
- 人工确定方向后建立 Design Token 与 Component Contract；
- 登记 Git、Figma 与代码组件之间的准确关系；
- 让 Agent 先查询 Registry，再插入真实 Figma Instance；
- 通过人工审批门管理关键视觉决定与重大变更；
- 自动审计组件来源、设计漂移与无障碍问题。

Hatch 不是提示词合集，也不是另一套现成 UI 组件库，而是用于生产和治理设计系统的基础设施。

## 工作流程

```text
产品 Brief
    ↓
三套 UI 方向
    ↓
人工选择与批准
    ↓
Design Token + Component Contract
    ↓
登记 Figma Main Component
    ↓
Agent 查询并复用真实 Instance
    ↓
一致性与无障碍审计
```

系统中的职责被明确分开：

| 系统            | 负责保存                                                     |
| --------------- | ------------------------------------------------------------ |
| Git 仓库        | 规则、Token、Contract、审批、Registry、决策与版本历史        |
| Figma           | 视觉资产、Variables、Main Components、Instances 与页面设计稿 |
| 本地 MCP Server | 校验、查询、审批门禁、编排与审计结果                         |
| Figma Plugin    | 串行执行受管理 Figma 写入的唯一 Writer                       |

Agent 不应根据名字猜测 Button，也不应只根据 Token 重新画一个相似按钮。它必须先解析 Component Contract 与 Registry，再插入已登记 Main Component 的真实 Instance。

## 架构

```text
Codex · Claude · Cursor · Antigravity
                  │
                  ▼
            本地 MCP Server
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
Git 设计事实          Figma Plugin
规则 · Contract       单一 Writer
Registry · 历史             │
                            ▼
                      Figma 设计文件
```

第一版采用本地优先架构，不托管 AI 模型，也不要求自建云服务器、数据库、账号系统或管理后台。

## 当前状态

**Hatch 当前处于 M1 工程骨架阶段，尚未成为可用于生产环境的完整工具。**

目前已经完成：

- 固定依赖边界的 pnpm Workspace；
- `core`、`cli`、`mcp-server` 与 `figma-plugin` 四个正式 Package；
- 架构、稳定身份、版本、幂等和迁移策略的冻结决策；
- 可以复现的 M0 Spike，验证 Figma 资产创建与本地进程到 Plugin 的通信；
- Button 最小垂直链路的正式验收合同。

第一个正式 MVP 必须完整证明：校验已批准的设计事实、查询 Button、幂等建立或复用 Figma Library 资产、插入真实 Instance、正确处理重试，并审计最终结果。

## 项目结构

```text
design-system/   Token、Contract、Registry 与审批记录
packages/core/   环境无关的领域逻辑与 Schema
packages/cli/    人工与自动化命令行入口
packages/mcp-server/
                 本地 MCP 控制面与 Figma Bridge
packages/figma-plugin/
                 单一 Writer Figma 集成
skills/          Agent 工作流与专业设计方法
adapters/        Codex、Claude、Cursor、Antigravity 适配层
docs/            产品、架构、治理与验证决策
spikes/          M0 历史能力证明，不属于正式 Package
```

## 开始使用

正式产品流程仍在开发中。当前可以克隆仓库并验证工程骨架：

```bash
git clone https://github.com/KinoKo668/hatchkit.git
cd hatchkit
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm build
```

环境要求：

- 主要开发版本为 Node.js `24.20.0` LTS；
- 支持范围为 Node.js `>=22.22 <27`；
- pnpm 通过 Corepack 与根目录 `packageManager` 字段固定为 `11.24.0`。

运行当前 M0 能力验证：

```bash
./spikes/run-m0-checks.sh
```

这条命令只验证历史 Spike，通过并不表示正式 MVP 已经完成。

## 进一步阅读

- [项目背景与当前决策](docs/项目背景与当前决策.md)
- [Agent 设计系统术语入门](docs/Agent设计系统术语入门.md)
- [Button 垂直验证链路](docs/DIR-001-Button垂直验证链路.md)
- [人工审批门禁与状态模型](docs/DIR-002-人工审批门禁与状态模型.md)
- [系统边界与端到端数据流](docs/ARCH-001-系统边界与端到端数据流.md)
- [工程技术栈与 Monorepo 方案](docs/ADR-001-工程技术栈与Monorepo方案.md)
- [稳定身份、版本、幂等与迁移策略](docs/ADR-002-稳定身份版本幂等与迁移策略.md)
- [MVP 演示脚本与成功标准](docs/DEMO-001-MVP演示脚本与成功标准.md)

## 核心原则

- 创建或插入 UI 前，必须先查询 Component Registry。
- 插入登记过的 Figma Instance，不重新绘制近似组件。
- Token 是设计决定，不等于 Component 或完整页面。
- Figma 写入由单一 Writer 串行执行，其他工作可以并行研究与审查。
- 找不到合适的已批准组件时，应停止并提出变更申请。
- 视觉方向、组件范围与重大变更必须经过人工批准。
- 运行时密钥、个人 Figma 标识与本地操作日志不得进入 Git。

## 许可证与商业使用

Hatch 属于 **Source Available（源码开放）** 项目，不是 OSI 定义的开源软件。

非商业用途可以依据 [PolyForm Noncommercial License 1.0.0](LICENSE.md) 使用、修改和分发。商业使用必须事先获得书面许可，具体参见[商业授权说明](COMMERCIAL-LICENSE.md)。

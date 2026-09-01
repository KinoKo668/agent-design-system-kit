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

**Hatch 已完成 M2 Schema、Registry 与只读查询，并在 M3 建立了首个本地 stdio MCP 入口，但尚未成为可用于生产环境的完整工具。**

目前已经完成：

- 固定依赖边界的 pnpm Workspace；
- `core`、`cli`、`mcp-server` 与 `figma-plugin` 四个正式 Package；
- 统一执行格式、类型化 Lint、类型、测试与构建的 `pnpm check`；
- 在 Node.js 24 与 22 上运行相同门禁的 GitHub Actions；
- CLI、MCP Server 与 Figma Plugin 共用的结果、错误、恢复动作和结构化日志契约；
- 本地凭据保存边界与递归日志脱敏合同；
- 带正确／错误公开样例的版本化 Design Brief Schema；
- 带类型 Alias、Mode、依赖规则和 Button 样例的 DTCG 2025.10 Token Set 子集；
- 带严格属性、完整 Variant 矩阵、稳定 Slot 和类型化 Token Binding 的 Button v1 Component Contract；
- 连接准确 Contract 摘要、审批引用、生命周期与可修复 Figma Locator 的 Component Registry Schema；
- 可确定复现的本地 Loader，能够安全发现正式文件、校验跨资产引用，并用相对路径报告内容摘要漂移；
- 确定性的组件搜索与精确解析，不模糊猜测、不自动回退旧版本，也不把尚未建成的 Figma 资产冒充为可插入；
- 环境无关的 Brief 与 Token 查询，支持精确详情、确定性分页、Token Path 限量与已校验的 Alias 依赖闭包；
- 结构化的缺失组件 Change Request，把真实能力缺口交给人工分诊，同时阻止近似 UI 和 Figma 写入命令；
- 可显式选择来源文件的只读 `hatchkit` CLI，支持校验、精确搜索、解析与确定性 Change Request；
- 带初始化治理说明以及 Status、Brief、Token、Component Search 四个只读 Tool 的本地 `hatchkit` stdio MCP Server，并覆盖新旧协议冒烟验证；
- 精确 Component Resolve 与确定性 Change Request MCP Tools，始终保留审批／审计门禁且不会加入 Figma 写入队列；
- 真实 Codex Agent 契约 Harness，验证 Status → Search → Resolve、结构化决策、禁止 Shell 绕过和工作区零变更；
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
pnpm check
```

构建完成后可以查看只读 CLI：

```bash
pnpm --silent hatchkit --help
```

验证本地 MCP 子进程并查看启动配置：

```bash
pnpm mcp:smoke
pnpm --silent hatchkit:mcp --help
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
- [统一结果、错误与日志模型](docs/CORE-001-统一结果错误与日志模型.md)
- [本地凭据与日志脱敏策略](docs/SEC-001-本地凭据与日志脱敏策略.md)
- [Design Brief Schema](docs/SCH-001-Design-Brief-Schema.md)
- [基础 Token Schema 与 DTCG 子集](docs/SCH-002-基础Token-Schema与DTCG子集.md)
- [Button Component Contract](docs/SCH-003-Button-Component-Contract.md)
- [Component Registry Schema](docs/SCH-004-Component-Registry-Schema.md)
- [文件加载与完整性校验](docs/REG-001-文件加载与完整性校验.md)
- [组件搜索与精确解析](docs/REG-002-组件搜索与精确解析.md)
- [缺失组件 Change Request](docs/REG-003-缺失组件Change-Request.md)
- [本地只读 CLI](docs/CLI-001-本地只读命令.md)
- [本地 stdio MCP Server](docs/MCP-001-本地Stdio-Server.md)
- [只读设计资产 MCP 查询](docs/MCP-002-只读设计资产查询Tools.md)
- [组件解析与变更申请 MCP Tools](docs/MCP-003-组件解析与变更申请Tools.md)
- [真实 Codex Agent 契约测试](docs/MCP-004-Codex真实Agent契约测试.md)
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

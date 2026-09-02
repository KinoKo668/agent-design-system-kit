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

**`v0.1.0-alpha.1` 是 Hatch 的首个公开源码预发布。自动化 Button 链路现已覆盖 Agent 精确查询、Registry 驱动的 Instance 编排、三类 Figma 审计、失败恢复和发布门禁。真实审批与独立 Figma Desktop 视觉验收尚未完成，因此还不可用于生产环境。**

目前已经完成：

- 固定依赖边界的 pnpm Workspace；
- `core`、`cli`、`mcp-server` 与 `figma-plugin` 四个正式 Package；
- 统一执行格式、类型化 Lint、类型、测试与构建的 `pnpm check`；
- 在 Node.js 24 与 22 上运行相同门禁的 GitHub Actions；
- CLI、MCP Server 与 Figma Plugin 共用的结果、错误、恢复动作和结构化日志契约；
- 本地凭据保存边界与递归日志脱敏合同；
- 带正确／错误公开样例的版本化 Design Brief Schema；
- 带同场景预览、双角色人工选择状态、准确 Brief 摘要绑定和诚实待评审公开样例的三候选 UI Direction Review 契约；
- 带类型 Alias、Mode、依赖规则和 Button 样例的 DTCG 2025.10 Token Set 子集；
- 带严格属性、完整 Variant 矩阵、稳定 Slot 和类型化 Token Binding 的 Button v1 Component Contract；
- 带 Token 驱动的 16／24／32 尺寸、固定光学几何、无障碍规则、精确 Registry 解析和诚实 `unbuilt` 公开样例的 Icon v1 垂直切片；
- 严格的 Input v1 Contract 与诚实 `unbuilt` 公开样例：包含 8 个 State × Content Variant、始终可见的 Label、就近 Helper／Error、语义 Token Binding 和精确 CLI／MCP 解析；
- 连接准确 Contract 摘要、审批引用、生命周期与可修复 Figma Locator 的 Component Registry Schema；
- 根据准确内容、必需人工角色、验证证据、终止事件和上游状态推导结果的严格 Approval Record Schema；
- 可确定复现的本地 Loader，能够安全发现正式文件、校验跨资产引用，并用相对路径报告内容摘要漂移；
- 确定性的组件搜索与精确解析，不模糊猜测、不自动回退旧版本，也不把尚未建成的 Figma 资产冒充为可插入；
- 环境无关的 Brief、Direction 与 Token 查询，支持精确详情、确定性分页、Token Path 限量与已校验的 Alias 依赖闭包；
- 结构化的缺失组件 Change Request，把真实能力缺口交给人工分诊，同时阻止近似 UI 和 Figma 写入命令；
- 可显式选择来源文件的只读 `hatchkit` CLI，支持校验、精确搜索、解析与确定性 Change Request；
- 带初始化治理说明以及 Status、Brief、Direction、Token、Component Search／Resolve 和 Change Request 七个只读 Tool 的本地 `hatchkit` stdio MCP Server，并覆盖新旧协议冒烟验证；
- 精确 Component Resolve 与确定性 Change Request MCP Tools，始终保留审批／审计门禁且不会加入 Figma 写入队列；
- 真实 Codex Agent 契约 Harness，验证 Status → Search → Resolve、结构化决策、禁止 Shell 绕过和工作区零变更；
- 紧凑的 Figma Writer 面板，使用版本化边界显示连接、审批、操作、进度、错误恢复和真实写入授权；
- 只监听回环地址的认证 HTTP Bridge，提供单 Plugin 所有权、FIFO、单在途租约、幂等重放、结构化结果与 30 天脱敏 Operation Log；
- Session Token 只驻留内存的连接流程，以及不会修改 Figma 的 `writer.ping` 完整往返验证；
- 严格的 Variable Plan 与 `variables.ensure` Adapter：把 Button Token Fixture 映射为一个 Major Collection、30 个真实 Variable、精确 Scope、Alias、Code Syntax 和稳定托管身份，并支持无写入重试与部分恢复；
- 需要设计师二次确认的 Figma 文件绑定入口：未绑定库文件只初始化一次，同一身份可安全重放，不同身份或损坏记录不会被自动覆盖或改绑；
- 实时 Git Approval Verifier：每条写命令前重读 Catalog，校验准确 Subject 与完整上游链，并阻断缺失、过期、撤销、取代、重复或无效记录；
- 确定性的 Button Writer：建立或收敛一个真实 Main Component Set、四个已批准 Variant、Label 属性与准确 Variable Binding，不重复创建近似资产；
- 确定性的 Icon Writer 与 `components.icon.ensure` 协议链路：建立或收敛一个三尺寸 Component Set、真实 Vector Glyph、准确 Variable Binding 与稳定 Marker，并支持无变化重试和部分恢复；
- 原子 Registry 最终化：只在 Figma 审计成功后登记 Button Node，保护并发编辑，并把登记失败报告为可恢复的部分写入；
- Registry 驱动的 Button Instance Writer：审计真实 Main Component 与准确 Variant，只创建一个托管 Instance，并在无变化重试时保持零写入；
- 统一 Writer 重放与破坏性操作策略：恢复时强制真实写入重新审计，并禁止自动删除、Detach 或 Component Swap；
- 可选的 `hatchkit_insert_button_instance` MCP Tool：一次调用完成 Registry／Variant 查询、确定性计划、认证 Bridge 提交、Plugin 等待与真实 Instance 审计结果；默认不配置本地凭据时完全保持只读；
- 可选的 `hatchkit_insert_icon_instance` MCP Tool：对已 Ready Icon 的准确尺寸执行同样的失败关闭链路；公开 Icon 样例仍为 `unbuilt`，因此在真实审批和 Figma 登记完成前保持 Writer 零派发；
- 完整 Agent Loop 的审批负向门禁：缺失、评审中、要求修改、不完整、拒绝、过期、被取代和撤销均在进入 Queue 前阻断，并向 Agent 保留准确恢复动作；
- 只读 `hatchkit_audit_styles` MCP Tool：从当前 Git 设计事实生成已登记 Variable 允许清单，扫描绑定的 Figma 当前页面，并用准确 Node 与字段证据报告硬编码样式和外部 Variable；
- 只读 `hatchkit_audit_components` MCP Tool：把真实 Instance、托管 Marker、Component Set 来源、批准 Variant 与当前 Variant Properties 和 Active Registry 交叉核对；
- 只读 `hatchkit_audit_registry_drift` MCP Tool：盘点整个已绑定 Figma Library，报告双方缺失、重复身份、无效 Marker、版本／摘要／Locator 冲突以及不完整的 Variable／Variant 集合；
- 纳入发布门禁的 Agent 黄金路径回归：在同一个公开 Demo 场景中依次验证 MCP 状态、Button 精确搜索与解析、幂等插入编排和三类审计 Tool；
- 系统级失败矩阵回归：证明资源缺失与 Plugin 断线不会产生 Figma 派发，精确重试不会增加 Operation，同一幂等身份下改变意图会被拒绝；
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

请优先阅读[安装与五分钟 Quickstart](docs/DOC-001-安装与五分钟Quickstart.md)，完成经过验证的只读 Button 演示和可选 Figma 开发连接。

最短工程安装步骤如下：

```bash
git clone https://github.com/KinoKo668/hatchkit.git
cd hatchkit
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm check
```

构建完成后可以查看只读 CLI：

```bash
pnpm --silent hatchkit --version
pnpm --silent hatchkit --help
```

验证本地 MCP 子进程并查看启动配置：

```bash
pnpm mcp:smoke
pnpm --silent hatchkit:mcp --help
```

启动当前 Figma Bridge，并把一次性内存 Token 粘贴到 **Hatchkit Writer** 开发插件：

```bash
pnpm build
pnpm hatchkit:figma-bridge
```

请勿重定向、保存、截图或公开终端显示的 Token。独立 Bridge 可以运行无写入的 `writer.ping`，并主动阻断 `variables.ensure`。如需启用实时 Git 校验（不是绕过审批），必须同时指定项目和设计系统目录：

```bash
pnpm hatchkit:figma-bridge -- --project hatch-demo --root design-system/hatch-demo
```

当前公开 Demo 没有真实人工 Approval Record，因此正式写入仍会保持阻断，直到这些记录真实存在。

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
- [三套 UI 方向生成与评审](docs/LOOP-004-三套UI方向生成与评审.md)
- [系统边界与端到端数据流](docs/ARCH-001-系统边界与端到端数据流.md)
- [工程技术栈与 Monorepo 方案](docs/ADR-001-工程技术栈与Monorepo方案.md)
- [稳定身份、版本、幂等与迁移策略](docs/ADR-002-稳定身份版本幂等与迁移策略.md)
- [统一结果、错误与日志模型](docs/CORE-001-统一结果错误与日志模型.md)
- [本地凭据与日志脱敏策略](docs/SEC-001-本地凭据与日志脱敏策略.md)
- [Design Brief Schema](docs/SCH-001-Design-Brief-Schema.md)
- [基础 Token Schema 与 DTCG 子集](docs/SCH-002-基础Token-Schema与DTCG子集.md)
- [Button Component Contract](docs/SCH-003-Button-Component-Contract.md)
- [Icon 契约与 Figma 组件链路](docs/COMP-001-Icon契约与Figma组件链路.md)
- [Input 契约与 Figma 组件链路](docs/COMP-002-Input契约与Figma组件链路.md)
- [Component Registry Schema](docs/SCH-004-Component-Registry-Schema.md)
- [文件加载与完整性校验](docs/REG-001-文件加载与完整性校验.md)
- [组件搜索与精确解析](docs/REG-002-组件搜索与精确解析.md)
- [缺失组件 Change Request](docs/REG-003-缺失组件Change-Request.md)
- [本地只读 CLI](docs/CLI-001-本地只读命令.md)
- [本地 stdio MCP Server](docs/MCP-001-本地Stdio-Server.md)
- [只读设计资产 MCP 查询](docs/MCP-002-只读设计资产查询Tools.md)
- [组件解析与变更申请 MCP Tools](docs/MCP-003-组件解析与变更申请Tools.md)
- [真实 Codex Agent 契约测试](docs/MCP-004-Codex真实Agent契约测试.md)
- [最小 Figma Plugin UI](docs/FIG-001-最小Figma-Plugin-UI.md)
- [Plugin Bridge 与单 Writer 队列](docs/FIG-002-Plugin-Bridge与单Writer队列.md)
- [确定性 Figma Variables Ensure](docs/FIG-003-基础Figma-Variables-Ensure.md)
- [确定性 Button Component Set Ensure](docs/FIG-004-Button-Component-Ensure.md)
- [Registry 原子 Ready 登记](docs/FIG-005-Registry-Atomic-Ready.md)
- [Button 真实 Instance 插入](docs/FIG-006-Button-Instance-Insert.md)
- [Writer 幂等、冲突与恢复保护](docs/FIG-007-Writer-Idempotency-Conflict-Recovery.md)
- [Registry 到 Figma 单次写入流程](docs/LOOP-002-Registry到Figma单次写入流程.md)
- [审批拒绝端到端阻断](docs/LOOP-003-审批拒绝端到端阻断.md)
- [硬编码样式与未登记 Variable 审计](docs/AUD-001-硬编码样式与未登记Variable审计.md)
- [Instance、Variant 与组件来源审计](docs/AUD-002-Instance-Variant与组件来源审计.md)
- [Registry 与 Figma 双向差异审计](docs/AUD-003-Registry与Figma双向差异审计.md)
- [Agent 黄金路径回归测试](docs/QA-001-Agent黄金路径回归测试.md)
- [系统失败矩阵与零污染回归](docs/QA-002-系统失败矩阵与零污染回归.md)
- [安装与五分钟 Quickstart](docs/DOC-001-安装与五分钟Quickstart.md)
- [故障排查手册](docs/DOC-002-故障排查手册.md)
- [当前架构与运行边界](docs/DOC-002-当前架构与运行边界.md)
- [v0.1.0-alpha.1 发布说明](docs/REL-001-v0.1.0-alpha.1发布说明.md)
- [变更记录](CHANGELOG.md)
- [安全策略](SECURITY.md)
- [审批记录与写前校验](docs/GOV-001-审批记录与写前校验.md)
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

# ADR-001：工程技术栈与 Monorepo 方案

- 状态：已接受
- 决策日期：2026-08-30
- 依赖：SPIKE-001、SPIKE-002
- 适用范围：MVP 正式工程代码

## 1. 决策背景

SPIKE-001 已证明 Figma Plugin 可以创建 Variables、Component Set、Variant 和真实 Instance；SPIKE-002 已证明本地进程可以通过 HTTP 长轮询驱动 Plugin。

正式工程需要同时运行在三个环境：

1. Node.js：CLI、本地 MCP Server、Registry、审批门禁和审计；
2. Figma Plugin 主线程：读取和写入 Figma 文件；
3. Figma Plugin iframe：连接本地 Bridge 并显示状态。

技术栈必须让三者共享协议和类型，同时保持个人项目的安装、构建和维护成本足够低。

## 2. 冻结结论

| 类别 | 决定 |
| --- | --- |
| 主要语言 | TypeScript 6 |
| Node.js | Node 24 LTS 作为开发与 CI 主版本；兼容 Node `>=22.22 <27` |
| 模块格式 | Node 包统一 ESM；Figma 主线程打包为单文件 IIFE |
| Monorepo | pnpm 11 Workspace |
| 包间引用 | `workspace:*` + TypeScript Project References |
| Node 构建 | `tsc --build` |
| Figma 打包 | esbuild |
| 单元与集成测试 | Vitest 4 |
| Lint | ESLint 10 + typescript-eslint 8，Flat Config |
| 格式化 | Prettier 3 |
| Runtime Schema | Zod 4 |
| MCP | 官方 TypeScript SDK v2，初期使用 stdio Transport |
| Figma 类型 | `@figma/plugin-typings` |
| Figma UI | 原生 TypeScript、HTML、CSS；MVP 不引入 React 或前端框架 |
| 任务编排 | pnpm scripts；MVP 不引入 Turborepo、Nx 或自建任务系统 |

## 3. 版本基线

以下版本是 ADR 接受时验证过的基线。ENG-001 应把实际采用版本精确写入 `packageManager`、`package.json` 和 Lockfile。

| 工具 | 基线 | 策略 |
| --- | --- | --- |
| Node.js | 24 LTS | `.nvmrc` 或等价文件固定 24；`engines` 保留 Node 22 兼容 |
| pnpm | 11.24.0 | `packageManager` 精确固定；提交唯一根 Lockfile |
| TypeScript | 6.0.3 | 暂不升级 7；等待类型化 Lint 生态明确兼容 |
| Vitest | 4.1.11 | 同一配置覆盖各 Workspace Package |
| ESLint | 10.9.1 | 使用 Flat Config |
| typescript-eslint | 8.68.0 | 开启 Type-aware Rules |
| Prettier | 3.9.6 | 只负责格式，不与 ESLint 重叠 |
| esbuild | 0.28.2 | 只承担需要 Bundle 的 Figma 产物 |
| Zod | 4.5.4 | Schema 与 TypeScript 类型的共同来源 |
| MCP Server SDK | 2.0.0 | 使用 `@modelcontextprotocol/server`，不新建 v1 项目 |
| Figma typings | 1.136.0 | 与 Plugin API 升级一起检查 |

补丁版本可以在全部质量门禁通过后更新；Node、TypeScript、pnpm、MCP SDK 等主版本变化必须更新或替代本 ADR。

## 4. 为什么选择 TypeScript

- Figma Plugin API 和官方类型定义天然面向 TypeScript；
- MCP 官方提供稳定的 TypeScript SDK v2；
- CLI、MCP、Plugin 可以共享 Writer Command、Operation Result、Schema 和错误码；
- Zod 可以让运行时校验与静态类型来自同一份定义；
- 相比 Node 与 Plugin 分别使用不同语言，可以减少协议漂移和重复模型。

SPIKE 中的 CommonJS 和原生 JavaScript 只是为了隔离风险、避免提前决定正式栈，不作为正式工程先例。

### 暂不使用 TypeScript 7

决策时 TypeScript 7.0.2 已发布，但 typescript-eslint 8.68.0 的 Peer Range 仍为 TypeScript `<6.1.0`。MVP 优先选择已经互相声明兼容的 TypeScript 6.0.3，而不是关闭警告或牺牲 Type-aware Lint。升级到 TypeScript 7 需要单独验证 ESLint、Figma typings、MCP SDK 和构建产物。

## 5. Node.js 版本策略

Node 官方当前把 Node 24 列为 LTS，并计划支持到 2028 年 4 月。Node 24 因此作为开发机和 CI 主版本；Node 22 仍在 LTS，且当前项目实际实验环境为 Node 22.22.2，所以首版保留 Node 22 兼容测试。

规则如下：

- `engines.node` 使用 `>=22.22 <27`；
- CI 主任务运行 Node 24；
- CI 兼容任务运行 Node 22，直至 Node 22 官方 EOL；
- 不以 Node 26 Current 作为发布基线；
- 不使用低于 Node 22 的版本。

Node 支持状态以官方 [Node.js Releases](https://nodejs.org/en/about/previous-releases) 为准。

## 6. Monorepo 结构

正式工程保持四个初始 Package：

```text
packages/
├── core/
├── cli/
├── mcp-server/
└── figma-plugin/
```

### `@agent-design-system-kit/core`

保存环境无关的领域能力：

- Brief、Token、Contract、Registry 和 Approval Schema；
- Writer Command、Operation Result 和错误模型；
- 稳定身份、版本、摘要与幂等算法；
- 组件解析和审计的纯逻辑。

`core` 禁止依赖 `node:*`、Figma 全局对象和 UI DOM。这样 Node 与 Figma 可以真正共享同一协议，而不是复制类型。

### `@agent-design-system-kit/cli`

提供人工和自动化入口，例如 `validate`、`search`、`resolve`、`serve` 和实验诊断命令。CLI 只做参数、输出和退出码适配，不复制领域逻辑。

### `@agent-design-system-kit/mcp-server`

包含：

- MCP Tools、Resources 和 stdio Transport；
- Schema Validator、Approval Guard、Registry Resolver；
- SPIKE-002 已验证的本地 HTTP Bridge；
- 单 Writer FIFO 和 Operation Reporter。

第一版使用官方 `@modelcontextprotocol/server` v2。官方 v2 已对应 2026-07-28 MCP 规范，并拆分为 Server、Client 和可选 Runtime Adapter 包，参见[官方 TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)。本项目初期使用 stdio，不引入 Express、Fastify 或远程 HTTP MCP Server。

### `@agent-design-system-kit/figma-plugin`

包含：

- Figma Plugin 主线程 Writer；
- HTTP 长轮询连接 UI；
- Variables、Components、Instance 和局部审计 Adapter；
- `manifest.json` 与最终 Bundle。

MVP UI 仅显示连接、审批摘要、进度和错误，不需要 React、Vite 或完整前端应用。

## 7. 依赖方向

```text
core
├── cli
├── mcp-server
└── figma-plugin
```

约束：

- `core` 不反向依赖任何入口包；
- `cli` 不通过启动 MCP Server 来复用逻辑，而是调用 `core` 应用服务；
- `mcp-server` 不依赖 `cli`；
- `figma-plugin` 只能使用 `core` 中浏览器安全的导出；
- Package 之间统一使用 `workspace:*`；
- pnpm 配置 `disallowWorkspaceCycles: true`，循环依赖直接失败。

pnpm 原生支持 Workspace、单一 Lockfile 和 `workspace:` 协议，参见[pnpm Workspace 文档](https://pnpm.io/workspaces)。四个 Package 的规模不需要额外引入 Monorepo 平台。

## 8. 构建策略

### Node Packages

- `core`、`cli` 和 `mcp-server` 使用 ESM；
- TypeScript Project References 表达 Package 构建顺序；
- `tsc --build` 生成 JavaScript、Declaration 和 Source Map；
- 不默认把第三方依赖 Bundle 进 Node 产物；
- CLI 通过 `bin` 字段暴露可执行入口。

TypeScript 官方说明 Project References 可以拆分项目边界，并由 `tsc --build` 按依赖顺序增量构建，参见[官方文档](https://www.typescriptlang.org/docs/handbook/project-references)。

### Figma Plugin

- 主线程使用 `@figma/plugin-typings` 做类型检查；
- esbuild 把主线程打包为 Figma 可运行的单文件；
- iframe UI 使用原生 TypeScript、HTML 和 CSS；
- 构建脚本生成完整 `dist/`，Manifest 不引用源码；
- 不从 CDN 加载运行时代码，保持本地和离线可用。

esbuild 只服务必须 Bundle 的 Plugin，不负责整个 Monorepo 的任务编排。

## 9. 测试策略

### 自动测试

Vitest 4 作为正式测试框架：

- `core`：Schema、身份、审批、Registry 与审计单元测试；
- `mcp-server`：Tool Contract、Bridge、认证、FIFO、超时和故障集成测试；
- `cli`：参数、退出码和快照测试；
- `figma-plugin`：把纯 Writer 计划与 Figma API Adapter 分离，对纯逻辑和 Adapter Fake 做测试；
- 根目录：Button 黄金链路 Contract Test。

Vitest 当前要求 Node 20 或更高，与本 ADR 的 Node 范围兼容，参见[官方入门文档](https://vitest.dev/guide/)。

### 真实环境测试

Figma Plugin API 不能只靠 Mock 宣告完成。涉及 Variables、Component Set、Instance、网络权限和插件生命周期的任务，仍需保留真实 Figma Desktop 验证记录。

SPIKE 目录继续使用现有 Node 内置测试，不强制迁移；Spike 是历史证据，不属于正式 Package。

## 10. 代码质量门禁

根目录最终提供统一命令：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

`pnpm check` 必须依次覆盖格式、Lint、类型、测试和构建。CI 使用冻结 Lockfile，任何一步失败都不得发布。

规则分工：

- Prettier 只负责排版；
- ESLint 负责代码质量和危险模式；
- TypeScript 负责类型完整性；
- Vitest 负责行为；
- Schema Validator 负责运行时输入；
- 真实 Figma 验证负责外部平台行为。

## 11. 暂不引入的工具

### 不使用 Turborepo 或 Nx

当前只有四个 Package，pnpm scripts 和 `tsc --build` 已能表达依赖顺序。增加缓存平台会提高配置和理解成本，等构建时间成为真实问题后再评估。

### 不使用 React 或完整 Web 前端

项目没有管理后台，Figma UI 只承担连接和执行状态。原生 UI 足以完成 MVP，并能减少 Bundle、依赖更新和安全面。

### 不使用 Jest

Vitest 对 ESM、TypeScript 和多项目配置更直接，也与未来需要的浏览器测试扩展路径一致。

### 不使用 Python 作为主实现语言

Python 适合后续离线分析脚本，但不能减少 Figma Plugin 的 JavaScript 运行时；使用两套主语言会增加协议和类型维护成本。

### 不使用 MCP SDK v1

这是一个新项目，没有历史兼容负担。官方 SDK v2 已是稳定线，因此直接从 v2 开始，避免在开发早期安排一次已知迁移。

## 12. 结果与代价

### 正面结果

- Node、MCP 与 Figma 共享一种语言和协议；
- 没有云服务、数据库或前端框架；
- 四个 Package 边界明确，Agent 容易定位代码；
- 单一 Lockfile 和统一质量命令降低协作成本；
- 工具数量受控，但保留类型、运行时校验和真实平台验证。

### 需要承担的代价

- Figma Plugin 仍需要独立 Bundle；
- Node ESM 与 Figma IIFE 需要两种输出配置；
- TypeScript 7 功能暂时不能使用；
- 真实 Figma 回归暂时不能完全自动化；
- ESLint 与 Prettier 是两个工具，但职责清楚。

## 13. 实施边界

ADR-001 只冻结选择，不创建 `package.json`、Lockfile 或正式 Package。工程初始化由 ENG-001 至 ENG-003 完成：

1. ENG-001 创建 pnpm Workspace 和根配置；
2. ENG-002 创建四个 Package 及依赖方向；
3. ENG-003 配置 TypeScript、esbuild、Vitest、ESLint、Prettier 和统一 `check`；
4. ENG-004 再把同一门禁接入 GitHub Actions。

任何实施中发现的关键不可行性必须通过新的 ADR 修正，而不是悄悄改变本文件中的技术方向。

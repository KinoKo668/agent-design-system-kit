<p align="center">
  <img src="docs/brand/hatch-logo.png" width="240" alt="Hatch mascot protecting a golden component tile">
</p>

<h1 align="center">Hatch</h1>

<p align="center"><strong>Hatch a design system your agents can trust.</strong></p>

<p align="center">
  A local-first, agent-native toolkit for building and governing design systems from product brief to reusable Figma components.
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a>
  ·
  <a href="#how-hatch-works">How it works</a>
  ·
  <a href="#current-status">Status</a>
  ·
  <a href="#getting-started">Getting started</a>
</p>

<p align="center">
  <img alt="Stage: M3 MCP" src="https://img.shields.io/badge/stage-M3%20MCP-4C8ECC">
  <a href="https://github.com/KinoKo668/hatchkit/actions/workflows/quality.yml"><img alt="Quality workflow" src="https://github.com/KinoKo668/hatchkit/actions/workflows/quality.yml/badge.svg"></a>
  <img alt="Node.js 24 LTS" src="https://img.shields.io/badge/Node.js-24%20LTS-339933?logo=nodedotjs&logoColor=white">
  <img alt="pnpm 11" src="https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white">
  <img alt="License: source available" src="https://img.shields.io/badge/license-source%20available-F5B700">
</p>

## Design systems that survive the agent loop

AI agents can generate a screen. The harder problem is making every future screen follow the same decisions.

Across sessions, tools, and collaborators, design context gets lost. Colors drift, components are redrawn, Figma assets diverge from code, and an agent may invent a near-duplicate instead of reusing the approved component.

Hatch turns professional design-system practice into a workflow that agents can execute, verify, and resume:

- explore multiple UI directions before committing to one;
- encode approved decisions as design tokens and component contracts;
- register the exact relationship between Git, Figma, and code assets;
- make agents query the registry before inserting a real Figma instance;
- gate important changes on human approval;
- audit component provenance, design drift, and accessibility.

Hatch is infrastructure for producing and governing a design system—not a collection of prompts and not another component library.

## How Hatch works

```text
Product brief
    ↓
Three design directions
    ↓
Human approval
    ↓
Design tokens + component contracts
    ↓
Registered Figma main components
    ↓
Agents query and reuse real instances
    ↓
Consistency and accessibility audit
```

The ownership model is deliberately explicit:

| System           | Owns                                                                           |
| ---------------- | ------------------------------------------------------------------------------ |
| Git repository   | Rules, tokens, contracts, approvals, registry, decisions, and version history  |
| Figma            | Visual assets, main components, variables, instances, and page designs         |
| Local MCP server | Validation, registry queries, approval gates, orchestration, and audit results |
| Figma plugin     | The single serialized writer for managed Figma changes                         |

Agents do not search for a Button by guessing its name or reconstructing its appearance from tokens. They resolve its component contract and registry entry, then insert an instance of the registered Figma main component.

## Architecture

```text
Codex · Claude · Cursor · Antigravity
                  │
                  ▼
          Local MCP server
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
Git design facts      Figma plugin
rules · contracts     single writer
registry · history          │
                            ▼
                    Figma design file
```

The first release is local-first. It does not host an AI model and does not require a project cloud server, database, account system, or admin dashboard.

## Current status

**Hatch has completed M2 schemas and read-only queries. M3 now includes the local stdio MCP entry point, machine-readable Approval Records with live Git write verification, the authenticated single-writer Figma Bridge, and the first deterministic Figma Variables Ensure path, but the toolkit is not yet production-ready.**

What exists today:

- a pnpm workspace with frozen dependency boundaries;
- `core`, `cli`, `mcp-server`, and `figma-plugin` packages;
- one `pnpm check` gate for formatting, typed linting, type checks, tests, and builds;
- an esbuild pipeline that produces the Figma main-thread IIFE bundle;
- a GitHub Actions workflow that runs the same gate on Node.js 24 and 22;
- a shared, JSON-safe result, error, recovery, and structured-log contract;
- a local credential boundary and recursive log-redaction contract;
- a versioned Design Brief schema with valid and invalid public fixtures;
- a versioned DTCG 2025.10 Token Set subset with typed aliases, modes, dependency rules, and Button fixtures;
- a strict Button v1 Component Contract with properties, a complete Variant matrix, stable slots, and typed Token bindings;
- a Component Registry schema that connects exact Contract digests, Approval references, lifecycle, and repairable Figma locators;
- a strict Approval Record schema whose status is derived from exact content, required human roles, validation evidence, terminal events, and upstream approval state;
- a deterministic local loader that safely discovers managed files, validates cross-asset references, and rejects content-digest drift with relative source paths;
- deterministic component search and exact resolution that never fuzzy-matches, silently falls back to inactive versions, or treats an unbuilt Figma asset as insertable;
- environment-neutral Brief and Token queries with exact detail selection, deterministic pagination, bounded Token paths, and validated alias dependency closure;
- a structured Component Change Request outcome that stops execution and routes real capability gaps to human triage without emitting approximate UI or Figma write commands;
- a read-only `hatchkit` CLI for explicit-source validation, exact search, resolution, and deterministic Change Request generation;
- a local `hatchkit` stdio MCP server with governance instructions plus read-only status, Brief, Token, and Component search tools, covered by legacy/modern protocol smoke tests;
- exact Component Resolve and deterministic Change Request MCP tools that preserve approval/audit gates and never enqueue a Figma write;
- a real Codex Agent contract harness that proves status → search → resolve tool use, structured decisions, no shell bypass, and no workspace changes;
- a compact Figma Writer panel with versioned connection, approval, operation, progress, error-recovery, and write-authorization status boundaries;
- an authenticated loopback-only HTTP Bridge with one Plugin owner, FIFO dispatch, one in-flight lease, idempotent replay, structured results, and a 30-day redacted operation log;
- an in-memory Session Token connection flow and a safe `writer.ping` round trip that proves the full Plugin transport without modifying Figma;
- a strict Variable planner and `variables.ensure` adapter that maps the Button Token fixture to one Major-version Collection, 30 real Variables, targeted scopes, aliases, code syntax, stable managed identities, no-op retries, and recoverable partial writes;
- an explicit human-confirmed Figma file-binding control that binds an unbound library once, safely replays the same identity, and refuses automatic overwrite or rebind;
- a live Git Approval verifier that reloads the catalog before every write, validates the exact subject and upstream chain, and fails closed on missing, stale, revoked, superseded, duplicate, or invalid records;
- a deterministic Button writer that ensures one real Main Component Set, four approved Variants, Label properties, and exact Variable bindings without duplicate assets;
- an atomic Registry finalizer that records the audited Button node only after Figma success, preserves concurrent edits, and reports recoverable partial writes instead of false success;
- a Registry-backed Button Instance writer that audits the real Main Component and exact Variant, creates one managed Figma Instance, and performs zero writes on an unchanged retry;
- a unified Writer replay and destructive-action policy that forces real writes to re-audit on recovery and forbids automatic delete, detach, or component swap;
- accepted architecture, identity, versioning, idempotency, and migration decisions;
- reproducible M0 spikes proving Figma variable/component creation and local process-to-plugin communication;
- a frozen Button vertical-slice acceptance contract.

The first formal MVP must prove one complete path: validate approved design facts, resolve a Button, ensure the Figma library asset without duplication, insert a real instance, retry idempotently, and audit the result.

## Repository layout

```text
design-system/   Machine-readable tokens, contracts, registry, and approvals
packages/core/   Environment-neutral domain logic and schemas
packages/cli/    Human and automation command-line entry point
packages/mcp-server/
                 Local MCP control plane and Figma bridge
packages/figma-plugin/
                 Single-writer Figma integration
skills/          Agent workflows and professional design practices
adapters/        Codex, Claude, Cursor, and Antigravity integration layers
docs/            Product, architecture, governance, and validation decisions
spikes/          Historical M0 capability proofs—not production packages
```

## Getting started

The formal product workflow is still under construction. To inspect and build the current engineering foundation:

```bash
git clone https://github.com/KinoKo668/hatchkit.git
cd hatchkit
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm check
```

After building, inspect the read-only CLI with:

```bash
pnpm --silent hatchkit --help
```

To verify the local MCP process and inspect its configuration:

```bash
pnpm mcp:smoke
pnpm --silent hatchkit:mcp --help
```

To run the current Figma Bridge and paste its one-time in-memory token into the **Hatchkit Writer** development plugin:

```bash
pnpm build
pnpm hatchkit:figma-bridge
```

Do not redirect, save, screenshot, or publish the displayed token. A standalone Bridge can run the no-write `writer.ping` and deliberately blocks `variables.ensure`. To enable live Git verification—not bypass approval—start it with both project and design-system root:

```bash
pnpm hatchkit:figma-bridge -- --project hatch-demo --root design-system/hatch-demo
```

The public demo currently has no real human Approval Records, so formal writes remain blocked until those records exist.

Requirements:

- Node.js `24.20.0` LTS is the primary development version;
- Node.js `>=22.22 <27` is the supported range;
- pnpm is pinned to `11.24.0` through Corepack and the root `packageManager` field.

To run the current M0 capability checks:

```bash
./spikes/run-m0-checks.sh
```

These checks validate historical spikes only. Passing them does not mean the formal MVP is complete.

## Documentation

The detailed project documentation is currently written primarily in Chinese:

- [Project background and current decisions](docs/项目背景与当前决策.md)
- [Agent design-system terminology primer](docs/Agent设计系统术语入门.md)
- [Button vertical validation path](docs/DIR-001-Button垂直验证链路.md)
- [Human approval gates and state model](docs/DIR-002-人工审批门禁与状态模型.md)
- [System boundaries and end-to-end data flow](docs/ARCH-001-系统边界与端到端数据流.md)
- [Engineering stack and monorepo decision](docs/ADR-001-工程技术栈与Monorepo方案.md)
- [Identity, versioning, idempotency, and migration](docs/ADR-002-稳定身份版本幂等与迁移策略.md)
- [Shared result, error, recovery, and logging contract](docs/CORE-001-统一结果错误与日志模型.md)
- [Local credentials and log-redaction policy](docs/SEC-001-本地凭据与日志脱敏策略.md)
- [Design Brief schema](docs/SCH-001-Design-Brief-Schema.md)
- [Design Token schema and DTCG subset](docs/SCH-002-基础Token-Schema与DTCG子集.md)
- [Button Component Contract](docs/SCH-003-Button-Component-Contract.md)
- [Component Registry schema](docs/SCH-004-Component-Registry-Schema.md)
- [Local file loading and integrity validation](docs/REG-001-文件加载与完整性校验.md)
- [Component search and exact resolution](docs/REG-002-组件搜索与精确解析.md)
- [Missing-component Change Requests](docs/REG-003-缺失组件Change-Request.md)
- [Read-only local CLI](docs/CLI-001-本地只读命令.md)
- [Local stdio MCP server](docs/MCP-001-本地Stdio-Server.md)
- [Read-only design-asset MCP queries](docs/MCP-002-只读设计资产查询Tools.md)
- [Component Resolve and Change Request MCP tools](docs/MCP-003-组件解析与变更申请Tools.md)
- [Real Codex Agent contract](docs/MCP-004-Codex真实Agent契约测试.md)
- [Minimal Figma Plugin UI](docs/FIG-001-最小Figma-Plugin-UI.md)
- [Plugin Bridge and single-writer queue](docs/FIG-002-Plugin-Bridge与单Writer队列.md)
- [Deterministic Figma Variables Ensure](docs/FIG-003-基础Figma-Variables-Ensure.md)
- [Deterministic Button Component Set Ensure](docs/FIG-004-Button-Component-Ensure.md)
- [Atomic Registry Ready finalization](docs/FIG-005-Registry-Atomic-Ready.md)
- [Registry-backed Button Instance insertion](docs/FIG-006-Button-Instance-Insert.md)
- [Writer idempotency, conflict, and recovery policy](docs/FIG-007-Writer-Idempotency-Conflict-Recovery.md)
- [Approval Records and pre-write verification](docs/GOV-001-审批记录与写前校验.md)
- [MVP demonstration and acceptance contract](docs/DEMO-001-MVP演示脚本与成功标准.md)

Start with the [Chinese project introduction](README.zh-CN.md) if you prefer a concise overview.

## Principles

- Query the component registry before creating or inserting UI.
- Insert registered Figma instances instead of drawing lookalikes.
- Treat tokens as design decisions, not as components or finished screens.
- Keep one serialized Figma writer; parallel work may research and review.
- Stop and request a change when no approved component satisfies the need.
- Require human approval for visual direction, component scope, and major changes.
- Keep runtime secrets, personal Figma identifiers, and local operation logs out of Git.

## License and commercial use

Hatch is **source available**, not OSI-defined open source.

Non-commercial use, modification, and distribution are permitted under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). Commercial use requires prior written permission; see the [commercial licensing guide](COMMERCIAL-LICENSE.md).

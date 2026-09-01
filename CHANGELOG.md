# Changelog

All notable changes to Hatch are documented in this file. Versions follow [Semantic Versioning](https://semver.org/); this project is source-available under the PolyForm Noncommercial License rather than OSI-defined open source.

## [Unreleased]

## [0.1.0-alpha.1] - 2026-09-01

First public source pre-release of the local-first Hatch architecture.

### Added

- Strict, versioned schemas for Briefs, DTCG-based Tokens, Button Component Contracts, Component Registry entries, Approval Records, Writer commands, results, errors, and audit findings.
- Deterministic catalog loading, integrity validation, exact component search and resolution, and structured Change Requests.
- A read-only CLI and local stdio MCP server for Agent access.
- An authenticated loopback Bridge, single-writer FIFO queue, leases, idempotent replay, a redacted 30-day Operation Log, and atomic Registry finalization.
- Deterministic Figma Variables, Button Component Set, and Button Instance writers with stable managed identities and partial-write recovery.
- Read-only style, component-provenance, and Registry-to-Figma drift audits.
- Agent golden-path and system failure-matrix regressions, cross-version Node.js CI, and verified Quickstart, troubleshooting, and current-architecture documentation.

### Safety boundaries

- The default Agent configuration is read-only; Writer tools appear only with an authenticated local Bridge session.
- Git Approval, exact content digests, Registry identity, and Figma File Binding are revalidated before writes.
- Formal writers do not automatically delete, detach, swap, downgrade, adopt, or rebind assets.
- Runtime secrets and local Operation Logs are excluded from Git and recursively redacted.

### Known limitations

- This is an Alpha source release, not a production-ready package and not an npm publication.
- The public demo intentionally contains no trusted human Approval Records, so live writes fail closed.
- FIG-003 through FIG-006 still require independent Figma Desktop double-run, reopen-location, and designer visual acceptance with a real approved test file.
- Agent-facing public MCP tools do not yet expose Variables or Component Set creation, even though the underlying plans, protocol, Plugin writers, and tests exist.
- Cross-file Figma Library publishing, Icon, Input, three-direction visual exploration, accessibility auditing, and multi-Agent writing are not complete.

[Unreleased]: https://github.com/KinoKo668/hatchkit/compare/v0.1.0-alpha.1...HEAD
[0.1.0-alpha.1]: https://github.com/KinoKo668/hatchkit/releases/tag/v0.1.0-alpha.1

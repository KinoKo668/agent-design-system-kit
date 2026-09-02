# Contributing to Hatch

Thank you for helping improve Hatch. The project is currently an Alpha source-available project, so correctness, provenance, and a reviewable rights chain take priority over contribution volume.

## Before opening a pull request

1. Search existing Issues and Discussions.
2. Open an Issue for behavior changes, schemas, public contracts, Figma write behavior, licensing, or architecture changes.
3. Keep each proposal focused on one problem and describe the expected user outcome.
4. Never attach live Figma files, customer design assets, credentials, Session Tokens, personal local paths, or unredacted operation logs.

Small typo and broken-link fixes may go directly to a pull request. A maintainer may still ask for an Issue when the change affects meaning or public behavior.

## Development setup

Hatch uses Node.js 24 LTS and pnpm 11.24.0.

```bash
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install --frozen-lockfile
pnpm check
```

Package dependencies must continue to point one way: `cli`, `mcp-server`, and `figma-plugin` may depend on `core`; `core` must not depend on Node built-ins, DOM, or Figma globals. Workspace dependencies use `workspace:*`.

Before requesting review, run:

```bash
pnpm check
pnpm audit --audit-level=high
./spikes/run-m0-checks.sh
git diff --check
```

Add or update tests for every observable behavior change. Do not copy Spike code into a production Package; rebuild it against the current formal contracts.

## Pull request expectations

A pull request should include:

- the user problem and intended outcome;
- the contracts, packages, and documentation changed;
- tests proving the success path and relevant failure-closed behavior;
- security, migration, compatibility, and Figma pollution risks;
- commands run and their results;
- screenshots only when UI changed, using synthetic data and no credentials.

Figma write changes must preserve one serialized Writer, exact identity, live Git Approval verification, File Binding checks, idempotent retry behavior, redacted logs, and zero writes on failed preconditions.

## Current contributor-license gate

Hatch uses the PolyForm Noncommercial License for public source and reserves commercial use for separate written permission. A normal Developer Certificate of Origin does not by itself establish the broader commercial sublicensing rights required by this dual-license model.

Until the project publishes a finalized Contributor License Agreement and electronic acceptance process, external pull requests may be reviewed and discussed but will not be merged. This temporary gate protects both contributors and maintainers from an ambiguous rights chain; it is not a request to assign copyright informally in an Issue or pull-request comment.

The planned non-assignment CLA approach is documented in [Contributor licensing and CLA strategy](docs/GOV-002-贡献者许可与CLA策略.md). Contributors will retain ownership of their work. The final CLA must be accepted explicitly before the first covered contribution is merged.

## Licensing of accepted contributions

Repository content remains governed by [LICENSE.md](LICENSE.md), [NOTICE](NOTICE), and the separate [commercial licensing guide](COMMERCIAL-LICENSE.md). Do not submit third-party material unless its provenance and license are documented and compatible with this project.

By opening an Issue or pull request, do not include anything confidential. Mark discussion-only material that is not intended as a contribution clearly in writing.

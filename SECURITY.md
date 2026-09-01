# Security Policy

## Supported version

Security fixes are currently provided only for the newest `0.1.x` Alpha pre-release. Hatch is not production-ready; evaluate it only with non-sensitive test design files until the documented external Figma acceptance is complete.

## Report a vulnerability privately

Do not disclose a suspected vulnerability in a public Issue, Discussion, pull request, chat, screenshot, or Figma file.

Use [GitHub private vulnerability reporting](https://github.com/KinoKo668/hatchkit/security/advisories/new). Include:

- the affected Hatch version or commit;
- a minimal reproduction using synthetic data;
- the expected and actual security boundary;
- likely impact;
- whether a credential, local path, Figma identifier, or customer asset may have been exposed.

Never send live Session Tokens, Authorization headers, Figma credentials, customer files, or unredacted Operation Logs. Revoke or rotate any credential that may already have been exposed before reporting it.

## Security scope

The current security model assumes:

- the MCP server, Bridge, Plugin, Git checkout, and Figma Desktop run on the same trusted local machine;
- the Bridge listens only on loopback and uses a short-lived in-memory Session Token;
- the default MCP configuration remains read-only;
- real writes require current Git Approval, exact identity and digest checks, and matching Figma File Binding;
- GitHub is used for collaboration and source distribution, not as a runtime authorization service.

Remote Bridge exposure, shared-machine hostile users, untrusted third-party plugins, cloud tenancy, and production secrets are outside the `0.1.0-alpha.1` support boundary.

import {
  serveStdio,
  type StdioServerHandle,
} from "@modelcontextprotocol/server/stdio";

import {
  createFailureResult,
  createSuccessResult,
  createToolkitError,
  type JsonObject,
  type ToolkitResult,
} from "@agent-design-system-kit/core";

import {
  createHatchkitMcpServer,
  type HatchkitMcpServerOptions,
} from "./server.js";

export const HATCHKIT_MCP_HELP = `Hatchkit MCP Server

Usage:
  hatchkit-mcp --project <id> --root <directory>

Options:
  --project <id>       Expected design-system project ID
  --root <directory>   Directory containing briefs/, tokens/, components/, and registry/
  --help               Show this help text

Environment fallbacks:
  HATCHKIT_PROJECT_ID
  HATCHKIT_DESIGN_SYSTEM_ROOT

The server uses MCP stdio. Protocol messages are the only stdout output.`;

export interface HatchkitMcpEnvironment {
  readonly HATCHKIT_DESIGN_SYSTEM_ROOT?: string;
  readonly HATCHKIT_PROJECT_ID?: string;
}

export interface HatchkitMcpLaunchOptions extends HatchkitMcpServerOptions {
  readonly showHelp: false;
}

export interface HatchkitMcpHelpOptions {
  readonly showHelp: true;
}

export type HatchkitMcpParsedOptions =
  HatchkitMcpHelpOptions | HatchkitMcpLaunchOptions;

interface ArgumentIssue extends JsonObject {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

function argumentFailure(
  issues: readonly ArgumentIssue[],
): ToolkitResult<never> {
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issues } },
      message: `The MCP server arguments contain ${String(issues.length)} issue(s).`,
      recoveryInstruction:
        "Provide --project and --root, or set the documented Hatchkit environment variables.",
      target: { logicalId: "hatchkit-mcp-startup", type: "command" },
    }),
  );
}

function issue(path: string, code: string, message: string): ArgumentIssue {
  return { code, message, path: `/arguments/${path}` };
}

export function parseHatchkitMcpArguments(
  argv: readonly string[],
  environment: HatchkitMcpEnvironment = {},
): ToolkitResult<HatchkitMcpParsedOptions> {
  if (argv.length === 1 && argv[0] === "--help") {
    return createSuccessResult({ showHelp: true });
  }

  const values = new Map<string, string>();
  const issues: ArgumentIssue[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag !== "--project" && flag !== "--root") {
      issues.push(
        issue(
          flag ?? "unknown",
          "unknown_option",
          `Option '${flag ?? ""}' is not supported.`,
        ),
      );
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      issues.push(
        issue(flag, "missing_option_value", `Option '${flag}' needs a value.`),
      );
      continue;
    }
    index += 1;
    if (values.has(flag)) {
      issues.push(
        issue(flag, "duplicate_option", `Option '${flag}' may be used once.`),
      );
      continue;
    }
    values.set(flag, value);
  }

  const expectedProjectId =
    values.get("--project") ?? environment.HATCHKIT_PROJECT_ID;
  const designSystemRoot =
    values.get("--root") ?? environment.HATCHKIT_DESIGN_SYSTEM_ROOT;
  if (expectedProjectId === undefined || expectedProjectId.length === 0) {
    issues.push(
      issue("--project", "missing_required_option", "Project ID is required."),
    );
  }
  if (designSystemRoot === undefined || designSystemRoot.length === 0) {
    issues.push(
      issue(
        "--root",
        "missing_required_option",
        "Design-system root is required.",
      ),
    );
  }
  if (issues.length > 0) {
    return argumentFailure(issues);
  }
  if (expectedProjectId === undefined || designSystemRoot === undefined) {
    return argumentFailure([
      issue(
        "startup",
        "invalid_startup_state",
        "Validated MCP startup options could not be constructed.",
      ),
    ]);
  }
  return createSuccessResult({
    designSystemRoot,
    expectedProjectId,
    showHelp: false,
  });
}

export interface StartHatchkitMcpStdioOptions {
  readonly onError?: (error: Error) => void;
}

export function startHatchkitMcpStdioServer(
  serverOptions: HatchkitMcpServerOptions,
  options: StartHatchkitMcpStdioOptions = {},
): StdioServerHandle {
  return serveStdio(() => createHatchkitMcpServer(serverOptions), {
    legacy: "serve",
    ...(options.onError === undefined ? {} : { onerror: options.onError }),
  });
}

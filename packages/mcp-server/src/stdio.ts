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
import {
  normalizeLocalWriterUrl,
  type LocalWriterClientOptions,
} from "./local-writer-client.js";

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
  HATCHKIT_FIGMA_BRIDGE_URL
  HATCHKIT_FIGMA_BRIDGE_TOKEN

The server uses MCP stdio. Protocol messages are the only stdout output.
The optional Writer Tool is enabled only when both Bridge environment variables are set. The Session Token is never accepted as a command-line argument.`;

export interface HatchkitMcpEnvironment {
  readonly HATCHKIT_DESIGN_SYSTEM_ROOT?: string;
  readonly HATCHKIT_FIGMA_BRIDGE_TOKEN?: string;
  readonly HATCHKIT_FIGMA_BRIDGE_URL?: string;
  readonly HATCHKIT_PROJECT_ID?: string;
}

export interface HatchkitMcpLaunchOptions extends Omit<
  HatchkitMcpServerOptions,
  "writer"
> {
  readonly showHelp: false;
  readonly writerOptions?: LocalWriterClientOptions;
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
  const writerUrl = environment.HATCHKIT_FIGMA_BRIDGE_URL;
  const writerToken = environment.HATCHKIT_FIGMA_BRIDGE_TOKEN;
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
  if ((writerUrl === undefined) !== (writerToken === undefined)) {
    issues.push(
      issue(
        "writer-environment",
        "incomplete_writer_configuration",
        "Both HATCHKIT_FIGMA_BRIDGE_URL and HATCHKIT_FIGMA_BRIDGE_TOKEN are required to enable the Writer Tool.",
      ),
    );
  }
  if (
    writerToken !== undefined &&
    (writerToken.length < 32 || writerToken.length > 256)
  ) {
    issues.push(
      issue(
        "HATCHKIT_FIGMA_BRIDGE_TOKEN",
        "invalid_writer_token",
        "Writer Session Token must contain 32 to 256 characters.",
      ),
    );
  }
  let normalizedWriterUrl: string | undefined;
  if (writerUrl !== undefined) {
    try {
      normalizedWriterUrl = normalizeLocalWriterUrl(writerUrl);
    } catch {
      issues.push(
        issue(
          "HATCHKIT_FIGMA_BRIDGE_URL",
          "invalid_writer_url",
          "Writer URL must be an HTTP 127.0.0.1 origin without credentials, path, query, or fragment.",
        ),
      );
    }
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
    ...(normalizedWriterUrl === undefined || writerToken === undefined
      ? {}
      : {
          writerOptions: {
            sessionToken: writerToken,
            url: normalizedWriterUrl,
          },
        }),
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

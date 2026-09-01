import {
  createFailureResult,
  createSuccessResult,
  createToolkitError,
  stableIdSegmentSchema,
  type JsonObject,
  type ToolkitResult,
} from "@agent-design-system-kit/core";

import type { ApprovalVerifierOptions } from "./approval-verifier.js";

export const HATCHKIT_FIGMA_BRIDGE_HELP = `Hatchkit Figma Bridge

Usage:
  hatchkit-figma-bridge
  hatchkit-figma-bridge --project <id> --root <directory>

Options:
  --project <id>       Expected design-system project ID
  --root <directory>   Directory containing approvals/ and design assets
  --help               Show this help text

Environment fallbacks:
  HATCHKIT_PROJECT_ID
  HATCHKIT_DESIGN_SYSTEM_ROOT

Without project and root, the Bridge starts in diagnostic-only mode and rejects all Figma writes.
With both values, it re-reads and verifies Approval Records before every write command.`;

export interface FigmaBridgeLaunchEnvironment {
  readonly HATCHKIT_DESIGN_SYSTEM_ROOT?: string;
  readonly HATCHKIT_PROJECT_ID?: string;
}

export interface FigmaBridgeHelpOptions {
  readonly showHelp: true;
}

export interface FigmaBridgeRuntimeOptions {
  readonly approvalVerifier: ApprovalVerifierOptions | null;
  readonly showHelp: false;
}

export type FigmaBridgeParsedOptions =
  FigmaBridgeHelpOptions | FigmaBridgeRuntimeOptions;

interface ArgumentIssue extends JsonObject {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

function issue(path: string, code: string, message: string): ArgumentIssue {
  return { code, message, path: `/arguments/${path}` };
}

function argumentFailure(
  issues: readonly ArgumentIssue[],
): ToolkitResult<never> {
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issues } },
      message: `The Figma Bridge arguments contain ${String(issues.length)} issue(s).`,
      recoveryInstruction:
        "Provide both --project and --root for write verification, or neither for diagnostic-only mode.",
      target: { logicalId: "figma-bridge-startup", type: "command" },
    }),
  );
}

export function parseFigmaBridgeArguments(
  argv: readonly string[],
  environment: FigmaBridgeLaunchEnvironment = {},
): ToolkitResult<FigmaBridgeParsedOptions> {
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
  if (issues.length > 0) return argumentFailure(issues);

  const expectedProjectId =
    values.get("--project") ?? environment.HATCHKIT_PROJECT_ID;
  const designSystemRoot =
    values.get("--root") ?? environment.HATCHKIT_DESIGN_SYSTEM_ROOT;
  if (expectedProjectId === undefined && designSystemRoot === undefined) {
    return createSuccessResult({ approvalVerifier: null, showHelp: false });
  }
  if (expectedProjectId === undefined || expectedProjectId.length === 0) {
    issues.push(
      issue(
        "--project",
        "missing_required_option",
        "Project ID is required when Approval verification is enabled.",
      ),
    );
  }
  if (designSystemRoot === undefined || designSystemRoot.length === 0) {
    issues.push(
      issue(
        "--root",
        "missing_required_option",
        "Design-system root is required when Approval verification is enabled.",
      ),
    );
  }
  if (
    expectedProjectId !== undefined &&
    !stableIdSegmentSchema.safeParse(expectedProjectId).success
  ) {
    issues.push(
      issue(
        "--project",
        "invalid_project_id",
        "Project ID must be one lowercase kebab-case segment of at most 64 characters.",
      ),
    );
  }
  if (issues.length > 0) return argumentFailure(issues);
  if (expectedProjectId === undefined || designSystemRoot === undefined) {
    return argumentFailure([
      issue(
        "startup",
        "invalid_startup_state",
        "Validated Figma Bridge options could not be constructed.",
      ),
    ]);
  }
  return createSuccessResult({
    approvalVerifier: { designSystemRoot, expectedProjectId },
    showHelp: false,
  });
}

import {
  CORE_PACKAGE_NAME,
  HATCHKIT_VERSION,
  createFailureResult,
  createSuccessResult,
  createToolkitError,
  resolveComponent,
  resolveComponentOrRequestChange,
  searchComponents,
  type DesignSystemDocumentKind,
  type DesignSystemSnapshot,
  type JsonObject,
  type ToolkitResult,
} from "@agent-design-system-kit/core";

import {
  loadExplicitDesignSystem,
  type CliSourceFile,
} from "./source-files.js";

export const CLI_PACKAGE_NAME = "@agent-design-system-kit/cli" as const;
export const CLI_PACKAGE_DEPENDENCIES = [CORE_PACKAGE_NAME] as const;
export const CLI_EXIT_CODES = {
  commandFailure: 1,
  internalFailure: 70,
  success: 0,
  usageFailure: 2,
} as const;

export const CLI_HELP = `Hatchkit — local design-system validation and component queries

Usage:
  hatchkit --version
  hatchkit validate [catalog options]
  hatchkit search [catalog options] [search options]
  hatchkit resolve [catalog options] --asset-id <id> [resolve options]
  hatchkit request-change [catalog options] --asset-id <id> [request options]

Catalog options (repeat source options when needed):
  --project <id>          Expected project ID (required)
  --root <directory>      Root containing all source paths (default: current directory)
  --approval <path>       Relative *.approval.json source
  --brief <path>          Relative *.brief.json source
  --token-set <path>      Relative *.tokens.json source
  --component <path>      Relative *.component.json source
  --registry <path>       Relative *.registry.json source

Search options:
  --term <exact-term>     Exact asset ID, name, or profile term
  --asset-id <id>         Exact component asset ID
  --asset-version <x.y.z> Exact component version
  --lifecycle <status>    active, superseded, revoked, or any
  --figma-status <status> ready, unbuilt, or any

Resolve options:
  --asset-version <x.y.z> Exact component version
  --variant <key=value>   Variant selection; repeat for multiple properties

Request options:
  --request-id <uuid>       Caller-provided stable request ID
  --request-version <x.y.z> Request version (default: 1.0.0)
  --submitted-at <time>     ISO 8601 timestamp with offset
  --submitted-by <id>       Human or Agent stable ID
  --submitter-type <type>   agent or human (default: agent)
  --summary <text>          Short requested change summary
  --rationale <text>        Why the registered catalog is insufficient
  --intended-use <text>     Where and how the component will be used

All command results are JSON. No command writes design-system or Figma data.`;

type CliCommand = "request-change" | "resolve" | "search" | "validate";

interface ParsedArguments {
  readonly command: CliCommand;
  readonly options: ReadonlyMap<string, readonly string[]>;
}

interface CliArgumentIssue extends JsonObject {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface CliRunOptions {
  readonly cwd?: string;
}

export interface CliRunResult {
  readonly exitCode: number;
  readonly output: string;
}

const COMMON_OPTIONS = new Set([
  "--approval",
  "--brief",
  "--component",
  "--project",
  "--registry",
  "--root",
  "--token-set",
]);
const SOURCE_OPTIONS = new Set([
  "--approval",
  "--brief",
  "--component",
  "--registry",
  "--token-set",
]);
const REPEATABLE_OPTIONS = new Set([...SOURCE_OPTIONS, "--variant"]);
const COMMAND_OPTIONS: Readonly<Record<CliCommand, ReadonlySet<string>>> = {
  "request-change": new Set([
    "--asset-id",
    "--asset-version",
    "--intended-use",
    "--rationale",
    "--request-id",
    "--request-version",
    "--submitted-at",
    "--submitted-by",
    "--submitter-type",
    "--summary",
    "--variant",
  ]),
  resolve: new Set(["--asset-id", "--asset-version", "--variant"]),
  search: new Set([
    "--asset-id",
    "--asset-version",
    "--figma-status",
    "--lifecycle",
    "--term",
  ]),
  validate: new Set(),
};

function jsonOutput(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function argumentFailure(
  issues: readonly CliArgumentIssue[],
): ToolkitResult<never> {
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issues } },
      message: `The CLI arguments contain ${String(issues.length)} issue(s).`,
      recoveryInstruction:
        "Correct the arguments listed in context.details.issues and run hatchkit --help if needed.",
      target: { logicalId: "cli-command", type: "command" },
    }),
  );
}

function issue(flag: string, code: string, message: string): CliArgumentIssue {
  return { code, message, path: `/arguments/${flag}` };
}

function isCommand(value: string): value is CliCommand {
  return ["request-change", "resolve", "search", "validate"].includes(value);
}

function parseArguments(
  argv: readonly string[],
): ToolkitResult<ParsedArguments> {
  const command = argv[0];
  if (command === undefined || !isCommand(command)) {
    return argumentFailure([
      issue(
        "command",
        "unknown_command",
        command === undefined
          ? "A command is required."
          : `Unknown command '${command}'.`,
      ),
    ]);
  }

  const allowed = new Set([...COMMON_OPTIONS, ...COMMAND_OPTIONS[command]]);
  const options = new Map<string, string[]>();
  const issues: CliArgumentIssue[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === undefined) {
      continue;
    }
    if (!flag.startsWith("--") || !allowed.has(flag)) {
      issues.push(
        issue(flag, "unknown_option", `Option '${flag}' is not supported.`),
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
    const values = options.get(flag) ?? [];
    if (!REPEATABLE_OPTIONS.has(flag) && values.length > 0) {
      issues.push(
        issue(flag, "duplicate_option", `Option '${flag}' may be used once.`),
      );
      continue;
    }
    values.push(value);
    options.set(flag, values);
  }
  return issues.length > 0
    ? argumentFailure(issues)
    : createSuccessResult({ command, options });
}

function first(
  options: ReadonlyMap<string, readonly string[]>,
  flag: string,
): string | undefined {
  return options.get(flag)?.[0];
}

function requireOptions(
  options: ReadonlyMap<string, readonly string[]>,
  flags: readonly string[],
): CliArgumentIssue[] {
  return flags.flatMap((flag) =>
    first(options, flag) === undefined
      ? [
          issue(
            flag,
            "missing_required_option",
            `Option '${flag}' is required.`,
          ),
        ]
      : [],
  );
}

function toSources(
  options: ReadonlyMap<string, readonly string[]>,
): readonly CliSourceFile[] {
  const mappings: readonly [string, DesignSystemDocumentKind][] = [
    ["--approval", "approval"],
    ["--brief", "brief"],
    ["--component", "component"],
    ["--registry", "component-registry"],
    ["--token-set", "token-set"],
  ];
  return mappings.flatMap(([flag, kind]) =>
    (options.get(flag) ?? []).map((sourcePath) => ({ kind, sourcePath })),
  );
}

function toVariantSelections(
  values: readonly string[],
): ToolkitResult<Readonly<Record<string, string>>> {
  const selections: Record<string, string> = {};
  const issues: CliArgumentIssue[] = [];
  values.forEach((value, index) => {
    const separator = value.indexOf("=");
    const property = separator < 0 ? "" : value.slice(0, separator);
    const option = separator < 0 ? "" : value.slice(separator + 1);
    if (property.length === 0 || option.length === 0) {
      issues.push(
        issue(
          `--variant/${String(index)}`,
          "invalid_key_value",
          "Variant must use a non-empty key=value pair.",
        ),
      );
      return;
    }
    if (Object.hasOwn(selections, property)) {
      issues.push(
        issue(
          `--variant/${String(index)}`,
          "duplicate_variant_property",
          `Variant property '${property}' was selected more than once.`,
        ),
      );
      return;
    }
    selections[property] = option;
  });
  return issues.length > 0
    ? argumentFailure(issues)
    : createSuccessResult(selections);
}

function validationSummary(snapshot: DesignSystemSnapshot): JsonObject {
  return {
    counts: {
      approvals: snapshot.approvals.length,
      briefs: snapshot.briefs.length,
      components: snapshot.components.length,
      registries: snapshot.registries.length,
      tokenSets: snapshot.tokenSets.length,
    },
    projectId: snapshot.projectId,
    sources: [
      ...snapshot.approvals.map(({ sourcePath }) => sourcePath),
      ...snapshot.briefs.map(({ sourcePath }) => sourcePath),
      ...snapshot.components.map(({ sourcePath }) => sourcePath),
      ...snapshot.registries.map(({ sourcePath }) => sourcePath),
      ...snapshot.tokenSets.map(({ sourcePath }) => sourcePath),
    ].sort(),
    status: "valid",
  };
}

async function executeParsed(
  parsed: ParsedArguments,
  cwd: string,
): Promise<ToolkitResult<unknown>> {
  const required = requireOptions(parsed.options, ["--project"]);
  const sources = toSources(parsed.options);
  if (sources.length === 0) {
    required.push(
      issue(
        "sources",
        "missing_sources",
        "At least one Approval, Brief, Token Set, Component, or Registry source is required.",
      ),
    );
  }
  if (parsed.command === "resolve" || parsed.command === "request-change") {
    required.push(...requireOptions(parsed.options, ["--asset-id"]));
  }
  if (parsed.command === "request-change") {
    required.push(
      ...requireOptions(parsed.options, [
        "--intended-use",
        "--rationale",
        "--request-id",
        "--submitted-at",
        "--submitted-by",
        "--summary",
      ]),
    );
  }
  if (required.length > 0) {
    return argumentFailure(required);
  }

  const projectId = first(parsed.options, "--project");
  if (projectId === undefined) {
    return argumentFailure([
      issue("--project", "missing_required_option", "Project ID is required."),
    ]);
  }
  const snapshotResult = await loadExplicitDesignSystem({
    cwd,
    expectedProjectId: projectId,
    rootPath: first(parsed.options, "--root") ?? ".",
    sources,
  });
  if (!snapshotResult.ok) {
    return snapshotResult;
  }
  if (parsed.command === "validate") {
    return createSuccessResult(validationSummary(snapshotResult.data));
  }
  if (parsed.command === "search") {
    return searchComponents(snapshotResult.data, {
      projectId,
      ...(first(parsed.options, "--asset-id") === undefined
        ? {}
        : { assetId: first(parsed.options, "--asset-id") }),
      ...(first(parsed.options, "--asset-version") === undefined
        ? {}
        : { assetVersion: first(parsed.options, "--asset-version") }),
      ...(first(parsed.options, "--figma-status") === undefined
        ? {}
        : { figmaStatus: first(parsed.options, "--figma-status") }),
      ...(first(parsed.options, "--lifecycle") === undefined
        ? {}
        : { lifecycle: first(parsed.options, "--lifecycle") }),
      ...(first(parsed.options, "--term") === undefined
        ? {}
        : { term: first(parsed.options, "--term") }),
    });
  }

  const variantsResult = toVariantSelections(
    parsed.options.get("--variant") ?? [],
  );
  if (!variantsResult.ok) {
    return variantsResult;
  }
  const query = {
    assetId: first(parsed.options, "--asset-id"),
    projectId,
    variantSelections: variantsResult.data,
    ...(first(parsed.options, "--asset-version") === undefined
      ? {}
      : { assetVersion: first(parsed.options, "--asset-version") }),
  };
  if (parsed.command === "resolve") {
    return resolveComponent(snapshotResult.data, query);
  }
  return resolveComponentOrRequestChange(snapshotResult.data, query, {
    intendedUse: first(parsed.options, "--intended-use"),
    rationale: first(parsed.options, "--rationale"),
    requestId: first(parsed.options, "--request-id"),
    requestVersion: first(parsed.options, "--request-version") ?? "1.0.0",
    submittedAt: first(parsed.options, "--submitted-at"),
    submittedBy: {
      id: first(parsed.options, "--submitted-by"),
      type: first(parsed.options, "--submitter-type") ?? "agent",
    },
    summary: first(parsed.options, "--summary"),
  });
}

function internalFailure(): ToolkitResult<never> {
  return createFailureResult(
    createToolkitError({
      code: "INTERNAL_ERROR",
      message: "The CLI command could not be completed.",
      recoveryInstruction:
        "Retry from a clean checkout and report the command if the failure persists.",
      target: { logicalId: "cli-command", type: "command" },
    }),
  );
}

export async function runCli(
  argv: readonly string[],
  options: CliRunOptions = {},
): Promise<CliRunResult> {
  if (argv.length === 1 && (argv[0] === "--version" || argv[0] === "-v")) {
    return {
      exitCode: CLI_EXIT_CODES.success,
      output: `${HATCHKIT_VERSION}\n`,
    };
  }
  if (
    argv.length === 0 ||
    argv[0] === "help" ||
    argv[0] === "--help" ||
    argv.includes("--help")
  ) {
    return { exitCode: CLI_EXIT_CODES.success, output: `${CLI_HELP}\n` };
  }
  try {
    const parsedResult = parseArguments(argv);
    if (!parsedResult.ok) {
      return {
        exitCode: CLI_EXIT_CODES.usageFailure,
        output: jsonOutput(parsedResult),
      };
    }
    const result = await executeParsed(
      parsedResult.data,
      options.cwd ?? process.cwd(),
    );
    return {
      exitCode: result.ok
        ? CLI_EXIT_CODES.success
        : result.error.target?.type === "command"
          ? CLI_EXIT_CODES.usageFailure
          : CLI_EXIT_CODES.commandFailure,
      output: jsonOutput(result),
    };
  } catch {
    return {
      exitCode: CLI_EXIT_CODES.internalFailure,
      output: jsonOutput(internalFailure()),
    };
  }
}

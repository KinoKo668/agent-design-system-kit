import { constants, type Dirent } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative, resolve, sep } from "node:path";

import {
  canonicalizeJson,
  createDesignSystemIntegrityFailure,
  createFailureResult,
  createToolkitError,
  validateDesignSystemIntegrity,
  type DesignSystemDocumentKind,
  type DesignSystemIntegrityIssue,
  type DesignSystemSnapshot,
  type DesignSystemSourceDocument,
  type FailureResult,
  type ToolkitResult,
} from "@agent-design-system-kit/core";

const DEFAULT_MAX_FILE_BYTES = 2 * 1_024 * 1_024;
const DEFAULT_MAX_FILES = 1_000;
const DEFAULT_MAX_DEPTH = 12;

interface DirectorySpec {
  readonly directory: string;
  readonly kind: DesignSystemDocumentKind;
  readonly suffix: string;
}

const DIRECTORY_SPECS: readonly DirectorySpec[] = [
  { directory: "approvals", kind: "approval", suffix: ".approval.json" },
  { directory: "briefs", kind: "brief", suffix: ".brief.json" },
  {
    directory: "directions",
    kind: "direction",
    suffix: ".direction-review.json",
  },
  { directory: "tokens", kind: "token-set", suffix: ".tokens.json" },
  { directory: "components", kind: "component", suffix: ".component.json" },
  {
    directory: "platforms",
    kind: "platform-target",
    suffix: ".platform-target.json",
  },
  {
    directory: "platform-registry",
    kind: "platform-component-registry",
    suffix: ".platform-registry.json",
  },
  {
    directory: "registry",
    kind: "component-registry",
    suffix: ".registry.json",
  },
];

export interface LoadDesignSystemOptions {
  readonly designSystemRoot: string;
  readonly expectedProjectId: string;
  readonly maxDepth?: number;
  readonly maxFileBytes?: number;
  readonly maxFiles?: number;
}

interface NormalizedLoadOptions {
  readonly designSystemRoot: string;
  readonly expectedProjectId: string;
  readonly maxDepth: number;
  readonly maxFileBytes: number;
  readonly maxFiles: number;
}

interface DiscoveredFile {
  readonly absolutePath: string;
  readonly kind: DesignSystemDocumentKind;
  readonly sourcePath: string;
}

interface DiscoveryState {
  readonly files: DiscoveredFile[];
  readonly issues: DesignSystemIntegrityIssue[];
  limitReached: boolean;
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const normalized = value ?? fallback;
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
  return normalized;
}

function normalizeOptions(
  options: LoadDesignSystemOptions,
): NormalizedLoadOptions {
  if (
    typeof options.designSystemRoot !== "string" ||
    options.designSystemRoot.trim().length === 0
  ) {
    throw new TypeError("designSystemRoot must be a non-empty path.");
  }
  return {
    designSystemRoot: resolve(options.designSystemRoot),
    expectedProjectId: options.expectedProjectId,
    maxDepth: normalizePositiveInteger(
      options.maxDepth,
      DEFAULT_MAX_DEPTH,
      "maxDepth",
    ),
    maxFileBytes: normalizePositiveInteger(
      options.maxFileBytes,
      DEFAULT_MAX_FILE_BYTES,
      "maxFileBytes",
    ),
    maxFiles: normalizePositiveInteger(
      options.maxFiles,
      DEFAULT_MAX_FILES,
      "maxFiles",
    ),
  };
}

function toSourcePath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join("/");
}

function sourceIssue(
  sourcePath: string,
  code: string,
  message: string,
): DesignSystemIntegrityIssue {
  return { code, message, path: "/", sourcePath };
}

function isMissingError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function readDirectoryEntries(directory: string): Promise<Dirent[]> {
  const entries: Dirent[] = [];
  const handle = await opendir(directory);
  for await (const entry of handle) {
    entries.push(entry);
  }
  return entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
}

async function discoverDirectory(
  root: string,
  directory: string,
  spec: DirectorySpec,
  depth: number,
  options: NormalizedLoadOptions,
  state: DiscoveryState,
): Promise<void> {
  if (state.limitReached) {
    return;
  }
  if (depth > options.maxDepth) {
    state.issues.push(
      sourceIssue(
        toSourcePath(root, directory),
        "directory_depth_exceeded",
        `Design-system directory nesting exceeds the configured limit of ${String(options.maxDepth)}.`,
      ),
    );
    return;
  }

  const entries = await readDirectoryEntries(directory);
  for (const entry of entries) {
    if (state.limitReached || entry.name.startsWith(".")) {
      continue;
    }
    const absolutePath = join(directory, entry.name);
    const sourcePath = toSourcePath(root, absolutePath);
    if (entry.isSymbolicLink()) {
      state.issues.push(
        sourceIssue(
          sourcePath,
          "symbolic_link_rejected",
          "Symbolic links are not allowed in managed design-system directories.",
        ),
      );
      continue;
    }
    if (entry.isDirectory()) {
      await discoverDirectory(
        root,
        absolutePath,
        spec,
        depth + 1,
        options,
        state,
      );
      continue;
    }
    if (!entry.isFile()) {
      state.issues.push(
        sourceIssue(
          sourcePath,
          "unsupported_source_type",
          "Only regular JSON files are allowed in managed design-system directories.",
        ),
      );
      continue;
    }
    if (!entry.name.endsWith(".json")) {
      continue;
    }
    if (!entry.name.endsWith(spec.suffix)) {
      state.issues.push(
        sourceIssue(
          sourcePath,
          "unsupported_file_name",
          `JSON file must end with '${spec.suffix}' in the '${spec.directory}' directory.`,
        ),
      );
      continue;
    }
    if (state.files.length >= options.maxFiles) {
      state.issues.push(
        sourceIssue(
          spec.directory,
          "file_count_exceeded",
          `Design-system file count exceeds the configured limit of ${String(options.maxFiles)}.`,
        ),
      );
      state.limitReached = true;
      continue;
    }
    state.files.push({ absolutePath, kind: spec.kind, sourcePath });
  }
}

async function discoverFiles(
  root: string,
  options: NormalizedLoadOptions,
): Promise<DiscoveryState> {
  const state: DiscoveryState = {
    files: [],
    issues: [],
    limitReached: false,
  };
  for (const spec of DIRECTORY_SPECS) {
    const directory = join(root, spec.directory);
    try {
      const directoryStat = await lstat(directory);
      if (directoryStat.isSymbolicLink()) {
        state.issues.push(
          sourceIssue(
            spec.directory,
            "symbolic_link_rejected",
            "Symbolic links are not allowed for managed design-system directories.",
          ),
        );
        continue;
      }
      if (!directoryStat.isDirectory()) {
        state.issues.push(
          sourceIssue(
            spec.directory,
            "managed_path_not_directory",
            `Managed path '${spec.directory}' must be a directory.`,
          ),
        );
        continue;
      }
      await discoverDirectory(root, directory, spec, 1, options, state);
    } catch (error) {
      if (!isMissingError(error)) {
        throw error;
      }
    }
  }
  state.files.sort((left, right) =>
    left.sourcePath < right.sourcePath
      ? -1
      : left.sourcePath > right.sourcePath
        ? 1
        : 0,
  );
  return state;
}

async function readJsonDocument(
  file: DiscoveredFile,
  maxFileBytes: number,
): Promise<
  | { readonly document: DesignSystemSourceDocument }
  | { readonly issue: DesignSystemIntegrityIssue }
> {
  const handle = await open(
    file.absolutePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const fileStat = await handle.stat();
    if (!fileStat.isFile()) {
      return {
        issue: sourceIssue(
          file.sourcePath,
          "unsupported_source_type",
          "Managed source must remain a regular file while loading.",
        ),
      };
    }
    if (fileStat.size > maxFileBytes) {
      return {
        issue: sourceIssue(
          file.sourcePath,
          "file_size_exceeded",
          `JSON file exceeds the configured limit of ${String(maxFileBytes)} bytes.`,
        ),
      };
    }

    const text = await handle.readFile({ encoding: "utf8" });
    if (Buffer.byteLength(text, "utf8") > maxFileBytes) {
      return {
        issue: sourceIssue(
          file.sourcePath,
          "file_size_exceeded",
          `JSON file exceeds the configured limit of ${String(maxFileBytes)} bytes.`,
        ),
      };
    }
    try {
      return {
        document: {
          kind: file.kind,
          sourcePath: file.sourcePath,
          value: JSON.parse(text) as unknown,
        },
      };
    } catch {
      return {
        issue: sourceIssue(
          file.sourcePath,
          "invalid_json",
          "File is not valid JSON.",
        ),
      };
    }
  } finally {
    await handle.close();
  }
}

export function computeJsonContentDigest(value: unknown): string {
  const canonical = canonicalizeJson(value);
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function loaderFailure(
  code: "IDENTITY_NOT_FOUND" | "INTERNAL_ERROR",
): FailureResult {
  return createFailureResult(
    createToolkitError({
      code,
      message:
        code === "IDENTITY_NOT_FOUND"
          ? "The configured design-system root does not exist."
          : "The design-system files could not be read safely.",
      recoveryInstruction:
        code === "IDENTITY_NOT_FOUND"
          ? "Create or select the correct design-system directory and retry."
          : "Check local file permissions and filesystem health, then retry.",
      target: { logicalId: "design-system-root", type: "project" },
    }),
  );
}

export async function loadDesignSystemFromDirectory(
  inputOptions: LoadDesignSystemOptions,
): Promise<ToolkitResult<DesignSystemSnapshot>> {
  let options: NormalizedLoadOptions;
  try {
    options = normalizeOptions(inputOptions);
  } catch {
    return createDesignSystemIntegrityFailure([
      sourceIssue(
        ".",
        "invalid_loader_options",
        "The design-system root must be a non-empty path and loader limits must be positive safe integers.",
      ),
    ]);
  }

  let root: string;
  try {
    root = await realpath(options.designSystemRoot);
  } catch (error) {
    return loaderFailure(
      isMissingError(error) ? "IDENTITY_NOT_FOUND" : "INTERNAL_ERROR",
    );
  }

  try {
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory()) {
      return createDesignSystemIntegrityFailure([
        sourceIssue(
          ".",
          "managed_root_not_directory",
          "The configured design-system root must be a directory.",
        ),
      ]);
    }
    const discovery = await discoverFiles(root, options);
    const documents: DesignSystemSourceDocument[] = [];
    const issues = [...discovery.issues];
    for (const file of discovery.files) {
      try {
        const result = await readJsonDocument(file, options.maxFileBytes);
        if ("issue" in result) {
          issues.push(result.issue);
        } else {
          documents.push(result.document);
        }
      } catch {
        issues.push(
          sourceIssue(
            file.sourcePath,
            "file_read_failed",
            "Managed JSON file could not be read safely.",
          ),
        );
      }
    }
    if (issues.length > 0) {
      return createDesignSystemIntegrityFailure(issues);
    }

    return validateDesignSystemIntegrity(
      options.expectedProjectId,
      documents,
      computeJsonContentDigest,
    );
  } catch {
    return loaderFailure("INTERNAL_ERROR");
  }
}

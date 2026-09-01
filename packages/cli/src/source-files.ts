import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  canonicalizeJson,
  createDesignSystemIntegrityFailure,
  validateDesignSystemIntegrity,
  type DesignSystemDocumentKind,
  type DesignSystemSnapshot,
  type DesignSystemSourceDocument,
  type ToolkitResult,
} from "@agent-design-system-kit/core";

const MAX_FILE_BYTES = 2 * 1_024 * 1_024;
const MAX_FILES = 1_000;

const SOURCE_SUFFIXES = {
  brief: ".brief.json",
  component: ".component.json",
  "component-registry": ".registry.json",
  "token-set": ".tokens.json",
} as const satisfies Record<DesignSystemDocumentKind, string>;

export interface CliSourceFile {
  readonly kind: DesignSystemDocumentKind;
  readonly sourcePath: string;
}

export interface LoadExplicitDesignSystemOptions {
  readonly cwd: string;
  readonly expectedProjectId: string;
  readonly rootPath: string;
  readonly sources: readonly CliSourceFile[];
}

function sourceIssue(
  sourcePath: string,
  code: string,
  message: string,
): {
  readonly code: string;
  readonly message: string;
  readonly path: string;
  readonly sourcePath: string;
} {
  return { code, message, path: "/", sourcePath };
}

function isSafeSourcePath(sourcePath: string): boolean {
  return (
    sourcePath.length > 0 &&
    sourcePath.length <= 1_024 &&
    !isAbsolute(sourcePath) &&
    !sourcePath.includes("\\") &&
    !sourcePath.includes("\0") &&
    sourcePath
      .split("/")
      .every(
        (segment) => segment.length > 0 && segment !== "." && segment !== "..",
      )
  );
}

function isMissingError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export function computeCliJsonContentDigest(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(canonicalizeJson(value), "utf8")
    .digest("hex")}`;
}

async function readSource(
  root: string,
  source: CliSourceFile,
): Promise<
  | { readonly document: DesignSystemSourceDocument }
  | { readonly issue: ReturnType<typeof sourceIssue> }
> {
  if (!isSafeSourcePath(source.sourcePath)) {
    return {
      issue: sourceIssue(
        ".",
        "unsafe_source_path",
        "CLI source paths must be normalized relative POSIX paths inside the selected root.",
      ),
    };
  }
  const expectedSuffix = SOURCE_SUFFIXES[source.kind];
  if (!source.sourcePath.endsWith(expectedSuffix)) {
    return {
      issue: sourceIssue(
        source.sourcePath,
        "unsupported_file_name",
        `Source for '${source.kind}' must end with '${expectedSuffix}'.`,
      ),
    };
  }

  const absolutePath = resolve(root, ...source.sourcePath.split("/"));
  const rootRelativePath = relative(root, absolutePath);
  if (
    rootRelativePath.startsWith(`..${sep}`) ||
    rootRelativePath === ".." ||
    isAbsolute(rootRelativePath)
  ) {
    return {
      issue: sourceIssue(
        ".",
        "unsafe_source_path",
        "CLI source path escapes the selected design-system root.",
      ),
    };
  }

  let handle;
  try {
    const segments = source.sourcePath.split("/");
    let parent = root;
    for (const segment of segments.slice(0, -1)) {
      parent = resolve(parent, segment);
      const parentStat = await lstat(parent);
      if (parentStat.isSymbolicLink()) {
        return {
          issue: sourceIssue(
            source.sourcePath,
            "symbolic_link_rejected",
            "Symbolic links are not allowed in a CLI source path.",
          ),
        };
      }
      if (!parentStat.isDirectory()) {
        return {
          issue: sourceIssue(
            source.sourcePath,
            "managed_path_not_directory",
            "Every parent segment of a CLI source must be a directory.",
          ),
        };
      }
    }
    const sourceStat = await lstat(absolutePath);
    if (sourceStat.isSymbolicLink()) {
      return {
        issue: sourceIssue(
          source.sourcePath,
          "symbolic_link_rejected",
          "Symbolic links are not allowed for CLI source files.",
        ),
      };
    }
    handle = await open(
      absolutePath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const before = await handle.stat();
    if (!before.isFile()) {
      return {
        issue: sourceIssue(
          source.sourcePath,
          "unsupported_source_type",
          "CLI sources must be regular JSON files.",
        ),
      };
    }
    if (before.size > MAX_FILE_BYTES) {
      return {
        issue: sourceIssue(
          source.sourcePath,
          "file_size_exceeded",
          `JSON file exceeds the ${String(MAX_FILE_BYTES)} byte limit.`,
        ),
      };
    }
    const text = await handle.readFile({ encoding: "utf8" });
    const after = await handle.stat();
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES
    ) {
      return {
        issue: sourceIssue(
          source.sourcePath,
          "source_changed_during_read",
          "CLI source changed while it was being read; retry from a stable checkout.",
        ),
      };
    }
    try {
      return {
        document: {
          kind: source.kind,
          sourcePath: source.sourcePath,
          value: JSON.parse(text) as unknown,
        },
      };
    } catch {
      return {
        issue: sourceIssue(
          source.sourcePath,
          "invalid_json",
          "CLI source is not valid JSON.",
        ),
      };
    }
  } catch (error) {
    return {
      issue: sourceIssue(
        source.sourcePath,
        isMissingError(error) ? "source_not_found" : "file_read_failed",
        isMissingError(error)
          ? "CLI source file does not exist."
          : "CLI source file could not be read safely.",
      ),
    };
  } finally {
    await handle?.close();
  }
}

export async function loadExplicitDesignSystem(
  options: LoadExplicitDesignSystemOptions,
): Promise<ToolkitResult<DesignSystemSnapshot>> {
  if (options.sources.length > MAX_FILES) {
    return createDesignSystemIntegrityFailure([
      sourceIssue(
        ".",
        "file_count_exceeded",
        `CLI source count exceeds the ${String(MAX_FILES)} file limit.`,
      ),
    ]);
  }

  const selectedRoot = resolve(options.cwd, options.rootPath);
  let root: string;
  try {
    const rootStat = await lstat(selectedRoot);
    if (rootStat.isSymbolicLink()) {
      return createDesignSystemIntegrityFailure([
        sourceIssue(
          ".",
          "symbolic_link_rejected",
          "The selected design-system root must not be a symbolic link.",
        ),
      ]);
    }
    if (!rootStat.isDirectory()) {
      return createDesignSystemIntegrityFailure([
        sourceIssue(
          ".",
          "managed_root_not_directory",
          "The selected design-system root must be a directory.",
        ),
      ]);
    }
    root = await realpath(selectedRoot);
  } catch (error) {
    return createDesignSystemIntegrityFailure([
      sourceIssue(
        ".",
        isMissingError(error) ? "managed_root_not_found" : "root_read_failed",
        isMissingError(error)
          ? "The selected design-system root does not exist."
          : "The selected design-system root could not be read safely.",
      ),
    ]);
  }

  const sortedSources = [...options.sources].sort((left, right) =>
    left.sourcePath < right.sourcePath
      ? -1
      : left.sourcePath > right.sourcePath
        ? 1
        : left.kind < right.kind
          ? -1
          : left.kind > right.kind
            ? 1
            : 0,
  );
  const seen = new Set<string>();
  const documents: DesignSystemSourceDocument[] = [];
  const issues: ReturnType<typeof sourceIssue>[] = [];
  for (const source of sortedSources) {
    if (seen.has(source.sourcePath)) {
      issues.push(
        sourceIssue(
          source.sourcePath,
          "duplicate_source_path",
          "CLI source path was provided more than once.",
        ),
      );
      continue;
    }
    seen.add(source.sourcePath);
    const result = await readSource(root, source);
    if ("issue" in result) {
      issues.push(result.issue);
    } else {
      documents.push(result.document);
    }
  }
  return issues.length > 0
    ? createDesignSystemIntegrityFailure(issues)
    : validateDesignSystemIntegrity(
        options.expectedProjectId,
        documents,
        computeCliJsonContentDigest,
      );
}

import * as z from "zod";

import { compareSemanticVersions } from "./semantic-version.js";
import type {
  DesignSystemSnapshot,
  LocatedDesignAsset,
} from "./design-system-snapshot.js";
import type { DesignBrief } from "./design-brief.js";
import { createToolkitError } from "./errors.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { FailureResult, ToolkitResult } from "./results.js";
import {
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";
import { toValidationIssues } from "./schema-validation.js";
import type { TokenSet } from "./token-set.js";

export const DESIGN_ASSET_QUERY_DETAILS = ["summary", "full"] as const;
export const TOKEN_QUERY_DETAILS = ["summary", "definitions"] as const;
export const MAX_QUERY_PAGE_SIZE = 100;
export const MAX_TOKEN_QUERY_PATHS = 64;
export const MAX_TOKEN_QUERY_DEFINITIONS = 256;

const tokenPathSchema = z
  .string()
  .min(1, "Must not be empty.")
  .max(384, "Must contain at most 384 characters.")
  .refine((value) => value.trim() === value, {
    message: "Must not start or end with whitespace.",
  })
  .refine((value) => {
    const segments = value.split(".");
    return (
      segments.length >= 3 &&
      segments.length <= 12 &&
      segments.every((segment) => /^[a-z][a-z0-9-]*$/u.test(segment))
    );
  }, "Must be a dot-separated Token path with 3 to 12 stable ID segments.");

const paginationShape = {
  limit: z.number().int().min(1).max(MAX_QUERY_PAGE_SIZE).default(50),
  offset: z.number().int().nonnegative().default(0),
};

export const designBriefQuerySchema = z
  .strictObject({
    assetId: stableAssetIdSchema.optional(),
    assetVersion: strictSemverSchema.optional(),
    detail: z.enum(DESIGN_ASSET_QUERY_DETAILS).default("summary"),
    projectId: stableIdSegmentSchema,
    ...paginationShape,
  })
  .superRefine((query, context) => {
    if (query.assetVersion !== undefined && query.assetId === undefined) {
      context.addIssue({
        code: "custom",
        message: "assetVersion requires an exact assetId.",
        path: ["assetVersion"],
      });
    }
    if (
      query.detail === "full" &&
      (query.assetId === undefined || query.assetVersion === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Full Brief detail requires exact assetId and assetVersion.",
        path: ["detail"],
      });
    }
    if (query.detail === "full" && query.offset !== 0) {
      context.addIssue({
        code: "custom",
        message: "Full Brief detail requires offset 0.",
        path: ["offset"],
      });
    }
  });

export const tokenSetQuerySchema = z
  .strictObject({
    assetId: stableAssetIdSchema.optional(),
    assetVersion: strictSemverSchema.optional(),
    detail: z.enum(TOKEN_QUERY_DETAILS).default("summary"),
    includeDependencies: z.boolean().default(true),
    modeId: stableIdSegmentSchema.optional(),
    paths: z
      .array(tokenPathSchema)
      .max(MAX_TOKEN_QUERY_PATHS)
      .default([])
      .refine((paths) => new Set(paths).size === paths.length, {
        message: "Token paths must be unique.",
      }),
    projectId: stableIdSegmentSchema,
    ...paginationShape,
  })
  .superRefine((query, context) => {
    if (query.assetVersion !== undefined && query.assetId === undefined) {
      context.addIssue({
        code: "custom",
        message: "assetVersion requires an exact assetId.",
        path: ["assetVersion"],
      });
    }
    if (query.detail === "summary") {
      if (query.modeId !== undefined) {
        context.addIssue({
          code: "custom",
          message: "modeId is only supported for definitions detail.",
          path: ["modeId"],
        });
      }
      if (query.paths.length > 0) {
        context.addIssue({
          code: "custom",
          message: "paths are only supported for definitions detail.",
          path: ["paths"],
        });
      }
      return;
    }
    if (
      query.assetId === undefined ||
      query.assetVersion === undefined ||
      query.modeId === undefined ||
      query.paths.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Definitions detail requires exact assetId, assetVersion, modeId, and at least one Token path.",
        path: ["detail"],
      });
    }
    if (query.offset !== 0) {
      context.addIssue({
        code: "custom",
        message: "Token definitions detail requires offset 0.",
        path: ["offset"],
      });
    }
  });

export type DesignBriefQuery = z.input<typeof designBriefQuerySchema>;
export type NormalizedDesignBriefQuery = z.output<
  typeof designBriefQuerySchema
>;
export type TokenSetQuery = z.input<typeof tokenSetQuerySchema>;
export type NormalizedTokenSetQuery = z.output<typeof tokenSetQuerySchema>;

export interface QueryPage {
  readonly limit: number;
  readonly nextOffset: number | null;
  readonly offset: number;
  readonly returned: number;
  readonly total: number;
}

export interface DesignAssetReference {
  readonly contentDigest: string | null;
  readonly id: string;
  readonly type: "brief" | "token-set";
  readonly version: string;
}

export interface DesignBriefQueryItem {
  readonly asset: DesignAssetReference & { readonly type: "brief" };
  readonly brief: DesignBrief | null;
  readonly productSummary: string;
  readonly sourcePath: string;
  readonly title: string;
}

export interface DesignBriefQueryResults {
  readonly items: readonly DesignBriefQueryItem[];
  readonly page: QueryPage;
  readonly query: NormalizedDesignBriefQuery;
}

type TokenDefinition = TokenSet["modes"][number]["tokens"][number];

export interface TokenModeSummary {
  readonly id: string;
  readonly name: string;
  readonly tokenCount: number;
}

export interface TokenDefinitionMatch {
  readonly path: string;
  readonly requested: boolean;
  readonly token: TokenDefinition;
}

export interface TokenSetQueryItem {
  readonly asset: DesignAssetReference & { readonly type: "token-set" };
  readonly defaultMode: string;
  readonly definitions: readonly TokenDefinitionMatch[];
  readonly description: string;
  readonly dtcgVersion: string;
  readonly modeId: string | null;
  readonly modes: readonly TokenModeSummary[];
  readonly name: string;
  readonly sourcePath: string;
  readonly unmatchedPaths: readonly string[];
}

export interface TokenSetQueryResults {
  readonly items: readonly TokenSetQueryItem[];
  readonly page: QueryPage;
  readonly query: NormalizedTokenSetQuery;
}

function queryValidationFailure(
  kind: "brief" | "token-set",
  error: z.ZodError,
): FailureResult {
  const issues = toValidationIssues(error);
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issues } },
      message: `The ${kind} query contains ${String(issues.length)} validation issue(s).`,
      recoveryInstruction:
        "Correct the fields listed in context.details.issues and query again.",
      target: {
        logicalId: `${kind}-query`,
        type: kind === "brief" ? "brief" : "token-set",
      },
    }),
  );
}

function compareLocatedAssets<
  T extends { readonly assetId: string; readonly assetVersion: string },
>(left: LocatedDesignAsset<T>, right: LocatedDesignAsset<T>): number {
  if (left.data.assetId !== right.data.assetId) {
    return left.data.assetId < right.data.assetId ? -1 : 1;
  }
  const versionOrder = compareSemanticVersions(
    right.data.assetVersion,
    left.data.assetVersion,
  );
  if (versionOrder !== 0) {
    return versionOrder;
  }
  return left.sourcePath < right.sourcePath
    ? -1
    : left.sourcePath > right.sourcePath
      ? 1
      : 0;
}

function pageItems<T>(
  items: readonly T[],
  offset: number,
  limit: number,
): { readonly items: readonly T[]; readonly page: QueryPage } {
  const pageItems = items.slice(offset, offset + limit);
  const nextOffset =
    offset + pageItems.length < items.length ? offset + pageItems.length : null;
  return {
    items: pageItems,
    page: {
      limit,
      nextOffset,
      offset,
      returned: pageItems.length,
      total: items.length,
    },
  };
}

function exactIdentityNotFound(
  kind: "brief" | "token-set",
  assetId: string,
  assetVersion: string,
): FailureResult {
  return createFailureResult(
    createToolkitError({
      code: "IDENTITY_NOT_FOUND",
      context: {
        expected: {
          assetId,
          assetType: kind,
          assetVersion,
        },
      },
      message: `No ${kind} '${assetId}@${assetVersion}' matched the exact query.`,
      recoveryInstruction:
        "Query available asset summaries, then retry using an exact registered identity and version.",
      target: {
        logicalId: assetId,
        type: kind,
        version: assetVersion,
      },
    }),
  );
}

function assetReference(asset: DesignBrief | TokenSet): DesignAssetReference {
  return {
    contentDigest: asset.contentDigest ?? null,
    id: asset.assetId,
    type: asset.assetType,
    version: asset.assetVersion,
  };
}

export function queryDesignBriefs(
  snapshot: DesignSystemSnapshot,
  input: unknown,
): ToolkitResult<DesignBriefQueryResults> {
  const parsed = designBriefQuerySchema.safeParse(input);
  if (!parsed.success) {
    return queryValidationFailure("brief", parsed.error);
  }
  const query = parsed.data;
  const matches = [...snapshot.briefs]
    .sort(compareLocatedAssets)
    .filter(
      ({ data }) =>
        data.projectId === query.projectId &&
        (query.assetId === undefined || data.assetId === query.assetId) &&
        (query.assetVersion === undefined ||
          data.assetVersion === query.assetVersion),
    );
  if (
    query.detail === "full" &&
    matches.length === 0 &&
    query.assetId !== undefined &&
    query.assetVersion !== undefined
  ) {
    return exactIdentityNotFound("brief", query.assetId, query.assetVersion);
  }
  const items = matches.map(({ data, sourcePath }) => ({
    asset: { ...assetReference(data), type: "brief" as const },
    brief: query.detail === "full" ? data : null,
    productSummary: data.product.summary,
    sourcePath,
    title: data.title,
  }));
  const page = pageItems(items, query.offset, query.limit);
  return createSuccessResult({ ...page, query });
}

const TOKEN_REFERENCE_PATTERN =
  /^\{([a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,11})\}$/u;

function collectTokenReferences(value: unknown, references: Set<string>): void {
  if (typeof value === "string") {
    const match = TOKEN_REFERENCE_PATTERN.exec(value);
    const path = match?.[1];
    if (path !== undefined) {
      references.add(path);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTokenReferences(item, references);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) {
      collectTokenReferences(nested, references);
    }
  }
}

function tokenQueryTooBroadFailure(
  assetId: string,
  assetVersion: string,
): FailureResult {
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: {
        actual: { definitionCount: MAX_TOKEN_QUERY_DEFINITIONS + 1 },
        expected: { maxDefinitionCount: MAX_TOKEN_QUERY_DEFINITIONS },
      },
      message: "The Token query dependency closure exceeds the output limit.",
      recoveryInstruction:
        "Query fewer Token paths or set includeDependencies to false, then request additional dependencies separately.",
      target: {
        logicalId: assetId,
        type: "token-set",
        version: assetVersion,
      },
    }),
  );
}

function collectTokenDefinitions(
  tokenSet: TokenSet,
  modeId: string,
  requestedPaths: readonly string[],
  includeDependencies: boolean,
): ToolkitResult<{
  readonly definitions: readonly TokenDefinitionMatch[];
  readonly unmatchedPaths: readonly string[];
}> {
  const mode = tokenSet.modes.find((candidate) => candidate.id === modeId);
  if (mode === undefined) {
    return createFailureResult(
      createToolkitError({
        code: "IDENTITY_NOT_FOUND",
        context: { expected: { modeId } },
        message: `Token mode '${modeId}' is not registered by '${tokenSet.assetId}@${tokenSet.assetVersion}'.`,
        recoveryInstruction:
          "Query the Token Set summary and retry with an exact registered mode ID.",
        target: {
          logicalId: tokenSet.assetId,
          type: "token-set",
          version: tokenSet.assetVersion,
        },
      }),
    );
  }
  const tokens = new Map(
    mode.tokens.map((token) => [token.path.join("."), token]),
  );
  const requested = new Set(requestedPaths.filter((path) => tokens.has(path)));
  const unmatchedPaths = requestedPaths.filter((path) => !tokens.has(path));
  const selected = new Set(requested);
  const visit = (path: string): boolean => {
    const token = tokens.get(path);
    if (token === undefined) {
      return true;
    }
    const references = new Set<string>();
    collectTokenReferences(token.$value, references);
    for (const reference of references) {
      if (selected.has(reference)) {
        continue;
      }
      selected.add(reference);
      if (selected.size > MAX_TOKEN_QUERY_DEFINITIONS) {
        return false;
      }
      if (!visit(reference)) {
        return false;
      }
    }
    return true;
  };
  if (includeDependencies) {
    for (const path of requested) {
      if (!visit(path)) {
        return tokenQueryTooBroadFailure(
          tokenSet.assetId,
          tokenSet.assetVersion,
        );
      }
    }
  }
  const definitions = [...selected].sort().flatMap((path) => {
    const token = tokens.get(path);
    return token === undefined
      ? []
      : [{ path, requested: requested.has(path), token }];
  });
  return createSuccessResult({ definitions, unmatchedPaths });
}

function tokenModeSummaries(tokenSet: TokenSet): readonly TokenModeSummary[] {
  return tokenSet.modes
    .map((mode) => ({
      id: mode.id,
      name: mode.name,
      tokenCount: mode.tokens.length,
    }))
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    );
}

function tokenSetItem(
  located: LocatedDesignAsset<TokenSet>,
  definitions: readonly TokenDefinitionMatch[] = [],
  modeId: string | null = null,
  unmatchedPaths: readonly string[] = [],
): TokenSetQueryItem {
  const tokenSet = located.data;
  return {
    asset: { ...assetReference(tokenSet), type: "token-set" },
    defaultMode: tokenSet.defaultMode,
    definitions,
    description: tokenSet.description,
    dtcgVersion: tokenSet.dtcgVersion,
    modeId,
    modes: tokenModeSummaries(tokenSet),
    name: tokenSet.name,
    sourcePath: located.sourcePath,
    unmatchedPaths,
  };
}

export function queryTokenSets(
  snapshot: DesignSystemSnapshot,
  input: unknown,
): ToolkitResult<TokenSetQueryResults> {
  const parsed = tokenSetQuerySchema.safeParse(input);
  if (!parsed.success) {
    return queryValidationFailure("token-set", parsed.error);
  }
  const query = parsed.data;
  const matches = [...snapshot.tokenSets]
    .sort(compareLocatedAssets)
    .filter(
      ({ data }) =>
        data.projectId === query.projectId &&
        (query.assetId === undefined || data.assetId === query.assetId) &&
        (query.assetVersion === undefined ||
          data.assetVersion === query.assetVersion),
    );
  if (
    query.detail === "definitions" &&
    matches.length === 0 &&
    query.assetId !== undefined &&
    query.assetVersion !== undefined
  ) {
    return exactIdentityNotFound(
      "token-set",
      query.assetId,
      query.assetVersion,
    );
  }

  const items: TokenSetQueryItem[] = [];
  for (const located of matches) {
    if (query.detail === "summary") {
      items.push(tokenSetItem(located));
      continue;
    }
    const definitionResult = collectTokenDefinitions(
      located.data,
      query.modeId ?? "",
      query.paths,
      query.includeDependencies,
    );
    if (!definitionResult.ok) {
      return definitionResult;
    }
    items.push(
      tokenSetItem(
        located,
        definitionResult.data.definitions,
        query.modeId ?? null,
        definitionResult.data.unmatchedPaths,
      ),
    );
  }
  const page = pageItems(items, query.offset, query.limit);
  return createSuccessResult({ ...page, query });
}

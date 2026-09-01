import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import {
  DESIGN_ASSET_QUERY_DETAILS,
  FIGMA_BINDING_STATUSES,
  MAX_QUERY_PAGE_SIZE,
  MAX_TOKEN_QUERY_PATHS,
  REGISTRY_LIFECYCLES,
  TOKEN_QUERY_DETAILS,
  createSuccessResult,
  designBriefSchema,
  queryDesignBriefs,
  queryTokenSets,
  searchComponents,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
  tokenDefinitionSchema,
  type DesignSystemSnapshot,
  type ToolkitResult,
} from "@agent-design-system-kit/core";

import { loadDesignSystemFromDirectory } from "./registry-files.js";

export const HATCHKIT_BRIEF_QUERY_TOOL_NAME = "hatchkit_query_briefs" as const;
export const HATCHKIT_TOKEN_QUERY_TOOL_NAME = "hatchkit_query_tokens" as const;
export const HATCHKIT_COMPONENT_SEARCH_TOOL_NAME =
  "hatchkit_search_components" as const;

export interface HatchkitQueryToolOptions {
  readonly designSystemRoot: string;
  readonly expectedProjectId: string;
}

const paginationInputShape = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_QUERY_PAGE_SIZE)
    .default(50)
    .describe("Maximum results to return, from 1 to 100."),
  offset: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe("Zero-based offset for deterministic pagination."),
};

export const hatchkitBriefQueryInputSchema = z
  .strictObject({
    assetId: stableAssetIdSchema
      .optional()
      .describe("Exact Brief asset ID. Omit only when listing summaries."),
    assetVersion: strictSemverSchema
      .optional()
      .describe("Exact Brief SemVer. Requires assetId."),
    detail: z
      .enum(DESIGN_ASSET_QUERY_DETAILS)
      .default("summary")
      .describe(
        "summary lists bounded metadata; full requires exact assetId and assetVersion.",
      ),
    ...paginationInputShape,
  })
  .superRefine((query, context) => {
    if (query.assetVersion !== undefined && query.assetId === undefined) {
      context.addIssue({
        code: "custom",
        message: "assetVersion requires assetId.",
        path: ["assetVersion"],
      });
    }
    if (
      query.detail === "full" &&
      (query.assetId === undefined || query.assetVersion === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "full detail requires exact assetId and assetVersion.",
        path: ["detail"],
      });
    }
    if (query.detail === "full" && query.offset !== 0) {
      context.addIssue({
        code: "custom",
        message: "full detail requires offset 0.",
        path: ["offset"],
      });
    }
  });

const tokenPathInputSchema = z
  .string()
  .min(1)
  .max(384)
  .regex(
    /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,11}$/u,
    "Must be an exact dot-separated Token path.",
  );

export const hatchkitTokenQueryInputSchema = z
  .strictObject({
    assetId: stableAssetIdSchema
      .optional()
      .describe("Exact Token Set asset ID."),
    assetVersion: strictSemverSchema
      .optional()
      .describe("Exact Token Set SemVer. Requires assetId."),
    detail: z
      .enum(TOKEN_QUERY_DETAILS)
      .default("summary")
      .describe(
        "summary lists sets and modes; definitions returns exact Token paths.",
      ),
    includeDependencies: z
      .boolean()
      .default(true)
      .describe("Include the validated alias dependency closure."),
    modeId: stableIdSegmentSchema
      .optional()
      .describe("Exact Token mode ID, required for definitions."),
    paths: z
      .array(tokenPathInputSchema)
      .max(MAX_TOKEN_QUERY_PATHS)
      .default([])
      .refine((paths) => new Set(paths).size === paths.length, {
        message: "Token paths must be unique.",
      })
      .describe("One to 64 exact Token paths for definitions detail."),
    ...paginationInputShape,
  })
  .superRefine((query, context) => {
    if (query.assetVersion !== undefined && query.assetId === undefined) {
      context.addIssue({
        code: "custom",
        message: "assetVersion requires assetId.",
        path: ["assetVersion"],
      });
    }
    if (query.detail === "summary") {
      if (query.modeId !== undefined || query.paths.length > 0) {
        context.addIssue({
          code: "custom",
          message: "modeId and paths require definitions detail.",
          path: ["detail"],
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
          "definitions detail requires exact assetId, assetVersion, modeId, and at least one path.",
        path: ["detail"],
      });
    }
    if (query.offset !== 0) {
      context.addIssue({
        code: "custom",
        message: "definitions detail requires offset 0.",
        path: ["offset"],
      });
    }
  });

const exactSearchTermSchema = z
  .string()
  .min(1)
  .max(192)
  .refine((value) => value.trim() === value, {
    message: "Must not start or end with whitespace.",
  });

export const hatchkitComponentSearchInputSchema = z.strictObject({
  assetId: stableAssetIdSchema.optional().describe("Exact Component asset ID."),
  assetVersion: strictSemverSchema
    .optional()
    .describe("Exact Component SemVer."),
  figmaStatus: z
    .enum([...FIGMA_BINDING_STATUSES, "any"])
    .default("any")
    .describe("Filter by registered Figma binding status."),
  lifecycle: z
    .enum([...REGISTRY_LIFECYCLES, "any"])
    .default("active")
    .describe("Defaults to active. Use any only for explicit history review."),
  term: exactSearchTermSchema
    .optional()
    .describe(
      "Exact case-insensitive asset ID, display name, or profile. No fuzzy matching.",
    ),
  ...paginationInputShape,
});

const queryPageSchema = z.strictObject({
  limit: z.number().int().positive(),
  nextOffset: z.number().int().nonnegative().nullable(),
  offset: z.number().int().nonnegative(),
  returned: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

const resultEnvelopeShape = {
  ok: z.literal(true),
  schemaVersion: z.literal("1.0.0"),
  warnings: z.array(z.unknown()),
};

const briefAssetSchema = z.strictObject({
  contentDigest: z.string().nullable(),
  id: stableAssetIdSchema,
  type: z.literal("brief"),
  version: strictSemverSchema,
});

const briefQueryDataSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      asset: briefAssetSchema,
      brief: designBriefSchema.nullable(),
      productSummary: z.string(),
      sourcePath: z.string(),
      title: z.string(),
    }),
  ),
  page: queryPageSchema,
  query: z.strictObject({
    assetId: stableAssetIdSchema.optional(),
    assetVersion: strictSemverSchema.optional(),
    detail: z.enum(DESIGN_ASSET_QUERY_DETAILS),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    projectId: stableIdSegmentSchema,
  }),
});

export const hatchkitBriefQueryOutputSchema = z.strictObject({
  data: briefQueryDataSchema,
  ...resultEnvelopeShape,
});

const tokenAssetSchema = z.strictObject({
  contentDigest: z.string().nullable(),
  id: stableAssetIdSchema,
  type: z.literal("token-set"),
  version: strictSemverSchema,
});

const tokenQueryDataSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      asset: tokenAssetSchema,
      defaultMode: stableIdSegmentSchema,
      definitions: z.array(
        z.strictObject({
          path: z.string(),
          requested: z.boolean(),
          token: tokenDefinitionSchema,
        }),
      ),
      description: z.string(),
      dtcgVersion: z.string(),
      modeId: stableIdSegmentSchema.nullable(),
      modes: z.array(
        z.strictObject({
          id: stableIdSegmentSchema,
          name: z.string(),
          tokenCount: z.number().int().nonnegative(),
        }),
      ),
      name: z.string(),
      sourcePath: z.string(),
      unmatchedPaths: z.array(z.string()),
    }),
  ),
  page: queryPageSchema,
  query: z.strictObject({
    assetId: stableAssetIdSchema.optional(),
    assetVersion: strictSemverSchema.optional(),
    detail: z.enum(TOKEN_QUERY_DETAILS),
    includeDependencies: z.boolean(),
    limit: z.number().int().positive(),
    modeId: stableIdSegmentSchema.optional(),
    offset: z.number().int().nonnegative(),
    paths: z.array(z.string()),
    projectId: stableIdSegmentSchema,
  }),
});

export const hatchkitTokenQueryOutputSchema = z.strictObject({
  data: tokenQueryDataSchema,
  ...resultEnvelopeShape,
});

const componentSearchDataSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      approvalId: z.string(),
      asset: z.strictObject({
        contentDigest: z.string(),
        id: stableAssetIdSchema,
        type: z.literal("component"),
        version: strictSemverSchema,
      }),
      availability: z.enum(["ensure-required", "figma-ready", "unavailable"]),
      componentKind: z.string(),
      figmaStatus: z.enum(FIGMA_BINDING_STATUSES),
      lifecycle: z.enum(REGISTRY_LIFECYCLES),
      lifecycleReason: z.string().nullable(),
      matchFields: z.array(z.enum(["assetId", "name", "profile"])),
      name: z.string(),
      profile: z.string(),
      size: z.string(),
      sources: z.strictObject({
        contractSourcePath: z.string(),
        registrySourcePath: z.string(),
      }),
    }),
  ),
  page: queryPageSchema,
  query: z.strictObject({
    assetId: stableAssetIdSchema.optional(),
    assetVersion: strictSemverSchema.optional(),
    figmaStatus: z.enum([...FIGMA_BINDING_STATUSES, "any"]),
    lifecycle: z.enum([...REGISTRY_LIFECYCLES, "any"]),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    projectId: stableIdSegmentSchema,
    term: exactSearchTermSchema.optional(),
  }),
});

export const hatchkitComponentSearchOutputSchema = z.strictObject({
  data: componentSearchDataSchema,
  ...resultEnvelopeShape,
});

const readOnlyAnnotations = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: true,
} as const;

function stringifyResult(result: ToolkitResult<unknown>): string {
  return JSON.stringify(result, null, 2);
}

function toolResponse(result: ToolkitResult<unknown>) {
  const text = stringifyResult(result);
  return result.ok
    ? {
        content: [{ text, type: "text" as const }],
        structuredContent: result,
      }
    : {
        content: [{ text, type: "text" as const }],
        isError: true as const,
      };
}

async function withSnapshot<T>(
  options: HatchkitQueryToolOptions,
  query: (snapshot: DesignSystemSnapshot) => ToolkitResult<T>,
): Promise<ToolkitResult<T>> {
  const snapshotResult = await loadDesignSystemFromDirectory({
    designSystemRoot: options.designSystemRoot,
    expectedProjectId: options.expectedProjectId,
  });
  return snapshotResult.ok ? query(snapshotResult.data) : snapshotResult;
}

function pageComponentResults(
  result: ReturnType<typeof searchComponents>,
  limit: number,
  offset: number,
) {
  if (!result.ok) {
    return result;
  }
  const items = result.data.items.slice(offset, offset + limit);
  return createSuccessResult({
    items,
    page: {
      limit,
      nextOffset:
        offset + items.length < result.data.total
          ? offset + items.length
          : null,
      offset,
      returned: items.length,
      total: result.data.total,
    },
    query: { ...result.data.query, limit, offset },
  });
}

export function registerHatchkitQueryTools(
  server: McpServer,
  options: HatchkitQueryToolOptions,
): void {
  server.registerTool(
    HATCHKIT_BRIEF_QUERY_TOOL_NAME,
    {
      annotations: readOnlyAnnotations,
      description:
        "List bounded Design Brief summaries or retrieve one exact full Brief. Use summaries first; full detail requires assetId and assetVersion.",
      inputSchema: hatchkitBriefQueryInputSchema,
      outputSchema: hatchkitBriefQueryOutputSchema,
      title: "Query Hatchkit Design Briefs",
    },
    async (input) =>
      toolResponse(
        await withSnapshot(options, (snapshot) =>
          queryDesignBriefs(snapshot, {
            ...input,
            projectId: options.expectedProjectId,
          }),
        ),
      ),
  );

  server.registerTool(
    HATCHKIT_TOKEN_QUERY_TOOL_NAME,
    {
      annotations: readOnlyAnnotations,
      description:
        "List bounded Token Set summaries or retrieve exact Token definitions for one mode. Definitions can include validated alias dependencies and never resolve by fuzzy path.",
      inputSchema: hatchkitTokenQueryInputSchema,
      outputSchema: hatchkitTokenQueryOutputSchema,
      title: "Query Hatchkit Tokens",
    },
    async (input) =>
      toolResponse(
        await withSnapshot(options, (snapshot) =>
          queryTokenSets(snapshot, {
            ...input,
            projectId: options.expectedProjectId,
          }),
        ),
      ),
  );

  server.registerTool(
    HATCHKIT_COMPONENT_SEARCH_TOOL_NAME,
    {
      annotations: readOnlyAnnotations,
      description:
        "Search registered Components by exact identity, display name, or profile. Returns bounded summaries and Git-relative sources without Figma locators or fuzzy approximations.",
      inputSchema: hatchkitComponentSearchInputSchema,
      outputSchema: hatchkitComponentSearchOutputSchema,
      title: "Search Hatchkit Components",
    },
    async ({ limit, offset, ...input }) =>
      toolResponse(
        await withSnapshot(options, (snapshot) =>
          pageComponentResults(
            searchComponents(snapshot, {
              ...input,
              projectId: options.expectedProjectId,
            }),
            limit,
            offset,
          ),
        ),
      ),
  );
}

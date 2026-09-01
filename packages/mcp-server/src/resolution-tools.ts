import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import {
  buttonVariantSchema,
  componentContractSchema,
  componentChangeRequestSchema,
  componentChangeRequestSubmissionSchema,
  componentRegistryEntrySchema,
  iconVariantSchema,
  resolveComponent,
  resolveComponentOrRequestChange,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "@agent-design-system-kit/core";

import {
  HATCHKIT_READ_ONLY_TOOL_ANNOTATIONS,
  TOOLKIT_SUCCESS_ENVELOPE_SHAPE,
  toMcpToolResponse,
  withDesignSystemSnapshot,
  type HatchkitCatalogOptions,
} from "./tool-support.js";

export const HATCHKIT_COMPONENT_RESOLVE_TOOL_NAME =
  "hatchkit_resolve_component" as const;
export const HATCHKIT_COMPONENT_CHANGE_REQUEST_TOOL_NAME =
  "hatchkit_request_component_change" as const;

const variantSelectionsSchema = z
  .record(stableIdSegmentSchema, stableIdSegmentSchema)
  .refine((value) => Object.keys(value).length <= 32, {
    message: "Must contain at most 32 Variant selections.",
  })
  .default({})
  .describe(
    "Exact Contract Variant property IDs and option IDs. Omitted properties use declared defaults.",
  );

export const hatchkitComponentResolveInputSchema = z.strictObject({
  assetId: stableAssetIdSchema.describe("Exact Component asset ID."),
  assetVersion: strictSemverSchema
    .optional()
    .describe("Optional exact active Component SemVer."),
  variantSelections: variantSelectionsSchema,
});

export const hatchkitComponentChangeRequestInputSchema = z.strictObject({
  assetId: stableAssetIdSchema.describe("Exact requested Component asset ID."),
  assetVersion: strictSemverSchema
    .optional()
    .describe("Optional exact requested Component SemVer."),
  submission: componentChangeRequestSubmissionSchema.describe(
    "Caller-supplied deterministic request identity, time, author, summary, rationale, and intended use.",
  ),
  variantSelections: variantSelectionsSchema,
});

const componentSourcesSchema = z.strictObject({
  contractSourcePath: z.string(),
  registrySourcePath: z.string(),
});

const componentResolutionCommonShape = {
  contract: componentContractSchema,
  selectedVariant: z.union([buttonVariantSchema, iconVariantSchema]),
  sources: componentSourcesSchema,
  variantSelections: z.record(stableIdSegmentSchema, stableIdSegmentSchema),
};

const readyRegistryEntrySchema = componentRegistryEntrySchema.refine(
  (entry) => entry.lifecycle === "active" && entry.figma.status === "ready",
  "A figma-ready resolution requires one active ready Registry entry.",
);

const unbuiltRegistryEntrySchema = componentRegistryEntrySchema.refine(
  (entry) => entry.lifecycle === "active" && entry.figma.status === "unbuilt",
  "An ensure-required resolution requires one active unbuilt Registry entry.",
);

export const componentResolutionOutputDataSchema = z.discriminatedUnion(
  "status",
  [
    z.strictObject({
      ...componentResolutionCommonShape,
      nextAction: z.literal("verify-approval-and-audit-then-insert-instance"),
      registryEntry: readyRegistryEntrySchema,
      status: z.literal("figma-ready"),
    }),
    z.strictObject({
      ...componentResolutionCommonShape,
      nextAction: z.literal("verify-approval-then-ensure-library-asset"),
      registryEntry: unbuiltRegistryEntrySchema,
      status: z.literal("ensure-required"),
    }),
  ],
);

export const hatchkitComponentResolveOutputSchema = z.strictObject({
  data: componentResolutionOutputDataSchema,
  ...TOOLKIT_SUCCESS_ENVELOPE_SHAPE,
});

export const componentResolutionOutcomeSchema = z.discriminatedUnion(
  "outcome",
  [
    z.strictObject({
      outcome: z.literal("resolved"),
      resolution: componentResolutionOutputDataSchema,
    }),
    z.strictObject({
      changeRequest: componentChangeRequestSchema,
      outcome: z.literal("change-request-required"),
    }),
  ],
);

export const hatchkitComponentChangeRequestOutputSchema = z.strictObject({
  data: componentResolutionOutcomeSchema,
  ...TOOLKIT_SUCCESS_ENVELOPE_SHAPE,
});

export function registerHatchkitResolutionTools(
  server: McpServer,
  options: HatchkitCatalogOptions,
): void {
  server.registerTool(
    HATCHKIT_COMPONENT_RESOLVE_TOOL_NAME,
    {
      annotations: HATCHKIT_READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Resolve one exact active Component and Variant. Returns the validated Contract, Registry entry, selected Variant, sources, and next action. A Figma locator is audit input, never write authorization.",
      inputSchema: hatchkitComponentResolveInputSchema,
      outputSchema: hatchkitComponentResolveOutputSchema,
      title: "Resolve a Hatchkit Component",
    },
    async (input) =>
      toMcpToolResponse(
        await withDesignSystemSnapshot(options, (snapshot) =>
          resolveComponent(snapshot, {
            ...input,
            projectId: options.expectedProjectId,
          }),
        ),
      ),
  );

  server.registerTool(
    HATCHKIT_COMPONENT_CHANGE_REQUEST_TOOL_NAME,
    {
      annotations: HATCHKIT_READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Re-run exact resolution and produce a deterministic proposed Component Change Request only for a real identity, version, or Variant capability gap. Never writes Git, Registry, Contract, or Figma.",
      inputSchema: hatchkitComponentChangeRequestInputSchema,
      outputSchema: hatchkitComponentChangeRequestOutputSchema,
      title: "Request a Hatchkit Component change",
    },
    async ({ submission, ...query }) =>
      toMcpToolResponse(
        await withDesignSystemSnapshot(options, (snapshot) =>
          resolveComponentOrRequestChange(
            snapshot,
            { ...query, projectId: options.expectedProjectId },
            submission,
          ),
        ),
      ),
  );
}

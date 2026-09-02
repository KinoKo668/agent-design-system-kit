import * as z from "zod";

import type { DesignSystemSnapshot } from "./design-system-snapshot.js";
import { createToolkitError } from "./errors.js";
import type { JsonObject, JsonValue } from "./json.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { ToolkitResult } from "./results.js";
import {
  contentDigestSchema,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";

export const FIGMA_PLATFORM_AUDIT_SCHEMA_VERSION = "1.0.0" as const;
export const PLATFORM_AUDIT_FINDING_CODES = [
  "OFFICIAL_INSTANCE_DETACHED",
  "OFFICIAL_SOURCE_KEY_MISMATCH",
  "PLATFORM_BINDING_UNREGISTERED",
  "PLATFORM_PROVENANCE_MISMATCH",
  "PLATFORM_TARGET_MISMATCH",
] as const;

const nodeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^\d+:\d+$/u);
const figmaKeySchema = z
  .string()
  .min(8)
  .max(256)
  .regex(/^[a-z0-9_-]+$/iu);
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const platformAuditSourceSchema = z.strictObject({
  bindingId: stableAssetIdSchema,
  bindingVersion: strictSemverSchema,
  componentKeys: z.array(figmaKeySchema).min(1).max(256),
  contentDigest: contentDigestSchema,
  libraryId: stableAssetIdSchema,
  libraryKey: figmaKeySchema,
  platform: z.enum(["android", "ios", "ipados"]),
  platformTargetId: stableAssetIdSchema,
  platformTargetVersion: strictSemverSchema,
  releaseChannel: z.enum(["preview", "stable"]),
  vendor: z.enum(["apple", "google"]),
});

export const figmaPlatformAuditPlanSchema = z
  .strictObject({
    fileBindingId: z.uuid(),
    projectId: stableIdSegmentSchema,
    schemaVersion: z.literal(FIGMA_PLATFORM_AUDIT_SCHEMA_VERSION),
    scope: z.literal("current-page"),
    sources: z.array(platformAuditSourceSchema).min(1).max(5_000),
  })
  .superRefine((plan, context) => {
    const identities = new Set<string>();
    plan.sources.forEach((source, index) => {
      const identity = `${source.bindingId}@${source.bindingVersion}`;
      if (identities.has(identity)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate Platform Binding audit source '${identity}'.`,
          path: ["sources", index, "bindingId"],
        });
      }
      identities.add(identity);
      if (new Set(source.componentKeys).size !== source.componentKeys.length) {
        context.addIssue({
          code: "custom",
          message: "Published Component Keys must be unique.",
          path: ["sources", index, "componentKeys"],
        });
      }
    });
  });
export type FigmaPlatformAuditPlan = z.infer<
  typeof figmaPlatformAuditPlanSchema
>;

const platformMarkerSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("invalid") }),
  z.strictObject({
    approvalId: z.string().min(1).max(320),
    bindingId: stableAssetIdSchema,
    bindingVersion: strictSemverSchema,
    componentKey: figmaKeySchema,
    contentDigest: contentDigestSchema,
    instanceStableId: stableAssetIdSchema,
    libraryId: stableAssetIdSchema,
    phase: z.enum(["applied", "creating"]),
    platformTargetId: stableAssetIdSchema,
    platformTargetVersion: strictSemverSchema,
    projectId: stableIdSegmentSchema,
    status: z.literal("valid"),
  }),
]);

export const figmaPlatformObservationSchema = z.strictObject({
  marker: platformMarkerSchema,
  node: z.strictObject({
    id: nodeIdSchema,
    name: z.string().min(1).max(256),
    type: z.string().min(1).max(64),
  }),
  source: z
    .strictObject({ componentKey: figmaKeySchema, remote: z.boolean() })
    .nullable(),
});
export type FigmaPlatformObservation = z.infer<
  typeof figmaPlatformObservationSchema
>;

export const figmaPlatformAuditFindingSchema = z.strictObject({
  actual: z.record(z.string(), jsonValueSchema),
  code: z.enum(PLATFORM_AUDIT_FINDING_CODES),
  expected: z.record(z.string(), jsonValueSchema),
  node: figmaPlatformObservationSchema.shape.node,
  recoveryInstruction: z.string().min(1).max(500),
  severity: z.literal("error"),
});
export type FigmaPlatformAuditFinding = z.infer<
  typeof figmaPlatformAuditFindingSchema
>;

export const figmaPlatformAuditResultSchema = z
  .strictObject({
    findings: z.array(figmaPlatformAuditFindingSchema).max(10_000),
    page: z.strictObject({
      id: nodeIdSchema,
      name: z.string().min(1).max(256),
    }),
    passed: z.boolean(),
    schemaVersion: z.literal(FIGMA_PLATFORM_AUDIT_SCHEMA_VERSION),
    scope: z.literal("current-page"),
    summary: z.strictObject({
      auditedInstances: z.number().int().nonnegative(),
      compliantInstances: z.number().int().nonnegative(),
      detached: z.number().int().nonnegative(),
      provenanceMismatches: z.number().int().nonnegative(),
      sourceKeyMismatches: z.number().int().nonnegative(),
      targetMismatches: z.number().int().nonnegative(),
      unregisteredBindings: z.number().int().nonnegative(),
    }),
    type: z.literal("audit.platform-components.scan"),
  })
  .superRefine((result, context) => {
    const count = (code: FigmaPlatformAuditFinding["code"]) =>
      result.findings.filter((finding) => finding.code === code).length;
    const nodesWithFindings = new Set(
      result.findings.map(({ node }) => node.id),
    ).size;
    if (
      result.passed !== (result.findings.length === 0) ||
      result.summary.detached !== count("OFFICIAL_INSTANCE_DETACHED") ||
      result.summary.provenanceMismatches !==
        count("PLATFORM_PROVENANCE_MISMATCH") ||
      result.summary.sourceKeyMismatches !==
        count("OFFICIAL_SOURCE_KEY_MISMATCH") ||
      result.summary.targetMismatches !== count("PLATFORM_TARGET_MISMATCH") ||
      result.summary.unregisteredBindings !==
        count("PLATFORM_BINDING_UNREGISTERED") ||
      result.summary.auditedInstances !==
        result.summary.compliantInstances + nodesWithFindings
    ) {
      context.addIssue({
        code: "custom",
        message: "Platform audit summary must exactly match its findings.",
        path: ["summary"],
      });
    }
  });
export type FigmaPlatformAuditResult = z.infer<
  typeof figmaPlatformAuditResultSchema
>;

export function createFigmaPlatformAuditPlan(
  snapshot: DesignSystemSnapshot,
  input: unknown,
): ToolkitResult<FigmaPlatformAuditPlan> {
  const request = z.strictObject({ fileBindingId: z.uuid() }).safeParse(input);
  if (!request.success) {
    return createFailureResult(
      createToolkitError({
        code: "VALIDATION_FAILED",
        message: "The Platform audit request needs an exact file binding.",
        recoveryInstruction: "Bind the current Figma page file and retry.",
        target: { logicalId: "platform-audit", type: "operation" },
      }),
    );
  }
  const targets = new Map(
    snapshot.platformTargets.map(({ data }) => [
      `${data.assetId}@${data.assetVersion}`,
      data,
    ]),
  );
  const sources = snapshot.platformRegistries.flatMap(({ data }) =>
    data.entries.flatMap((entry) => {
      if (entry.lifecycle !== "active" || entry.figma.status !== "ready") {
        return [];
      }
      const target = targets.get(
        `${entry.platformTarget.assetId}@${entry.platformTarget.assetVersion}`,
      );
      return target === undefined
        ? []
        : [
            {
              bindingId: entry.bindingId,
              bindingVersion: entry.bindingVersion,
              componentKeys: entry.figma.mappings.map(
                ({ componentKey }) => componentKey,
              ),
              contentDigest: entry.contentDigest,
              libraryId: entry.source.libraryId,
              libraryKey: entry.figma.libraryKey,
              platform: target.platform,
              platformTargetId: target.assetId,
              platformTargetVersion: target.assetVersion,
              releaseChannel: target.releaseChannel,
              vendor: entry.source.vendor,
            },
          ];
    }),
  );
  if (sources.length === 0) {
    return createFailureResult(
      createToolkitError({
        code: "IDENTITY_NOT_FOUND",
        message: "No approved Ready official Platform Binding can be audited.",
        recoveryInstruction:
          "Verify and approve an official Platform Component Registry mapping first.",
        target: { logicalId: "platform-audit", type: "platform-binding" },
      }),
    );
  }
  return createSuccessResult(
    figmaPlatformAuditPlanSchema.parse({
      fileBindingId: request.data.fileBindingId,
      projectId: snapshot.projectId,
      schemaVersion: FIGMA_PLATFORM_AUDIT_SCHEMA_VERSION,
      scope: "current-page",
      sources: sources.sort((left, right) =>
        left.bindingId.localeCompare(right.bindingId),
      ),
    }),
  );
}

function finding(
  code: FigmaPlatformAuditFinding["code"],
  observation: FigmaPlatformObservation,
  actual: JsonObject,
  expected: JsonObject,
  recoveryInstruction: string,
): FigmaPlatformAuditFinding {
  return {
    actual,
    code,
    expected,
    node: observation.node,
    recoveryInstruction,
    severity: "error",
  };
}

export function auditFigmaPlatformObservations(
  planInput: unknown,
  pageInput: unknown,
  observationsInput: unknown,
): ToolkitResult<FigmaPlatformAuditResult> {
  const plan = figmaPlatformAuditPlanSchema.safeParse(planInput);
  const page = z
    .strictObject({ id: nodeIdSchema, name: z.string().min(1).max(256) })
    .safeParse(pageInput);
  const observations = z
    .array(figmaPlatformObservationSchema)
    .max(10_000)
    .safeParse(observationsInput);
  if (!plan.success || !page.success || !observations.success) {
    return createFailureResult(
      createToolkitError({
        code: "VALIDATION_FAILED",
        message: "Platform component audit inputs are invalid.",
        recoveryInstruction:
          "Rebuild the plan and observations from the validated Registry and Plugin adapter.",
        target: { logicalId: "platform-audit", type: "operation" },
      }),
    );
  }
  const sources = new Map(
    plan.data.sources.map((source) => [
      `${source.bindingId}@${source.bindingVersion}`,
      source,
    ]),
  );
  const findings: FigmaPlatformAuditFinding[] = [];
  let compliantInstances = 0;
  for (const observation of observations.data) {
    const before = findings.length;
    if (observation.marker.status === "invalid") {
      findings.push(
        finding(
          "PLATFORM_PROVENANCE_MISMATCH",
          observation,
          { marker: "invalid" },
          { validAppliedMarker: true },
          "Reinsert the component through the approved official Platform workflow.",
        ),
      );
      continue;
    }
    const marker = observation.marker;
    const registered = sources.get(
      `${marker.bindingId}@${marker.bindingVersion}`,
    );
    if (registered === undefined) {
      findings.push(
        finding(
          "PLATFORM_BINDING_UNREGISTERED",
          observation,
          {
            bindingId: marker.bindingId,
            bindingVersion: marker.bindingVersion,
          },
          { activeReadyBindingRequired: true },
          "Replace this Instance with one from an active approved Platform Binding.",
        ),
      );
    } else {
      if (
        marker.projectId !== plan.data.projectId ||
        marker.phase !== "applied" ||
        marker.contentDigest !== registered.contentDigest ||
        marker.libraryId !== registered.libraryId
      ) {
        findings.push(
          finding(
            "PLATFORM_PROVENANCE_MISMATCH",
            observation,
            { marker },
            {
              contentDigest: registered.contentDigest,
              libraryId: registered.libraryId,
              phase: "applied",
              projectId: plan.data.projectId,
            },
            "Reinsert the exact approved binding; do not edit its provenance marker.",
          ),
        );
      }
      if (
        marker.platformTargetId !== registered.platformTargetId ||
        marker.platformTargetVersion !== registered.platformTargetVersion ||
        (registered.vendor === "apple" && registered.platform === "android") ||
        (registered.vendor === "google" && registered.platform !== "android")
      ) {
        findings.push(
          finding(
            "PLATFORM_TARGET_MISMATCH",
            observation,
            {
              platformTargetId: marker.platformTargetId,
              platformTargetVersion: marker.platformTargetVersion,
            },
            {
              platform: registered.platform,
              platformTargetId: registered.platformTargetId,
              platformTargetVersion: registered.platformTargetVersion,
              releaseChannel: registered.releaseChannel,
              vendor: registered.vendor,
            },
            "Use the approved component mapping for the page's exact Platform Target.",
          ),
        );
      }
      if (observation.source === null) {
        findings.push(
          finding(
            "OFFICIAL_INSTANCE_DETACHED",
            observation,
            { nodeType: observation.node.type },
            { nodeType: "INSTANCE", remote: true },
            "Remove the detached node and reinsert the official remote Instance.",
          ),
        );
      } else if (
        !observation.source.remote ||
        observation.source.componentKey !== marker.componentKey ||
        !registered.componentKeys.includes(observation.source.componentKey)
      ) {
        findings.push(
          finding(
            "OFFICIAL_SOURCE_KEY_MISMATCH",
            observation,
            { source: observation.source },
            { approvedComponentKeys: registered.componentKeys, remote: true },
            "Replace the node with the exact registered official Component Key.",
          ),
        );
      }
    }
    if (findings.length === before) compliantInstances += 1;
  }
  findings.sort((left, right) =>
    `${left.node.id}/${left.code}`.localeCompare(
      `${right.node.id}/${right.code}`,
    ),
  );
  const count = (code: FigmaPlatformAuditFinding["code"]) =>
    findings.filter((item) => item.code === code).length;
  return createSuccessResult({
    findings,
    page: page.data,
    passed: findings.length === 0,
    schemaVersion: FIGMA_PLATFORM_AUDIT_SCHEMA_VERSION,
    scope: "current-page",
    summary: {
      auditedInstances: observations.data.length,
      compliantInstances,
      detached: count("OFFICIAL_INSTANCE_DETACHED"),
      provenanceMismatches: count("PLATFORM_PROVENANCE_MISMATCH"),
      sourceKeyMismatches: count("OFFICIAL_SOURCE_KEY_MISMATCH"),
      targetMismatches: count("PLATFORM_TARGET_MISMATCH"),
      unregisteredBindings: count("PLATFORM_BINDING_UNREGISTERED"),
    },
    type: "audit.platform-components.scan",
  });
}

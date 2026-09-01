import * as z from "zod";

import type { DesignSystemSnapshot } from "./design-system-snapshot.js";
import { createToolkitError } from "./errors.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { ToolkitResult } from "./results.js";
import {
  stableAssetIdSchema,
  stableIdSegmentSchema,
} from "./schema-primitives.js";

export const FIGMA_STYLE_AUDIT_SCHEMA_VERSION = "1.0.0" as const;
export const STYLE_AUDIT_FINDING_CODES = [
  "HARD_CODED_STYLE",
  "UNREGISTERED_VARIABLE",
] as const;
export const STYLE_AUDIT_KINDS = [
  "color",
  "dimension",
  "opacity",
  "typography",
] as const;
export type StyleAuditKind = (typeof STYLE_AUDIT_KINDS)[number];

const nodeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^\d+:\d+$/u);
const fileBindingIdSchema = z.uuid();
const boundedFieldSchema = z.string().min(1).max(160);

export const figmaStyleAuditPlanSchema = z
  .object({
    fileBindingId: fileBindingIdSchema,
    projectId: stableIdSegmentSchema,
    registeredVariables: z
      .array(
        z
          .object({
            stableId: stableAssetIdSchema,
            tokenPath: stableAssetIdSchema,
          })
          .strict(),
      )
      .min(1)
      .max(2_000),
    schemaVersion: z.literal(FIGMA_STYLE_AUDIT_SCHEMA_VERSION),
    scope: z.literal("current-page"),
  })
  .strict()
  .superRefine((plan, context) => {
    const identities = new Set<string>();
    plan.registeredVariables.forEach((variable, index) => {
      if (identities.has(variable.stableId)) {
        context.addIssue({
          code: "custom",
          message: "Registered Variable identities must be unique.",
          path: ["registeredVariables", index, "stableId"],
        });
      }
      identities.add(variable.stableId);
      if (!variable.stableId.startsWith(`${plan.projectId}/token-set/`)) {
        context.addIssue({
          code: "custom",
          message: "Registered Variable identity must belong to the project.",
          path: ["registeredVariables", index, "stableId"],
        });
      }
      if (!variable.stableId.endsWith(`/variable/${variable.tokenPath}`)) {
        context.addIssue({
          code: "custom",
          message: "Registered Variable identity must match its Token path.",
          path: ["registeredVariables", index, "stableId"],
        });
      }
    });
  });

export type FigmaStyleAuditPlan = z.infer<typeof figmaStyleAuditPlanSchema>;

export const figmaStyleObservationSchema = z
  .object({
    actual: z.string().min(1).max(240),
    binding: z
      .object({
        id: z.string().min(1).max(128),
        stableId: stableAssetIdSchema.nullable(),
      })
      .strict()
      .nullable(),
    field: boundedFieldSchema,
    kind: z.enum(STYLE_AUDIT_KINDS),
    node: z
      .object({
        id: nodeIdSchema,
        name: z.string().min(1).max(256),
        type: z.string().min(1).max(64),
      })
      .strict(),
  })
  .strict();

export type FigmaStyleObservation = z.infer<typeof figmaStyleObservationSchema>;

export const figmaStyleAuditFindingSchema = z
  .object({
    actual: z
      .object({
        bindingVariableId: z.string().min(1).max(128).nullable(),
        value: z.string().min(1).max(240),
      })
      .strict(),
    code: z.enum(STYLE_AUDIT_FINDING_CODES),
    expected: z
      .object({ registeredVariableRequired: z.literal(true) })
      .strict(),
    field: boundedFieldSchema,
    kind: z.enum(STYLE_AUDIT_KINDS),
    node: z
      .object({
        id: nodeIdSchema,
        name: z.string().min(1).max(256),
        type: z.string().min(1).max(64),
      })
      .strict(),
    recoveryInstruction: z.string().min(1).max(500),
    severity: z.literal("error"),
  })
  .strict();

export type FigmaStyleAuditFinding = z.infer<
  typeof figmaStyleAuditFindingSchema
>;

export const figmaStyleAuditResultSchema = z
  .object({
    findings: z.array(figmaStyleAuditFindingSchema).max(10_000),
    page: z
      .object({ id: nodeIdSchema, name: z.string().min(1).max(256) })
      .strict(),
    passed: z.boolean(),
    schemaVersion: z.literal(FIGMA_STYLE_AUDIT_SCHEMA_VERSION),
    scope: z.literal("current-page"),
    summary: z
      .object({
        auditedStyles: z.number().int().nonnegative(),
        hardCodedStyles: z.number().int().nonnegative(),
        nodesWithFindings: z.number().int().nonnegative(),
        registeredBindings: z.number().int().nonnegative(),
        unregisteredVariables: z.number().int().nonnegative(),
      })
      .strict(),
    type: z.literal("audit.styles.scan"),
  })
  .strict()
  .superRefine((result, context) => {
    const hardCodedStyles = result.findings.filter(
      ({ code }) => code === "HARD_CODED_STYLE",
    ).length;
    const unregisteredVariables = result.findings.filter(
      ({ code }) => code === "UNREGISTERED_VARIABLE",
    ).length;
    const nodesWithFindings = new Set(
      result.findings.map(({ node }) => node.id),
    ).size;
    const expectedPassed = result.findings.length === 0;
    if (
      result.passed !== expectedPassed ||
      result.summary.hardCodedStyles !== hardCodedStyles ||
      result.summary.unregisteredVariables !== unregisteredVariables ||
      result.summary.nodesWithFindings !== nodesWithFindings ||
      result.summary.auditedStyles !==
        result.summary.registeredBindings + result.findings.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Style audit summary must exactly match its findings.",
        path: ["summary"],
      });
    }
  });

export type FigmaStyleAuditResult = z.infer<typeof figmaStyleAuditResultSchema>;

function majorVersion(version: string): number {
  return Number(version.split(".")[0]);
}

function tokenPath(token: { readonly path: readonly string[] }): string {
  return token.path.join("/");
}

function planFailure(
  code: "IDENTITY_CONFLICT" | "IDENTITY_NOT_FOUND" | "VALIDATION_FAILED",
  message: string,
  recoveryInstruction: string,
): ToolkitResult<never> {
  return createFailureResult(
    createToolkitError({
      code,
      message,
      recoveryInstruction,
      target: { logicalId: "style-audit", type: "operation" },
    }),
  );
}

export function createFigmaStyleAuditPlan(
  snapshot: DesignSystemSnapshot,
): ToolkitResult<FigmaStyleAuditPlan> {
  const activeEntries = snapshot.registries.flatMap(({ data }) =>
    data.entries.filter(
      (entry) => entry.lifecycle === "active" && entry.figma.status === "ready",
    ),
  );
  const fileBindingIds = new Set(
    activeEntries.map((entry) => entry.figma.fileBindingId),
  );
  if (fileBindingIds.size === 0) {
    return planFailure(
      "IDENTITY_NOT_FOUND",
      "No active Ready Figma file binding is available for style audit.",
      "Ensure and register an approved component library before auditing its page.",
    );
  }
  if (fileBindingIds.size > 1) {
    return planFailure(
      "IDENTITY_CONFLICT",
      "The current audit scope spans more than one Figma file binding.",
      "Select one registered Figma file before running the current-page audit.",
    );
  }
  const referencedTokenSets = new Map<
    string,
    {
      readonly assetId: string;
      readonly assetVersion: string;
      readonly projectId: string;
    }
  >(
    activeEntries.flatMap((entry) =>
      snapshot.components
        .filter(
          ({ data }) =>
            data.assetId === entry.asset.id &&
            data.assetVersion === entry.asset.version,
        )
        .map(
          ({ data }) =>
            [
              `${data.tokenSource.projectId}/${data.tokenSource.assetId}@${data.tokenSource.assetVersion}`,
              data.tokenSource,
            ] as const,
        ),
    ),
  );
  const variables = new Map<string, { stableId: string; tokenPath: string }>();
  for (const tokenSet of snapshot.tokenSets) {
    const identity = `${tokenSet.data.projectId}/${tokenSet.data.assetId}@${tokenSet.data.assetVersion}`;
    if (!referencedTokenSets.has(identity)) continue;
    const baseline = tokenSet.data.modes.find(
      ({ id }) => id === tokenSet.data.defaultMode,
    );
    if (baseline === undefined) {
      return planFailure(
        "VALIDATION_FAILED",
        "A referenced Token Set has no default mode for style audit.",
        "Repair and validate the Token Set before running the audit.",
      );
    }
    const collection = `${tokenSet.data.projectId}/token-set/${tokenSet.data.assetId}/variables/major-${String(majorVersion(tokenSet.data.assetVersion))}`;
    for (const token of baseline.tokens) {
      if (token.$type === "typography") continue;
      const path = tokenPath(token);
      const stableId = `${collection}/variable/${path}`;
      variables.set(stableId, { stableId, tokenPath: path });
    }
  }
  const parsed = figmaStyleAuditPlanSchema.safeParse({
    fileBindingId: [...fileBindingIds][0],
    projectId: snapshot.projectId,
    registeredVariables: [...variables.values()].sort((left, right) =>
      left.stableId.localeCompare(right.stableId),
    ),
    schemaVersion: FIGMA_STYLE_AUDIT_SCHEMA_VERSION,
    scope: "current-page",
  });
  return parsed.success
    ? createSuccessResult(parsed.data)
    : planFailure(
        "VALIDATION_FAILED",
        "The validated design system could not produce a style audit plan.",
        "Repair the active Registry and referenced Token Sets before retrying.",
      );
}

export function auditFigmaStyleObservations(
  planInput: unknown,
  pageInput: unknown,
  observationsInput: unknown,
): ToolkitResult<FigmaStyleAuditResult> {
  const plan = figmaStyleAuditPlanSchema.safeParse(planInput);
  const page = z
    .object({ id: nodeIdSchema, name: z.string().min(1).max(256) })
    .strict()
    .safeParse(pageInput);
  const observations = z
    .array(figmaStyleObservationSchema)
    .max(50_000)
    .safeParse(observationsInput);
  if (!plan.success || !page.success || !observations.success) {
    return planFailure(
      "VALIDATION_FAILED",
      "Figma style audit observations are invalid.",
      "Reload the current page with the compatible Hatchkit Plugin and retry.",
    );
  }
  const registered = new Set(
    plan.data.registeredVariables.map(({ stableId }) => stableId),
  );
  const findings: FigmaStyleAuditFinding[] = [];
  let registeredBindings = 0;
  for (const observation of observations.data) {
    if (observation.binding === null) {
      findings.push({
        actual: { bindingVariableId: null, value: observation.actual },
        code: "HARD_CODED_STYLE",
        expected: { registeredVariableRequired: true },
        field: observation.field,
        kind: observation.kind,
        node: observation.node,
        recoveryInstruction:
          "Replace the direct value with an approved registered Variable binding.",
        severity: "error",
      });
    } else if (
      observation.binding.stableId === null ||
      !registered.has(observation.binding.stableId)
    ) {
      findings.push({
        actual: {
          bindingVariableId: observation.binding.id,
          value: observation.actual,
        },
        code: "UNREGISTERED_VARIABLE",
        expected: { registeredVariableRequired: true },
        field: observation.field,
        kind: observation.kind,
        node: observation.node,
        recoveryInstruction:
          "Bind this field to a Variable registered by the current Git Token Set.",
        severity: "error",
      });
    } else {
      registeredBindings += 1;
    }
  }
  findings.sort((left, right) =>
    `${left.node.id}/${left.field}/${left.code}`.localeCompare(
      `${right.node.id}/${right.field}/${right.code}`,
    ),
  );
  const result = figmaStyleAuditResultSchema.safeParse({
    findings,
    page: page.data,
    passed: findings.length === 0,
    schemaVersion: FIGMA_STYLE_AUDIT_SCHEMA_VERSION,
    scope: "current-page",
    summary: {
      auditedStyles: observations.data.length,
      hardCodedStyles: findings.filter(
        ({ code }) => code === "HARD_CODED_STYLE",
      ).length,
      nodesWithFindings: new Set(findings.map(({ node }) => node.id)).size,
      registeredBindings,
      unregisteredVariables: findings.filter(
        ({ code }) => code === "UNREGISTERED_VARIABLE",
      ).length,
    },
    type: "audit.styles.scan",
  });
  return result.success
    ? createSuccessResult(result.data)
    : planFailure(
        "VALIDATION_FAILED",
        "The Figma style audit result exceeded its contract.",
        "Reduce the page scope or repair incompatible Plugin observations.",
      );
}

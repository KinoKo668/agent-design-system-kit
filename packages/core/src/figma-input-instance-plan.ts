import * as z from "zod";

import { resolveComponent } from "./component-query.js";
import type { DesignSystemSnapshot } from "./design-system-snapshot.js";
import { createToolkitError } from "./errors.js";
import {
  INPUT_CONTRACT_PROFILE,
  type InputComponentContract,
} from "./input-contract.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { ToolkitResult } from "./results.js";
import {
  contentDigestSchema,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";
import { semanticVersionMajor } from "./semantic-version.js";

export const FIGMA_INPUT_INSTANCE_PLAN_SCHEMA_VERSION = "1.0.0" as const;

const nodeIdSchema = z
  .string()
  .max(128)
  .regex(/^\d+:\d+$/u);
const propertySchema = z
  .object({
    name: z.string().min(1).max(120),
    value: z.string().min(1).max(500),
  })
  .strict();
const trimmedTextSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => value.trim() === value, {
    message: "Text must not start or end with whitespace.",
  });

export const figmaInputInstancePlanSchema = z
  .object({
    componentSet: z
      .object({
        expectedVariantStableIds: z.array(stableAssetIdSchema).length(8),
        majorVersion: z.number().int().nonnegative(),
        nodeId: nodeIdSchema,
        stableId: stableAssetIdSchema,
      })
      .strict(),
    instance: z
      .object({
        stableId: stableAssetIdSchema,
        x: z.number().finite().min(-1_000_000).max(1_000_000),
        y: z.number().finite().min(-1_000_000).max(1_000_000),
      })
      .strict(),
    properties: z
      .object({
        content: propertySchema,
        label: propertySchema,
        state: propertySchema,
        supportingText: propertySchema,
        text: propertySchema,
      })
      .strict(),
    schemaVersion: z.literal(FIGMA_INPUT_INSTANCE_PLAN_SCHEMA_VERSION),
    selectedVariant: z
      .object({
        figmaName: z.string().min(1).max(240),
        selections: z
          .object({
            content: z.enum(["empty", "filled"]),
            state: z.enum(["default", "focused", "error", "disabled"]),
          })
          .strict(),
        slotId: stableAssetIdSchema,
        stableId: stableAssetIdSchema,
      })
      .strict(),
    source: z
      .object({
        approvalId: z
          .string()
          .min(1)
          .max(320)
          .regex(/^approval\.component\.[a-z0-9.+-]+$/u),
        assetId: stableAssetIdSchema,
        assetVersion: strictSemverSchema,
        contentDigest: contentDigestSchema,
        fileBindingId: z.uuid(),
        projectId: stableIdSegmentSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((plan, context) => {
    const root = `${plan.source.projectId}/component/${plan.source.assetId}/component-set/major-${semanticVersionMajor(plan.source.assetVersion)}`;
    if (
      plan.componentSet.stableId !== root ||
      String(plan.componentSet.majorVersion) !==
        semanticVersionMajor(plan.source.assetVersion)
    ) {
      context.addIssue({
        code: "custom",
        message: "Input Component Set identity must match its source Major.",
        path: ["componentSet"],
      });
    }
    const expectedApproval = `approval.component.${plan.source.assetId.replaceAll("/", ".")}.${plan.source.assetVersion}`;
    if (plan.source.approvalId !== expectedApproval) {
      context.addIssue({
        code: "custom",
        message: `Approval ID must be '${expectedApproval}'.`,
        path: ["source", "approvalId"],
      });
    }
    if (
      plan.selectedVariant.stableId !== `${root}/${plan.selectedVariant.slotId}`
    ) {
      context.addIssue({
        code: "custom",
        message: "Selected Input Variant must belong to its Component Set.",
        path: ["selectedVariant", "stableId"],
      });
    }
    if (
      !plan.instance.stableId.startsWith(`${plan.source.projectId}/instance/`)
    ) {
      context.addIssue({
        code: "custom",
        message: "Input Instance identity must belong to its source project.",
        path: ["instance", "stableId"],
      });
    }
    if (
      new Set(plan.componentSet.expectedVariantStableIds).size !== 8 ||
      plan.componentSet.expectedVariantStableIds.some(
        (stableId) => !stableId.startsWith(`${root}/`),
      ) ||
      !plan.componentSet.expectedVariantStableIds.includes(
        plan.selectedVariant.stableId,
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Expected Input Variants must be unique and belong to the Set.",
        path: ["componentSet", "expectedVariantStableIds"],
      });
    }
    const expectedName = `${plan.properties.state.name}=${plan.properties.state.value}, ${plan.properties.content.name}=${plan.properties.content.value}`;
    if (plan.selectedVariant.figmaName !== expectedName) {
      context.addIssue({
        code: "custom",
        message: "Selected Input Variant must match State and Content.",
        path: ["selectedVariant", "figmaName"],
      });
    }
    for (const key of ["label", "text", "supportingText"] as const) {
      if (plan.properties[key].value.trim() !== plan.properties[key].value) {
        context.addIssue({
          code: "custom",
          message: `${plan.properties[key].name} must not start or end with whitespace.`,
          path: ["properties", key, "value"],
        });
      }
    }
  });

export type FigmaInputInstancePlan = z.infer<
  typeof figmaInputInstancePlanSchema
>;

export const figmaInputInstanceRequestSchema = z.strictObject({
  assetId: stableAssetIdSchema,
  assetVersion: strictSemverSchema.optional(),
  instanceId: stableAssetIdSchema,
  label: trimmedTextSchema,
  projectId: stableIdSegmentSchema,
  supportingText: trimmedTextSchema,
  text: trimmedTextSchema,
  variantSelections: z
    .object({
      content: z.enum(["empty", "filled"]),
      state: z.enum(["default", "focused", "error", "disabled"]),
    })
    .strict(),
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
});

export type FigmaInputInstanceRequest = z.infer<
  typeof figmaInputInstanceRequestSchema
>;

export function createFigmaInputInstancePlan(
  snapshot: DesignSystemSnapshot,
  requestInput: unknown,
): ToolkitResult<FigmaInputInstancePlan> {
  const request = figmaInputInstanceRequestSchema.safeParse(requestInput);
  if (!request.success) {
    return createFailureResult(
      createToolkitError({
        code: "VALIDATION_FAILED",
        message: "The Input Instance request is invalid.",
        recoveryInstruction:
          "Provide a stable Instance ID, exact State and Content, bounded visible text and finite placement.",
        target: { logicalId: "input-instance", type: "operation" },
      }),
    );
  }
  const resolved = resolveComponent(snapshot, {
    assetId: request.data.assetId,
    ...(request.data.assetVersion === undefined
      ? {}
      : { assetVersion: request.data.assetVersion }),
    projectId: request.data.projectId,
    variantSelections: request.data.variantSelections,
  });
  if (!resolved.ok) return resolved;
  if (resolved.data.status !== "figma-ready") {
    return createFailureResult(
      createToolkitError({
        code: "IDENTITY_NOT_FOUND",
        message: "The requested Input is not Ready in the Component Registry.",
        recoveryInstruction:
          "Ensure, visually approve and register the Input Component Set before inserting an Instance.",
        target: {
          logicalId: request.data.assetId,
          type: "component",
          version: resolved.data.contract.assetVersion,
        },
      }),
    );
  }
  const { contract, registryEntry, selectedVariant } = resolved.data;
  if (contract.profile !== INPUT_CONTRACT_PROFILE) {
    return createFailureResult(
      createToolkitError({
        code: "IDENTITY_CONFLICT",
        message: "The Input request resolved a non-Input Component profile.",
        recoveryInstruction:
          "Repair the Registry and resolve the exact Input Contract before planning insertion.",
        target: { logicalId: contract.assetId, type: "component" },
      }),
    );
  }
  const inputVariant =
    selectedVariant as InputComponentContract["variants"][number];
  const property = (id: string) =>
    contract.properties.find((candidate) => candidate.id === id);
  const state = property("state");
  const content = property("content");
  const label = property("label");
  const text = property("text");
  const supportingText = property("supporting-text");
  if (
    state?.kind !== "variant" ||
    content?.kind !== "variant" ||
    label?.kind !== "text" ||
    text?.kind !== "text" ||
    supportingText?.kind !== "text"
  ) {
    return createFailureResult(
      createToolkitError({
        code: "INTERNAL_ERROR",
        message: "The verified Input Contract lacks required properties.",
        recoveryInstruction: "Repair and revalidate the Input Contract.",
        target: { logicalId: contract.assetId, type: "component" },
      }),
    );
  }
  const stateValue = state.options.find(
    ({ id }) => id === inputVariant.selections.state,
  )?.figmaValue;
  const contentValue = content.options.find(
    ({ id }) => id === inputVariant.selections.content,
  )?.figmaValue;
  if (stateValue === undefined || contentValue === undefined) {
    return createFailureResult(
      createToolkitError({
        code: "INTERNAL_ERROR",
        message: "The selected Input Variant cannot be mapped to Figma.",
        recoveryInstruction: "Repair and revalidate the Input Contract.",
        target: { logicalId: selectedVariant.id, type: "component" },
      }),
    );
  }
  const root = `${contract.projectId}/component/${contract.assetId}/component-set/major-${String(registryEntry.figma.majorVersion)}`;
  const plan = figmaInputInstancePlanSchema.safeParse({
    componentSet: {
      expectedVariantStableIds: contract.variants.map(
        ({ slotId }) => `${root}/${slotId}`,
      ),
      majorVersion: registryEntry.figma.majorVersion,
      nodeId: registryEntry.figma.locator.nodeId,
      stableId: root,
    },
    instance: {
      stableId: `${contract.projectId}/instance/${request.data.instanceId}`,
      x: request.data.x,
      y: request.data.y,
    },
    properties: {
      content: { name: content.figmaName, value: contentValue },
      label: { name: label.figmaName, value: request.data.label },
      state: { name: state.figmaName, value: stateValue },
      supportingText: {
        name: supportingText.figmaName,
        value: request.data.supportingText,
      },
      text: { name: text.figmaName, value: request.data.text },
    },
    schemaVersion: FIGMA_INPUT_INSTANCE_PLAN_SCHEMA_VERSION,
    selectedVariant: {
      figmaName: `${state.figmaName}=${stateValue}, ${content.figmaName}=${contentValue}`,
      selections: inputVariant.selections,
      slotId: selectedVariant.slotId,
      stableId: `${root}/${selectedVariant.slotId}`,
    },
    source: {
      approvalId: registryEntry.approvalId,
      assetId: contract.assetId,
      assetVersion: contract.assetVersion,
      contentDigest: registryEntry.asset.contentDigest,
      fileBindingId: registryEntry.figma.fileBindingId,
      projectId: contract.projectId,
    },
  });
  return plan.success
    ? createSuccessResult(plan.data)
    : createFailureResult(
        createToolkitError({
          code: "INTERNAL_ERROR",
          message: "The verified Input could not produce a safe Instance plan.",
          recoveryInstruction:
            "Repair the Contract and Registry before retrying.",
          target: { logicalId: contract.assetId, type: "component" },
        }),
      );
}

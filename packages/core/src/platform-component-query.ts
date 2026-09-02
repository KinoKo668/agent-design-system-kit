import * as z from "zod";

import {
  componentResolveQuerySchema,
  resolveComponent,
  type ComponentResolution,
} from "./component-query.js";
import type { DesignSystemSnapshot } from "./design-system-snapshot.js";
import { createToolkitError } from "./errors.js";
import type {
  PlatformComponentRegistryEntry,
  PlatformTarget,
} from "./platform-library.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { FailureResult, ToolkitResult } from "./results.js";
import {
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";
import { toValidationIssues } from "./schema-validation.js";

export const platformComponentResolveQuerySchema = z.strictObject({
  assetId: stableAssetIdSchema,
  assetVersion: strictSemverSchema.optional(),
  platformTargetId: stableAssetIdSchema,
  platformTargetVersion: strictSemverSchema,
  projectId: stableIdSegmentSchema,
  variantSelections: componentResolveQuerySchema.shape.variantSelections,
});

export type PlatformComponentResolveQuery = z.input<
  typeof platformComponentResolveQuerySchema
>;
export type NormalizedPlatformComponentResolveQuery = z.output<
  typeof platformComponentResolveQuerySchema
>;

type ActivePlatformEntry = PlatformComponentRegistryEntry & {
  readonly lifecycle: "active";
};
type ReadyPlatformEntry = ActivePlatformEntry & {
  readonly figma: Extract<
    PlatformComponentRegistryEntry["figma"],
    { readonly status: "ready" }
  >;
};

interface PlatformResolutionBase {
  readonly componentResolution: ComponentResolution;
  readonly platformTarget: PlatformTarget;
  readonly priorityEvaluated: readonly (
    "platform-system" | "official-vendor" | "brand-wrapper" | "hatchkit-managed"
  )[];
  readonly sources: {
    readonly platformRegistrySourcePath: string | null;
    readonly platformTargetSourcePath: string;
  };
}

export interface OfficialPlatformComponentResolution extends PlatformResolutionBase {
  readonly componentKey: string;
  readonly componentName: string;
  readonly libraryKey: string;
  readonly nextAction: "import-official-component-by-key-and-insert-instance";
  readonly platformRegistryEntry: ReadyPlatformEntry;
  readonly status: "official-library-ready";
}

export interface PlatformVerificationRequiredResolution extends PlatformResolutionBase {
  readonly nextAction: "verify-library-keys-and-obtain-human-binding-approval";
  readonly platformRegistryEntry: ActivePlatformEntry & {
    readonly figma: { readonly status: "cataloged" };
  };
  readonly status: "official-library-verification-required";
}

export interface ManagedPlatformFallbackResolution extends PlatformResolutionBase {
  readonly nextAction: ComponentResolution["nextAction"];
  readonly platformRegistryEntry: null;
  readonly status: "hatchkit-managed-fallback";
}

export type PlatformComponentResolution =
  | ManagedPlatformFallbackResolution
  | OfficialPlatformComponentResolution
  | PlatformVerificationRequiredResolution;

function queryFailure(error: z.ZodError): FailureResult {
  const issues = toValidationIssues(error);
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issues } },
      message: `The platform component resolve query contains ${String(issues.length)} validation issue(s).`,
      recoveryInstruction:
        "Use one exact Platform Target version, Component identity, and declared Variant selection.",
      target: { logicalId: "platform-component-resolve", type: "component" },
    }),
  );
}

function targetNotFound(
  query: NormalizedPlatformComponentResolveQuery,
): FailureResult {
  return createFailureResult(
    createToolkitError({
      code: "IDENTITY_NOT_FOUND",
      context: {
        expected: {
          assetId: query.platformTargetId,
          assetVersion: query.platformTargetVersion,
          assetType: "platform-target",
          projectId: query.projectId,
        },
      },
      message: `Platform Target '${query.platformTargetId}@${query.platformTargetVersion}' was not found.`,
      recoveryInstruction:
        "Register and validate the exact Platform Target; do not infer an OS version or reuse another platform.",
      target: {
        logicalId: query.platformTargetId,
        type: "registry",
        version: query.platformTargetVersion,
      },
    }),
  );
}

function strictOfficialBindingMissing(
  query: NormalizedPlatformComponentResolveQuery,
  target: PlatformTarget,
): FailureResult {
  return createFailureResult(
    createToolkitError({
      code: "IDENTITY_NOT_FOUND",
      context: {
        expected: {
          componentId: query.assetId,
          nativeFidelity: "strict",
          platformTargetId: target.assetId,
          platformTargetVersion: target.assetVersion,
          source: "official-vendor",
        },
        missingConditions: ["approved official vendor component mapping"],
      },
      message: `Strict Platform Target '${target.assetId}' has no active official mapping for Component '${query.assetId}'.`,
      recoveryInstruction:
        "Verify the official UI kit and submit a platform binding change for human review; do not insert a managed approximation.",
      target: {
        logicalId: query.assetId,
        type: "component",
        ...(query.assetVersion === undefined
          ? {}
          : { version: query.assetVersion }),
      },
    }),
  );
}

export function resolvePlatformComponent(
  snapshot: DesignSystemSnapshot,
  input: unknown,
): ToolkitResult<PlatformComponentResolution> {
  const queryResult = platformComponentResolveQuerySchema.safeParse(input);
  if (!queryResult.success) return queryFailure(queryResult.error);
  const query = queryResult.data;
  const targetMatches = snapshot.platformTargets.filter(
    ({ data }) =>
      data.projectId === query.projectId &&
      data.assetId === query.platformTargetId &&
      data.assetVersion === query.platformTargetVersion,
  );
  if (targetMatches.length === 0) return targetNotFound(query);
  if (targetMatches.length > 1) {
    return createFailureResult(
      createToolkitError({
        code: "IDENTITY_CONFLICT",
        context: {
          actual: { matchCount: targetMatches.length },
          details: {
            sourcePaths: targetMatches.map(({ sourcePath }) => sourcePath),
          },
        },
        message: "The exact Platform Target resolved to multiple sources.",
        recoveryInstruction:
          "Keep exactly one source for each Platform Target identity and version.",
        target: {
          logicalId: query.platformTargetId,
          type: "registry",
          version: query.platformTargetVersion,
        },
      }),
    );
  }
  const locatedTarget = targetMatches[0];
  if (locatedTarget === undefined) return targetNotFound(query);

  const componentResult = resolveComponent(snapshot, {
    assetId: query.assetId,
    assetVersion: query.assetVersion,
    projectId: query.projectId,
    variantSelections: query.variantSelections,
  });
  if (!componentResult.ok) return componentResult;
  const component = componentResult.data;
  const bindings = snapshot.platformRegistries.flatMap((registry) =>
    registry.data.entries.flatMap((entry) =>
      entry.lifecycle === "active" &&
      entry.component.id === component.contract.assetId &&
      entry.component.version === component.contract.assetVersion &&
      entry.platformTarget.assetId === locatedTarget.data.assetId &&
      entry.platformTarget.assetVersion === locatedTarget.data.assetVersion
        ? [
            {
              entry: entry as ActivePlatformEntry,
              sourcePath: registry.sourcePath,
            },
          ]
        : [],
    ),
  );
  if (bindings.length > 1) {
    return createFailureResult(
      createToolkitError({
        code: "IDENTITY_CONFLICT",
        context: {
          actual: { matchCount: bindings.length },
          details: {
            sourcePaths: bindings.map(({ sourcePath }) => sourcePath),
          },
        },
        message: "The platform component resolved to multiple active bindings.",
        recoveryInstruction:
          "Keep exactly one active platform binding for the Component and Platform Target.",
        target: { logicalId: query.assetId, type: "component" },
      }),
    );
  }
  const binding = bindings[0];
  const common = {
    componentResolution: component,
    platformTarget: locatedTarget.data,
    sources: {
      platformRegistrySourcePath: binding?.sourcePath ?? null,
      platformTargetSourcePath: locatedTarget.sourcePath,
    },
  };
  if (binding?.entry.figma.status === "ready") {
    const mapping = binding.entry.figma.mappings.find(
      ({ variantId }) => variantId === component.selectedVariant.id,
    );
    if (mapping === undefined) {
      return createFailureResult(
        createToolkitError({
          code: "INTERNAL_ERROR",
          message:
            "A validated ready platform binding omitted the selected Variant mapping.",
          recoveryInstruction:
            "Reload and validate the Platform Component Registry before retrying.",
          target: { logicalId: query.assetId, type: "registry" },
        }),
      );
    }
    return createSuccessResult(
      {
        ...common,
        componentKey: mapping.componentKey,
        componentName: mapping.componentName,
        libraryKey: binding.entry.figma.libraryKey,
        nextAction: "import-official-component-by-key-and-insert-instance",
        platformRegistryEntry: binding.entry as ReadyPlatformEntry,
        priorityEvaluated: ["platform-system", "official-vendor"],
        status: "official-library-ready",
      },
      [
        {
          code: "EXTERNAL_LIBRARY_ENABLEMENT_REQUIRED",
          message:
            "The user must have access to and enable the referenced official Figma library.",
          target: {
            logicalId: binding.entry.source.libraryId,
            type: "figma-asset",
          },
        },
      ],
    );
  }
  if (binding !== undefined) {
    return createSuccessResult(
      {
        ...common,
        nextAction: "verify-library-keys-and-obtain-human-binding-approval",
        platformRegistryEntry:
          binding.entry as PlatformVerificationRequiredResolution["platformRegistryEntry"],
        priorityEvaluated: ["platform-system", "official-vendor"],
        status: "official-library-verification-required",
      },
      [
        {
          code: "APPROVAL_GUARD_REQUIRED",
          message:
            "Official kit metadata is cataloged, but exact Figma keys and human binding approval are still required.",
          target: {
            logicalId: binding.entry.source.libraryId,
            type: "approval",
          },
        },
      ],
    );
  }
  if (locatedTarget.data.nativeFidelity === "strict") {
    return strictOfficialBindingMissing(query, locatedTarget.data);
  }
  return createSuccessResult(
    {
      ...common,
      nextAction: component.nextAction,
      platformRegistryEntry: null,
      priorityEvaluated: [
        "platform-system",
        "official-vendor",
        "brand-wrapper",
        "hatchkit-managed",
      ],
      status: "hatchkit-managed-fallback",
    },
    [
      {
        code: "OFFICIAL_COMPONENT_MAPPING_NOT_FOUND",
        details: {
          platformTargetId: locatedTarget.data.assetId,
          platformTargetVersion: locatedTarget.data.assetVersion,
        },
        message:
          "No approved official component mapping exists; the target permits a managed fallback.",
        target: { logicalId: query.assetId, type: "component" },
      },
    ],
  );
}

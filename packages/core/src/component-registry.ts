import * as z from "zod";

import {
  validateButtonComponentContract,
  type ButtonComponentContract,
} from "./button-contract.js";
import { createToolkitError } from "./errors.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { FailureResult, ToolkitResult } from "./results.js";
import {
  contentDigestSchema,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";
import {
  getProvidedSchemaVersion,
  toJsonPointer,
  toValidationIssues,
  type SchemaValidationIssue,
} from "./schema-validation.js";

export const COMPONENT_REGISTRY_SCHEMA_VERSION = "1.0.0" as const;
export const COMPONENT_REGISTRY_TYPE = "component-registry" as const;
export const REGISTRY_LIFECYCLES = ["active", "revoked", "superseded"] as const;
export const FIGMA_BINDING_STATUSES = ["ready", "unbuilt"] as const;

const approvalIdSchema = z
  .string()
  .min(1, "Must not be empty.")
  .max(320, "Must contain at most 320 characters.")
  .regex(
    /^approval\.component\.[a-z0-9.+-]+$/u,
    "Must be a component Approval ID such as approval.component.button.1.0.0.",
  );

const figmaNodeIdSchema = z
  .string()
  .regex(/^\d+:\d+$/u, "Must be a Figma Plugin node ID such as 123:456.");

const figmaPublishedKeySchema = z
  .string()
  .min(8, "Must contain at least 8 characters.")
  .max(256, "Must contain at most 256 characters.")
  .regex(
    /^[a-z0-9_-]+$/iu,
    "Must contain only ASCII letters, digits, underscore or hyphen.",
  );

const lifecycleReasonSchema = z
  .string()
  .min(1, "Must not be empty.")
  .max(1_000, "Must contain at most 1000 characters.")
  .refine((value) => value.trim() === value, {
    message: "Must not start or end with whitespace.",
  });

const registryAssetSchema = z.strictObject({
  contentDigest: contentDigestSchema,
  id: stableAssetIdSchema,
  type: z.literal("component"),
  version: strictSemverSchema,
});

const figmaBindingCommonShape = {
  channel: z.literal("library"),
  fileBindingId: z.uuid(),
  majorVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  role: z.literal("component-set"),
  slotId: z.literal("root"),
};

const unbuiltFigmaBindingSchema = z.strictObject({
  ...figmaBindingCommonShape,
  status: z.literal("unbuilt"),
});

const readyFigmaBindingSchema = z.strictObject({
  ...figmaBindingCommonShape,
  appliedDigest: contentDigestSchema,
  appliedVersion: strictSemverSchema,
  locator: z.strictObject({
    componentSetKey: figmaPublishedKeySchema.optional(),
    nodeId: figmaNodeIdSchema,
  }),
  status: z.literal("ready"),
});

export const componentRegistryFigmaBindingSchema = z.discriminatedUnion(
  "status",
  [unbuiltFigmaBindingSchema, readyFigmaBindingSchema],
);

export const componentRegistryEntrySchema = z.strictObject({
  approvalId: approvalIdSchema,
  asset: registryAssetSchema,
  figma: componentRegistryFigmaBindingSchema,
  lifecycle: z.enum(REGISTRY_LIFECYCLES),
  lifecycleReason: lifecycleReasonSchema.nullable(),
  replacedBy: strictSemverSchema.nullable(),
  supersedes: strictSemverSchema.nullable(),
});

type ComponentRegistryEntry = z.infer<typeof componentRegistryEntrySchema>;

function addIssue(
  context: z.RefinementCtx,
  path: readonly (number | string)[],
  message: string,
): void {
  context.addIssue({ code: "custom", message, path: [...path] });
}

interface ParsedSemver {
  readonly core: readonly [bigint, bigint, bigint];
  readonly prerelease: readonly string[] | undefined;
}

function parseSemver(version: string): ParsedSemver {
  const withoutBuild = version.split("+", 1)[0] ?? version;
  const prereleaseSeparator = withoutBuild.indexOf("-");
  const corePart =
    prereleaseSeparator === -1
      ? withoutBuild
      : withoutBuild.slice(0, prereleaseSeparator);
  const prereleasePart =
    prereleaseSeparator === -1
      ? undefined
      : withoutBuild.slice(prereleaseSeparator + 1);
  const [major = "0", minor = "0", patch = "0"] = corePart.split(".");
  return {
    core: [BigInt(major), BigInt(minor), BigInt(patch)],
    prerelease: prereleasePart?.split("."),
  };
}

function comparePrereleaseIdentifiers(left: string, right: string): number {
  const numericPattern = /^\d+$/u;
  const leftNumeric = numericPattern.test(left);
  const rightNumeric = numericPattern.test(right);
  if (leftNumeric && rightNumeric) {
    const leftNumber = BigInt(left);
    const rightNumber = BigInt(right);
    return leftNumber < rightNumber ? -1 : leftNumber > rightNumber ? 1 : 0;
  }
  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

export function compareSemanticVersions(left: string, right: string): number {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);
  for (let index = 0; index < leftVersion.core.length; index += 1) {
    const leftPart = leftVersion.core[index];
    const rightPart = rightVersion.core[index];
    if (leftPart !== rightPart) {
      return (leftPart ?? 0n) < (rightPart ?? 0n) ? -1 : 1;
    }
  }

  if (leftVersion.prerelease === undefined) {
    return rightVersion.prerelease === undefined ? 0 : 1;
  }
  if (rightVersion.prerelease === undefined) {
    return -1;
  }

  const length = Math.max(
    leftVersion.prerelease.length,
    rightVersion.prerelease.length,
  );
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];
    if (leftIdentifier === undefined) {
      return -1;
    }
    if (rightIdentifier === undefined) {
      return 1;
    }
    const comparison = comparePrereleaseIdentifiers(
      leftIdentifier,
      rightIdentifier,
    );
    if (comparison !== 0) {
      return comparison;
    }
  }
  return 0;
}

function expectedApprovalId(entry: ComponentRegistryEntry): string {
  const encodedAssetId = entry.asset.id.replaceAll("/", ".");
  return `approval.component.${encodedAssetId}.${entry.asset.version}`;
}

function validateEntryState(
  entry: ComponentRegistryEntry,
  entryIndex: number,
  context: z.RefinementCtx,
): void {
  if (entry.approvalId !== expectedApprovalId(entry)) {
    addIssue(
      context,
      ["entries", entryIndex, "approvalId"],
      `Approval ID must be '${expectedApprovalId(entry)}'.`,
    );
  }

  if (
    BigInt(entry.figma.majorVersion) !==
    parseSemver(entry.asset.version).core[0]
  ) {
    addIssue(
      context,
      ["entries", entryIndex, "figma", "majorVersion"],
      "Figma majorVersion must match the Component asset major version.",
    );
  }

  if (entry.figma.status === "ready") {
    if (entry.figma.appliedVersion !== entry.asset.version) {
      addIssue(
        context,
        ["entries", entryIndex, "figma", "appliedVersion"],
        "A ready Figma binding must match the registered asset version.",
      );
    }
    if (entry.figma.appliedDigest !== entry.asset.contentDigest) {
      addIssue(
        context,
        ["entries", entryIndex, "figma", "appliedDigest"],
        "A ready Figma binding must match the registered content digest.",
      );
    }
  }

  if (entry.lifecycle === "active") {
    if (entry.replacedBy !== null) {
      addIssue(
        context,
        ["entries", entryIndex, "replacedBy"],
        "An active Registry entry must not be replaced by another version.",
      );
    }
    if (entry.lifecycleReason !== null) {
      addIssue(
        context,
        ["entries", entryIndex, "lifecycleReason"],
        "An active Registry entry must not carry an inactive lifecycle reason.",
      );
    }
    return;
  }

  if (entry.lifecycleReason === null) {
    addIssue(
      context,
      ["entries", entryIndex, "lifecycleReason"],
      `A ${entry.lifecycle} Registry entry must explain why it is inactive.`,
    );
  }
  if (entry.lifecycle === "superseded" && entry.replacedBy === null) {
    addIssue(
      context,
      ["entries", entryIndex, "replacedBy"],
      "A superseded Registry entry must identify its replacement version.",
    );
  }
}

function validateVersionRelationships(
  entries: readonly ComponentRegistryEntry[],
  context: z.RefinementCtx,
): void {
  const entryIndex = new Map<
    string,
    { entry: ComponentRegistryEntry; index: number }
  >();
  entries.forEach((entry, index) => {
    const key = `${entry.asset.id}@${entry.asset.version}`;
    if (entryIndex.has(key)) {
      addIssue(
        context,
        ["entries", index, "asset", "version"],
        `Duplicate Registry asset version '${key}'.`,
      );
      return;
    }
    entryIndex.set(key, { entry, index });
  });

  entries.forEach((entry, index) => {
    if (entry.supersedes !== null) {
      const target = entryIndex.get(`${entry.asset.id}@${entry.supersedes}`);
      if (target === undefined) {
        addIssue(
          context,
          ["entries", index, "supersedes"],
          `Superseded version '${entry.supersedes}' does not exist in the Registry.`,
        );
      } else {
        if (
          compareSemanticVersions(
            target.entry.asset.version,
            entry.asset.version,
          ) >= 0
        ) {
          addIssue(
            context,
            ["entries", index, "supersedes"],
            "supersedes must point to a lower version.",
          );
        }
        if (target.entry.replacedBy !== entry.asset.version) {
          addIssue(
            context,
            ["entries", index, "supersedes"],
            "supersedes and replacedBy must form a reciprocal relationship.",
          );
        }
      }
    }

    if (entry.replacedBy !== null) {
      const target = entryIndex.get(`${entry.asset.id}@${entry.replacedBy}`);
      if (target === undefined) {
        addIssue(
          context,
          ["entries", index, "replacedBy"],
          `Replacement version '${entry.replacedBy}' does not exist in the Registry.`,
        );
      } else {
        if (
          compareSemanticVersions(
            entry.asset.version,
            target.entry.asset.version,
          ) >= 0
        ) {
          addIssue(
            context,
            ["entries", index, "replacedBy"],
            "replacedBy must point to a higher version.",
          );
        }
        if (target.entry.supersedes !== entry.asset.version) {
          addIssue(
            context,
            ["entries", index, "replacedBy"],
            "replacedBy and supersedes must form a reciprocal relationship.",
          );
        }
      }
    }
  });
}

function validateActiveEntries(
  entries: readonly ComponentRegistryEntry[],
  context: z.RefinementCtx,
): void {
  const activeByAsset = new Map<string, number>();
  entries.forEach((entry, index) => {
    if (entry.lifecycle !== "active") {
      return;
    }
    const previousIndex = activeByAsset.get(entry.asset.id);
    if (previousIndex !== undefined) {
      addIssue(
        context,
        ["entries", index, "lifecycle"],
        `Component '${entry.asset.id}' already has an active version at entries[${String(previousIndex)}].`,
      );
    }
    activeByAsset.set(entry.asset.id, index);
  });
}

function validateApprovalIdentities(
  entries: readonly ComponentRegistryEntry[],
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    if (seen.has(entry.approvalId)) {
      addIssue(
        context,
        ["entries", index, "approvalId"],
        `Duplicate Approval ID '${entry.approvalId}'.`,
      );
    }
    seen.add(entry.approvalId);
  });
}

function validatePhysicalBindings(
  entries: readonly ComponentRegistryEntry[],
  context: z.RefinementCtx,
): void {
  const locators = new Map<string, string>();
  const publishedKeys = new Map<string, string>();
  entries.forEach((entry, index) => {
    if (entry.figma.status !== "ready") {
      return;
    }
    const track = `${entry.asset.id}@${String(entry.figma.majorVersion)}`;
    const locator = `${entry.figma.fileBindingId}/${entry.figma.locator.nodeId}`;
    const existingTrack = locators.get(locator);
    if (existingTrack !== undefined && existingTrack !== track) {
      addIssue(
        context,
        ["entries", index, "figma", "locator", "nodeId"],
        `Figma locator is already assigned to physical track '${existingTrack}'.`,
      );
    }
    locators.set(locator, track);

    const key = entry.figma.locator.componentSetKey;
    if (key === undefined) {
      return;
    }
    const existingKeyTrack = publishedKeys.get(key);
    if (existingKeyTrack !== undefined && existingKeyTrack !== track) {
      addIssue(
        context,
        ["entries", index, "figma", "locator", "componentSetKey"],
        `Published Component Set key is already assigned to physical track '${existingKeyTrack}'.`,
      );
    }
    publishedKeys.set(key, track);
  });
}

export const componentRegistrySchema = z
  .strictObject({
    entries: z.array(componentRegistryEntrySchema).min(1).max(5_000),
    projectId: stableIdSegmentSchema,
    registryType: z.literal(COMPONENT_REGISTRY_TYPE),
    schemaVersion: z.literal(COMPONENT_REGISTRY_SCHEMA_VERSION),
  })
  .superRefine((registry, context) => {
    registry.entries.forEach((entry, index) =>
      validateEntryState(entry, index, context),
    );
    validateVersionRelationships(registry.entries, context);
    validateActiveEntries(registry.entries, context);
    validateApprovalIdentities(registry.entries, context);
    validatePhysicalBindings(registry.entries, context);
  });

export type ComponentRegistry = z.infer<typeof componentRegistrySchema>;
export type ComponentRegistryValidationIssue = SchemaValidationIssue;

function validationFailure(
  issues: readonly SchemaValidationIssue[],
  message: string,
): FailureResult {
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issues } },
      message,
      recoveryInstruction:
        "Correct the fields listed in context.details.issues and validate again.",
      target: {
        logicalId: "component-registry",
        type: "registry",
      },
    }),
  );
}

export function validateComponentRegistry(
  input: unknown,
): ToolkitResult<ComponentRegistry> {
  const providedVersion = getProvidedSchemaVersion(input);
  if (
    providedVersion !== undefined &&
    providedVersion.schemaVersion !== COMPONENT_REGISTRY_SCHEMA_VERSION
  ) {
    return createFailureResult(
      createToolkitError({
        code: "SCHEMA_VERSION_UNSUPPORTED",
        context: {
          actual: providedVersion,
          expected: { schemaVersion: COMPONENT_REGISTRY_SCHEMA_VERSION },
        },
        message: "The Component Registry schema version is not supported.",
        recoveryInstruction:
          "Use Component Registry schema version 1.0.0 or run a registered migration.",
        target: {
          logicalId: "component-registry-schema",
          type: "schema",
          version: providedVersion.schemaVersion,
        },
      }),
    );
  }

  const result = componentRegistrySchema.safeParse(input);
  if (result.success) {
    return createSuccessResult(result.data);
  }
  const issues = toValidationIssues(result.error);
  return validationFailure(
    issues,
    `The Component Registry contains ${String(issues.length)} validation issue(s).`,
  );
}

function validateContractAssociation(
  registry: ComponentRegistry,
  contract: ButtonComponentContract,
): readonly SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];
  if (registry.projectId !== contract.projectId) {
    issues.push({
      code: "custom",
      message: `Registry project '${registry.projectId}' does not match Contract project '${contract.projectId}'.`,
      path: "/projectId",
    });
  }

  const entryIndex = registry.entries.findIndex(
    (entry) =>
      entry.asset.id === contract.assetId &&
      entry.asset.version === contract.assetVersion,
  );
  if (entryIndex === -1) {
    issues.push({
      code: "custom",
      message: `Registry does not contain Component '${contract.assetId}@${contract.assetVersion}'.`,
      path: "/entries",
    });
    return issues;
  }

  const entry = registry.entries[entryIndex];
  if (entry === undefined) {
    return issues;
  }
  if (contract.contentDigest === undefined) {
    issues.push({
      code: "custom",
      message:
        "A Component must have a verified contentDigest before registration.",
      path: toJsonPointer(["entries", entryIndex, "asset", "contentDigest"]),
    });
  } else if (entry.asset.contentDigest !== contract.contentDigest) {
    issues.push({
      code: "custom",
      message: "Registry content digest does not match the Component Contract.",
      path: toJsonPointer(["entries", entryIndex, "asset", "contentDigest"]),
    });
  }
  return issues;
}

export function validateComponentRegistryWithButtonContract(
  registryInput: unknown,
  contractInput: unknown,
): ToolkitResult<ComponentRegistry> {
  const registryResult = validateComponentRegistry(registryInput);
  if (!registryResult.ok) {
    return registryResult;
  }

  const contractResult = validateButtonComponentContract(contractInput);
  if (!contractResult.ok) {
    return contractResult;
  }

  const issues = validateContractAssociation(
    registryResult.data,
    contractResult.data,
  );
  return issues.length === 0
    ? createSuccessResult(registryResult.data)
    : validationFailure(
        issues,
        `The Component Registry has ${String(issues.length)} Contract association issue(s).`,
      );
}

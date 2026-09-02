import {
  canonicalizeJson,
  type ErrorCode,
  type FigmaInputInstancePlan,
} from "@agent-design-system-kit/core";

import type {
  ButtonInstanceComponentPort,
  ButtonInstanceComponentSetPort,
  ButtonInstanceNodePort,
  FigmaButtonInstancePort,
  InsertButtonInstanceContext,
} from "./button-instance-writer.js";
import {
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
  getFigmaLibraryFileBinding,
  type SharedPluginDataPort,
} from "./variables-writer.js";

interface ComponentMarker {
  readonly appliedDigest?: string;
  readonly approvalId?: string;
  readonly assetId: string;
  readonly assetVersion?: string;
  readonly channel: "library";
  readonly majorVersion: number;
  readonly phase: "applied" | "creating";
  readonly projectId: string;
  readonly role: "component-set" | "component-variant";
  readonly schemaVersion: "1.0.0";
  readonly slotId: string;
}

interface InputInstanceMarker {
  readonly approvalId: string;
  readonly assetId: string;
  readonly assetType: "component-instance";
  readonly assetVersion: string;
  readonly componentSetStableId: string;
  readonly content: string;
  readonly contentDigest: string;
  readonly instanceStableId: string;
  readonly label: string;
  readonly phase: "applied" | "creating";
  readonly projectId: string;
  readonly schemaVersion: "1.0.0";
  readonly state: string;
  readonly supportingText: string;
  readonly text: string;
  readonly variantStableId: string;
  readonly x: number;
  readonly y: number;
}

interface InputProperties {
  readonly content: string;
  readonly label: string;
  readonly state: string;
  readonly supportingText: string;
  readonly text: string;
}

export interface InsertInputInstanceResult {
  readonly componentSet: { readonly nodeId: string; readonly stableId: string };
  readonly instance: {
    readonly action: "created" | "recovered" | "unchanged";
    readonly nodeId: string;
    readonly stableId: string;
  };
  readonly type: "instances.input.insert";
  readonly variant: { readonly stableId: string };
}

export class InputInstanceWriterError extends Error {
  readonly code: ErrorCode;
  readonly completedSteps: readonly string[];
  readonly recoveryInstruction: string;

  constructor(input: {
    readonly code: ErrorCode;
    readonly completedSteps?: readonly string[];
    readonly message: string;
    readonly recoveryInstruction: string;
  }) {
    super(input.message);
    this.name = "InputInstanceWriterError";
    this.code = input.code;
    this.completedSteps = input.completedSteps ?? [];
    this.recoveryInstruction = input.recoveryInstruction;
  }
}

function fail(
  code: ErrorCode,
  message: string,
  recoveryInstruction: string,
  completedSteps: readonly string[] = [],
): InputInstanceWriterError {
  return new InputInstanceWriterError({
    code,
    completedSteps,
    message,
    recoveryInstruction,
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMarker(
  entity: SharedPluginDataPort,
): Record<string, unknown> | null {
  try {
    const value = JSON.parse(
      entity.getSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
      ) || "null",
    ) as unknown;
    return record(value) ? value : null;
  } catch {
    return null;
  }
}

function componentMarker(entity: SharedPluginDataPort): ComponentMarker | null {
  const value = readMarker(entity);
  return value?.assetType === "component" &&
    value.schemaVersion === "1.0.0" &&
    value.channel === "library" &&
    typeof value.projectId === "string" &&
    typeof value.assetId === "string" &&
    Number.isSafeInteger(value.majorVersion) &&
    (value.role === "component-set" || value.role === "component-variant") &&
    typeof value.slotId === "string" &&
    (value.phase === "applied" || value.phase === "creating")
    ? (value as unknown as ComponentMarker)
    : null;
}

function instanceMarker(
  entity: SharedPluginDataPort,
): InputInstanceMarker | null {
  const value = readMarker(entity);
  return value?.assetType === "component-instance" &&
    value.schemaVersion === "1.0.0" &&
    typeof value.instanceStableId === "string" &&
    (value.phase === "applied" || value.phase === "creating")
    ? (value as unknown as InputInstanceMarker)
    : null;
}

function componentMatches(
  value: ComponentMarker | null,
  plan: FigmaInputInstancePlan,
  role: ComponentMarker["role"],
  slotId: string,
): boolean {
  return (
    value?.phase === "applied" &&
    value.projectId === plan.source.projectId &&
    value.assetId === plan.source.assetId &&
    value.assetVersion === plan.source.assetVersion &&
    value.appliedDigest === plan.source.contentDigest &&
    value.approvalId === plan.source.approvalId &&
    value.majorVersion === plan.componentSet.majorVersion &&
    value.role === role &&
    value.slotId === slotId
  );
}

function expectedMarker(
  plan: FigmaInputInstancePlan,
  context: InsertButtonInstanceContext,
  phase: InputInstanceMarker["phase"],
): InputInstanceMarker {
  return {
    approvalId: context.approvalId,
    assetId: plan.source.assetId,
    assetType: "component-instance",
    assetVersion: plan.source.assetVersion,
    componentSetStableId: plan.componentSet.stableId,
    content: plan.properties.content.value,
    contentDigest: plan.source.contentDigest,
    instanceStableId: plan.instance.stableId,
    label: plan.properties.label.value,
    phase,
    projectId: plan.source.projectId,
    schemaVersion: "1.0.0",
    state: plan.properties.state.value,
    supportingText: plan.properties.supportingText.value,
    text: plan.properties.text.value,
    variantStableId: plan.selectedVariant.stableId,
    x: plan.instance.x,
    y: plan.instance.y,
  };
}

function setMarker(
  entity: SharedPluginDataPort,
  value: InputInstanceMarker,
): void {
  entity.setSharedPluginData(
    HATCHKIT_SHARED_NAMESPACE,
    MANAGED_ASSET_SHARED_KEY,
    canonicalizeJson(value),
  );
}

function assertFile(
  port: FigmaButtonInstancePort,
  plan: FigmaInputInstancePlan,
  context: InsertButtonInstanceContext,
): void {
  const binding = getFigmaLibraryFileBinding(port.document);
  if (
    binding === null ||
    binding.projectId !== context.projectId ||
    binding.fileBindingId !== context.fileBindingId ||
    plan.source.fileBindingId !== context.fileBindingId ||
    context.approvalId !== plan.source.approvalId
  ) {
    throw fail(
      "FILE_BINDING_MISMATCH",
      "The open Figma file or approval does not match the planned Input library.",
      "Open the registered library file and use the exact approved Input plan.",
    );
  }
}

async function resolveSet(
  port: FigmaButtonInstancePort,
  plan: FigmaInputInstancePlan,
): Promise<ButtonInstanceComponentSetPort> {
  const direct = await port.getComponentSetById(plan.componentSet.nodeId);
  if (
    direct !== null &&
    componentMatches(componentMarker(direct), plan, "component-set", "root")
  ) {
    return direct;
  }
  const matches = (await port.getComponentSets()).filter((candidate) =>
    componentMatches(componentMarker(candidate), plan, "component-set", "root"),
  );
  if (matches.length !== 1) {
    throw fail(
      matches.length === 0 ? "IDENTITY_NOT_FOUND" : "IDENTITY_CONFLICT",
      `Expected one approved Input Component Set, found ${String(matches.length)}.`,
      "Repair the Input Registry locator or managed Figma identity before retrying.",
    );
  }
  const resolved = matches[0];
  if (resolved === undefined) throw new Error("Input Set resolution drifted.");
  return resolved;
}

function expectedVariantName(slotId: string): string | null {
  const match =
    /^variant\/state-(default|focused|error|disabled)\/content-(empty|filled)$/u.exec(
      slotId,
    );
  if (match === null) return null;
  const state = match[1];
  const content = match[2];
  if (state === undefined || content === undefined) return null;
  return `State=${state.charAt(0).toUpperCase()}${state.slice(1)}, Content=${content.charAt(0).toUpperCase()}${content.slice(1)}`;
}

function findProperty(
  definitions: ButtonInstanceComponentSetPort["componentPropertyDefinitions"],
  baseName: string,
  type: "TEXT" | "VARIANT",
): string {
  const matches = Object.entries(definitions).filter(
    ([name, definition]) =>
      definition.type === type &&
      (name === baseName || name.startsWith(`${baseName}#`)),
  );
  if (matches.length !== 1 || matches[0] === undefined) {
    throw fail(
      "CONTENT_DIGEST_CONFLICT",
      `The approved Input property '${baseName}' is missing or ambiguous.`,
      "Run the approved Input ensure and audit before inserting an Instance.",
    );
  }
  return matches[0][0];
}

function auditSet(
  set: ButtonInstanceComponentSetPort,
  plan: FigmaInputInstancePlan,
): {
  readonly properties: InputProperties;
  readonly variant: ButtonInstanceComponentPort;
} {
  const identities = set.children.map((child) => ({
    child,
    marker: componentMarker(child),
  }));
  const actual = identities
    .filter(({ marker }) =>
      marker === null
        ? false
        : componentMatches(marker, plan, "component-variant", marker.slotId),
    )
    .map(
      ({ marker }) => `${plan.componentSet.stableId}/${marker?.slotId ?? ""}`,
    );
  if (
    set.children.length !== 8 ||
    canonicalizeJson([...actual].sort()) !==
      canonicalizeJson(
        [...plan.componentSet.expectedVariantStableIds].sort(),
      ) ||
    identities.some(({ child, marker }) =>
      marker === null
        ? true
        : child.name !== expectedVariantName(marker.slotId),
    )
  ) {
    throw fail(
      "IDENTITY_CONFLICT",
      "The Input Component Set no longer matches the approved 4 × 2 Variant matrix.",
      "Run the approved Input ensure and audit before inserting an Instance.",
    );
  }
  const selected = identities.filter(({ marker }) =>
    componentMatches(
      marker,
      plan,
      "component-variant",
      plan.selectedVariant.slotId,
    ),
  );
  const variant = selected[0]?.child;
  if (
    selected.length !== 1 ||
    variant === undefined ||
    variant.name !== plan.selectedVariant.figmaName
  ) {
    throw fail(
      selected.length === 0 ? "IDENTITY_NOT_FOUND" : "IDENTITY_CONFLICT",
      "The selected approved Input Variant is missing, duplicated, or renamed.",
      "Repair the Input Component Set before inserting an Instance.",
    );
  }
  const definitions = set.componentPropertyDefinitions;
  const properties = {
    content: findProperty(definitions, plan.properties.content.name, "VARIANT"),
    label: findProperty(definitions, plan.properties.label.name, "TEXT"),
    state: findProperty(definitions, plan.properties.state.name, "VARIANT"),
    supportingText: findProperty(
      definitions,
      plan.properties.supportingText.name,
      "TEXT",
    ),
    text: findProperty(definitions, plan.properties.text.name, "TEXT"),
  };
  const stateOptions = definitions[properties.state]?.variantOptions;
  const contentOptions = definitions[properties.content]?.variantOptions;
  if (
    canonicalizeJson([...(stateOptions ?? [])].sort()) !==
      canonicalizeJson(["Default", "Disabled", "Error", "Focused"]) ||
    canonicalizeJson([...(contentOptions ?? [])].sort()) !==
      canonicalizeJson(["Empty", "Filled"])
  ) {
    throw fail(
      "CONTENT_DIGEST_CONFLICT",
      "The Input State or Content property options drifted from the Contract.",
      "Run the approved Input ensure before inserting an Instance.",
    );
  }
  return { properties, variant };
}

function propertyValues(
  plan: FigmaInputInstancePlan,
  properties: InputProperties,
): Readonly<Record<string, string>> {
  return {
    [properties.content]: plan.properties.content.value,
    [properties.label]: plan.properties.label.value,
    [properties.state]: plan.properties.state.value,
    [properties.supportingText]: plan.properties.supportingText.value,
    [properties.text]: plan.properties.text.value,
  };
}

function hasDrift(
  instance: ButtonInstanceNodePort,
  expected: Readonly<Record<string, string>>,
  plan: FigmaInputInstancePlan,
): boolean {
  const actual = instance.getProperties();
  return (
    Object.entries(expected).some(([name, value]) => actual[name] !== value) ||
    instance.x !== plan.instance.x ||
    instance.y !== plan.instance.y
  );
}

export async function insertFigmaInputInstance(
  port: FigmaButtonInstancePort,
  plan: FigmaInputInstancePlan,
  context: InsertButtonInstanceContext,
): Promise<InsertInputInstanceResult> {
  const completedSteps: string[] = [];
  let mutated = false;
  let recovering = false;
  try {
    assertFile(port, plan, context);
    const set = await resolveSet(port, plan);
    const audited = auditSet(set, plan);
    completedSteps.push("component-set-resolved", "variant-audited");
    const matches = (await port.getInstances()).filter(
      (candidate) =>
        instanceMarker(candidate)?.instanceStableId === plan.instance.stableId,
    );
    if (matches.length > 1) {
      throw fail(
        "IDENTITY_CONFLICT",
        "More than one Input Instance uses the requested stable identity.",
        "Resolve duplicate managed Instances before retrying.",
      );
    }
    let instance = matches[0];
    const creating = expectedMarker(plan, context, "creating");
    const applied = expectedMarker(plan, context, "applied");
    if (instance === undefined) {
      instance = audited.variant.createInstance();
      mutated = true;
      setMarker(instance, creating);
      port.appendToCurrentPage(instance);
      completedSteps.push("instance-created");
    } else {
      const existing = instanceMarker(instance);
      if (
        existing === null ||
        (canonicalizeJson(existing) !== canonicalizeJson(creating) &&
          canonicalizeJson(existing) !== canonicalizeJson(applied))
      ) {
        throw fail(
          "IDENTITY_CONFLICT",
          "The stable Input Instance identity belongs to different content.",
          "Use a new Instance ID or restore the original approved request.",
        );
      }
      recovering = existing.phase === "creating";
    }
    if ((await instance.getMainComponentId()) !== audited.variant.id) {
      throw fail(
        "IDENTITY_CONFLICT",
        "The managed Input Instance is detached or points to another Main Component.",
        "Replace it only through an explicit reviewed migration.",
        completedSteps,
      );
    }
    const expectedProperties = propertyValues(plan, audited.properties);
    if (
      !mutated &&
      !recovering &&
      hasDrift(instance, expectedProperties, plan)
    ) {
      throw fail(
        "CONTENT_DIGEST_CONFLICT",
        "The managed Input Instance drifted from its approved properties or placement.",
        "Review the page change and use an explicit migration instead of overwriting it.",
      );
    }
    if (!mutated && !recovering) {
      return {
        componentSet: { nodeId: set.id, stableId: plan.componentSet.stableId },
        instance: {
          action: "unchanged",
          nodeId: instance.id,
          stableId: plan.instance.stableId,
        },
        type: "instances.input.insert",
        variant: { stableId: plan.selectedVariant.stableId },
      };
    }
    instance.setProperties(expectedProperties);
    instance.x = plan.instance.x;
    instance.y = plan.instance.y;
    instance.name = `Input · ${plan.instance.stableId.split("/").at(-1) ?? "instance"}`;
    setMarker(instance, applied);
    completedSteps.push("properties-applied", "instance-audited");
    return {
      componentSet: { nodeId: set.id, stableId: plan.componentSet.stableId },
      instance: {
        action: mutated ? "created" : "recovered",
        nodeId: instance.id,
        stableId: plan.instance.stableId,
      },
      type: "instances.input.insert",
      variant: { stableId: plan.selectedVariant.stableId },
    };
  } catch (cause) {
    if (cause instanceof InputInstanceWriterError && !mutated && !recovering) {
      throw cause;
    }
    const partial = mutated || recovering;
    throw fail(
      partial ? "PARTIAL_WRITE" : "INTERNAL_ERROR",
      partial
        ? "The Input Instance write stopped after creating a managed node."
        : "The Input Instance writer failed before creating a node.",
      partial
        ? "Retry the same approved command; its creating marker will resume without duplication."
        : "Inspect the local Plugin diagnostics before retrying.",
      completedSteps,
    );
  }
}

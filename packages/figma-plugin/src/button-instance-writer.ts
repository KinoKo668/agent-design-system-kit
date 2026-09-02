import {
  canonicalizeJson,
  type ErrorCode,
  type FigmaButtonInstancePlan,
  type FigmaIconInstancePlan,
} from "@agent-design-system-kit/core";

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
  readonly assetType: "component";
  readonly assetVersion?: string;
  readonly channel: "library";
  readonly majorVersion: number;
  readonly phase: "applied" | "creating";
  readonly projectId: string;
  readonly role: "component-set" | "component-variant";
  readonly schemaVersion: "1.0.0";
  readonly slotId: string;
}

interface InstanceMarker {
  readonly approvalId: string;
  readonly assetId: string;
  readonly assetType: "component-instance";
  readonly assetVersion: string;
  readonly componentSetStableId: string;
  readonly contentDigest: string;
  readonly instanceStableId: string;
  readonly label: string;
  readonly phase: "applied" | "creating";
  readonly projectId: string;
  readonly schemaVersion: "1.0.0";
  readonly variantStableId: string;
  readonly x: number;
  readonly y: number;
}

interface IconInstanceMarker {
  readonly approvalId: string;
  readonly assetId: string;
  readonly assetType: "component-instance";
  readonly assetVersion: string;
  readonly componentSetStableId: string;
  readonly contentDigest: string;
  readonly instanceStableId: string;
  readonly phase: "applied" | "creating";
  readonly projectId: string;
  readonly schemaVersion: "1.0.0";
  readonly size: string;
  readonly variantStableId: string;
  readonly x: number;
  readonly y: number;
}

type ManagedInstanceMarker = InstanceMarker | IconInstanceMarker;
type InstancePlan = FigmaButtonInstancePlan | FigmaIconInstancePlan;

export interface ButtonInstanceNodePort extends SharedPluginDataPort {
  readonly id: string;
  name: string;
  x: number;
  y: number;
  getMainComponentId(): Promise<string | null>;
  getProperties(): Readonly<Record<string, string | boolean>>;
  setProperties(properties: Readonly<Record<string, string>>): void;
}

export interface ButtonInstanceComponentPort extends SharedPluginDataPort {
  readonly id: string;
  readonly name: string;
  createInstance(): ButtonInstanceNodePort;
}

export interface ButtonInstanceComponentSetPort extends SharedPluginDataPort {
  readonly children: readonly ButtonInstanceComponentPort[];
  readonly componentPropertyDefinitions: Readonly<
    Record<
      string,
      {
        readonly type:
          "BOOLEAN" | "INSTANCE_SWAP" | "SLOT" | "TEXT" | "VARIANT";
        readonly variantOptions?: readonly string[];
      }
    >
  >;
  readonly id: string;
}

export interface FigmaButtonInstancePort {
  readonly document: SharedPluginDataPort;
  appendToCurrentPage(instance: ButtonInstanceNodePort): void;
  getComponentSetById(
    nodeId: string,
  ): Promise<ButtonInstanceComponentSetPort | null>;
  getComponentSets(): Promise<readonly ButtonInstanceComponentSetPort[]>;
  getInstances(): Promise<readonly ButtonInstanceNodePort[]>;
}

export interface InsertButtonInstanceContext {
  readonly approvalId: string;
  readonly fileBindingId: string;
  readonly operationId: string;
  readonly projectId: string;
}

export interface InsertButtonInstanceResult {
  readonly componentSet: { readonly nodeId: string; readonly stableId: string };
  readonly instance: {
    readonly action: "created" | "recovered" | "unchanged";
    readonly nodeId: string;
    readonly stableId: string;
  };
  readonly type: "instances.button.insert";
  readonly variant: { readonly stableId: string };
}

export interface InsertIconInstanceResult {
  readonly componentSet: { readonly nodeId: string; readonly stableId: string };
  readonly instance: {
    readonly action: "created" | "recovered" | "unchanged";
    readonly nodeId: string;
    readonly stableId: string;
  };
  readonly type: "instances.icon.insert";
  readonly variant: { readonly stableId: string };
}

export class ButtonInstanceWriterError extends Error {
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
    this.name = "ButtonInstanceWriterError";
    this.code = input.code;
    this.completedSteps = input.completedSteps ?? [];
    this.recoveryInstruction = input.recoveryInstruction;
  }
}

export class IconInstanceWriterError extends ButtonInstanceWriterError {
  constructor(
    input: ConstructorParameters<typeof ButtonInstanceWriterError>[0],
  ) {
    super(input);
    this.name = "IconInstanceWriterError";
  }
}

function fail(
  code: ErrorCode,
  message: string,
  recoveryInstruction: string,
  completedSteps: readonly string[] = [],
): ButtonInstanceWriterError {
  return new ButtonInstanceWriterError({
    code,
    completedSteps,
    message,
    recoveryInstruction,
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function marker(entity: SharedPluginDataPort): Record<string, unknown> | null {
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
  const value = marker(entity);
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

function instanceMarker(entity: SharedPluginDataPort): InstanceMarker | null {
  const value = marker(entity);
  return value?.assetType === "component-instance" &&
    value.schemaVersion === "1.0.0" &&
    typeof value.instanceStableId === "string" &&
    (value.phase === "applied" || value.phase === "creating")
    ? (value as unknown as InstanceMarker)
    : null;
}

function managedInstanceMarker(
  entity: SharedPluginDataPort,
): ManagedInstanceMarker | null {
  const value = marker(entity);
  return value?.assetType === "component-instance" &&
    value.schemaVersion === "1.0.0" &&
    typeof value.instanceStableId === "string" &&
    (value.phase === "applied" || value.phase === "creating")
    ? (value as unknown as ManagedInstanceMarker)
    : null;
}

function expectedInstanceMarker(
  plan: FigmaButtonInstancePlan,
  context: InsertButtonInstanceContext,
  phase: "applied" | "creating",
): InstanceMarker {
  return {
    approvalId: context.approvalId,
    assetId: plan.source.assetId,
    assetType: "component-instance",
    assetVersion: plan.source.assetVersion,
    componentSetStableId: plan.componentSet.stableId,
    contentDigest: plan.source.contentDigest,
    instanceStableId: plan.instance.stableId,
    label: plan.properties.label.value,
    phase,
    projectId: plan.source.projectId,
    schemaVersion: "1.0.0",
    variantStableId: plan.selectedVariant.stableId,
    x: plan.instance.x,
    y: plan.instance.y,
  };
}

function setMarker(
  entity: SharedPluginDataPort,
  value: ManagedInstanceMarker,
): void {
  entity.setSharedPluginData(
    HATCHKIT_SHARED_NAMESPACE,
    MANAGED_ASSET_SHARED_KEY,
    canonicalizeJson(value),
  );
}

function componentMatches(
  value: ComponentMarker | null,
  plan: InstancePlan,
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

function assertFile(
  port: FigmaButtonInstancePort,
  plan: InstancePlan,
  context: InsertButtonInstanceContext,
): void {
  const binding = getFigmaLibraryFileBinding(port.document);
  if (
    binding === null ||
    binding.projectId !== context.projectId ||
    binding.fileBindingId !== context.fileBindingId ||
    plan.source.fileBindingId !== context.fileBindingId
  ) {
    throw fail(
      "FILE_BINDING_MISMATCH",
      "The open Figma file is not the Registry-bound component library.",
      "Open the registered library file before inserting this Instance.",
    );
  }
}

async function resolveSet(
  port: FigmaButtonInstancePort,
  plan: InstancePlan,
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
      `Expected one audited Component Set, found ${String(matches.length)}.`,
      "Repair the managed Component identity or Registry locator before retrying.",
    );
  }
  const resolved = matches[0];
  if (resolved === undefined)
    throw new Error("Component Set resolution drifted.");
  return resolved;
}

function expectedIconInstanceMarker(
  plan: FigmaIconInstancePlan,
  context: InsertButtonInstanceContext,
  phase: "applied" | "creating",
): IconInstanceMarker {
  return {
    approvalId: context.approvalId,
    assetId: plan.source.assetId,
    assetType: "component-instance",
    assetVersion: plan.source.assetVersion,
    componentSetStableId: plan.componentSet.stableId,
    contentDigest: plan.source.contentDigest,
    instanceStableId: plan.instance.stableId,
    phase,
    projectId: plan.source.projectId,
    schemaVersion: "1.0.0",
    size: plan.properties.size.value,
    variantStableId: plan.selectedVariant.stableId,
    x: plan.instance.x,
    y: plan.instance.y,
  };
}

function auditIconSet(
  set: ButtonInstanceComponentSetPort,
  plan: FigmaIconInstancePlan,
): ButtonInstanceComponentPort {
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
      ({ marker }) =>
        `${plan.componentSet.stableId}/${marker?.slotId ?? "invalid"}`,
    );
  if (
    set.children.length !== plan.componentSet.expectedVariantStableIds.length ||
    canonicalizeJson([...actual].sort()) !==
      canonicalizeJson([...plan.componentSet.expectedVariantStableIds].sort())
  ) {
    throw new IconInstanceWriterError({
      code: "IDENTITY_CONFLICT",
      message:
        "The Icon Component Set no longer contains the exact approved Size matrix.",
      recoveryInstruction:
        "Run the approved Icon ensure and audit before inserting an Instance.",
    });
  }
  const matches = identities.filter(({ marker }) =>
    componentMatches(
      marker,
      plan,
      "component-variant",
      plan.selectedVariant.slotId,
    ),
  );
  const variant = matches[0]?.child;
  if (matches.length !== 1 || variant === undefined) {
    throw new IconInstanceWriterError({
      code: matches.length === 0 ? "IDENTITY_NOT_FOUND" : "IDENTITY_CONFLICT",
      message: "The selected approved Icon Variant is not unique.",
      recoveryInstruction:
        "Repair the Icon Component Set before inserting an Instance.",
    });
  }
  if (variant.name !== plan.selectedVariant.figmaName) {
    throw new IconInstanceWriterError({
      code: "CONTENT_DIGEST_CONFLICT",
      message: "The selected Icon Variant name drifted from the Contract.",
      recoveryInstruction:
        "Run the approved Icon ensure before inserting an Instance.",
    });
  }
  const definition =
    set.componentPropertyDefinitions[plan.properties.size.name];
  if (
    definition?.type !== "VARIANT" ||
    !definition.variantOptions?.includes(plan.properties.size.value)
  ) {
    throw new IconInstanceWriterError({
      code: "CONTENT_DIGEST_CONFLICT",
      message: "The Icon Size property drifted from the approved Contract.",
      recoveryInstruction:
        "Run the approved Icon ensure before inserting an Instance.",
    });
  }
  return variant;
}

export async function insertFigmaIconInstance(
  port: FigmaButtonInstancePort,
  plan: FigmaIconInstancePlan,
  context: InsertButtonInstanceContext,
): Promise<InsertIconInstanceResult> {
  const completedSteps: string[] = [];
  let mutated = false;
  let recovering = false;
  try {
    assertFile(port, plan, context);
    const set = await resolveSet(port, plan);
    const variant = auditIconSet(set, plan);
    completedSteps.push("component-set-resolved", "variant-audited");
    const matches = (await port.getInstances()).filter(
      (candidate) =>
        managedInstanceMarker(candidate)?.instanceStableId ===
        plan.instance.stableId,
    );
    if (matches.length > 1) {
      throw new IconInstanceWriterError({
        code: "IDENTITY_CONFLICT",
        message: "More than one Icon Instance uses the requested identity.",
        recoveryInstruction:
          "Resolve duplicate managed Instances before retrying.",
      });
    }
    let instance = matches[0];
    const expectedCreating = expectedIconInstanceMarker(
      plan,
      context,
      "creating",
    );
    const expectedApplied = expectedIconInstanceMarker(
      plan,
      context,
      "applied",
    );
    if (instance !== undefined) {
      const existing = managedInstanceMarker(instance);
      if (
        existing === null ||
        (canonicalizeJson(existing) !== canonicalizeJson(expectedCreating) &&
          canonicalizeJson(existing) !== canonicalizeJson(expectedApplied))
      ) {
        throw new IconInstanceWriterError({
          code: "IDENTITY_CONFLICT",
          message:
            "The stable Icon Instance identity belongs to different content.",
          recoveryInstruction:
            "Use a new Instance ID or restore the original approved plan.",
        });
      }
      recovering = existing.phase === "creating";
    } else {
      instance = variant.createInstance();
      mutated = true;
      setMarker(instance, expectedCreating);
      port.appendToCurrentPage(instance);
      completedSteps.push("instance-created");
    }
    if ((await instance.getMainComponentId()) !== variant.id) {
      throw new IconInstanceWriterError({
        code: "IDENTITY_CONFLICT",
        completedSteps,
        message:
          "The managed Icon Instance is detached or points to another Main Component.",
        recoveryInstruction:
          "Replace it only through an explicit reviewed migration.",
      });
    }
    const properties = instance.getProperties();
    if (
      !mutated &&
      !recovering &&
      (properties[plan.properties.size.name] !== plan.properties.size.value ||
        instance.x !== plan.instance.x ||
        instance.y !== plan.instance.y)
    ) {
      throw new IconInstanceWriterError({
        code: "CONTENT_DIGEST_CONFLICT",
        message:
          "The managed Icon Instance drifted from its approved Size or placement.",
        recoveryInstruction:
          "Review the page change and use an explicit migration instead of overwriting it.",
      });
    }
    if (!mutated && !recovering) {
      return {
        componentSet: { nodeId: set.id, stableId: plan.componentSet.stableId },
        instance: {
          action: "unchanged",
          nodeId: instance.id,
          stableId: plan.instance.stableId,
        },
        type: "instances.icon.insert",
        variant: { stableId: plan.selectedVariant.stableId },
      };
    }
    instance.setProperties({
      [plan.properties.size.name]: plan.properties.size.value,
    });
    instance.x = plan.instance.x;
    instance.y = plan.instance.y;
    instance.name = `${plan.source.assetId} · ${plan.instance.stableId.split("/").at(-1) ?? "instance"}`;
    setMarker(instance, expectedApplied);
    completedSteps.push("properties-applied", "instance-audited");
    return {
      componentSet: { nodeId: set.id, stableId: plan.componentSet.stableId },
      instance: {
        action: mutated ? "created" : "recovered",
        nodeId: instance.id,
        stableId: plan.instance.stableId,
      },
      type: "instances.icon.insert",
      variant: { stableId: plan.selectedVariant.stableId },
    };
  } catch (cause) {
    if (cause instanceof ButtonInstanceWriterError && !mutated && !recovering) {
      throw cause;
    }
    const partial = mutated || recovering;
    throw new IconInstanceWriterError({
      code: partial ? "PARTIAL_WRITE" : "INTERNAL_ERROR",
      completedSteps,
      message: partial
        ? "The Icon Instance write stopped after creating a managed node."
        : "The Icon Instance writer failed before creating a node.",
      recoveryInstruction: partial
        ? "Retry the same approved command; its creating marker will resume without duplication."
        : "Inspect the local Plugin diagnostics before retrying.",
    });
  }
}

function auditSet(
  set: ButtonInstanceComponentSetPort,
  plan: FigmaButtonInstancePlan,
): {
  readonly labelProperty: string;
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
      ({ marker }) =>
        `${plan.componentSet.stableId}/${marker?.slotId ?? "invalid"}`,
    );
  if (
    set.children.length !== plan.componentSet.expectedVariantStableIds.length ||
    canonicalizeJson([...actual].sort()) !==
      canonicalizeJson([...plan.componentSet.expectedVariantStableIds].sort())
  ) {
    throw fail(
      "IDENTITY_CONFLICT",
      "The Button Component Set no longer contains the exact approved Variant matrix.",
      "Run the approved Button ensure and audit before inserting an Instance.",
    );
  }
  const variants = identities.filter(({ marker }) =>
    componentMatches(
      marker,
      plan,
      "component-variant",
      plan.selectedVariant.slotId,
    ),
  );
  if (variants.length !== 1 || variants[0] === undefined) {
    throw fail(
      variants.length === 0 ? "IDENTITY_NOT_FOUND" : "IDENTITY_CONFLICT",
      "The selected approved Button Variant is not unique.",
      "Repair the Component Set before inserting an Instance.",
    );
  }
  if (variants[0].child.name !== plan.selectedVariant.figmaName) {
    throw fail(
      "CONTENT_DIGEST_CONFLICT",
      "The selected Button Variant name drifted from the approved Contract.",
      "Run the approved Button ensure before inserting an Instance.",
    );
  }
  const definitions = Object.entries(set.componentPropertyDefinitions);
  const variantProperties = [plan.properties.appearance, plan.properties.state];
  for (const property of variantProperties) {
    const definition = definitions.find(
      ([name]) => name === property.name,
    )?.[1];
    if (
      definition?.type !== "VARIANT" ||
      !definition.variantOptions?.includes(property.value)
    ) {
      throw fail(
        "CONTENT_DIGEST_CONFLICT",
        `The Button property '${property.name}' drifted from the approved Contract.`,
        "Run the approved Button ensure before inserting an Instance.",
      );
    }
  }
  const labelDefinitions = definitions.filter(
    ([name, definition]) =>
      definition.type === "TEXT" &&
      (name === plan.properties.label.name ||
        name.startsWith(`${plan.properties.label.name}#`)),
  );
  if (labelDefinitions.length !== 1 || labelDefinitions[0] === undefined) {
    throw fail(
      "IDENTITY_CONFLICT",
      "The Button Label property is missing or ambiguous.",
      "Run the approved Button ensure before inserting an Instance.",
    );
  }
  return { labelProperty: labelDefinitions[0][0], variant: variants[0].child };
}

export async function insertFigmaButtonInstance(
  port: FigmaButtonInstancePort,
  plan: FigmaButtonInstancePlan,
  context: InsertButtonInstanceContext,
): Promise<InsertButtonInstanceResult> {
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
        "More than one Instance uses the requested stable identity.",
        "Resolve the duplicate managed Instances before retrying.",
      );
    }
    let instance = matches[0];
    const expectedCreating = expectedInstanceMarker(plan, context, "creating");
    const expectedApplied = expectedInstanceMarker(plan, context, "applied");
    if (instance !== undefined) {
      const existing = instanceMarker(instance);
      if (
        existing === null ||
        (canonicalizeJson(existing) !== canonicalizeJson(expectedCreating) &&
          canonicalizeJson(existing) !== canonicalizeJson(expectedApplied))
      ) {
        throw fail(
          "IDENTITY_CONFLICT",
          "The stable Instance identity is already bound to different content.",
          "Use a new logical Instance ID or restore the original approved plan.",
        );
      }
      recovering = existing.phase === "creating";
    } else {
      instance = audited.variant.createInstance();
      mutated = true;
      setMarker(instance, expectedCreating);
      port.appendToCurrentPage(instance);
      completedSteps.push("instance-created");
    }
    if ((await instance.getMainComponentId()) !== audited.variant.id) {
      throw fail(
        "IDENTITY_CONFLICT",
        "The managed Instance is detached or points to another Main Component.",
        "Replace it only through an explicit reviewed migration.",
        completedSteps,
      );
    }
    const properties = instance.getProperties();
    if (
      !mutated &&
      !recovering &&
      (properties[audited.labelProperty] !== plan.properties.label.value ||
        instance.x !== plan.instance.x ||
        instance.y !== plan.instance.y)
    ) {
      throw fail(
        "CONTENT_DIGEST_CONFLICT",
        "The managed Instance drifted from its approved placement or Label.",
        "Review the page change and use an explicit migration instead of silently overwriting it.",
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
        type: "instances.button.insert",
        variant: { stableId: plan.selectedVariant.stableId },
      };
    }
    instance.setProperties({
      [audited.labelProperty]: plan.properties.label.value,
    });
    instance.x = plan.instance.x;
    instance.y = plan.instance.y;
    instance.name = `${plan.source.assetId} · ${plan.instance.stableId.split("/").at(-1) ?? "instance"}`;
    setMarker(instance, expectedApplied);
    completedSteps.push("properties-applied", "instance-audited");
    return {
      componentSet: { nodeId: set.id, stableId: plan.componentSet.stableId },
      instance: {
        action: mutated ? "created" : "recovered",
        nodeId: instance.id,
        stableId: plan.instance.stableId,
      },
      type: "instances.button.insert",
      variant: { stableId: plan.selectedVariant.stableId },
    };
  } catch (cause) {
    if (cause instanceof ButtonInstanceWriterError && !mutated && !recovering)
      throw cause;
    const partial = mutated || recovering;
    throw fail(
      partial ? "PARTIAL_WRITE" : "INTERNAL_ERROR",
      partial
        ? "The Button Instance write stopped after creating a managed node."
        : "The Button Instance writer failed before creating a node.",
      partial
        ? "Retry the same approved command; the creating marker will resume without duplication."
        : "Inspect the local Plugin diagnostics before retrying.",
      completedSteps,
    );
  }
}

import {
  canonicalizeJson,
  compareSemanticVersions,
  type ErrorCode,
  type FigmaIconPlan,
} from "@agent-design-system-kit/core";

import {
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
  getFigmaLibraryFileBinding,
  type SharedPluginDataPort,
} from "./variables-writer.js";

export interface IconVariablePort extends SharedPluginDataPort {
  readonly id: string;
  readonly resolvedType: "COLOR" | "FLOAT";
}

export interface IconGlyphPort extends SharedPluginDataPort {
  readonly id: string;
  fills: unknown;
  height: number;
  name: string;
  strokeCap: "ROUND";
  strokeJoin: "ROUND";
  strokes: unknown;
  strokeWeight: number;
  vectorPaths: readonly {
    readonly data: string;
    readonly windingRule: "NONE";
  }[];
  width: number;
  x: number;
  y: number;
  resize(width: number, height: number): boolean;
}

export type IconFrameBoundField = "height" | "width";

export interface IconComponentPort extends SharedPluginDataPort {
  readonly children: readonly IconGlyphPort[];
  readonly id: string;
  readonly totalChildCount: number;
  description: string;
  name: string;
  x: number;
  y: number;
  appendChild(node: IconGlyphPort): void;
  resize(size: number): boolean;
  setBoundVariable(
    field: IconFrameBoundField,
    variable: IconVariablePort,
  ): boolean;
}

interface IconPropertyDefinitionPort {
  readonly defaultValue: string | boolean;
  readonly type: "BOOLEAN" | "INSTANCE_SWAP" | "SLOT" | "TEXT" | "VARIANT";
  readonly variantOptions?: readonly string[];
}

export interface IconComponentSetPort extends SharedPluginDataPort {
  readonly children: readonly IconComponentPort[];
  readonly componentPropertyDefinitions: Readonly<
    Record<string, IconPropertyDefinitionPort>
  >;
  readonly id: string;
  description: string;
  name: string;
  editComponentProperty(name: string, value: { defaultValue?: string }): string;
}

export interface FigmaIconPort {
  readonly document: SharedPluginDataPort;
  bindColor(
    variable: IconVariablePort,
    fallback: FigmaIconPlan["glyph"]["color"]["fallback"],
  ): unknown;
  combineAsVariants(
    components: readonly IconComponentPort[],
  ): IconComponentSetPort;
  createComponent(): IconComponentPort;
  createGlyph(): IconGlyphPort;
  getComponentSets(): Promise<readonly IconComponentSetPort[]>;
  getComponents(): Promise<readonly IconComponentPort[]>;
  getVariables(): Promise<readonly IconVariablePort[]>;
}

export interface EnsureIconContext {
  readonly approvalId: string;
  readonly fileBindingId: string;
  readonly operationId: string;
  readonly projectId: string;
}

export interface EnsureIconResult {
  readonly componentSet: {
    readonly action: "created" | "unchanged" | "updated";
    readonly nodeId: string;
    readonly stableId: string;
  };
  readonly type: "components.icon.ensure";
  readonly variants: {
    readonly created: number;
    readonly unchanged: number;
    readonly updated: number;
  };
}

export class IconWriterError extends Error {
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
    this.name = "IconWriterError";
    this.code = input.code;
    this.completedSteps = input.completedSteps ?? [];
    this.recoveryInstruction = input.recoveryInstruction;
  }
}

type ComponentRole = "component-layer" | "component-set" | "component-variant";

interface ComponentMarker {
  readonly appliedDigest?: string;
  readonly approvalId?: string;
  readonly assetId: string;
  readonly assetType: "component";
  readonly assetVersion?: string;
  readonly channel: "library";
  readonly majorVersion: number;
  readonly pendingOperationId?: string;
  readonly phase: "applied" | "creating";
  readonly projectId: string;
  readonly role: ComponentRole;
  readonly schemaVersion: "1.0.0";
  readonly slotId: string;
  readonly targetAssetVersion?: string;
  readonly targetDigest?: string;
}

interface TokenVariableMarker {
  readonly appliedDigest: string;
  readonly assetId: string;
  readonly assetType: "token-set";
  readonly assetVersion: string;
  readonly channel: "library";
  readonly majorVersion: number;
  readonly phase: "applied";
  readonly projectId: string;
  readonly role: "variable";
  readonly schemaVersion: "1.0.0";
  readonly slotId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(serialized: string): unknown {
  try {
    return serialized.length === 0 ? null : (JSON.parse(serialized) as unknown);
  } catch {
    return null;
  }
}

function readComponentMarker(
  entity: SharedPluginDataPort,
): ComponentMarker | null {
  const value = readJson(
    entity.getSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      MANAGED_ASSET_SHARED_KEY,
    ),
  );
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0.0" ||
    value.assetType !== "component" ||
    typeof value.projectId !== "string" ||
    typeof value.assetId !== "string" ||
    value.channel !== "library" ||
    !Number.isSafeInteger(value.majorVersion) ||
    !["component-set", "component-variant", "component-layer"].includes(
      String(value.role),
    ) ||
    typeof value.slotId !== "string" ||
    (value.phase !== "creating" && value.phase !== "applied")
  )
    return null;
  return value as unknown as ComponentMarker;
}

function readTokenMarker(
  entity: SharedPluginDataPort,
): TokenVariableMarker | null {
  const value = readJson(
    entity.getSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      MANAGED_ASSET_SHARED_KEY,
    ),
  );
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0.0" ||
    value.assetType !== "token-set" ||
    typeof value.projectId !== "string" ||
    typeof value.assetId !== "string" ||
    value.channel !== "library" ||
    !Number.isSafeInteger(value.majorVersion) ||
    value.role !== "variable" ||
    typeof value.slotId !== "string" ||
    value.phase !== "applied" ||
    typeof value.assetVersion !== "string" ||
    typeof value.appliedDigest !== "string"
  )
    return null;
  return value as unknown as TokenVariableMarker;
}

function error(
  code: ErrorCode,
  message: string,
  recoveryInstruction: string,
  completedSteps: readonly string[] = [],
): IconWriterError {
  return new IconWriterError({
    code,
    completedSteps,
    message,
    recoveryInstruction,
  });
}

function markerMatches(
  marker: ComponentMarker,
  plan: FigmaIconPlan,
  role: ComponentRole,
  slotId: string,
): boolean {
  return (
    marker.projectId === plan.source.projectId &&
    marker.assetId === plan.source.assetId &&
    marker.majorVersion === plan.componentSet.majorVersion &&
    marker.role === role &&
    marker.slotId === slotId
  );
}

function creatingMarker(
  plan: FigmaIconPlan,
  context: EnsureIconContext,
  role: ComponentRole,
  slotId: string,
): ComponentMarker {
  return {
    assetId: plan.source.assetId,
    assetType: "component",
    channel: "library",
    majorVersion: plan.componentSet.majorVersion,
    pendingOperationId: context.operationId,
    phase: "creating",
    projectId: plan.source.projectId,
    role,
    schemaVersion: "1.0.0",
    slotId,
    targetAssetVersion: plan.source.assetVersion,
    targetDigest: plan.source.contentDigest,
  };
}

function appliedMarker(
  plan: FigmaIconPlan,
  context: EnsureIconContext,
  role: ComponentRole,
  slotId: string,
): ComponentMarker {
  return {
    appliedDigest: plan.source.contentDigest,
    approvalId: context.approvalId,
    assetId: plan.source.assetId,
    assetType: "component",
    assetVersion: plan.source.assetVersion,
    channel: "library",
    majorVersion: plan.componentSet.majorVersion,
    phase: "applied",
    projectId: plan.source.projectId,
    role,
    schemaVersion: "1.0.0",
    slotId,
  };
}

function setMarker(
  entity: SharedPluginDataPort,
  marker: ComponentMarker,
): boolean {
  const serialized = canonicalizeJson(marker);
  if (
    entity.getSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      MANAGED_ASSET_SHARED_KEY,
    ) === serialized
  )
    return false;
  entity.setSharedPluginData(
    HATCHKIT_SHARED_NAMESPACE,
    MANAGED_ASSET_SHARED_KEY,
    serialized,
  );
  return true;
}

function validateExistingVersion(
  marker: ComponentMarker,
  plan: FigmaIconPlan,
): void {
  if (marker.phase === "creating") {
    if (
      marker.targetAssetVersion !== plan.source.assetVersion ||
      marker.targetDigest !== plan.source.contentDigest
    ) {
      throw error(
        "CONTENT_DIGEST_CONFLICT",
        "A partial Icon write belongs to different approved content.",
        "Finish or explicitly recover the existing partial write before retrying.",
      );
    }
    return;
  }
  if (marker.assetVersion === undefined || marker.appliedDigest === undefined) {
    throw error(
      "IDENTITY_CONFLICT",
      "A managed Icon marker is incomplete.",
      "Inspect and repair the marker before retrying.",
    );
  }
  const comparison = compareSemanticVersions(
    marker.assetVersion,
    plan.source.assetVersion,
  );
  if (comparison > 0) {
    throw error(
      "DOWNGRADE_BLOCKED",
      "The Figma Icon is newer than the requested Contract.",
      "Use the current Contract or create an approved rollback plan.",
    );
  }
  if (comparison === 0 && marker.appliedDigest !== plan.source.contentDigest) {
    throw error(
      "CONTENT_DIGEST_CONFLICT",
      "The same Icon version has a different content digest.",
      "Publish corrected content under a new version and approval.",
    );
  }
}

function markerIsCurrent(
  marker: ComponentMarker | null,
  plan: FigmaIconPlan,
): boolean {
  return (
    marker?.phase === "applied" &&
    marker.assetVersion === plan.source.assetVersion &&
    marker.appliedDigest === plan.source.contentDigest
  );
}

function findOne<T extends SharedPluginDataPort>(
  entities: readonly T[],
  plan: FigmaIconPlan,
  role: ComponentRole,
  slotId: string,
): T | undefined {
  const matches = entities.filter((entity) => {
    const marker = readComponentMarker(entity);
    return marker !== null && markerMatches(marker, plan, role, slotId);
  });
  if (matches.length > 1) {
    throw error(
      "IDENTITY_CONFLICT",
      `Multiple managed assets claim '${role}/${slotId}'.`,
      "Resolve duplicate stable identities before retrying.",
    );
  }
  const entity = matches[0];
  const marker = entity === undefined ? null : readComponentMarker(entity);
  if (marker !== null) validateExistingVersion(marker, plan);
  return entity;
}

function setValue<T extends object, K extends keyof T>(
  entity: T,
  key: K,
  value: T[K],
): boolean {
  if (JSON.stringify(entity[key]) === JSON.stringify(value)) return false;
  entity[key] = value;
  return true;
}

async function resolveVariables(
  port: FigmaIconPort,
  plan: FigmaIconPlan,
): Promise<ReadonlyMap<string, IconVariablePort>> {
  const expected = new Map<string, IconVariablePort["resolvedType"]>([
    [plan.glyph.color.variableStableId, "COLOR"],
    ...plan.variants.map(
      ({ frame }) => [frame.variableStableId, "FLOAT"] as const,
    ),
  ]);
  const matches = new Map<string, IconVariablePort[]>();
  for (const variable of await port.getVariables()) {
    const marker = readTokenMarker(variable);
    if (marker === null) continue;
    const stableId = `${marker.projectId}/token-set/${marker.assetId}/variables/major-${String(marker.majorVersion)}/variable/${marker.slotId}`;
    if (!expected.has(stableId)) continue;
    if (
      marker.projectId !== plan.tokenSource.projectId ||
      marker.assetId !== plan.tokenSource.assetId ||
      marker.assetVersion !== plan.tokenSource.assetVersion ||
      marker.appliedDigest !== plan.tokenSource.contentDigest
    ) {
      throw error(
        "VERSION_CONFLICT",
        `Required Variable '${stableId}' is not from the approved Icon Token source.`,
        "Run variables.ensure for the exact approved Token Set before writing the Icon.",
      );
    }
    matches.set(stableId, [...(matches.get(stableId) ?? []), variable]);
  }
  const resolved = new Map<string, IconVariablePort>();
  for (const [stableId, type] of expected) {
    const candidates = matches.get(stableId) ?? [];
    if (candidates.length !== 1) {
      throw error(
        candidates.length === 0 ? "IDENTITY_NOT_FOUND" : "IDENTITY_CONFLICT",
        `Expected exactly one applied Variable '${stableId}', found ${String(candidates.length)}.`,
        "Run variables.ensure or resolve duplicate managed Variables before retrying.",
      );
    }
    const variable = candidates[0];
    if (variable === undefined || variable.resolvedType !== type) {
      throw error(
        "IDENTITY_CONFLICT",
        `Variable '${stableId}' has the wrong Figma type.`,
        "Repair the managed Variable through the approved Token write flow.",
      );
    }
    resolved.set(stableId, variable);
  }
  return resolved;
}

function variableOrThrow(
  variables: ReadonlyMap<string, IconVariablePort>,
  stableId: string,
): IconVariablePort {
  const variable = variables.get(stableId);
  if (variable === undefined)
    throw new Error("Preflight Variable index drifted.");
  return variable;
}

function configureVariant(
  port: FigmaIconPort,
  component: IconComponentPort,
  variant: FigmaIconPlan["variants"][number],
  plan: FigmaIconPlan,
  variables: ReadonlyMap<string, IconVariablePort>,
  context: EnsureIconContext,
  position: { readonly x: number; readonly y: number },
): { readonly glyph: IconGlyphPort; readonly mutated: boolean } {
  let glyph = findOne(
    component.children,
    plan,
    "component-layer",
    `${variant.slotId}/glyph`,
  );
  if (
    component.totalChildCount > 1 ||
    (component.totalChildCount === 1 && glyph === undefined)
  ) {
    throw error(
      "IDENTITY_CONFLICT",
      `Icon Variant '${variant.slotId}' must contain exactly one managed Glyph.`,
      "Remove unmanaged or duplicate layers before retrying.",
    );
  }
  let mutated = false;
  if (!markerIsCurrent(readComponentMarker(component), plan)) {
    mutated = setMarker(
      component,
      creatingMarker(plan, context, "component-variant", variant.slotId),
    );
  }
  mutated = setValue(component, "name", variant.figmaName) || mutated;
  mutated = setValue(component, "description", variant.figmaName) || mutated;
  mutated = setValue(component, "x", position.x) || mutated;
  mutated = setValue(component, "y", position.y) || mutated;
  mutated = component.resize(variant.frame.size) || mutated;
  const sizeVariable = variableOrThrow(
    variables,
    variant.frame.variableStableId,
  );
  mutated = component.setBoundVariable("width", sizeVariable) || mutated;
  mutated = component.setBoundVariable("height", sizeVariable) || mutated;

  if (glyph === undefined) {
    glyph = port.createGlyph();
    component.appendChild(glyph);
    mutated = true;
  }
  if (!markerIsCurrent(readComponentMarker(glyph), plan)) {
    mutated =
      setMarker(
        glyph,
        creatingMarker(
          plan,
          context,
          "component-layer",
          `${variant.slotId}/glyph`,
        ),
      ) || mutated;
  }
  mutated = setValue(glyph, "name", plan.glyph.name) || mutated;
  mutated =
    setValue(glyph, "vectorPaths", [
      { data: plan.glyph.pathData, windingRule: "NONE" },
    ]) || mutated;
  mutated = glyph.resize(variant.glyph.width, variant.glyph.height) || mutated;
  mutated = setValue(glyph, "x", variant.glyph.x) || mutated;
  mutated = setValue(glyph, "y", variant.glyph.y) || mutated;
  mutated = setValue(glyph, "fills", []) || mutated;
  mutated =
    setValue(glyph, "strokeWeight", variant.glyph.strokeWidth) || mutated;
  mutated = setValue(glyph, "strokeCap", plan.glyph.strokeCap) || mutated;
  mutated = setValue(glyph, "strokeJoin", plan.glyph.strokeJoin) || mutated;
  mutated =
    setValue(
      glyph,
      "strokes",
      port.bindColor(
        variableOrThrow(variables, plan.glyph.color.variableStableId),
        plan.glyph.color.fallback,
      ),
    ) || mutated;
  return { glyph, mutated };
}

function assertVariantDefinition(
  componentSet: IconComponentSetPort,
  plan: FigmaIconPlan,
): boolean {
  let property =
    componentSet.componentPropertyDefinitions[
      plan.componentSet.sizePropertyName
    ];
  if (
    property?.type !== "VARIANT" ||
    JSON.stringify(property.variantOptions) !==
      JSON.stringify(plan.componentSet.sizeOptions)
  ) {
    throw error(
      "IDENTITY_CONFLICT",
      `Figma Variant property '${plan.componentSet.sizePropertyName}' does not match the approved Icon plan.`,
      "Resolve the Component Set property conflict before retrying.",
    );
  }
  if (property.defaultValue !== plan.componentSet.defaultSize) {
    componentSet.editComponentProperty(plan.componentSet.sizePropertyName, {
      defaultValue: plan.componentSet.defaultSize,
    });
    property =
      componentSet.componentPropertyDefinitions[
        plan.componentSet.sizePropertyName
      ];
    if (property?.defaultValue !== plan.componentSet.defaultSize) {
      throw error(
        "IDENTITY_CONFLICT",
        "Figma did not accept the approved default Icon size.",
        "Set the Size Variant default to Medium before retrying.",
      );
    }
    return true;
  }
  return false;
}

function hasExactManagedVariantChildren(
  componentSet: IconComponentSetPort,
  plan: FigmaIconPlan,
): boolean {
  const expected = new Set(plan.variants.map(({ slotId }) => slotId));
  const actual = new Set<string>();
  for (const component of componentSet.children) {
    const marker = readComponentMarker(component);
    if (
      marker === null ||
      !markerMatches(marker, plan, "component-variant", marker.slotId) ||
      !expected.has(marker.slotId) ||
      actual.has(marker.slotId)
    )
      return false;
    actual.add(marker.slotId);
  }
  return actual.size === expected.size;
}

export async function ensureFigmaIcon(
  port: FigmaIconPort,
  plan: FigmaIconPlan,
  context: EnsureIconContext,
): Promise<EnsureIconResult> {
  const binding = getFigmaLibraryFileBinding(port.document);
  if (
    binding === null ||
    binding.fileRole !== "design-system-library" ||
    binding.projectId !== context.projectId ||
    binding.fileBindingId !== context.fileBindingId ||
    plan.source.projectId !== context.projectId
  ) {
    throw error(
      "FILE_BINDING_MISMATCH",
      "The open Figma file is not the Icon plan's bound design-system library.",
      "Open the registered library file or explicitly bind this file before retrying.",
    );
  }
  const variables = await resolveVariables(port, plan);
  const componentSets = await port.getComponentSets();
  const components = await port.getComponents();
  let componentSet = findOne(componentSets, plan, "component-set", "root");
  if (
    componentSet === undefined &&
    componentSets.some(
      (candidate) =>
        candidate.name === plan.componentSet.name &&
        readComponentMarker(candidate) === null &&
        !hasExactManagedVariantChildren(candidate, plan),
    )
  ) {
    throw error(
      "UNMANAGED_ASSET",
      `An unmanaged Component Set named '${plan.componentSet.name}' already exists.`,
      "Rename it or run an explicit adoption flow; Hatchkit will not adopt by name.",
    );
  }
  if (componentSet !== undefined && componentSet.children.length !== 3) {
    throw error(
      "IDENTITY_CONFLICT",
      "The managed Icon Component Set does not contain exactly three Variants.",
      "Restore the exact approved size matrix before retrying.",
    );
  }
  const completedSteps = ["file-binding-verified", "token-variables-verified"];
  const rootChildIds =
    componentSet === undefined
      ? null
      : new Set(componentSet.children.map(({ id }) => id));
  const resolved: Array<{
    component: IconComponentPort;
    glyph: IconGlyphPort;
    slotId: string;
  }> = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let rootCreated = false;
  try {
    for (const [index, variant] of plan.variants.entries()) {
      let component = findOne(
        components,
        plan,
        "component-variant",
        variant.slotId,
      );
      if (
        componentSet !== undefined &&
        (component === undefined || !rootChildIds?.has(component.id))
      ) {
        throw error(
          "IDENTITY_CONFLICT",
          `The managed Icon Set is missing Variant '${variant.slotId}' or contains it outside the Set.`,
          "Restore the exact managed Variant children before retrying.",
        );
      }
      const wasCreated = component === undefined;
      if (component === undefined) {
        if (
          components.some(
            (candidate) =>
              candidate.name === variant.figmaName &&
              readComponentMarker(candidate) === null,
          )
        ) {
          throw error(
            "UNMANAGED_ASSET",
            `An unmanaged Component named '${variant.figmaName}' already exists.`,
            "Rename it or run an explicit adoption flow before retrying.",
          );
        }
        component = port.createComponent();
        created += 1;
      }
      const configured = configureVariant(
        port,
        component,
        variant,
        plan,
        variables,
        context,
        { x: index * 80, y: 0 },
      );
      if (!wasCreated && configured.mutated) updated += 1;
      if (!wasCreated && !configured.mutated) unchanged += 1;
      resolved.push({
        component,
        glyph: configured.glyph,
        slotId: variant.slotId,
      });
      completedSteps.push(`variant:${variant.slotId}`);
    }
    if (componentSet === undefined) {
      const ids = new Set(resolved.map(({ component }) => component.id));
      const recoverySets = componentSets.filter(
        (candidate) =>
          readComponentMarker(candidate) === null &&
          candidate.children.length === ids.size &&
          candidate.children.every(({ id }) => ids.has(id)),
      );
      if (recoverySets.length > 1) {
        throw error(
          "IDENTITY_CONFLICT",
          "More than one unmarked Component Set contains the managed Icon Variants.",
          "Resolve the ambiguous partial write before retrying.",
        );
      }
      componentSet = recoverySets[0];
    }
    if (componentSet === undefined) {
      componentSet = port.combineAsVariants(
        resolved.map(({ component }) => component),
      );
      rootCreated = true;
    } else {
      const actualIds = new Set(componentSet.children.map(({ id }) => id));
      if (
        componentSet.children.length !== resolved.length ||
        resolved.some(({ component }) => !actualIds.has(component.id))
      ) {
        throw error(
          "IDENTITY_CONFLICT",
          "The managed Icon Set has missing or unmanaged Variant children.",
          "Restore the exact three managed Variants before retrying.",
        );
      }
    }
    let rootMutated = false;
    if (!markerIsCurrent(readComponentMarker(componentSet), plan)) {
      rootMutated = setMarker(
        componentSet,
        creatingMarker(plan, context, "component-set", "root"),
      );
    }
    rootMutated =
      setValue(componentSet, "name", plan.componentSet.name) || rootMutated;
    rootMutated =
      setValue(componentSet, "description", plan.componentSet.description) ||
      rootMutated;
    rootMutated = assertVariantDefinition(componentSet, plan) || rootMutated;
    resolved.forEach(({ component, glyph, slotId }) => {
      setMarker(
        glyph,
        appliedMarker(plan, context, "component-layer", `${slotId}/glyph`),
      );
      setMarker(
        component,
        appliedMarker(plan, context, "component-variant", slotId),
      );
    });
    setMarker(
      componentSet,
      appliedMarker(plan, context, "component-set", "root"),
    );
    return {
      componentSet: {
        action: rootCreated
          ? "created"
          : updated > 0 || rootMutated
            ? "updated"
            : "unchanged",
        nodeId: componentSet.id,
        stableId: plan.componentSet.stableId,
      },
      type: "components.icon.ensure",
      variants: { created, unchanged, updated },
    };
  } catch (cause) {
    if (cause instanceof IconWriterError) throw cause;
    throw error(
      "PARTIAL_WRITE",
      "The Icon write stopped after creating or updating Figma nodes.",
      "Retry the same approved operation; stable creating markers will resume it.",
      completedSteps,
    );
  }
}

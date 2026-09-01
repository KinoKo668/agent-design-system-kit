import {
  canonicalizeJson,
  compareSemanticVersions,
  type ErrorCode,
  type FigmaButtonPlan,
} from "@agent-design-system-kit/core";

import {
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
  getFigmaLibraryFileBinding,
  type SharedPluginDataPort,
} from "./variables-writer.js";

export interface ButtonVariablePort extends SharedPluginDataPort {
  readonly id: string;
  readonly resolvedType: "COLOR" | "FLOAT" | "STRING";
}

export type ButtonBoundField =
  | "cornerRadius"
  | "height"
  | "opacity"
  | "paddingLeft"
  | "paddingRight"
  | "strokeWeight";

export type ButtonTextBoundField =
  "fontFamily" | "fontSize" | "fontWeight" | "letterSpacing";

export interface ButtonTextPort extends SharedPluginDataPort {
  characters: string;
  componentPropertyReferences: { characters?: string } | null;
  fills: unknown;
  fontName: { family: string; style: string };
  fontSize: number;
  letterSpacing: { unit: "PIXELS"; value: number };
  lineHeight: { unit: "PERCENT"; value: number };
  name: string;
  setBoundVariable(
    field: ButtonTextBoundField,
    variable: ButtonVariablePort,
  ): boolean;
}

export interface ButtonComponentPort extends SharedPluginDataPort {
  readonly id: string;
  readonly children: readonly ButtonTextPort[];
  readonly totalChildCount: number;
  cornerRadius: number;
  counterAxisAlignItems: "CENTER";
  counterAxisSizingMode: "FIXED";
  description: string;
  fills: unknown;
  layoutMode: "HORIZONTAL";
  name: string;
  opacity: number;
  paddingLeft: number;
  paddingRight: number;
  primaryAxisAlignItems: "CENTER";
  primaryAxisSizingMode: "AUTO";
  strokeAlign: "INSIDE";
  strokes: unknown;
  strokeWeight: number;
  x: number;
  y: number;
  appendChild(node: ButtonTextPort): void;
  resizeHeight(height: number): boolean;
  setBoundVariable(
    field: ButtonBoundField,
    variable: ButtonVariablePort,
  ): boolean;
}

export interface ComponentPropertyDefinitionPort {
  readonly defaultValue: string | boolean;
  readonly type: "BOOLEAN" | "INSTANCE_SWAP" | "SLOT" | "TEXT" | "VARIANT";
  readonly variantOptions?: readonly string[];
}

export interface ButtonComponentSetPort extends SharedPluginDataPort {
  readonly id: string;
  readonly children: readonly ButtonComponentPort[];
  readonly componentPropertyDefinitions: Readonly<
    Record<string, ComponentPropertyDefinitionPort>
  >;
  description: string;
  name: string;
  addComponentProperty(
    name: string,
    type: "TEXT",
    defaultValue: string,
  ): string;
  editComponentProperty(
    name: string,
    value: { defaultValue?: string; name?: string },
  ): string;
}

export interface FigmaButtonPort {
  readonly document: SharedPluginDataPort;
  bindColor(
    variable: ButtonVariablePort,
    fallback: Extract<
      FigmaButtonPlan["variants"][number]["bindings"][number],
      { kind: "color" }
    >,
  ): unknown;
  combineAsVariants(
    components: readonly ButtonComponentPort[],
  ): ButtonComponentSetPort;
  createComponent(): ButtonComponentPort;
  createText(): ButtonTextPort;
  getComponentSets(): Promise<readonly ButtonComponentSetPort[]>;
  getComponents(): Promise<readonly ButtonComponentPort[]>;
  getVariables(): Promise<readonly ButtonVariablePort[]>;
  loadFont(family: string, style: string): Promise<void>;
}

export interface EnsureButtonContext {
  readonly approvalId: string;
  readonly fileBindingId: string;
  readonly operationId: string;
  readonly projectId: string;
}

export interface EnsureButtonResult {
  readonly componentSet: {
    readonly action: "created" | "unchanged" | "updated";
    readonly nodeId: string;
    readonly stableId: string;
  };
  readonly labelPropertyName: string;
  readonly type: "components.button.ensure";
  readonly typography: {
    readonly lineHeightStrategy: "resolved-percent";
    readonly variableBindings: 4;
  };
  readonly variants: {
    readonly created: number;
    readonly unchanged: number;
    readonly updated: number;
  };
}

export class ButtonWriterError extends Error {
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
    this.name = "ButtonWriterError";
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
    (value.role !== "component-set" &&
      value.role !== "component-variant" &&
      value.role !== "component-layer") ||
    typeof value.slotId !== "string" ||
    (value.phase !== "creating" && value.phase !== "applied")
  )
    return null;
  return value as unknown as ComponentMarker;
}

function readTokenVariableMarker(
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
): ButtonWriterError {
  return new ButtonWriterError({
    code,
    completedSteps,
    message,
    recoveryInstruction,
  });
}

function assertFileBinding(
  port: FigmaButtonPort,
  context: EnsureButtonContext,
): void {
  const binding = getFigmaLibraryFileBinding(port.document);
  if (
    binding === null ||
    binding.projectId !== context.projectId ||
    binding.fileBindingId !== context.fileBindingId
  ) {
    throw error(
      "FILE_BINDING_MISMATCH",
      "The open Figma file is not the bound design-system library.",
      "Open the registered library file or explicitly bind this file before retrying.",
    );
  }
}

function markerMatches(
  marker: ComponentMarker,
  plan: FigmaButtonPlan,
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
  plan: FigmaButtonPlan,
  context: EnsureButtonContext,
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
  plan: FigmaButtonPlan,
  context: EnsureButtonContext,
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
  plan: FigmaButtonPlan,
): void {
  if (marker.phase === "creating") {
    if (
      marker.targetAssetVersion !== plan.source.assetVersion ||
      marker.targetDigest !== plan.source.contentDigest
    ) {
      throw error(
        "CONTENT_DIGEST_CONFLICT",
        "A partial Button write belongs to different approved content.",
        "Finish or explicitly recover the existing partial write before retrying.",
      );
    }
    return;
  }
  if (marker.assetVersion === undefined || marker.appliedDigest === undefined) {
    throw error(
      "IDENTITY_CONFLICT",
      "A managed Button marker is incomplete.",
      "Inspect and repair the marker before retrying.",
    );
  }
  const comparison = compareSemanticVersions(
    marker.assetVersion,
    plan.source.assetVersion,
  );
  if (comparison > 0)
    throw error(
      "DOWNGRADE_BLOCKED",
      "The Figma Button is newer than the requested Contract.",
      "Use the current Contract or create an approved rollback plan.",
    );
  if (comparison === 0 && marker.appliedDigest !== plan.source.contentDigest) {
    throw error(
      "CONTENT_DIGEST_CONFLICT",
      "The same Button version has a different content digest.",
      "Publish corrected content under a new version and approval.",
    );
  }
}

function markerIsCurrent(
  marker: ComponentMarker | null,
  plan: FigmaButtonPlan,
): boolean {
  return (
    marker?.phase === "applied" &&
    marker.assetVersion === plan.source.assetVersion &&
    marker.appliedDigest === plan.source.contentDigest
  );
}

function expectedVariableType(
  target: string,
): ButtonVariablePort["resolvedType"] {
  return target.includes("fill") || target.includes("color")
    ? "COLOR"
    : "FLOAT";
}

async function resolveVariables(
  port: FigmaButtonPort,
  plan: FigmaButtonPlan,
): Promise<ReadonlyMap<string, ButtonVariablePort>> {
  const expected = new Map<string, ButtonVariablePort["resolvedType"]>();
  [
    ...plan.sharedBindings,
    ...plan.variants.flatMap(({ bindings }) => bindings),
  ].forEach((binding) =>
    expected.set(
      binding.variableStableId,
      expectedVariableType(binding.target),
    ),
  );
  expected.set(plan.typography.fontFamily.variableStableId, "STRING");
  expected.set(plan.typography.fontSize.variableStableId, "FLOAT");
  expected.set(plan.typography.fontWeight.variableStableId, "FLOAT");
  expected.set(plan.typography.letterSpacing.variableStableId, "FLOAT");

  const matches = new Map<string, ButtonVariablePort[]>();
  for (const variable of await port.getVariables()) {
    const marker = readTokenVariableMarker(variable);
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
        `Required Variable '${stableId}' is not from the approved Token source.`,
        "Run variables.ensure for the exact approved Token Set before writing components.",
      );
    }
    const entries = matches.get(stableId) ?? [];
    entries.push(variable);
    matches.set(stableId, entries);
  }
  const resolved = new Map<string, ButtonVariablePort>();
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

function findOne<T extends SharedPluginDataPort>(
  entities: readonly T[],
  plan: FigmaButtonPlan,
  role: ComponentRole,
  slotId: string,
): T | undefined {
  const matches = entities.filter((entity) => {
    const marker = readComponentMarker(entity);
    return marker !== null && markerMatches(marker, plan, role, slotId);
  });
  if (matches.length > 1)
    throw error(
      "IDENTITY_CONFLICT",
      `Multiple managed assets claim '${role}/${slotId}'.`,
      "Resolve the duplicate stable identities before retrying.",
    );
  const entity = matches[0];
  const marker = entity === undefined ? undefined : readComponentMarker(entity);
  if (marker !== undefined && marker !== null)
    validateExistingVersion(marker, plan);
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

function variableOrThrow(
  variables: ReadonlyMap<string, ButtonVariablePort>,
  stableId: string,
): ButtonVariablePort {
  const variable = variables.get(stableId);
  if (variable === undefined)
    throw new Error("Preflight Variable index drifted.");
  return variable;
}

async function configureVariant(
  port: FigmaButtonPort,
  component: ButtonComponentPort,
  variant: FigmaButtonPlan["variants"][number],
  plan: FigmaButtonPlan,
  variables: ReadonlyMap<string, ButtonVariablePort>,
  context: EnsureButtonContext,
  position: { readonly x: number; readonly y: number },
): Promise<{ readonly label: ButtonTextPort; readonly mutated: boolean }> {
  let label = findOne(
    component.children,
    plan,
    "component-layer",
    `${variant.slotId}/label`,
  );
  if (
    component.totalChildCount > 1 ||
    (component.totalChildCount === 1 && label === undefined)
  ) {
    throw error(
      "IDENTITY_CONFLICT",
      `Variant '${variant.slotId}' must contain exactly one managed Label layer.`,
      "Remove unmanaged or duplicate layers, or create an explicitly approved richer Component Contract.",
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
  mutated = setValue(component, "description", variant.displayName) || mutated;
  mutated = setValue(component, "layoutMode", "HORIZONTAL") || mutated;
  mutated = setValue(component, "primaryAxisSizingMode", "AUTO") || mutated;
  mutated = setValue(component, "counterAxisSizingMode", "FIXED") || mutated;
  mutated = setValue(component, "primaryAxisAlignItems", "CENTER") || mutated;
  mutated = setValue(component, "counterAxisAlignItems", "CENTER") || mutated;
  mutated = setValue(component, "strokeAlign", "INSIDE") || mutated;
  mutated = setValue(component, "x", position.x) || mutated;
  mutated = setValue(component, "y", position.y) || mutated;

  const bindings = [...plan.sharedBindings, ...variant.bindings];
  for (const binding of bindings) {
    const variable = variableOrThrow(variables, binding.variableStableId);
    switch (binding.target) {
      case "container.height":
        mutated = component.resizeHeight(binding.fallback) || mutated;
        mutated = component.setBoundVariable("height", variable) || mutated;
        break;
      case "container.padding-inline":
        mutated =
          setValue(component, "paddingLeft", binding.fallback) || mutated;
        mutated =
          setValue(component, "paddingRight", binding.fallback) || mutated;
        mutated =
          component.setBoundVariable("paddingLeft", variable) || mutated;
        mutated =
          component.setBoundVariable("paddingRight", variable) || mutated;
        break;
      case "container.radius":
        mutated =
          setValue(component, "cornerRadius", binding.fallback) || mutated;
        mutated =
          component.setBoundVariable("cornerRadius", variable) || mutated;
        break;
      case "container.border-width":
        mutated =
          setValue(component, "strokeWeight", binding.fallback) || mutated;
        mutated =
          component.setBoundVariable("strokeWeight", variable) || mutated;
        break;
      case "container.opacity":
        mutated = setValue(component, "opacity", binding.fallback) || mutated;
        mutated = component.setBoundVariable("opacity", variable) || mutated;
        break;
      case "container.fill":
        mutated =
          setValue(component, "fills", port.bindColor(variable, binding)) ||
          mutated;
        break;
      case "container.border-color":
        mutated =
          setValue(component, "strokes", port.bindColor(variable, binding)) ||
          mutated;
        break;
      case "label.fill":
        break;
    }
  }
  if (
    !variant.bindings.some(({ target }) => target === "container.border-color")
  )
    mutated = setValue(component, "strokes", []) || mutated;
  if (
    !variant.bindings.some(({ target }) => target === "container.border-width")
  )
    mutated = setValue(component, "strokeWeight", 0) || mutated;
  if (!variant.bindings.some(({ target }) => target === "container.opacity"))
    mutated = setValue(component, "opacity", 1) || mutated;

  if (label === undefined) {
    label = port.createText();
    component.appendChild(label);
    mutated = true;
  }
  if (!markerIsCurrent(readComponentMarker(label), plan)) {
    mutated =
      setMarker(
        label,
        creatingMarker(
          plan,
          context,
          "component-layer",
          `${variant.slotId}/label`,
        ),
      ) || mutated;
  }
  await port.loadFont(
    String(plan.typography.fontFamily.fallback),
    plan.typography.fontStyleFallback,
  );
  mutated = setValue(label, "name", "Label") || mutated;
  mutated =
    setValue(label, "fontName", {
      family: String(plan.typography.fontFamily.fallback),
      style: plan.typography.fontStyleFallback,
    }) || mutated;
  mutated =
    setValue(label, "fontSize", Number(plan.typography.fontSize.fallback)) ||
    mutated;
  mutated =
    setValue(label, "letterSpacing", {
      unit: "PIXELS",
      value: Number(plan.typography.letterSpacing.fallback),
    }) || mutated;
  mutated =
    setValue(label, "lineHeight", {
      unit: "PERCENT",
      value: plan.typography.lineHeight.fallback,
    }) || mutated;
  mutated =
    setValue(
      label,
      "characters",
      plan.componentSet.properties.label.defaultValue,
    ) || mutated;
  mutated =
    label.setBoundVariable(
      "fontFamily",
      variableOrThrow(variables, plan.typography.fontFamily.variableStableId),
    ) || mutated;
  mutated =
    label.setBoundVariable(
      "fontSize",
      variableOrThrow(variables, plan.typography.fontSize.variableStableId),
    ) || mutated;
  mutated =
    label.setBoundVariable(
      "fontWeight",
      variableOrThrow(variables, plan.typography.fontWeight.variableStableId),
    ) || mutated;
  mutated =
    label.setBoundVariable(
      "letterSpacing",
      variableOrThrow(
        variables,
        plan.typography.letterSpacing.variableStableId,
      ),
    ) || mutated;
  const labelFill = variant.bindings.find(
    ({ target }) => target === "label.fill",
  );
  if (labelFill === undefined || labelFill.kind !== "color")
    throw new Error("Validated Button plan lost its label fill.");
  mutated =
    setValue(
      label,
      "fills",
      port.bindColor(
        variableOrThrow(variables, labelFill.variableStableId),
        labelFill,
      ),
    ) || mutated;
  return { label, mutated };
}

function ensureLabelProperty(
  componentSet: ButtonComponentSetPort,
  plan: FigmaButtonPlan,
): { readonly name: string; readonly mutated: boolean } {
  const definitions = componentSet.componentPropertyDefinitions;
  const labels = Object.entries(definitions).filter(
    ([, definition]) => definition.type === "TEXT",
  );
  const exactLabels = labels.filter(
    ([name]) => name.split("#")[0] === plan.componentSet.properties.label.name,
  );
  if (labels.length !== exactLabels.length || exactLabels.length > 1) {
    throw error(
      "IDENTITY_CONFLICT",
      "The Button Component Set has incompatible TEXT properties.",
      "Keep exactly one managed Label TEXT property before retrying.",
    );
  }
  if (exactLabels.length === 0) {
    return {
      mutated: true,
      name: componentSet.addComponentProperty(
        plan.componentSet.properties.label.name,
        "TEXT",
        plan.componentSet.properties.label.defaultValue,
      ),
    };
  }
  const [name, definition] = exactLabels[0] ?? [];
  if (name === undefined || definition === undefined)
    throw new Error("Label property resolution drifted.");
  if (
    definition.defaultValue !== plan.componentSet.properties.label.defaultValue
  ) {
    return {
      mutated: true,
      name: componentSet.editComponentProperty(name, {
        defaultValue: plan.componentSet.properties.label.defaultValue,
      }),
    };
  }
  return { mutated: false, name };
}

function assertVariantDefinitions(
  componentSet: ButtonComponentSetPort,
  plan: FigmaButtonPlan,
): void {
  for (const property of [
    plan.componentSet.properties.appearance,
    plan.componentSet.properties.state,
  ]) {
    const definition = componentSet.componentPropertyDefinitions[property.name];
    if (
      definition?.type !== "VARIANT" ||
      JSON.stringify(definition.variantOptions) !==
        JSON.stringify(property.options) ||
      definition.defaultValue !== property.defaultValue
    ) {
      throw error(
        "IDENTITY_CONFLICT",
        `Figma Variant property '${property.name}' does not match the approved Button plan.`,
        "Resolve the Component Set property conflict before retrying.",
      );
    }
  }
}

function hasExactManagedVariantChildren(
  componentSet: ButtonComponentSetPort,
  plan: FigmaButtonPlan,
): boolean {
  const expectedSlots = new Set(plan.variants.map(({ slotId }) => slotId));
  const actualSlots = new Set<string>();
  for (const component of componentSet.children) {
    const marker = readComponentMarker(component);
    if (
      marker === null ||
      !markerMatches(marker, plan, "component-variant", marker.slotId) ||
      !expectedSlots.has(marker.slotId) ||
      actualSlots.has(marker.slotId)
    )
      return false;
    actualSlots.add(marker.slotId);
  }
  return actualSlots.size === expectedSlots.size;
}

export async function ensureFigmaButton(
  port: FigmaButtonPort,
  plan: FigmaButtonPlan,
  context: EnsureButtonContext,
): Promise<EnsureButtonResult> {
  assertFileBinding(port, context);
  if (plan.source.projectId !== context.projectId)
    throw error(
      "FILE_BINDING_MISMATCH",
      "Button plan and Writer project differ.",
      "Build the command for the bound project.",
    );
  const variables = await resolveVariables(port, plan);
  const componentSets = await port.getComponentSets();
  const allComponents = await port.getComponents();
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

  const completedSteps: string[] = [
    "file-binding-verified",
    "token-variables-verified",
  ];
  let createdVariants = 0;
  let updatedVariants = 0;
  let unchangedVariants = 0;
  const resolved: Array<{
    component: ButtonComponentPort;
    label: ButtonTextPort;
    slotId: string;
  }> = [];
  const rootChildIds =
    componentSet === undefined
      ? null
      : new Set(componentSet.children.map(({ id }) => id));
  if (componentSet !== undefined && componentSet.children.length !== 4) {
    throw error(
      "IDENTITY_CONFLICT",
      "The managed Component Set does not contain exactly four Variant children.",
      "Restore the exact approved Variant matrix before retrying.",
    );
  }
  let rootCreatedThisRun = false;
  try {
    for (const variant of plan.variants) {
      let component = findOne(
        allComponents,
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
          `The managed Component Set is missing Variant '${variant.slotId}' or contains it outside the Set.`,
          "Restore the exact four managed Variant children before retrying.",
        );
      }
      const wasCreated = component === undefined;
      if (component === undefined) {
        if (
          allComponents.some(
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
        createdVariants += 1;
      }
      const appearanceIndex =
        plan.componentSet.properties.appearance.options.indexOf(
          variant.selections.appearance,
        );
      const stateIndex = plan.componentSet.properties.state.options.indexOf(
        variant.selections.state,
      );
      const configured = await configureVariant(
        port,
        component,
        variant,
        plan,
        variables,
        context,
        { x: appearanceIndex * 240, y: stateIndex * 80 },
      );
      if (!wasCreated && configured.mutated) updatedVariants += 1;
      if (!wasCreated && !configured.mutated) unchangedVariants += 1;
      resolved.push({
        component,
        label: configured.label,
        slotId: variant.slotId,
      });
      completedSteps.push(`variant:${variant.slotId}`);
    }
    if (componentSet === undefined) {
      const resolvedIds = new Set(
        resolved.map(({ component }) => component.id),
      );
      const recoverySets = componentSets.filter(
        (candidate) =>
          readComponentMarker(candidate) === null &&
          candidate.children.length === resolvedIds.size &&
          candidate.children.every(({ id }) => resolvedIds.has(id)),
      );
      if (recoverySets.length > 1) {
        throw error(
          "IDENTITY_CONFLICT",
          "More than one unmarked Component Set contains the managed Button Variants.",
          "Resolve the ambiguous partial write before retrying.",
        );
      }
      componentSet = recoverySets[0];
    }
    if (componentSet === undefined) {
      componentSet = port.combineAsVariants(
        resolved.map(({ component }) => component),
      );
      rootCreatedThisRun = true;
    } else {
      const actualIds = new Set(componentSet.children.map(({ id }) => id));
      if (
        componentSet.children.length !== resolved.length ||
        resolved.some(({ component }) => !actualIds.has(component.id))
      ) {
        throw error(
          "IDENTITY_CONFLICT",
          "The managed Component Set has missing or unmanaged Variant children.",
          "Restore the exact four managed Variants before retrying.",
        );
      }
    }
    let componentSetMutated = false;
    if (!markerIsCurrent(readComponentMarker(componentSet), plan)) {
      componentSetMutated = setMarker(
        componentSet,
        creatingMarker(plan, context, "component-set", "root"),
      );
    }
    componentSetMutated =
      setValue(componentSet, "name", plan.componentSet.name) ||
      componentSetMutated;
    componentSetMutated =
      setValue(componentSet, "description", plan.componentSet.description) ||
      componentSetMutated;
    const labelProperty = ensureLabelProperty(componentSet, plan);
    componentSetMutated = labelProperty.mutated || componentSetMutated;
    const labelPropertyName = labelProperty.name;
    assertVariantDefinitions(componentSet, plan);
    resolved.forEach(({ label }) => {
      label.componentPropertyReferences = { characters: labelPropertyName };
    });
    resolved.forEach(({ component, label, slotId }) => {
      setMarker(
        label,
        appliedMarker(plan, context, "component-layer", `${slotId}/label`),
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
    completedSteps.push("component-set-audited", "applied-markers-written");
    return {
      componentSet: {
        action: rootCreatedThisRun
          ? "created"
          : updatedVariants > 0 || componentSetMutated
            ? "updated"
            : "unchanged",
        nodeId: componentSet.id,
        stableId: plan.componentSet.stableId,
      },
      labelPropertyName,
      type: "components.button.ensure",
      typography: {
        lineHeightStrategy: "resolved-percent",
        variableBindings: 4,
      },
      variants: {
        created: createdVariants,
        unchanged: unchangedVariants,
        updated: updatedVariants,
      },
    };
  } catch (cause) {
    if (cause instanceof ButtonWriterError) throw cause;
    throw error(
      "PARTIAL_WRITE",
      "The Button write stopped after creating or updating Figma nodes.",
      "Retry the same approved operation; stable creating markers will resume it.",
      completedSteps,
    );
  }
}

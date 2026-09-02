import {
  canonicalizeJson,
  compareSemanticVersions,
  type ErrorCode,
  type FigmaInputPlan,
} from "@agent-design-system-kit/core";

import type {
  ButtonTextBoundField,
  ButtonVariablePort,
  ComponentPropertyDefinitionPort,
} from "./button-writer.js";
import {
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
  getFigmaLibraryFileBinding,
  type SharedPluginDataPort,
} from "./variables-writer.js";

export type InputComponentBoundField = "itemSpacing" | "width";
export type InputFieldBoundField =
  "cornerRadius" | "height" | "paddingLeft" | "paddingRight" | "strokeWeight";

export interface InputTextPort extends SharedPluginDataPort {
  readonly kind: "text";
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

export interface InputFieldPort extends SharedPluginDataPort {
  readonly kind: "field";
  readonly children: readonly InputTextPort[];
  readonly totalChildCount: number;
  cornerRadius: number;
  counterAxisAlignItems: "CENTER";
  counterAxisSizingMode: "FIXED";
  fills: unknown;
  layoutMode: "HORIZONTAL";
  name: string;
  paddingLeft: number;
  paddingRight: number;
  primaryAxisSizingMode: "FIXED";
  strokeAlign: "INSIDE";
  strokes: unknown;
  strokeWeight: number;
  appendChild(node: InputTextPort): void;
  resize(width: number, height: number): boolean;
  setBoundVariable(
    field: InputFieldBoundField,
    variable: ButtonVariablePort,
  ): boolean;
}

export type InputVariantChildPort = InputFieldPort | InputTextPort;

export interface InputComponentPort extends SharedPluginDataPort {
  readonly id: string;
  readonly children: readonly InputVariantChildPort[];
  readonly totalChildCount: number;
  counterAxisSizingMode: "FIXED";
  description: string;
  itemSpacing: number;
  layoutMode: "VERTICAL";
  name: string;
  primaryAxisSizingMode: "AUTO";
  x: number;
  y: number;
  appendChild(node: InputVariantChildPort): void;
  resizeWidth(width: number): boolean;
  setBoundVariable(
    field: InputComponentBoundField,
    variable: ButtonVariablePort,
  ): boolean;
  setChildrenOrder(children: readonly InputVariantChildPort[]): boolean;
}

export interface InputComponentSetPort extends SharedPluginDataPort {
  readonly id: string;
  readonly children: readonly InputComponentPort[];
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

type InputColorBinding = Extract<
  FigmaInputPlan["sharedBindings"][number],
  { kind: "color" }
>;

export interface FigmaInputPort {
  readonly document: SharedPluginDataPort;
  bindColor(variable: ButtonVariablePort, binding: InputColorBinding): unknown;
  combineAsVariants(
    components: readonly InputComponentPort[],
  ): InputComponentSetPort;
  createComponent(): InputComponentPort;
  createFrame(): InputFieldPort;
  createText(): InputTextPort;
  getComponentSets(): Promise<readonly InputComponentSetPort[]>;
  getComponents(): Promise<readonly InputComponentPort[]>;
  getVariables(): Promise<readonly ButtonVariablePort[]>;
  loadFont(family: string, style: string): Promise<void>;
}

export interface EnsureInputContext {
  readonly approvalId: string;
  readonly fileBindingId: string;
  readonly operationId: string;
  readonly projectId: string;
}

export interface EnsureInputResult {
  readonly componentSet: {
    readonly action: "created" | "unchanged" | "updated";
    readonly nodeId: string;
    readonly stableId: string;
  };
  readonly textPropertyNames: {
    readonly label: string;
    readonly supportingText: string;
    readonly text: string;
  };
  readonly type: "components.input.ensure";
  readonly typography: {
    readonly lineHeightStrategy: "resolved-percent";
    readonly variableBindings: 12;
  };
  readonly variants: {
    readonly created: number;
    readonly unchanged: number;
    readonly updated: number;
  };
}

export class InputWriterError extends Error {
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
    this.name = "InputWriterError";
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

function marker(entity: SharedPluginDataPort): ComponentMarker | null {
  try {
    const value = JSON.parse(
      entity.getSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
      ),
    ) as unknown;
    return isRecord(value) &&
      value.schemaVersion === "1.0.0" &&
      value.assetType === "component" &&
      typeof value.projectId === "string" &&
      typeof value.assetId === "string" &&
      value.channel === "library" &&
      Number.isSafeInteger(value.majorVersion) &&
      ["component-set", "component-variant", "component-layer"].includes(
        String(value.role),
      ) &&
      typeof value.slotId === "string" &&
      ["creating", "applied"].includes(String(value.phase))
      ? (value as unknown as ComponentMarker)
      : null;
  } catch {
    return null;
  }
}

function tokenMarker(entity: SharedPluginDataPort): TokenVariableMarker | null {
  try {
    const value = JSON.parse(
      entity.getSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
      ),
    ) as unknown;
    return isRecord(value) &&
      value.schemaVersion === "1.0.0" &&
      value.assetType === "token-set" &&
      typeof value.projectId === "string" &&
      typeof value.assetId === "string" &&
      value.channel === "library" &&
      Number.isSafeInteger(value.majorVersion) &&
      value.role === "variable" &&
      typeof value.slotId === "string" &&
      value.phase === "applied" &&
      typeof value.assetVersion === "string" &&
      typeof value.appliedDigest === "string"
      ? (value as unknown as TokenVariableMarker)
      : null;
  } catch {
    return null;
  }
}

function fail(
  code: ErrorCode,
  message: string,
  recoveryInstruction: string,
  completedSteps: readonly string[] = [],
): InputWriterError {
  return new InputWriterError({
    code,
    completedSteps,
    message,
    recoveryInstruction,
  });
}

function markerMatches(
  value: ComponentMarker,
  plan: FigmaInputPlan,
  role: ComponentRole,
  slotId: string,
): boolean {
  return (
    value.projectId === plan.source.projectId &&
    value.assetId === plan.source.assetId &&
    value.majorVersion === plan.componentSet.majorVersion &&
    value.role === role &&
    value.slotId === slotId
  );
}

function markerFor(
  plan: FigmaInputPlan,
  context: EnsureInputContext,
  role: ComponentRole,
  slotId: string,
  phase: "applied" | "creating",
): ComponentMarker {
  const common = {
    assetId: plan.source.assetId,
    assetType: "component" as const,
    channel: "library" as const,
    majorVersion: plan.componentSet.majorVersion,
    phase,
    projectId: plan.source.projectId,
    role,
    schemaVersion: "1.0.0" as const,
    slotId,
  };
  return phase === "applied"
    ? {
        ...common,
        appliedDigest: plan.source.contentDigest,
        approvalId: context.approvalId,
        assetVersion: plan.source.assetVersion,
      }
    : {
        ...common,
        pendingOperationId: context.operationId,
        targetAssetVersion: plan.source.assetVersion,
        targetDigest: plan.source.contentDigest,
      };
}

function setMarker(
  entity: SharedPluginDataPort,
  value: ComponentMarker,
): boolean {
  const serialized = canonicalizeJson(value);
  if (
    entity.getSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      MANAGED_ASSET_SHARED_KEY,
    ) === serialized
  ) {
    return false;
  }
  entity.setSharedPluginData(
    HATCHKIT_SHARED_NAMESPACE,
    MANAGED_ASSET_SHARED_KEY,
    serialized,
  );
  return true;
}

function validateVersion(value: ComponentMarker, plan: FigmaInputPlan): void {
  if (value.phase === "creating") {
    if (
      value.targetAssetVersion !== plan.source.assetVersion ||
      value.targetDigest !== plan.source.contentDigest
    ) {
      throw fail(
        "CONTENT_DIGEST_CONFLICT",
        "A partial Input write belongs to different approved content.",
        "Finish or explicitly recover the existing partial write before retrying.",
      );
    }
    return;
  }
  if (value.assetVersion === undefined || value.appliedDigest === undefined) {
    throw fail(
      "IDENTITY_CONFLICT",
      "A managed Input marker is incomplete.",
      "Inspect and repair the marker before retrying.",
    );
  }
  const comparison = compareSemanticVersions(
    value.assetVersion,
    plan.source.assetVersion,
  );
  if (comparison > 0) {
    throw fail(
      "DOWNGRADE_BLOCKED",
      "The Figma Input is newer than the requested Contract.",
      "Use the current Contract or create an approved rollback plan.",
    );
  }
  if (comparison === 0 && value.appliedDigest !== plan.source.contentDigest) {
    throw fail(
      "CONTENT_DIGEST_CONFLICT",
      "The same Input version has a different content digest.",
      "Publish corrected content under a new version and approval.",
    );
  }
}

function current(value: ComponentMarker | null, plan: FigmaInputPlan): boolean {
  return (
    value?.phase === "applied" &&
    value.assetVersion === plan.source.assetVersion &&
    value.appliedDigest === plan.source.contentDigest
  );
}

function findOne<T extends SharedPluginDataPort>(
  entities: readonly T[],
  plan: FigmaInputPlan,
  role: ComponentRole,
  slotId: string,
): T | undefined {
  const matches = entities.filter((entity) => {
    const value = marker(entity);
    return value !== null && markerMatches(value, plan, role, slotId);
  });
  if (matches.length > 1) {
    throw fail(
      "IDENTITY_CONFLICT",
      `Multiple managed assets claim '${role}/${slotId}'.`,
      "Resolve the duplicate stable identities before retrying.",
    );
  }
  const entity = matches[0];
  const value = entity === undefined ? null : marker(entity);
  if (value !== null) validateVersion(value, plan);
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
  if (variable === undefined) throw new Error("Input Variable index drifted.");
  return variable;
}

async function resolveVariables(
  port: FigmaInputPort,
  plan: FigmaInputPlan,
): Promise<ReadonlyMap<string, ButtonVariablePort>> {
  const expected = new Map<string, "COLOR" | "FLOAT" | "STRING">();
  [
    ...plan.sharedBindings,
    ...plan.variants.flatMap(({ bindings }) => bindings),
  ].forEach((binding) =>
    expected.set(
      binding.variableStableId,
      binding.kind === "color" ? "COLOR" : "FLOAT",
    ),
  );
  Object.values(plan.typography).forEach((typography) => {
    expected.set(typography.fontFamily.variableStableId, "STRING");
    expected.set(typography.fontSize.variableStableId, "FLOAT");
    expected.set(typography.fontWeight.variableStableId, "FLOAT");
    expected.set(typography.letterSpacing.variableStableId, "FLOAT");
  });
  const matches = new Map<string, ButtonVariablePort[]>();
  for (const variable of await port.getVariables()) {
    const value = tokenMarker(variable);
    if (value === null) continue;
    const stableId = `${value.projectId}/token-set/${value.assetId}/variables/major-${String(value.majorVersion)}/variable/${value.slotId}`;
    if (!expected.has(stableId)) continue;
    if (
      value.projectId !== plan.tokenSource.projectId ||
      value.assetId !== plan.tokenSource.assetId ||
      value.assetVersion !== plan.tokenSource.assetVersion ||
      value.appliedDigest !== plan.tokenSource.contentDigest
    ) {
      throw fail(
        "VERSION_CONFLICT",
        `Required Variable '${stableId}' is not from the approved Token source.`,
        "Run variables.ensure for the exact approved Token Set before writing Input components.",
      );
    }
    matches.set(stableId, [...(matches.get(stableId) ?? []), variable]);
  }
  const resolved = new Map<string, ButtonVariablePort>();
  for (const [stableId, type] of expected) {
    const candidates = matches.get(stableId) ?? [];
    if (candidates.length !== 1) {
      throw fail(
        candidates.length === 0 ? "IDENTITY_NOT_FOUND" : "IDENTITY_CONFLICT",
        `Expected exactly one applied Variable '${stableId}', found ${String(candidates.length)}.`,
        "Run variables.ensure or resolve duplicate managed Variables before retrying.",
      );
    }
    const variable = candidates[0];
    if (variable === undefined || variable.resolvedType !== type) {
      throw fail(
        "IDENTITY_CONFLICT",
        `Variable '${stableId}' has the wrong Figma type.`,
        "Repair the managed Variable through the approved Token flow.",
      );
    }
    resolved.set(stableId, variable);
  }
  return resolved;
}

function colorBinding(
  port: FigmaInputPort,
  variables: ReadonlyMap<string, ButtonVariablePort>,
  binding: FigmaInputPlan["sharedBindings"][number],
): unknown {
  if (binding.kind !== "color") throw new Error("Expected a color binding.");
  return port.bindColor(
    variableOrThrow(variables, binding.variableStableId),
    binding,
  );
}

async function configureText(
  port: FigmaInputPort,
  text: InputTextPort,
  typography: FigmaInputPlan["typography"]["label"],
  fill: FigmaInputPlan["sharedBindings"][number],
  characters: string,
  name: string,
  variables: ReadonlyMap<string, ButtonVariablePort>,
): Promise<boolean> {
  if (fill.kind !== "color") throw new Error("Expected a text color binding.");
  await port.loadFont(
    String(typography.fontFamily.fallback),
    typography.fontStyleFallback,
  );
  let mutated = setValue(text, "name", name);
  mutated = setValue(text, "characters", characters) || mutated;
  mutated =
    setValue(text, "fontName", {
      family: String(typography.fontFamily.fallback),
      style: typography.fontStyleFallback,
    }) || mutated;
  mutated =
    setValue(text, "fontSize", Number(typography.fontSize.fallback)) || mutated;
  mutated =
    setValue(text, "letterSpacing", {
      unit: "PIXELS",
      value: Number(typography.letterSpacing.fallback),
    }) || mutated;
  mutated =
    setValue(text, "lineHeight", {
      unit: "PERCENT",
      value: typography.lineHeight.fallback,
    }) || mutated;
  mutated =
    setValue(text, "fills", colorBinding(port, variables, fill)) || mutated;
  for (const [field, planned] of [
    ["fontFamily", typography.fontFamily],
    ["fontSize", typography.fontSize],
    ["fontWeight", typography.fontWeight],
    ["letterSpacing", typography.letterSpacing],
  ] as const) {
    mutated =
      text.setBoundVariable(
        field,
        variableOrThrow(variables, planned.variableStableId),
      ) || mutated;
  }
  return mutated;
}

function findBinding(
  plan: FigmaInputPlan,
  variant: FigmaInputPlan["variants"][number],
  target: string,
): FigmaInputPlan["sharedBindings"][number] {
  const binding = [...plan.sharedBindings, ...variant.bindings].find(
    (candidate) => candidate.target === target,
  );
  if (binding === undefined)
    throw new Error(`Input binding '${target}' drifted.`);
  return binding;
}

async function configureVariant(
  port: FigmaInputPort,
  component: InputComponentPort,
  variant: FigmaInputPlan["variants"][number],
  plan: FigmaInputPlan,
  variables: ReadonlyMap<string, ButtonVariablePort>,
  context: EnsureInputContext,
  position: { readonly x: number; readonly y: number },
): Promise<{
  readonly label: InputTextPort;
  readonly mutated: boolean;
  readonly support: InputTextPort;
  readonly value: InputTextPort;
}> {
  const layer = (suffix: string) => `${variant.slotId}/${suffix}`;
  let label = findOne(
    component.children,
    plan,
    "component-layer",
    layer("label"),
  );
  let field = findOne(
    component.children,
    plan,
    "component-layer",
    layer("field"),
  );
  let support = findOne(
    component.children,
    plan,
    "component-layer",
    layer("support"),
  );
  if (
    component.children.some((child) => {
      const value = marker(child);
      return (
        value === null ||
        ![layer("label"), layer("field"), layer("support")].includes(
          value.slotId,
        )
      );
    }) ||
    component.totalChildCount > 3
  ) {
    throw fail(
      "IDENTITY_CONFLICT",
      `Variant '${variant.slotId}' has unmanaged or duplicate root layers.`,
      "Restore exactly Label, Field and Supporting text layers before retrying.",
    );
  }
  if (
    (label !== undefined && label.kind !== "text") ||
    (field !== undefined && field.kind !== "field") ||
    (support !== undefined && support.kind !== "text")
  ) {
    throw fail(
      "IDENTITY_CONFLICT",
      `Variant '${variant.slotId}' has a managed layer with the wrong Figma node type.`,
      "Restore Text, Frame and Text node types for Label, Field and Supporting text.",
    );
  }
  let mutated = false;
  if (!current(marker(component), plan)) {
    mutated = setMarker(
      component,
      markerFor(plan, context, "component-variant", variant.slotId, "creating"),
    );
  }
  mutated = setValue(component, "name", variant.figmaName) || mutated;
  mutated = setValue(component, "description", variant.displayName) || mutated;
  mutated = setValue(component, "layoutMode", "VERTICAL") || mutated;
  mutated = setValue(component, "primaryAxisSizingMode", "AUTO") || mutated;
  mutated = setValue(component, "counterAxisSizingMode", "FIXED") || mutated;
  mutated = component.resizeWidth(plan.layout.width) || mutated;
  mutated = setValue(component, "x", position.x) || mutated;
  mutated = setValue(component, "y", position.y) || mutated;

  const gap = findBinding(plan, variant, "layout.gap");
  if (gap.kind !== "float") throw new Error("Input gap binding drifted.");
  mutated = setValue(component, "itemSpacing", gap.fallback) || mutated;
  mutated =
    component.setBoundVariable(
      "itemSpacing",
      variableOrThrow(variables, gap.variableStableId),
    ) || mutated;

  if (label === undefined) {
    label = port.createText();
    component.appendChild(label);
    mutated = true;
  }
  if (field === undefined || field.kind !== "field") {
    field = port.createFrame();
    component.appendChild(field);
    mutated = true;
  }
  if (support === undefined || support.kind !== "text") {
    support = port.createText();
    component.appendChild(support);
    mutated = true;
  }
  if (label.kind !== "text") throw new Error("Input Label layer drifted.");
  let value = findOne(field.children, plan, "component-layer", layer("value"));
  if (
    field.totalChildCount > 1 ||
    (field.totalChildCount === 1 && value === undefined)
  ) {
    throw fail(
      "IDENTITY_CONFLICT",
      `Variant '${variant.slotId}' Field must contain exactly one managed Value layer.`,
      "Remove unmanaged Field children before retrying.",
    );
  }
  if (value === undefined) {
    value = port.createText();
    field.appendChild(value);
    mutated = true;
  }
  mutated = component.setChildrenOrder([label, field, support]) || mutated;

  for (const [entity, suffix] of [
    [label, "label"],
    [field, "field"],
    [value, "value"],
    [support, "support"],
  ] as const) {
    if (!current(marker(entity), plan)) {
      mutated =
        setMarker(
          entity,
          markerFor(
            plan,
            context,
            "component-layer",
            layer(suffix),
            "creating",
          ),
        ) || mutated;
    }
  }

  mutated = setValue(field, "name", "Field") || mutated;
  mutated = setValue(field, "layoutMode", "HORIZONTAL") || mutated;
  mutated = setValue(field, "primaryAxisSizingMode", "FIXED") || mutated;
  mutated = setValue(field, "counterAxisSizingMode", "FIXED") || mutated;
  mutated = setValue(field, "counterAxisAlignItems", "CENTER") || mutated;
  mutated = setValue(field, "strokeAlign", "INSIDE") || mutated;
  const width = findBinding(plan, variant, "field.border-width");
  const height = findBinding(plan, variant, "field.height");
  const padding = findBinding(plan, variant, "field.padding-inline");
  const radius = findBinding(plan, variant, "field.radius");
  const background = findBinding(plan, variant, "field.background");
  const border = findBinding(plan, variant, "field.border");
  if (
    width.kind !== "float" ||
    height.kind !== "float" ||
    padding.kind !== "float" ||
    radius.kind !== "float" ||
    background.kind !== "color" ||
    border.kind !== "color"
  ) {
    throw new Error("Input Field binding types drifted.");
  }
  mutated = field.resize(plan.layout.width, height.fallback) || mutated;
  mutated = setValue(field, "paddingLeft", padding.fallback) || mutated;
  mutated = setValue(field, "paddingRight", padding.fallback) || mutated;
  mutated = setValue(field, "cornerRadius", radius.fallback) || mutated;
  mutated = setValue(field, "strokeWeight", width.fallback) || mutated;
  mutated =
    setValue(field, "fills", colorBinding(port, variables, background)) ||
    mutated;
  mutated =
    setValue(field, "strokes", colorBinding(port, variables, border)) ||
    mutated;
  for (const [fieldName, binding] of [
    ["height", height],
    ["paddingLeft", padding],
    ["paddingRight", padding],
    ["cornerRadius", radius],
    ["strokeWeight", width],
  ] as const) {
    mutated =
      field.setBoundVariable(
        fieldName,
        variableOrThrow(variables, binding.variableStableId),
      ) || mutated;
  }

  mutated =
    (await configureText(
      port,
      label,
      plan.typography.label,
      findBinding(plan, variant, "label.fill"),
      plan.componentSet.properties.label.defaultValue,
      "Label",
      variables,
    )) || mutated;
  mutated =
    (await configureText(
      port,
      value,
      plan.typography.value,
      findBinding(plan, variant, "value.fill"),
      variant.textDefaults.text,
      "Text",
      variables,
    )) || mutated;
  mutated =
    (await configureText(
      port,
      support,
      plan.typography.support,
      findBinding(plan, variant, "support.fill"),
      variant.textDefaults.supportingText,
      "Supporting text",
      variables,
    )) || mutated;
  return { label, mutated, support, value };
}

function ensureTextProperties(
  componentSet: InputComponentSetPort,
  plan: FigmaInputPlan,
): {
  readonly mutated: boolean;
  readonly names: EnsureInputResult["textPropertyNames"];
} {
  const expected = {
    label: plan.componentSet.properties.label,
    supportingText: plan.componentSet.properties.supportingText,
    text: plan.componentSet.properties.text,
  };
  const definitions = componentSet.componentPropertyDefinitions;
  const textDefinitions = Object.entries(definitions).filter(
    ([, definition]) => definition.type === "TEXT",
  );
  if (
    textDefinitions.some(
      ([name]) =>
        !Object.values(expected).some(
          (property) => name.split("#")[0] === property.name,
        ),
    )
  ) {
    throw fail(
      "IDENTITY_CONFLICT",
      "The Input Component Set has incompatible TEXT properties.",
      "Keep only the governed Label, Text and Supporting text properties.",
    );
  }
  let mutated = false;
  const names = {} as Record<keyof typeof expected, string>;
  for (const [key, property] of Object.entries(expected) as Array<
    [keyof typeof expected, (typeof expected)[keyof typeof expected]]
  >) {
    const matches = textDefinitions.filter(
      ([name]) => name.split("#")[0] === property.name,
    );
    if (matches.length > 1) {
      throw fail(
        "IDENTITY_CONFLICT",
        `Input TEXT property '${property.name}' is duplicated.`,
        "Keep exactly one managed property for each text role.",
      );
    }
    const existing = matches[0];
    if (existing === undefined) {
      names[key] = componentSet.addComponentProperty(
        property.name,
        "TEXT",
        property.defaultValue,
      );
      mutated = true;
    } else {
      const [name, definition] = existing;
      if (definition.defaultValue === property.defaultValue) names[key] = name;
      else {
        names[key] = componentSet.editComponentProperty(name, {
          defaultValue: property.defaultValue,
        });
        mutated = true;
      }
    }
  }
  return { mutated, names };
}

function assertVariantDefinitions(
  componentSet: InputComponentSetPort,
  plan: FigmaInputPlan,
): void {
  for (const property of [
    plan.componentSet.properties.state,
    plan.componentSet.properties.content,
  ]) {
    const definition = componentSet.componentPropertyDefinitions[property.name];
    if (
      definition?.type !== "VARIANT" ||
      JSON.stringify(definition.variantOptions) !==
        JSON.stringify(property.options) ||
      definition.defaultValue !== property.defaultValue
    ) {
      throw fail(
        "IDENTITY_CONFLICT",
        `Figma Variant property '${property.name}' does not match the approved Input plan.`,
        "Resolve the Component Set property conflict before retrying.",
      );
    }
  }
}

export async function ensureFigmaInput(
  port: FigmaInputPort,
  plan: FigmaInputPlan,
  context: EnsureInputContext,
): Promise<EnsureInputResult> {
  const binding = getFigmaLibraryFileBinding(port.document);
  if (
    binding === null ||
    binding.projectId !== context.projectId ||
    binding.fileBindingId !== context.fileBindingId ||
    plan.source.projectId !== context.projectId
  ) {
    throw fail(
      "FILE_BINDING_MISMATCH",
      "The open Figma file is not the bound Input library.",
      "Open or bind the registered design-system library before retrying.",
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
        candidate.name === plan.componentSet.name && marker(candidate) === null,
    )
  ) {
    throw fail(
      "UNMANAGED_ASSET",
      `An unmanaged Component Set named '${plan.componentSet.name}' already exists.`,
      "Rename it or use an explicit adoption flow; Hatchkit will not adopt by name.",
    );
  }
  if (componentSet !== undefined && componentSet.children.length !== 8) {
    throw fail(
      "IDENTITY_CONFLICT",
      "The managed Input Set does not contain exactly eight Variants.",
      "Restore the approved State and Content matrix before retrying.",
    );
  }
  const rootChildren =
    componentSet === undefined
      ? null
      : new Set(componentSet.children.map(({ id }) => id));
  const completedSteps = ["file-binding-verified", "token-variables-verified"];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let rootCreated = false;
  const resolved: Array<{
    component: InputComponentPort;
    label: InputTextPort;
    support: InputTextPort;
    value: InputTextPort;
    slotId: string;
  }> = [];
  try {
    for (const variant of plan.variants) {
      let component = findOne(
        components,
        plan,
        "component-variant",
        variant.slotId,
      );
      if (
        componentSet !== undefined &&
        (component === undefined || !rootChildren?.has(component.id))
      ) {
        throw fail(
          "IDENTITY_CONFLICT",
          `The Input Set is missing Variant '${variant.slotId}'.`,
          "Restore the exact managed Variant children before retrying.",
        );
      }
      const wasCreated = component === undefined;
      if (component === undefined) {
        if (
          components.some(
            (candidate) =>
              candidate.name === variant.figmaName &&
              marker(candidate) === null,
          )
        ) {
          throw fail(
            "UNMANAGED_ASSET",
            `An unmanaged Component named '${variant.figmaName}' already exists.`,
            "Rename it or use an explicit adoption flow before retrying.",
          );
        }
        component = port.createComponent();
        created += 1;
      }
      const stateIndex = plan.componentSet.properties.state.options.indexOf(
        variant.selections.state,
      );
      const contentIndex = plan.componentSet.properties.content.options.indexOf(
        variant.selections.content,
      );
      const configured = await configureVariant(
        port,
        component,
        variant,
        plan,
        variables,
        context,
        { x: contentIndex * 360, y: stateIndex * 180 },
      );
      if (!wasCreated && configured.mutated) updated += 1;
      if (!wasCreated && !configured.mutated) unchanged += 1;
      resolved.push({ component, slotId: variant.slotId, ...configured });
      completedSteps.push(`variant:${variant.slotId}`);
    }
    if (componentSet === undefined) {
      const ids = new Set(resolved.map(({ component }) => component.id));
      const recovery = componentSets.filter(
        (candidate) =>
          marker(candidate) === null &&
          candidate.children.length === ids.size &&
          candidate.children.every(({ id }) => ids.has(id)),
      );
      if (recovery.length > 1) {
        throw fail(
          "IDENTITY_CONFLICT",
          "Multiple unmarked Sets contain the managed Input Variants.",
          "Resolve the ambiguous partial write before retrying.",
        );
      }
      componentSet = recovery[0];
    }
    if (componentSet === undefined) {
      componentSet = port.combineAsVariants(
        resolved.map(({ component }) => component),
      );
      rootCreated = true;
    }
    const actualIds = new Set(componentSet.children.map(({ id }) => id));
    if (
      componentSet.children.length !== resolved.length ||
      resolved.some(({ component }) => !actualIds.has(component.id))
    ) {
      throw fail(
        "IDENTITY_CONFLICT",
        "The managed Input Set has missing or unmanaged Variant children.",
        "Restore the exact eight managed Variants before retrying.",
      );
    }
    let rootMutated = false;
    if (!current(marker(componentSet), plan)) {
      rootMutated = setMarker(
        componentSet,
        markerFor(plan, context, "component-set", "root", "creating"),
      );
    }
    rootMutated =
      setValue(componentSet, "name", plan.componentSet.name) || rootMutated;
    rootMutated =
      setValue(componentSet, "description", plan.componentSet.description) ||
      rootMutated;
    const properties = ensureTextProperties(componentSet, plan);
    rootMutated = properties.mutated || rootMutated;
    assertVariantDefinitions(componentSet, plan);
    resolved.forEach(({ label, support, value }) => {
      rootMutated =
        setValue(label, "componentPropertyReferences", {
          characters: properties.names.label,
        }) || rootMutated;
      rootMutated =
        setValue(value, "componentPropertyReferences", {
          characters: properties.names.text,
        }) || rootMutated;
      rootMutated =
        setValue(support, "componentPropertyReferences", {
          characters: properties.names.supportingText,
        }) || rootMutated;
    });
    resolved.forEach(({ component, label, slotId, support, value }) => {
      for (const [entity, suffix] of [
        [label, "label"],
        [component.children.find((child) => child.kind === "field"), "field"],
        [value, "value"],
        [support, "support"],
      ] as const) {
        if (entity === undefined) throw new Error("Input layer index drifted.");
        setMarker(
          entity,
          markerFor(
            plan,
            context,
            "component-layer",
            `${slotId}/${suffix}`,
            "applied",
          ),
        );
      }
      setMarker(
        component,
        markerFor(plan, context, "component-variant", slotId, "applied"),
      );
    });
    setMarker(
      componentSet,
      markerFor(plan, context, "component-set", "root", "applied"),
    );
    completedSteps.push("component-set-audited", "applied-markers-written");
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
      textPropertyNames: properties.names,
      type: "components.input.ensure",
      typography: {
        lineHeightStrategy: "resolved-percent",
        variableBindings: 12,
      },
      variants: { created, unchanged, updated },
    };
  } catch (cause) {
    if (cause instanceof InputWriterError) throw cause;
    throw fail(
      "PARTIAL_WRITE",
      "The Input write stopped after creating or updating Figma nodes.",
      "Retry the same approved operation; stable creating markers will resume it.",
      completedSteps,
    );
  }
}

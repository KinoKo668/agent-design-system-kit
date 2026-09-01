import {
  ERROR_DEFINITIONS,
  type ErrorCode,
  type WriterCommandDelivery,
  type WriterPluginResult,
} from "@agent-design-system-kit/core";

export const FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION = "1.0.0" as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const STABLE_ID_SEGMENT_PATTERN = /^[a-z][a-z0-9-]*$/u;
const STABLE_ASSET_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*$/u;
const CONTENT_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*))*))?(?:\+([0-9a-z-]+(?:\.[0-9a-z-]+)*))?$/iu;
const TOKEN_APPROVAL_ID_PATTERN = /^approval\.tokens\.[a-z0-9.+-]+$/u;
const COMPONENT_APPROVAL_ID_PATTERN = /^approval\.component\.[a-z0-9.+-]+$/u;
const DELIVERY_KEYS = new Set([
  "approval",
  "attempt",
  "command",
  "idempotencyKey",
  "operationId",
  "projectId",
  "schemaVersion",
  "source",
  "target",
]);
const COMMAND_KEYS = new Set(["payload", "type"]);
const SOURCE_KEYS = new Set(["client"]);
const SUCCESS_RESULT_KEYS = new Set([
  "ok",
  "operationId",
  "pluginInstanceId",
  "result",
  "schemaVersion",
]);
const FAILURE_RESULT_KEYS = new Set([
  "error",
  "ok",
  "operationId",
  "pluginInstanceId",
  "schemaVersion",
]);
const PLUGIN_ERROR_KEYS = new Set([
  "code",
  "completedSteps",
  "message",
  "recoveryInstruction",
]);
const PLAN_KEYS = new Set([
  "collection",
  "deferredTypography",
  "schemaVersion",
  "source",
  "variables",
]);
const COLLECTION_KEYS = new Set([
  "defaultModeId",
  "description",
  "majorVersion",
  "modes",
  "name",
  "stableId",
]);
const MODE_KEYS = new Set(["name", "stableId"]);
const PLAN_SOURCE_KEYS = new Set([
  "assetId",
  "assetVersion",
  "contentDigest",
  "projectId",
]);
const VARIABLE_KEYS = new Set([
  "codeSyntax",
  "description",
  "hiddenFromPublishing",
  "name",
  "resolvedType",
  "scopes",
  "stableId",
  "tokenPath",
  "tokenType",
  "values",
]);
const MODE_VALUE_KEYS = new Set(["modeStableId", "value"]);
const DEFERRED_KEYS = new Set(["description", "stableId", "tokenPath"]);
const VARIABLE_TYPES = new Set(["COLOR", "FLOAT", "STRING"]);
const TOKEN_TYPES = new Set([
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "number",
]);
const VARIABLE_SCOPES = new Set([
  "CORNER_RADIUS",
  "FONT_FAMILY",
  "FONT_SIZE",
  "FONT_WEIGHT",
  "FRAME_FILL",
  "GAP",
  "LETTER_SPACING",
  "LINE_HEIGHT",
  "OPACITY",
  "SHAPE_FILL",
  "STROKE_COLOR",
  "STROKE_FLOAT",
  "TEXT_FILL",
  "WIDTH_HEIGHT",
]);
const BUTTON_PLAN_KEYS = new Set([
  "componentSet",
  "schemaVersion",
  "sharedBindings",
  "source",
  "tokenSource",
  "typography",
  "variants",
]);
const STYLE_AUDIT_PLAN_KEYS = new Set([
  "fileBindingId",
  "projectId",
  "registeredVariables",
  "schemaVersion",
  "scope",
]);
const STYLE_AUDIT_VARIABLE_KEYS = new Set(["stableId", "tokenPath"]);
const STYLE_AUDIT_RESULT_KEYS = new Set([
  "findings",
  "page",
  "passed",
  "schemaVersion",
  "scope",
  "summary",
  "type",
]);
const STYLE_AUDIT_FINDING_KEYS = new Set([
  "actual",
  "code",
  "expected",
  "field",
  "kind",
  "node",
  "recoveryInstruction",
  "severity",
]);
const STYLE_AUDIT_SUMMARY_KEYS = new Set([
  "auditedStyles",
  "hardCodedStyles",
  "nodesWithFindings",
  "registeredBindings",
  "unregisteredVariables",
]);
const COMPONENT_AUDIT_PLAN_KEYS = new Set([
  "fileBindingId",
  "projectId",
  "schemaVersion",
  "scope",
  "sources",
]);
const COMPONENT_AUDIT_SOURCE_KEYS = new Set([
  "assetId",
  "assetVersion",
  "componentSetNodeId",
  "componentSetStableId",
  "contentDigest",
  "variants",
]);
const COMPONENT_AUDIT_VARIANT_KEYS = new Set([
  "figmaName",
  "properties",
  "slotId",
  "stableId",
]);
const COMPONENT_AUDIT_RESULT_KEYS = new Set([
  "findings",
  "page",
  "passed",
  "schemaVersion",
  "scope",
  "summary",
  "type",
]);
const COMPONENT_AUDIT_FINDING_KEYS = new Set([
  "actual",
  "code",
  "expected",
  "node",
  "recoveryInstruction",
  "severity",
]);
const COMPONENT_AUDIT_SUMMARY_KEYS = new Set([
  "auditedNodes",
  "compliantInstances",
  "detachedOrApproximate",
  "provenanceMismatches",
  "unregisteredSources",
  "unregisteredVariants",
  "variantPropertyMismatches",
]);
const DRIFT_PLAN_KEYS = new Set([
  "componentSets",
  "fileBindingId",
  "projectId",
  "schemaVersion",
  "scope",
  "tokenCollections",
]);
const DRIFT_TOKEN_KEYS = new Set([
  "assetId",
  "assetVersion",
  "contentDigest",
  "stableId",
  "variableStableIds",
]);
const DRIFT_COMPONENT_KEYS = new Set([
  "assetId",
  "assetVersion",
  "componentSetKey",
  "contentDigest",
  "nodeId",
  "stableId",
  "variantStableIds",
]);
const DRIFT_RESULT_KEYS = new Set([
  "findings",
  "passed",
  "schemaVersion",
  "scope",
  "summary",
  "type",
]);
const DRIFT_FINDING_KEYS = new Set([
  "actual",
  "code",
  "expected",
  "kind",
  "physicalId",
  "recoveryInstruction",
  "severity",
  "stableId",
]);
const DRIFT_SUMMARY_KEYS = new Set([
  "auditedFigmaAssets",
  "duplicateAssets",
  "invalidMarkers",
  "locatorMismatches",
  "mismatchedChildren",
  "mismatchedDigests",
  "mismatchedVersions",
  "missingInFigma",
  "missingInRegistry",
]);
const DRIFT_CODES = new Set([
  "REGISTRY_ASSET_MISSING_IN_FIGMA",
  "FIGMA_ASSET_MISSING_IN_REGISTRY",
  "FIGMA_ASSET_DUPLICATE",
  "FIGMA_MARKER_INVALID",
  "FIGMA_ASSET_VERSION_MISMATCH",
  "FIGMA_ASSET_DIGEST_MISMATCH",
  "FIGMA_LOCATOR_MISMATCH",
  "FIGMA_CHILD_SET_MISMATCH",
]);
const BUTTON_SET_KEYS = new Set([
  "description",
  "majorVersion",
  "name",
  "properties",
  "slotId",
  "stableId",
]);
const BUTTON_TOKEN_SOURCE_KEYS = new Set([
  "assetId",
  "assetVersion",
  "collectionStableId",
  "contentDigest",
  "projectId",
]);
const BUTTON_TYPOGRAPHY_KEYS = new Set([
  "fontFamily",
  "fontSize",
  "fontStyleFallback",
  "fontWeight",
  "letterSpacing",
  "lineHeight",
  "tokenPath",
]);
const BUTTON_VARIANT_KEYS = new Set([
  "bindings",
  "displayName",
  "figmaName",
  "id",
  "selections",
  "slotId",
  "stableId",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isBoundedString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum
  );
}

function isUuid(value: unknown): value is string {
  return isBoundedString(value, 1, 64) && UUID_PATTERN.test(value);
}

function isStableIdSegment(value: unknown): value is string {
  return isBoundedString(value, 1, 64) && STABLE_ID_SEGMENT_PATTERN.test(value);
}

function isStableAssetId(value: unknown): value is string {
  return isBoundedString(value, 1, 192) && STABLE_ASSET_ID_PATTERN.test(value);
}

function isPlannedValue(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "alias":
      return (
        hasOnlyKeys(value, new Set(["kind", "targetStableId"])) &&
        isStableAssetId(value.targetStableId)
      );
    case "color":
      return (
        hasOnlyKeys(value, new Set(["a", "b", "g", "kind", "r"])) &&
        [value.a, value.b, value.g, value.r].every(
          (channel) =>
            typeof channel === "number" && channel >= 0 && channel <= 1,
        )
      );
    case "float":
      return (
        hasOnlyKeys(value, new Set(["kind", "value"])) &&
        typeof value.value === "number" &&
        Number.isFinite(value.value)
      );
    case "string":
      return (
        hasOnlyKeys(value, new Set(["kind", "value"])) &&
        isBoundedString(value.value, 1, 500)
      );
    default:
      return false;
  }
}

function isVariableSpec(value: unknown, modeIds: ReadonlySet<string>): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, VARIABLE_KEYS) &&
    isBoundedString(value.codeSyntax, 1, 500) &&
    isBoundedString(value.description, 1, 500) &&
    typeof value.hiddenFromPublishing === "boolean" &&
    isBoundedString(value.name, 1, 500) &&
    typeof value.resolvedType === "string" &&
    VARIABLE_TYPES.has(value.resolvedType) &&
    Array.isArray(value.scopes) &&
    value.scopes.every(
      (scope) => typeof scope === "string" && VARIABLE_SCOPES.has(scope),
    ) &&
    isStableAssetId(value.stableId) &&
    isStableAssetId(value.tokenPath) &&
    typeof value.tokenType === "string" &&
    TOKEN_TYPES.has(value.tokenType) &&
    Array.isArray(value.values) &&
    value.values.length === modeIds.size &&
    value.values.every(
      (entry) =>
        isRecord(entry) &&
        hasOnlyKeys(entry, MODE_VALUE_KEYS) &&
        isStableAssetId(entry.modeStableId) &&
        modeIds.has(entry.modeStableId) &&
        isPlannedValue(entry.value),
    )
  );
}

function hasValidPlanRelationships(
  plan: Record<string, unknown>,
  modeIds: ReadonlySet<string>,
): boolean {
  if (
    !isRecord(plan.collection) ||
    !isRecord(plan.source) ||
    !Array.isArray(plan.variables) ||
    typeof plan.collection.stableId !== "string" ||
    typeof plan.collection.majorVersion !== "number" ||
    typeof plan.source.projectId !== "string" ||
    typeof plan.source.assetId !== "string" ||
    typeof plan.source.assetVersion !== "string"
  ) {
    return false;
  }
  const majorText = plan.source.assetVersion.split(".")[0];
  const expectedCollectionId = `${plan.source.projectId}/token-set/${plan.source.assetId}/variables/major-${String(plan.collection.majorVersion)}`;
  if (
    plan.collection.stableId !== expectedCollectionId ||
    Number(majorText) !== plan.collection.majorVersion
  ) {
    return false;
  }

  const identities = new Map<string, string>();
  const names = new Set<string>();
  const paths = new Set<string>();
  for (const variable of plan.variables) {
    if (
      !isRecord(variable) ||
      typeof variable.stableId !== "string" ||
      typeof variable.name !== "string" ||
      typeof variable.tokenPath !== "string" ||
      typeof variable.resolvedType !== "string" ||
      typeof variable.hiddenFromPublishing !== "boolean" ||
      !Array.isArray(variable.scopes) ||
      !Array.isArray(variable.values) ||
      identities.has(variable.stableId) ||
      names.has(variable.name) ||
      paths.has(variable.tokenPath) ||
      variable.name !== variable.tokenPath ||
      variable.stableId !==
        `${plan.collection.stableId}/variable/${variable.tokenPath}`
    ) {
      return false;
    }
    const tier = variable.tokenPath.split("/")[0];
    if (
      (tier === "primitive" &&
        (!variable.hiddenFromPublishing || variable.scopes.length > 0)) ||
      ((tier === "semantic" || tier === "component") &&
        (variable.hiddenFromPublishing || variable.scopes.length === 0)) ||
      new Set(variable.scopes).size !== variable.scopes.length
    ) {
      return false;
    }
    const valueModeIds = new Set<string>();
    for (const entry of variable.values) {
      if (
        !isRecord(entry) ||
        typeof entry.modeStableId !== "string" ||
        !modeIds.has(entry.modeStableId) ||
        valueModeIds.has(entry.modeStableId)
      ) {
        return false;
      }
      valueModeIds.add(entry.modeStableId);
    }
    if (valueModeIds.size !== modeIds.size) return false;
    identities.set(variable.stableId, variable.resolvedType);
    names.add(variable.name);
    paths.add(variable.tokenPath);
  }

  for (const variable of plan.variables) {
    if (
      !isRecord(variable) ||
      typeof variable.resolvedType !== "string" ||
      !Array.isArray(variable.values)
    ) {
      return false;
    }
    for (const entry of variable.values) {
      if (!isRecord(entry) || !isRecord(entry.value)) return false;
      if (entry.value.kind === "alias") {
        if (
          typeof entry.value.targetStableId !== "string" ||
          identities.get(entry.value.targetStableId) !== variable.resolvedType
        ) {
          return false;
        }
      } else {
        const expectedKind =
          variable.resolvedType === "COLOR"
            ? "color"
            : variable.resolvedType === "FLOAT"
              ? "float"
              : "string";
        if (entry.value.kind !== expectedKind) return false;
      }
    }
  }
  return true;
}

function isVariablePlan(value: unknown): value is Record<string, unknown> {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, PLAN_KEYS) ||
    value.schemaVersion !== "1.0.0" ||
    !isRecord(value.collection) ||
    !hasOnlyKeys(value.collection, COLLECTION_KEYS) ||
    !isStableAssetId(value.collection.defaultModeId) ||
    !isBoundedString(value.collection.description, 1, 500) ||
    !Number.isSafeInteger(value.collection.majorVersion) ||
    Number(value.collection.majorVersion) < 0 ||
    !Array.isArray(value.collection.modes) ||
    value.collection.modes.length < 1 ||
    value.collection.modes.length > 8 ||
    !isBoundedString(value.collection.name, 1, 120) ||
    !isStableAssetId(value.collection.stableId) ||
    !isRecord(value.source) ||
    !hasOnlyKeys(value.source, PLAN_SOURCE_KEYS) ||
    !isStableAssetId(value.source.assetId) ||
    !isBoundedString(value.source.assetVersion, 1, 128) ||
    !SEMVER_PATTERN.test(value.source.assetVersion) ||
    !isBoundedString(value.source.contentDigest, 1, 80) ||
    !CONTENT_DIGEST_PATTERN.test(value.source.contentDigest) ||
    !isStableIdSegment(value.source.projectId)
  ) {
    return false;
  }
  const modeIds = new Set<string>();
  const modeNames = new Set<string>();
  for (const mode of value.collection.modes) {
    if (
      !isRecord(mode) ||
      !hasOnlyKeys(mode, MODE_KEYS) ||
      !isBoundedString(mode.name, 1, 120) ||
      !isStableAssetId(mode.stableId) ||
      modeIds.has(mode.stableId) ||
      modeNames.has(mode.name) ||
      !mode.stableId.startsWith(`${value.collection.stableId}/mode/`)
    ) {
      return false;
    }
    modeIds.add(mode.stableId);
    modeNames.add(mode.name);
  }
  const structurallyValid =
    modeIds.has(value.collection.defaultModeId) &&
    Array.isArray(value.deferredTypography) &&
    value.deferredTypography.every(
      (entry) =>
        isRecord(entry) &&
        hasOnlyKeys(entry, DEFERRED_KEYS) &&
        isBoundedString(entry.description, 1, 500) &&
        isStableAssetId(entry.stableId) &&
        isStableAssetId(entry.tokenPath),
    ) &&
    Array.isArray(value.variables) &&
    value.variables.length >= 1 &&
    value.variables.length <= 2_000 &&
    value.variables.every((variable) => isVariableSpec(variable, modeIds));
  return structurallyValid && hasValidPlanRelationships(value, modeIds);
}

function isPlanSource(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, PLAN_SOURCE_KEYS) &&
    isStableAssetId(value.assetId) &&
    isBoundedString(value.assetVersion, 1, 128) &&
    SEMVER_PATTERN.test(value.assetVersion) &&
    isBoundedString(value.contentDigest, 1, 80) &&
    CONTENT_DIGEST_PATTERN.test(value.contentDigest) &&
    isStableIdSegment(value.projectId)
  );
}

function isButtonBinding(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isStableAssetId(value.variableStableId) ||
    typeof value.target !== "string"
  ) {
    return false;
  }
  if (value.kind === "color") {
    return (
      hasOnlyKeys(
        value,
        new Set(["fallback", "kind", "target", "variableStableId"]),
      ) &&
      ["container.border-color", "container.fill", "label.fill"].includes(
        value.target,
      ) &&
      isRecord(value.fallback) &&
      hasOnlyKeys(value.fallback, new Set(["a", "b", "g", "r"])) &&
      [
        value.fallback.a,
        value.fallback.b,
        value.fallback.g,
        value.fallback.r,
      ].every(
        (channel) =>
          typeof channel === "number" && channel >= 0 && channel <= 1,
      )
    );
  }
  return (
    value.kind === "float" &&
    hasOnlyKeys(
      value,
      new Set(["fallback", "kind", "target", "variableStableId"]),
    ) &&
    [
      "container.border-width",
      "container.height",
      "container.opacity",
      "container.padding-inline",
      "container.radius",
    ].includes(value.target) &&
    typeof value.fallback === "number" &&
    Number.isFinite(value.fallback)
  );
}

function isTypographyVariable(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, new Set(["fallback", "variableStableId"])) &&
    (typeof value.fallback === "number" ||
      isBoundedString(value.fallback, 1, 120)) &&
    isStableAssetId(value.variableStableId)
  );
}

function isButtonProperty(value: unknown, variant: boolean): boolean {
  if (
    !isRecord(value) ||
    !isBoundedString(value.name, 1, 120) ||
    !isBoundedString(value.defaultValue, 1, variant ? 120 : 500)
  )
    return false;
  return variant
    ? hasOnlyKeys(value, new Set(["defaultValue", "name", "options"])) &&
        Array.isArray(value.options) &&
        value.options.length >= 2 &&
        value.options.length <= 20 &&
        value.options.every((option) => isBoundedString(option, 1, 120)) &&
        new Set(value.options).size === value.options.length &&
        value.options.includes(value.defaultValue)
    : hasOnlyKeys(value, new Set(["defaultValue", "name"]));
}

function isFigmaButtonPlan(value: unknown): value is Record<string, unknown> {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, BUTTON_PLAN_KEYS) ||
    value.schemaVersion !== "1.0.0" ||
    !isPlanSource(value.source) ||
    !isRecord(value.componentSet) ||
    !hasOnlyKeys(value.componentSet, BUTTON_SET_KEYS) ||
    !isBoundedString(value.componentSet.description, 1, 2_000) ||
    !Number.isSafeInteger(value.componentSet.majorVersion) ||
    Number(value.componentSet.majorVersion) < 0 ||
    !isBoundedString(value.componentSet.name, 1, 120) ||
    value.componentSet.slotId !== "root" ||
    !isStableAssetId(value.componentSet.stableId) ||
    !isRecord(value.componentSet.properties) ||
    !hasOnlyKeys(
      value.componentSet.properties,
      new Set(["appearance", "label", "state"]),
    ) ||
    !isButtonProperty(value.componentSet.properties.appearance, true) ||
    !isButtonProperty(value.componentSet.properties.label, false) ||
    !isButtonProperty(value.componentSet.properties.state, true) ||
    !isRecord(value.tokenSource) ||
    !hasOnlyKeys(value.tokenSource, BUTTON_TOKEN_SOURCE_KEYS) ||
    !isStableAssetId(value.tokenSource.assetId) ||
    !isBoundedString(value.tokenSource.assetVersion, 1, 128) ||
    !SEMVER_PATTERN.test(value.tokenSource.assetVersion) ||
    !isStableAssetId(value.tokenSource.collectionStableId) ||
    !isBoundedString(value.tokenSource.contentDigest, 1, 80) ||
    !CONTENT_DIGEST_PATTERN.test(value.tokenSource.contentDigest) ||
    !isStableIdSegment(value.tokenSource.projectId) ||
    !Array.isArray(value.sharedBindings) ||
    value.sharedBindings.length !== 3 ||
    !value.sharedBindings.every(isButtonBinding) ||
    !isRecord(value.typography) ||
    !hasOnlyKeys(value.typography, BUTTON_TYPOGRAPHY_KEYS) ||
    !isTypographyVariable(value.typography.fontFamily) ||
    !isTypographyVariable(value.typography.fontSize) ||
    !isTypographyVariable(value.typography.fontWeight) ||
    !isTypographyVariable(value.typography.letterSpacing) ||
    !isBoundedString(value.typography.fontStyleFallback, 1, 120) ||
    !isRecord(value.typography.lineHeight) ||
    !hasOnlyKeys(value.typography.lineHeight, new Set(["fallback", "unit"])) ||
    typeof value.typography.lineHeight.fallback !== "number" ||
    value.typography.lineHeight.fallback <= 0 ||
    value.typography.lineHeight.unit !== "PERCENT" ||
    !isStableAssetId(value.typography.tokenPath) ||
    !Array.isArray(value.variants) ||
    value.variants.length !== 4
  )
    return false;

  const source = value.source;
  const componentSet = value.componentSet;
  const tokenSource = value.tokenSource;
  const expectedRoot = `${String(source.projectId)}/component/${String(source.assetId)}/component-set/major-${String(componentSet.majorVersion)}`;
  const expectedCollection = `${String(tokenSource.projectId)}/token-set/${String(tokenSource.assetId)}/variables/major-${String(tokenSource.assetVersion).split(".")[0]}`;
  if (
    componentSet.stableId !== expectedRoot ||
    Number(String(source.assetVersion).split(".")[0]) !==
      componentSet.majorVersion ||
    tokenSource.collectionStableId !== expectedCollection
  )
    return false;

  const variablePrefix = `${tokenSource.collectionStableId}/variable/`;
  const ids = new Set<string>();
  const names = new Set<string>();
  const selectionKeys = new Set<string>();
  const properties = componentSet.properties;
  if (
    !isRecord(properties) ||
    !isRecord(properties.appearance) ||
    !isRecord(properties.state)
  ) {
    return false;
  }
  const appearanceOptions = properties.appearance.options as unknown[];
  const stateOptions = properties.state.options as unknown[];
  for (const variant of value.variants) {
    if (
      !isRecord(variant) ||
      !hasOnlyKeys(variant, BUTTON_VARIANT_KEYS) ||
      !Array.isArray(variant.bindings) ||
      variant.bindings.length < 2 ||
      variant.bindings.length > 5 ||
      !variant.bindings.every(isButtonBinding) ||
      !isBoundedString(variant.displayName, 1, 120) ||
      !isBoundedString(variant.figmaName, 1, 240) ||
      !isStableAssetId(variant.id) ||
      !isRecord(variant.selections) ||
      !hasOnlyKeys(variant.selections, new Set(["appearance", "state"])) ||
      !isBoundedString(variant.selections.appearance, 1, 120) ||
      !isBoundedString(variant.selections.state, 1, 120) ||
      !isStableAssetId(variant.slotId) ||
      !isStableAssetId(variant.stableId) ||
      variant.stableId !== `${expectedRoot}/${variant.slotId}` ||
      ids.has(variant.stableId) ||
      names.has(variant.figmaName) ||
      !appearanceOptions.includes(variant.selections.appearance) ||
      !stateOptions.includes(variant.selections.state) ||
      variant.figmaName !==
        `${String(properties.appearance.name)}=${String(variant.selections.appearance)}, ${String(properties.state.name)}=${String(variant.selections.state)}` ||
      selectionKeys.has(
        `${String(variant.selections.appearance)}/${String(variant.selections.state)}`,
      )
    )
      return false;
    ids.add(variant.stableId);
    names.add(variant.figmaName);
    selectionKeys.add(
      `${String(variant.selections.appearance)}/${String(variant.selections.state)}`,
    );
  }
  const sharedBindings = value.sharedBindings as unknown[];
  const variants = value.variants as unknown[];
  const bindings: unknown[] = [
    ...sharedBindings,
    ...variants.flatMap((variant): unknown[] =>
      isRecord(variant) && Array.isArray(variant.bindings)
        ? (variant.bindings as unknown[])
        : [],
    ),
    value.typography.fontFamily,
    value.typography.fontSize,
    value.typography.fontWeight,
    value.typography.letterSpacing,
  ];
  return bindings.every(
    (binding) =>
      isRecord(binding) &&
      typeof binding.variableStableId === "string" &&
      binding.variableStableId.startsWith(variablePrefix),
  );
}

function isFigmaButtonInstancePlan(
  value: unknown,
): value is Record<string, unknown> {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      new Set([
        "componentSet",
        "instance",
        "properties",
        "schemaVersion",
        "selectedVariant",
        "source",
      ]),
    ) ||
    value.schemaVersion !== "1.0.0" ||
    !isRecord(value.source) ||
    !hasOnlyKeys(
      value.source,
      new Set([
        "approvalId",
        "assetId",
        "assetVersion",
        "contentDigest",
        "fileBindingId",
        "projectId",
      ]),
    ) ||
    !COMPONENT_APPROVAL_ID_PATTERN.test(String(value.source.approvalId)) ||
    !isStableAssetId(value.source.assetId) ||
    !SEMVER_PATTERN.test(String(value.source.assetVersion)) ||
    !CONTENT_DIGEST_PATTERN.test(String(value.source.contentDigest)) ||
    !isUuid(value.source.fileBindingId) ||
    !isStableIdSegment(value.source.projectId) ||
    !isRecord(value.componentSet) ||
    !hasOnlyKeys(
      value.componentSet,
      new Set([
        "expectedVariantStableIds",
        "majorVersion",
        "nodeId",
        "stableId",
      ]),
    ) ||
    !Array.isArray(value.componentSet.expectedVariantStableIds) ||
    value.componentSet.expectedVariantStableIds.length !== 4 ||
    !value.componentSet.expectedVariantStableIds.every(isStableAssetId) ||
    new Set(value.componentSet.expectedVariantStableIds).size !== 4 ||
    !Number.isSafeInteger(value.componentSet.majorVersion) ||
    Number(value.componentSet.majorVersion) < 0 ||
    !isBoundedString(value.componentSet.nodeId, 1, 128) ||
    !/^\d+:\d+$/u.test(value.componentSet.nodeId) ||
    !isStableAssetId(value.componentSet.stableId) ||
    !isRecord(value.instance) ||
    !hasOnlyKeys(value.instance, new Set(["stableId", "x", "y"])) ||
    !isStableAssetId(value.instance.stableId) ||
    ![value.instance.x, value.instance.y].every(
      (position) =>
        typeof position === "number" &&
        Number.isFinite(position) &&
        position >= -1_000_000 &&
        position <= 1_000_000,
    ) ||
    !isRecord(value.properties) ||
    !hasOnlyKeys(value.properties, new Set(["appearance", "label", "state"])) ||
    ![
      value.properties.appearance,
      value.properties.label,
      value.properties.state,
    ].every(
      (property) =>
        isRecord(property) &&
        hasOnlyKeys(property, new Set(["name", "value"])) &&
        isBoundedString(property.name, 1, 120) &&
        isBoundedString(property.value, 1, 500),
    ) ||
    !isRecord(value.selectedVariant) ||
    !hasOnlyKeys(
      value.selectedVariant,
      new Set(["figmaName", "selections", "slotId", "stableId"]),
    ) ||
    !isBoundedString(value.selectedVariant.figmaName, 1, 240) ||
    !isRecord(value.selectedVariant.selections) ||
    !hasOnlyKeys(
      value.selectedVariant.selections,
      new Set(["appearance", "state"]),
    ) ||
    !isStableIdSegment(value.selectedVariant.selections.appearance) ||
    !isStableIdSegment(value.selectedVariant.selections.state) ||
    !isStableAssetId(value.selectedVariant.slotId) ||
    !isStableAssetId(value.selectedVariant.stableId)
  ) {
    return false;
  }
  const root = `${String(value.source.projectId)}/component/${String(value.source.assetId)}/component-set/major-${String(value.componentSet.majorVersion)}`;
  return (
    value.componentSet.stableId === root &&
    String(value.source.assetVersion).split(".")[0] ===
      String(value.componentSet.majorVersion) &&
    value.selectedVariant.stableId ===
      `${root}/${String(value.selectedVariant.slotId)}` &&
    value.componentSet.expectedVariantStableIds.every((stableId) =>
      String(stableId).startsWith(`${root}/`),
    ) &&
    value.componentSet.expectedVariantStableIds.includes(
      value.selectedVariant.stableId,
    ) &&
    value.selectedVariant.figmaName ===
      `${String((value.properties.appearance as Record<string, unknown>).name)}=${String((value.properties.appearance as Record<string, unknown>).value)}, ${String((value.properties.state as Record<string, unknown>).name)}=${String((value.properties.state as Record<string, unknown>).value)}` &&
    String((value.properties.label as Record<string, unknown>).value).trim() ===
      (value.properties.label as Record<string, unknown>).value &&
    String(value.instance.stableId).startsWith(
      `${String(value.source.projectId)}/instance/`,
    )
  );
}

function isPingCommand(value: Record<string, unknown>): boolean {
  return (
    value.type === "writer.ping" &&
    isRecord(value.payload) &&
    Object.keys(value.payload).length === 0
  );
}

function isVariablesCommand(
  value: Record<string, unknown>,
  approval: Record<string, unknown>,
  target: Record<string, unknown>,
  projectId: string,
): boolean {
  if (
    value.type !== "variables.ensure" ||
    !isRecord(value.payload) ||
    !hasOnlyKeys(value.payload, new Set(["plan"])) ||
    !isVariablePlan(value.payload.plan) ||
    approval.mode !== "approved" ||
    !hasOnlyKeys(approval, new Set(["approvalId", "mode", "subject"])) ||
    !isBoundedString(approval.approvalId, 1, 320) ||
    !TOKEN_APPROVAL_ID_PATTERN.test(approval.approvalId) ||
    !isRecord(approval.subject) ||
    !hasOnlyKeys(
      approval.subject,
      new Set([
        "assetId",
        "assetVersion",
        "contentDigest",
        "projectId",
        "type",
      ]),
    ) ||
    approval.subject.type !== "token-set" ||
    target.kind !== "figma-file" ||
    !hasOnlyKeys(target, new Set(["fileBindingId", "kind", "stableId"])) ||
    !isUuid(target.fileBindingId) ||
    !isStableAssetId(target.stableId)
  ) {
    return false;
  }
  const planSource = value.payload.plan.source;
  return (
    isRecord(planSource) &&
    approval.subject.projectId === planSource.projectId &&
    approval.subject.assetId === planSource.assetId &&
    approval.subject.assetVersion === planSource.assetVersion &&
    approval.subject.contentDigest === planSource.contentDigest &&
    projectId === planSource.projectId
  );
}

function isButtonCommand(
  value: Record<string, unknown>,
  approval: Record<string, unknown>,
  target: Record<string, unknown>,
  projectId: string,
): boolean {
  if (
    value.type !== "components.button.ensure" ||
    !isRecord(value.payload) ||
    !hasOnlyKeys(value.payload, new Set(["plan"])) ||
    !isFigmaButtonPlan(value.payload.plan) ||
    approval.mode !== "approved" ||
    !hasOnlyKeys(approval, new Set(["approvalId", "mode", "subject"])) ||
    !isBoundedString(approval.approvalId, 1, 320) ||
    !COMPONENT_APPROVAL_ID_PATTERN.test(approval.approvalId) ||
    !isRecord(approval.subject) ||
    !hasOnlyKeys(
      approval.subject,
      new Set([
        "assetId",
        "assetVersion",
        "contentDigest",
        "projectId",
        "type",
      ]),
    ) ||
    approval.subject.type !== "component" ||
    target.kind !== "figma-file" ||
    !hasOnlyKeys(target, new Set(["fileBindingId", "kind", "stableId"])) ||
    !isUuid(target.fileBindingId) ||
    !isStableAssetId(target.stableId)
  )
    return false;
  const source = value.payload.plan.source;
  return (
    isRecord(source) &&
    approval.subject.projectId === source.projectId &&
    approval.subject.assetId === source.assetId &&
    approval.subject.assetVersion === source.assetVersion &&
    approval.subject.contentDigest === source.contentDigest &&
    projectId === source.projectId
  );
}

function isButtonInstanceCommand(
  value: Record<string, unknown>,
  approval: Record<string, unknown>,
  target: Record<string, unknown>,
  projectId: string,
): boolean {
  if (
    value.type !== "instances.button.insert" ||
    !isRecord(value.payload) ||
    !hasOnlyKeys(value.payload, new Set(["plan"])) ||
    !isFigmaButtonInstancePlan(value.payload.plan) ||
    approval.mode !== "approved" ||
    !hasOnlyKeys(approval, new Set(["approvalId", "mode", "subject"])) ||
    !COMPONENT_APPROVAL_ID_PATTERN.test(String(approval.approvalId)) ||
    !isRecord(approval.subject) ||
    !hasOnlyKeys(
      approval.subject,
      new Set([
        "assetId",
        "assetVersion",
        "contentDigest",
        "projectId",
        "type",
      ]),
    ) ||
    approval.subject.type !== "component" ||
    target.kind !== "figma-file" ||
    !hasOnlyKeys(target, new Set(["fileBindingId", "kind", "stableId"])) ||
    !isUuid(target.fileBindingId) ||
    !isStableAssetId(target.stableId)
  ) {
    return false;
  }
  const source = value.payload.plan.source;
  return (
    isRecord(source) &&
    approval.approvalId === source.approvalId &&
    approval.subject.projectId === source.projectId &&
    approval.subject.assetId === source.assetId &&
    approval.subject.assetVersion === source.assetVersion &&
    approval.subject.contentDigest === source.contentDigest &&
    target.fileBindingId === source.fileBindingId &&
    projectId === source.projectId
  );
}

function isStyleAuditPlan(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, STYLE_AUDIT_PLAN_KEYS) ||
    value.schemaVersion !== "1.0.0" ||
    value.scope !== "current-page" ||
    !isStableIdSegment(value.projectId) ||
    !isUuid(value.fileBindingId) ||
    !Array.isArray(value.registeredVariables) ||
    value.registeredVariables.length < 1 ||
    value.registeredVariables.length > 2_000
  ) {
    return false;
  }
  const identities = new Set<string>();
  return value.registeredVariables.every((variable) => {
    if (
      !isRecord(variable) ||
      !hasOnlyKeys(variable, STYLE_AUDIT_VARIABLE_KEYS) ||
      !isStableAssetId(variable.stableId) ||
      !isStableAssetId(variable.tokenPath) ||
      !String(variable.stableId).startsWith(
        `${String(value.projectId)}/token-set/`,
      ) ||
      !String(variable.stableId).endsWith(
        `/variable/${String(variable.tokenPath)}`,
      ) ||
      identities.has(String(variable.stableId))
    ) {
      return false;
    }
    identities.add(String(variable.stableId));
    return true;
  });
}

function isStringProperties(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length <= 50 &&
    Object.entries(value).every(
      ([name, propertyValue]) =>
        isBoundedString(name, 1, 120) && isBoundedString(propertyValue, 1, 500),
    )
  );
}

function isComponentAuditPlan(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, COMPONENT_AUDIT_PLAN_KEYS) ||
    value.schemaVersion !== "1.0.0" ||
    value.scope !== "current-page" ||
    !isStableIdSegment(value.projectId) ||
    !isUuid(value.fileBindingId) ||
    !Array.isArray(value.sources) ||
    value.sources.length < 1 ||
    value.sources.length > 500
  ) {
    return false;
  }
  const sourceIds = new Set<string>();
  const variantIds = new Set<string>();
  return value.sources.every((source: unknown) => {
    if (
      !isRecord(source) ||
      !hasOnlyKeys(source, COMPONENT_AUDIT_SOURCE_KEYS) ||
      !isStableAssetId(source.assetId) ||
      !isBoundedString(source.assetVersion, 1, 128) ||
      !SEMVER_PATTERN.test(source.assetVersion) ||
      !isBoundedString(source.componentSetNodeId, 1, 128) ||
      !/^\d+:\d+$/u.test(source.componentSetNodeId) ||
      !isStableAssetId(source.componentSetStableId) ||
      !isBoundedString(source.contentDigest, 1, 80) ||
      !CONTENT_DIGEST_PATTERN.test(source.contentDigest) ||
      !Array.isArray(source.variants) ||
      source.variants.length < 1 ||
      source.variants.length > 200
    ) {
      return false;
    }
    const root = `${String(value.projectId)}/component/${String(source.assetId)}/component-set/major-${String(source.assetVersion).split(".")[0]}`;
    if (source.componentSetStableId !== root || sourceIds.has(root)) {
      return false;
    }
    sourceIds.add(root);
    return source.variants.every((variant: unknown) => {
      if (
        !isRecord(variant) ||
        !hasOnlyKeys(variant, COMPONENT_AUDIT_VARIANT_KEYS) ||
        !isBoundedString(variant.figmaName, 1, 240) ||
        !isStringProperties(variant.properties) ||
        !isStableAssetId(variant.slotId) ||
        !isStableAssetId(variant.stableId) ||
        variant.stableId !== `${root}/${String(variant.slotId)}` ||
        variantIds.has(variant.stableId)
      ) {
        return false;
      }
      variantIds.add(variant.stableId);
      return true;
    });
  });
}

function isRegistryDriftAuditPlan(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, DRIFT_PLAN_KEYS) ||
    value.schemaVersion !== "1.0.0" ||
    value.scope !== "entire-file" ||
    !isStableIdSegment(value.projectId) ||
    !isUuid(value.fileBindingId) ||
    !Array.isArray(value.tokenCollections) ||
    value.tokenCollections.length < 1 ||
    value.tokenCollections.length > 500 ||
    !Array.isArray(value.componentSets) ||
    value.componentSets.length < 1 ||
    value.componentSets.length > 500
  ) {
    return false;
  }
  const roots = new Set<string>();
  const validAsset = (
    asset: unknown,
    kind: "component" | "token-set",
  ): boolean => {
    if (
      !isRecord(asset) ||
      !hasOnlyKeys(
        asset,
        kind === "component" ? DRIFT_COMPONENT_KEYS : DRIFT_TOKEN_KEYS,
      ) ||
      !isStableAssetId(asset.assetId) ||
      !isBoundedString(asset.assetVersion, 1, 128) ||
      !SEMVER_PATTERN.test(asset.assetVersion) ||
      !isStableAssetId(asset.stableId) ||
      roots.has(asset.stableId) ||
      (asset.contentDigest !== null &&
        (typeof asset.contentDigest !== "string" ||
          !CONTENT_DIGEST_PATTERN.test(asset.contentDigest)))
    ) {
      return false;
    }
    const root =
      kind === "component"
        ? `${String(value.projectId)}/component/${String(asset.assetId)}/component-set/major-${asset.assetVersion.split(".")[0]}`
        : `${String(value.projectId)}/token-set/${String(asset.assetId)}/variables/major-${asset.assetVersion.split(".")[0]}`;
    const childKey =
      kind === "component" ? "variantStableIds" : "variableStableIds";
    const children = asset[childKey];
    if (
      asset.stableId !== root ||
      !Array.isArray(children) ||
      children.length < 1 ||
      children.length > (kind === "component" ? 200 : 2_000) ||
      !children.every(
        (child) =>
          isStableAssetId(child) && String(child).startsWith(`${root}/`),
      ) ||
      new Set(children).size !== children.length ||
      (kind === "component" &&
        (!CONTENT_DIGEST_PATTERN.test(String(asset.contentDigest)) ||
          !isBoundedString(asset.nodeId, 1, 128) ||
          !/^\d+:\d+$/u.test(asset.nodeId) ||
          (asset.componentSetKey !== null &&
            !isBoundedString(asset.componentSetKey, 1, 256))))
    ) {
      return false;
    }
    roots.add(root);
    return true;
  };
  return (
    value.tokenCollections.every((asset) => validAsset(asset, "token-set")) &&
    value.componentSets.every((asset) => validAsset(asset, "component"))
  );
}

function isComponentAuditCommand(
  value: Record<string, unknown>,
  approval: Record<string, unknown>,
  target: Record<string, unknown>,
  projectId: string,
): boolean {
  if (
    value.type !== "audit.components.scan" ||
    !isRecord(value.payload) ||
    !hasOnlyKeys(value.payload, new Set(["plan"])) ||
    !isComponentAuditPlan(value.payload.plan) ||
    !isRecord(value.payload.plan) ||
    !hasOnlyKeys(approval, new Set(["mode", "reason"])) ||
    approval.mode !== "not_required" ||
    approval.reason !== "read_only_diagnostic" ||
    !hasOnlyKeys(target, new Set(["fileBindingId", "kind", "stableId"])) ||
    target.kind !== "figma-file" ||
    !isUuid(target.fileBindingId) ||
    !isStableAssetId(target.stableId)
  ) {
    return false;
  }
  return (
    projectId === value.payload.plan.projectId &&
    target.fileBindingId === value.payload.plan.fileBindingId
  );
}

function isStyleAuditCommand(
  value: Record<string, unknown>,
  approval: Record<string, unknown>,
  target: Record<string, unknown>,
  projectId: string,
): boolean {
  if (
    value.type !== "audit.styles.scan" ||
    !isRecord(value.payload) ||
    !hasOnlyKeys(value.payload, new Set(["plan"])) ||
    !isStyleAuditPlan(value.payload.plan) ||
    !isRecord(value.payload.plan) ||
    !hasOnlyKeys(approval, new Set(["mode", "reason"])) ||
    approval.mode !== "not_required" ||
    approval.reason !== "read_only_diagnostic" ||
    !hasOnlyKeys(target, new Set(["fileBindingId", "kind", "stableId"])) ||
    target.kind !== "figma-file" ||
    !isUuid(target.fileBindingId) ||
    !isStableAssetId(target.stableId)
  ) {
    return false;
  }
  return (
    projectId === value.payload.plan.projectId &&
    target.fileBindingId === value.payload.plan.fileBindingId
  );
}

function isRegistryDriftAuditCommand(
  value: Record<string, unknown>,
  approval: Record<string, unknown>,
  target: Record<string, unknown>,
  projectId: string,
): boolean {
  return (
    value.type === "audit.registry-drift.scan" &&
    isRecord(value.payload) &&
    hasOnlyKeys(value.payload, new Set(["plan"])) &&
    isRegistryDriftAuditPlan(value.payload.plan) &&
    isRecord(value.payload.plan) &&
    hasOnlyKeys(approval, new Set(["mode", "reason"])) &&
    approval.mode === "not_required" &&
    approval.reason === "read_only_diagnostic" &&
    hasOnlyKeys(target, new Set(["fileBindingId", "kind", "stableId"])) &&
    target.kind === "figma-file" &&
    isUuid(target.fileBindingId) &&
    isStableAssetId(target.stableId) &&
    projectId === value.payload.plan.projectId &&
    target.fileBindingId === value.payload.plan.fileBindingId
  );
}

export function isWriterCommandDelivery(
  value: unknown,
): value is WriterCommandDelivery {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, DELIVERY_KEYS) ||
    value.schemaVersion !== FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION ||
    !isUuid(value.operationId) ||
    !isBoundedString(value.idempotencyKey, 1, 256) ||
    !isStableIdSegment(value.projectId) ||
    !Number.isSafeInteger(value.attempt) ||
    Number(value.attempt) <= 0 ||
    !isRecord(value.source) ||
    !hasOnlyKeys(value.source, SOURCE_KEYS) ||
    !isStableIdSegment(value.source.client) ||
    !isRecord(value.target) ||
    !isRecord(value.approval) ||
    !isRecord(value.command) ||
    !hasOnlyKeys(value.command, COMMAND_KEYS)
  ) {
    return false;
  }
  if (isPingCommand(value.command)) {
    return (
      hasOnlyKeys(value.target, new Set(["kind", "stableId"])) &&
      value.target.kind === "plugin-session" &&
      isStableAssetId(value.target.stableId) &&
      hasOnlyKeys(value.approval, new Set(["mode", "reason"])) &&
      value.approval.mode === "not_required" &&
      value.approval.reason === "read_only_diagnostic"
    );
  }
  if (
    isRegistryDriftAuditCommand(
      value.command,
      value.approval,
      value.target,
      value.projectId,
    )
  ) {
    return true;
  }
  if (
    isStyleAuditCommand(
      value.command,
      value.approval,
      value.target,
      value.projectId,
    )
  ) {
    return true;
  }
  if (
    isComponentAuditCommand(
      value.command,
      value.approval,
      value.target,
      value.projectId,
    )
  ) {
    return true;
  }
  return (
    isVariablesCommand(
      value.command,
      value.approval,
      value.target,
      value.projectId,
    ) ||
    isButtonCommand(
      value.command,
      value.approval,
      value.target,
      value.projectId,
    ) ||
    isButtonInstanceCommand(
      value.command,
      value.approval,
      value.target,
      value.projectId,
    )
  );
}

function isVariablesResult(value: Record<string, unknown>): boolean {
  return (
    hasOnlyKeys(
      value,
      new Set(["collection", "deferredTypographyCount", "type", "variables"]),
    ) &&
    value.type === "variables.ensure" &&
    Number.isSafeInteger(value.deferredTypographyCount) &&
    Number(value.deferredTypographyCount) >= 0 &&
    isRecord(value.collection) &&
    hasOnlyKeys(value.collection, new Set(["action", "stableId"])) &&
    ["created", "unchanged", "updated"].includes(
      String(value.collection.action),
    ) &&
    isStableAssetId(value.collection.stableId) &&
    isRecord(value.variables) &&
    hasOnlyKeys(
      value.variables,
      new Set(["created", "unchanged", "updated"]),
    ) &&
    [
      value.variables.created,
      value.variables.unchanged,
      value.variables.updated,
    ].every((count) => Number.isSafeInteger(count) && Number(count) >= 0)
  );
}

function isButtonResult(value: Record<string, unknown>): boolean {
  return (
    hasOnlyKeys(
      value,
      new Set([
        "componentSet",
        "labelPropertyName",
        "type",
        "typography",
        "variants",
      ]),
    ) &&
    value.type === "components.button.ensure" &&
    isRecord(value.componentSet) &&
    hasOnlyKeys(
      value.componentSet,
      new Set(["action", "nodeId", "stableId"]),
    ) &&
    ["created", "unchanged", "updated"].includes(
      String(value.componentSet.action),
    ) &&
    isBoundedString(value.componentSet.nodeId, 1, 128) &&
    /^\d+:\d+$/u.test(value.componentSet.nodeId) &&
    isStableAssetId(value.componentSet.stableId) &&
    isBoundedString(value.labelPropertyName, 1, 120) &&
    isRecord(value.typography) &&
    hasOnlyKeys(
      value.typography,
      new Set(["lineHeightStrategy", "variableBindings"]),
    ) &&
    value.typography.lineHeightStrategy === "resolved-percent" &&
    value.typography.variableBindings === 4 &&
    isRecord(value.variants) &&
    hasOnlyKeys(value.variants, new Set(["created", "unchanged", "updated"])) &&
    [
      value.variants.created,
      value.variants.unchanged,
      value.variants.updated,
    ].every((count) => Number.isSafeInteger(count) && Number(count) >= 0)
  );
}

function isButtonInstanceResult(value: Record<string, unknown>): boolean {
  return (
    hasOnlyKeys(
      value,
      new Set(["componentSet", "instance", "type", "variant"]),
    ) &&
    value.type === "instances.button.insert" &&
    isRecord(value.componentSet) &&
    hasOnlyKeys(value.componentSet, new Set(["nodeId", "stableId"])) &&
    isBoundedString(value.componentSet.nodeId, 1, 128) &&
    /^\d+:\d+$/u.test(value.componentSet.nodeId) &&
    isStableAssetId(value.componentSet.stableId) &&
    isRecord(value.instance) &&
    hasOnlyKeys(value.instance, new Set(["action", "nodeId", "stableId"])) &&
    ["created", "recovered", "unchanged"].includes(
      String(value.instance.action),
    ) &&
    isBoundedString(value.instance.nodeId, 1, 128) &&
    /^\d+:\d+$/u.test(value.instance.nodeId) &&
    isStableAssetId(value.instance.stableId) &&
    isRecord(value.variant) &&
    hasOnlyKeys(value.variant, new Set(["stableId"])) &&
    isStableAssetId(value.variant.stableId)
  );
}

function isStyleAuditNode(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, new Set(["id", "name", "type"])) &&
    isBoundedString(value.id, 1, 128) &&
    /^\d+:\d+$/u.test(value.id) &&
    isBoundedString(value.name, 1, 256) &&
    isBoundedString(value.type, 1, 64)
  );
}

function isStyleAuditFinding(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, STYLE_AUDIT_FINDING_KEYS) &&
    ["HARD_CODED_STYLE", "UNREGISTERED_VARIABLE"].includes(
      String(value.code),
    ) &&
    ["color", "dimension", "opacity", "typography"].includes(
      String(value.kind),
    ) &&
    value.severity === "error" &&
    isBoundedString(value.field, 1, 160) &&
    isBoundedString(value.recoveryInstruction, 1, 500) &&
    isStyleAuditNode(value.node) &&
    isRecord(value.actual) &&
    hasOnlyKeys(value.actual, new Set(["bindingVariableId", "value"])) &&
    (value.actual.bindingVariableId === null ||
      isBoundedString(value.actual.bindingVariableId, 1, 128)) &&
    isBoundedString(value.actual.value, 1, 240) &&
    isRecord(value.expected) &&
    hasOnlyKeys(value.expected, new Set(["registeredVariableRequired"])) &&
    value.expected.registeredVariableRequired === true
  );
}

function isStyleAuditResult(value: Record<string, unknown>): boolean {
  if (
    !hasOnlyKeys(value, STYLE_AUDIT_RESULT_KEYS) ||
    value.type !== "audit.styles.scan" ||
    value.schemaVersion !== "1.0.0" ||
    value.scope !== "current-page" ||
    typeof value.passed !== "boolean" ||
    !Array.isArray(value.findings) ||
    value.findings.length > 10_000 ||
    !value.findings.every(isStyleAuditFinding) ||
    !isRecord(value.page) ||
    !hasOnlyKeys(value.page, new Set(["id", "name"])) ||
    !isBoundedString(value.page.id, 1, 128) ||
    !/^\d+:\d+$/u.test(value.page.id) ||
    !isBoundedString(value.page.name, 1, 256) ||
    !isRecord(value.summary) ||
    !hasOnlyKeys(value.summary, STYLE_AUDIT_SUMMARY_KEYS) ||
    ![
      value.summary.auditedStyles,
      value.summary.hardCodedStyles,
      value.summary.nodesWithFindings,
      value.summary.registeredBindings,
      value.summary.unregisteredVariables,
    ].every((count) => Number.isSafeInteger(count) && Number(count) >= 0)
  ) {
    return false;
  }
  const hardCodedStyles = value.findings.filter(
    (finding: unknown) =>
      isRecord(finding) && finding.code === "HARD_CODED_STYLE",
  ).length;
  const unregisteredVariables = value.findings.filter(
    (finding: unknown) =>
      isRecord(finding) && finding.code === "UNREGISTERED_VARIABLE",
  ).length;
  const nodesWithFindings = new Set(
    value.findings.flatMap((finding: unknown) =>
      isRecord(finding) &&
      isRecord(finding.node) &&
      typeof finding.node.id === "string"
        ? [finding.node.id]
        : [],
    ),
  ).size;
  return (
    value.type === "audit.styles.scan" &&
    value.passed === (value.findings.length === 0) &&
    value.summary.hardCodedStyles === hardCodedStyles &&
    value.summary.unregisteredVariables === unregisteredVariables &&
    value.summary.nodesWithFindings === nodesWithFindings &&
    value.summary.auditedStyles ===
      Number(value.summary.registeredBindings) + value.findings.length
  );
}

function isComponentAuditFinding(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, COMPONENT_AUDIT_FINDING_KEYS) &&
    [
      "DETACHED_OR_APPROXIMATE_COMPONENT",
      "UNREGISTERED_COMPONENT_SOURCE",
      "UNREGISTERED_VARIANT",
      "VARIANT_PROPERTY_MISMATCH",
      "INSTANCE_PROVENANCE_MISMATCH",
    ].includes(String(value.code)) &&
    value.severity === "error" &&
    isRecord(value.actual) &&
    isRecord(value.expected) &&
    isStyleAuditNode(value.node) &&
    isBoundedString(value.recoveryInstruction, 1, 500)
  );
}

function isComponentAuditResult(value: Record<string, unknown>): boolean {
  if (
    !hasOnlyKeys(value, COMPONENT_AUDIT_RESULT_KEYS) ||
    value.type !== "audit.components.scan" ||
    value.schemaVersion !== "1.0.0" ||
    value.scope !== "current-page" ||
    typeof value.passed !== "boolean" ||
    !Array.isArray(value.findings) ||
    value.findings.length > 10_000 ||
    !value.findings.every(isComponentAuditFinding) ||
    !isRecord(value.page) ||
    !hasOnlyKeys(value.page, new Set(["id", "name"])) ||
    !isBoundedString(value.page.id, 1, 128) ||
    !/^\d+:\d+$/u.test(value.page.id) ||
    !isBoundedString(value.page.name, 1, 256) ||
    !isRecord(value.summary) ||
    !hasOnlyKeys(value.summary, COMPONENT_AUDIT_SUMMARY_KEYS) ||
    ![
      value.summary.auditedNodes,
      value.summary.compliantInstances,
      value.summary.detachedOrApproximate,
      value.summary.provenanceMismatches,
      value.summary.unregisteredSources,
      value.summary.unregisteredVariants,
      value.summary.variantPropertyMismatches,
    ].every((count) => Number.isSafeInteger(count) && Number(count) >= 0)
  ) {
    return false;
  }
  const findings: readonly unknown[] = value.findings;
  const count = (code: string) =>
    findings.filter(
      (finding: unknown) => isRecord(finding) && finding.code === code,
    ).length;
  const nodesWithFindings = new Set(
    findings.flatMap((finding: unknown) =>
      isRecord(finding) &&
      isRecord(finding.node) &&
      typeof finding.node.id === "string"
        ? [finding.node.id]
        : [],
    ),
  ).size;
  return (
    value.passed === (findings.length === 0) &&
    value.summary.detachedOrApproximate ===
      count("DETACHED_OR_APPROXIMATE_COMPONENT") &&
    value.summary.provenanceMismatches ===
      count("INSTANCE_PROVENANCE_MISMATCH") &&
    value.summary.unregisteredSources ===
      count("UNREGISTERED_COMPONENT_SOURCE") &&
    value.summary.unregisteredVariants === count("UNREGISTERED_VARIANT") &&
    value.summary.variantPropertyMismatches ===
      count("VARIANT_PROPERTY_MISMATCH") &&
    value.summary.auditedNodes ===
      Number(value.summary.compliantInstances) + nodesWithFindings
  );
}

function isRegistryDriftAuditResult(value: Record<string, unknown>): boolean {
  if (
    !hasOnlyKeys(value, DRIFT_RESULT_KEYS) ||
    value.type !== "audit.registry-drift.scan" ||
    value.schemaVersion !== "1.0.0" ||
    value.scope !== "entire-file" ||
    typeof value.passed !== "boolean" ||
    !Array.isArray(value.findings) ||
    value.findings.length > 10_000 ||
    !value.findings.every(
      (candidate) =>
        isRecord(candidate) &&
        hasOnlyKeys(candidate, DRIFT_FINDING_KEYS) &&
        typeof candidate.code === "string" &&
        DRIFT_CODES.has(candidate.code) &&
        ["component-set", "token-collection"].includes(
          String(candidate.kind),
        ) &&
        candidate.severity === "error" &&
        isRecord(candidate.actual) &&
        isRecord(candidate.expected) &&
        (candidate.physicalId === null ||
          isBoundedString(candidate.physicalId, 1, 256)) &&
        (candidate.stableId === null || isStableAssetId(candidate.stableId)) &&
        isBoundedString(candidate.recoveryInstruction, 1, 500),
    ) ||
    !isRecord(value.summary) ||
    !hasOnlyKeys(value.summary, DRIFT_SUMMARY_KEYS) ||
    ![...DRIFT_SUMMARY_KEYS].every(
      (key) =>
        Number.isSafeInteger((value.summary as Record<string, unknown>)[key]) &&
        Number((value.summary as Record<string, unknown>)[key]) >= 0,
    )
  ) {
    return false;
  }
  const findings: readonly unknown[] = value.findings;
  const count = (code: string) =>
    findings.filter(
      (candidate) => isRecord(candidate) && candidate.code === code,
    ).length;
  return (
    value.passed === (findings.length === 0) &&
    value.summary.duplicateAssets === count("FIGMA_ASSET_DUPLICATE") &&
    value.summary.invalidMarkers === count("FIGMA_MARKER_INVALID") &&
    value.summary.locatorMismatches === count("FIGMA_LOCATOR_MISMATCH") &&
    value.summary.mismatchedChildren === count("FIGMA_CHILD_SET_MISMATCH") &&
    value.summary.mismatchedDigests === count("FIGMA_ASSET_DIGEST_MISMATCH") &&
    value.summary.mismatchedVersions ===
      count("FIGMA_ASSET_VERSION_MISMATCH") &&
    value.summary.missingInFigma === count("REGISTRY_ASSET_MISSING_IN_FIGMA") &&
    value.summary.missingInRegistry === count("FIGMA_ASSET_MISSING_IN_REGISTRY")
  );
}

export function isWriterPluginResult(
  value: unknown,
): value is WriterPluginResult {
  if (
    !isRecord(value) ||
    value.schemaVersion !== FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION ||
    !isUuid(value.operationId) ||
    !isUuid(value.pluginInstanceId)
  ) {
    return false;
  }
  if (value.ok === true) {
    return (
      hasOnlyKeys(value, SUCCESS_RESULT_KEYS) &&
      isRecord(value.result) &&
      ((Object.keys(value.result).length === 1 && value.result.pong === true) ||
        isVariablesResult(value.result) ||
        isButtonResult(value.result) ||
        isButtonInstanceResult(value.result) ||
        isRegistryDriftAuditResult(value.result) ||
        isComponentAuditResult(value.result) ||
        isStyleAuditResult(value.result))
    );
  }
  if (
    value.ok !== false ||
    !hasOnlyKeys(value, FAILURE_RESULT_KEYS) ||
    !isRecord(value.error) ||
    !hasOnlyKeys(value.error, PLUGIN_ERROR_KEYS) ||
    typeof value.error.code !== "string" ||
    !Object.hasOwn(ERROR_DEFINITIONS, value.error.code) ||
    (value.error.completedSteps !== undefined &&
      (!Array.isArray(value.error.completedSteps) ||
        value.error.completedSteps.length > 20 ||
        !value.error.completedSteps.every((step) =>
          isBoundedString(step, 1, 120),
        ))) ||
    !isBoundedString(value.error.message, 1, 1024) ||
    !isBoundedString(value.error.recoveryInstruction, 1, 1024)
  ) {
    return false;
  }
  return ERROR_DEFINITIONS[value.error.code as ErrorCode] !== undefined;
}

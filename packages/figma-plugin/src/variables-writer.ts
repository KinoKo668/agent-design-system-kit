import {
  canonicalizeJson,
  type ErrorCode,
  type FigmaVariablePlan,
  type FigmaVariablePlannedValue,
  type FigmaVariableResolvedType,
  type FigmaVariableScope,
} from "@agent-design-system-kit/core";

export const HATCHKIT_SHARED_NAMESPACE = "agent_design_system_kit" as const;
export const FILE_BINDING_SHARED_KEY = "file-binding" as const;
export const MANAGED_ASSET_SHARED_KEY = "managed-asset" as const;
export const MODE_IDENTITIES_SHARED_KEY = "mode-identities" as const;

export interface SharedPluginDataPort {
  getSharedPluginData(namespace: string, key: string): string;
  setSharedPluginData(namespace: string, key: string, value: string): void;
}

export interface VariableModePort {
  readonly modeId: string;
  readonly name: string;
}

export interface VariableCollectionPort extends SharedPluginDataPort {
  readonly defaultModeId: string;
  readonly id: string;
  hiddenFromPublishing: boolean;
  readonly modes: readonly VariableModePort[];
  name: string;
  addMode(name: string): string;
  renameMode(modeId: string, newName: string): void;
}

export interface VariablePort extends SharedPluginDataPort {
  readonly codeSyntax: Readonly<Record<string, string | undefined>>;
  description: string;
  hiddenFromPublishing: boolean;
  readonly id: string;
  name: string;
  readonly resolvedType: FigmaVariableResolvedType;
  scopes: FigmaVariableScope[];
  readonly valuesByMode: Readonly<Record<string, unknown>>;
  readonly variableCollectionId: string;
  setValueForMode(modeId: string, value: unknown): void;
  setVariableCodeSyntax(platform: "WEB", value: string): void;
}

export interface FigmaVariablesPort {
  readonly document: SharedPluginDataPort;
  createAlias(variable: VariablePort): unknown;
  createCollection(name: string): VariableCollectionPort;
  createVariable(
    name: string,
    collection: VariableCollectionPort,
    resolvedType: FigmaVariableResolvedType,
  ): VariablePort;
  getCollections(): Promise<readonly VariableCollectionPort[]>;
  getVariables(): Promise<readonly VariablePort[]>;
}

export interface EnsureVariablesContext {
  readonly approvalId: string;
  readonly fileBindingId: string;
  readonly operationId: string;
  readonly projectId: string;
}

export interface EnsureVariablesResult {
  readonly collection: {
    readonly action: "created" | "unchanged" | "updated";
    readonly stableId: string;
  };
  readonly deferredTypographyCount: number;
  readonly type: "variables.ensure";
  readonly variables: {
    readonly created: number;
    readonly unchanged: number;
    readonly updated: number;
  };
}

export class VariablesWriterError extends Error {
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
    this.name = "VariablesWriterError";
    this.code = input.code;
    this.completedSteps = input.completedSteps ?? [];
    this.recoveryInstruction = input.recoveryInstruction;
  }
}

export interface FigmaLibraryFileBinding {
  readonly fileBindingId: string;
  readonly fileRole: "design-system-library";
  readonly projectId: string;
  readonly schemaVersion: "1.0.0";
}

export interface BindFigmaLibraryFileResult {
  readonly binding: FigmaLibraryFileBinding;
  readonly status: "bound" | "unchanged";
}

interface ManagedMarker {
  readonly appliedDigest?: string;
  readonly approvalId?: string;
  readonly assetId: string;
  readonly assetType: "token-set";
  readonly assetVersion?: string;
  readonly channel: "library";
  readonly majorVersion: number;
  readonly pendingOperationId?: string;
  readonly phase: "applied" | "creating";
  readonly projectId: string;
  readonly role: "variable" | "variable-collection";
  readonly schemaVersion: "1.0.0";
  readonly slotId: string;
  readonly targetAssetVersion?: string;
  readonly targetDigest?: string;
}

interface ResolvedVariable {
  readonly action: "created" | "unchanged" | "updated";
  readonly spec: FigmaVariablePlan["variables"][number];
  readonly variable: VariablePort;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(value: string): unknown {
  if (value.length === 0) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

const FILE_BINDING_KEYS = [
  "fileBindingId",
  "fileRole",
  "projectId",
  "schemaVersion",
] as const;
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]*$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function isFigmaLibraryFileBinding(
  value: unknown,
): value is FigmaLibraryFileBinding {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !==
      [...FILE_BINDING_KEYS].sort().join(",") ||
    value.schemaVersion !== "1.0.0" ||
    typeof value.projectId !== "string" ||
    value.projectId.length > 64 ||
    !PROJECT_ID_PATTERN.test(value.projectId) ||
    typeof value.fileBindingId !== "string" ||
    !UUID_PATTERN.test(value.fileBindingId) ||
    value.fileRole !== "design-system-library"
  ) {
    return false;
  }
  return true;
}

export function getFigmaLibraryFileBinding(
  document: SharedPluginDataPort,
): FigmaLibraryFileBinding | null {
  const serialized = document.getSharedPluginData(
    HATCHKIT_SHARED_NAMESPACE,
    FILE_BINDING_SHARED_KEY,
  );
  if (serialized.length === 0) return null;
  const value = readJson(serialized);
  if (!isFigmaLibraryFileBinding(value)) {
    throw writerError(
      "FILE_BINDING_MISMATCH",
      "The open Figma file contains an invalid Hatchkit file binding.",
      "Inspect the existing Shared Plugin Data and use an explicit recovery or rebind flow; do not overwrite it automatically.",
    );
  }
  return value;
}

function readMarker(entity: SharedPluginDataPort): ManagedMarker | null {
  const value = readJson(
    entity.getSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      MANAGED_ASSET_SHARED_KEY,
    ),
  );
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0.0" ||
    typeof value.projectId !== "string" ||
    value.assetType !== "token-set" ||
    typeof value.assetId !== "string" ||
    value.channel !== "library" ||
    !Number.isSafeInteger(value.majorVersion) ||
    (value.role !== "variable" && value.role !== "variable-collection") ||
    typeof value.slotId !== "string" ||
    (value.phase !== "creating" && value.phase !== "applied")
  ) {
    return null;
  }
  return value as unknown as ManagedMarker;
}

function markerIdentityMatches(
  marker: ManagedMarker,
  plan: FigmaVariablePlan,
  role: ManagedMarker["role"],
  slotId: string,
): boolean {
  return (
    marker.projectId === plan.source.projectId &&
    marker.assetId === plan.source.assetId &&
    marker.majorVersion === plan.collection.majorVersion &&
    marker.role === role &&
    marker.slotId === slotId
  );
}

function creatingMarker(
  plan: FigmaVariablePlan,
  context: EnsureVariablesContext,
  role: ManagedMarker["role"],
  slotId: string,
): ManagedMarker {
  return {
    assetId: plan.source.assetId,
    assetType: "token-set",
    channel: "library",
    majorVersion: plan.collection.majorVersion,
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
  plan: FigmaVariablePlan,
  context: EnsureVariablesContext,
  role: ManagedMarker["role"],
  slotId: string,
): ManagedMarker {
  return {
    appliedDigest: plan.source.contentDigest,
    approvalId: context.approvalId,
    assetId: plan.source.assetId,
    assetType: "token-set",
    assetVersion: plan.source.assetVersion,
    channel: "library",
    majorVersion: plan.collection.majorVersion,
    phase: "applied",
    projectId: plan.source.projectId,
    role,
    schemaVersion: "1.0.0",
    slotId,
  };
}

function setMarker(
  entity: SharedPluginDataPort,
  marker: ManagedMarker,
): boolean {
  const serialized = canonicalizeJson(marker);
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

function hasMarker(
  entity: SharedPluginDataPort,
  marker: ManagedMarker,
): boolean {
  return (
    entity.getSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      MANAGED_ASSET_SHARED_KEY,
    ) === canonicalizeJson(marker)
  );
}

function writerError(
  code: ErrorCode,
  message: string,
  recoveryInstruction: string,
): VariablesWriterError {
  return new VariablesWriterError({ code, message, recoveryInstruction });
}

function assertFileBinding(
  port: FigmaVariablesPort,
  context: EnsureVariablesContext,
): void {
  const binding = getFigmaLibraryFileBinding(port.document);
  if (
    binding === null ||
    binding.projectId !== context.projectId ||
    binding.fileBindingId !== context.fileBindingId
  ) {
    throw writerError(
      "FILE_BINDING_MISMATCH",
      "The open Figma file is not the bound design-system library.",
      "Open the registered library file or explicitly bind this file before retrying.",
    );
  }
}

function assertMarkerVersion(
  marker: ManagedMarker,
  plan: FigmaVariablePlan,
): void {
  if (marker.phase === "creating") {
    if (
      marker.targetAssetVersion !== plan.source.assetVersion ||
      marker.targetDigest !== plan.source.contentDigest
    ) {
      throw writerError(
        "CONTENT_DIGEST_CONFLICT",
        "A partial Variable write targets different approved content.",
        "Resume the original operation or complete an explicit recovery before applying different content.",
      );
    }
    return;
  }
  if (
    marker.assetVersion === plan.source.assetVersion &&
    marker.appliedDigest !== plan.source.contentDigest
  ) {
    throw writerError(
      "CONTENT_DIGEST_CONFLICT",
      "The same Token version is already bound to a different content digest.",
      "Create and approve a new Token version instead of overwriting the existing version.",
    );
  }
  if (marker.assetVersion === undefined) return;
  const comparison = compareSemver(
    marker.assetVersion,
    plan.source.assetVersion,
  );
  if (comparison > 0) {
    throw writerError(
      "VERSION_CONFLICT",
      "The Figma Variables are newer than the requested Token version.",
      "Refresh the design-system sources and retry with the current approved version.",
    );
  }
}

function compareSemver(left: string, right: string): number {
  const parse = (
    value: string,
  ): {
    readonly core: readonly number[];
    readonly prerelease: readonly string[] | null;
  } => {
    const withoutBuild = value.split("+")[0] ?? value;
    const [coreText = withoutBuild, prereleaseText] = withoutBuild.split(
      "-",
      2,
    );
    return {
      core: coreText.split(".").map((segment) => Number(segment)),
      prerelease: prereleaseText?.split(".") ?? null,
    };
  };
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference =
      (leftParts.core[index] ?? 0) - (rightParts.core[index] ?? 0);
    if (difference !== 0) return difference;
  }
  if (leftParts.prerelease === null) {
    return rightParts.prerelease === null ? 0 : 1;
  }
  if (rightParts.prerelease === null) return -1;
  const length = Math.max(
    leftParts.prerelease.length,
    rightParts.prerelease.length,
  );
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = leftParts.prerelease[index];
    const rightIdentifier = rightParts.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;
    const leftNumber = /^\d+$/u.test(leftIdentifier)
      ? Number(leftIdentifier)
      : null;
    const rightNumber = /^\d+$/u.test(rightIdentifier)
      ? Number(rightIdentifier)
      : null;
    if (leftNumber !== null && rightNumber !== null) {
      return leftNumber - rightNumber;
    }
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  return 0;
}

function unique<T>(
  values: readonly T[],
  predicate: (value: T) => boolean,
  description: string,
): T | null {
  const matches = values.filter(predicate);
  if (matches.length > 1) {
    throw writerError(
      "IDENTITY_CONFLICT",
      `More than one ${description} has the same managed identity.`,
      "Resolve the duplicate managed assets manually before retrying.",
    );
  }
  return matches[0] ?? null;
}

function readModeMap(collection: VariableCollectionPort): Map<string, string> {
  const value = readJson(
    collection.getSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      MODE_IDENTITIES_SHARED_KEY,
    ),
  );
  if (!isRecord(value)) return new Map();
  const entries = Object.entries(value);
  if (
    entries.some(([, modeId]) => typeof modeId !== "string") ||
    new Set(entries.map(([, modeId]) => modeId)).size !== entries.length
  ) {
    return new Map();
  }
  return new Map(entries as Array<[string, string]>);
}

function writeModeMap(
  collection: VariableCollectionPort,
  modeMap: ReadonlyMap<string, string>,
): boolean {
  const serialized = canonicalizeJson(Object.fromEntries(modeMap));
  if (
    collection.getSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      MODE_IDENTITIES_SHARED_KEY,
    ) === serialized
  ) {
    return false;
  }
  collection.setSharedPluginData(
    HATCHKIT_SHARED_NAMESPACE,
    MODE_IDENTITIES_SHARED_KEY,
    serialized,
  );
  return true;
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function plannedValueToFigma(
  value: FigmaVariablePlannedValue,
  variablesByStableId: ReadonlyMap<string, VariablePort>,
  port: FigmaVariablesPort,
): unknown {
  switch (value.kind) {
    case "alias": {
      const target = variablesByStableId.get(value.targetStableId);
      if (target === undefined) {
        throw writerError(
          "IDENTITY_NOT_FOUND",
          `Variable alias target '${value.targetStableId}' was not created.`,
          "Correct the Variable plan and retry the same operation.",
        );
      }
      return port.createAlias(target);
    }
    case "color":
      return { a: value.a, b: value.b, g: value.g, r: value.r };
    case "float":
    case "string":
      return value.value;
  }
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "number" && typeof expected === "number") {
    return Math.abs(actual - expected) <= 1e-6;
  }
  if (isRecord(actual) && isRecord(expected)) {
    if (
      actual.type === "VARIABLE_ALIAS" ||
      expected.type === "VARIABLE_ALIAS"
    ) {
      return (
        actual.type === expected.type &&
        typeof actual.id === "string" &&
        actual.id === expected.id
      );
    }
    const normalizeColor = (value: Record<string, unknown>) => ({
      a: typeof value.a === "number" ? value.a : 1,
      b: value.b,
      g: value.g,
      r: value.r,
    });
    return (
      canonicalizeJson(normalizeColor(actual)) ===
      canonicalizeJson(normalizeColor(expected))
    );
  }
  return actual === expected;
}

function variableNeedsUpdate(
  variable: VariablePort,
  spec: FigmaVariablePlan["variables"][number],
  modeMap: ReadonlyMap<string, string>,
  variablesByStableId: ReadonlyMap<string, VariablePort>,
  port: FigmaVariablesPort,
): boolean {
  if (
    variable.name !== spec.name ||
    variable.description !== spec.description ||
    variable.hiddenFromPublishing !== spec.hiddenFromPublishing ||
    !sameStringSet(variable.scopes, spec.scopes) ||
    variable.codeSyntax.WEB !== spec.codeSyntax
  ) {
    return true;
  }
  return spec.values.some(({ modeStableId, value }) => {
    const modeId = modeMap.get(modeStableId);
    if (modeId === undefined) return true;
    return !valuesEqual(
      variable.valuesByMode[modeId],
      plannedValueToFigma(value, variablesByStableId, port),
    );
  });
}

function auditVariable(
  variable: VariablePort,
  spec: FigmaVariablePlan["variables"][number],
  modeMap: ReadonlyMap<string, string>,
  variablesByStableId: ReadonlyMap<string, VariablePort>,
  port: FigmaVariablesPort,
): void {
  if (variableNeedsUpdate(variable, spec, modeMap, variablesByStableId, port)) {
    throw writerError(
      "PARTIAL_WRITE",
      `Variable '${spec.tokenPath}' did not match the approved plan after writing.`,
      "Retry the same operation to resume convergence, or inspect the partial Variable state.",
    );
  }
}

export async function ensureFigmaVariables(
  port: FigmaVariablesPort,
  plan: FigmaVariablePlan,
  context: EnsureVariablesContext,
): Promise<EnsureVariablesResult> {
  assertFileBinding(port, context);
  if (
    context.projectId !== plan.source.projectId ||
    !context.approvalId.startsWith(
      `approval.tokens.${plan.source.assetId.replaceAll("/", "+")}.`,
    )
  ) {
    throw writerError(
      "APPROVAL_STALE",
      "The approved Token identity does not match the Variable plan.",
      "Re-read the approval record and rebuild the command from the approved Token Set.",
    );
  }

  const collections = await port.getCollections();
  const identityCollection = unique(
    collections,
    (collection) => {
      const marker = readMarker(collection);
      return (
        marker !== null &&
        markerIdentityMatches(marker, plan, "variable-collection", "root")
      );
    },
    "Variable Collection",
  );
  if (identityCollection === null) {
    const nameMatches = collections.filter(
      (collection) => collection.name === plan.collection.name,
    );
    if (nameMatches.length > 0) {
      throw writerError(
        "UNMANAGED_ASSET",
        `Variable Collection '${plan.collection.name}' exists without the required Hatchkit identity.`,
        "Adopt the exact collection through a separate reviewed migration, or rename it before retrying.",
      );
    }
  } else {
    const marker = readMarker(identityCollection);
    if (marker === null)
      throw new Error("Managed collection marker disappeared.");
    assertMarkerVersion(marker, plan);
  }

  const existingVariables = await port.getVariables();
  const preflightVariables = new Map<
    string,
    {
      readonly existing: VariablePort | null;
      readonly spec: FigmaVariablePlan["variables"][number];
    }
  >();
  for (const spec of plan.variables) {
    const existing = unique(
      existingVariables,
      (variable) => {
        const marker = readMarker(variable);
        return (
          marker !== null &&
          markerIdentityMatches(marker, plan, "variable", spec.tokenPath)
        );
      },
      `Variable '${spec.tokenPath}'`,
    );
    if (existing !== null) {
      const marker = readMarker(existing);
      if (marker === null)
        throw new Error("Managed Variable marker disappeared.");
      assertMarkerVersion(marker, plan);
      if (
        identityCollection === null ||
        existing.variableCollectionId !== identityCollection.id
      ) {
        throw writerError(
          "IDENTITY_CONFLICT",
          `Variable '${spec.tokenPath}' is attached to a different collection.`,
          "Resolve the managed identity conflict before retrying.",
        );
      }
      if (existing.resolvedType !== spec.resolvedType) {
        throw writerError(
          "VERSION_CONFLICT",
          `Variable '${spec.tokenPath}' has type '${existing.resolvedType}', expected '${spec.resolvedType}'.`,
          "Publish the incompatible type change on a new Major Variable Collection.",
        );
      }
    } else if (identityCollection !== null) {
      const nameMatches = existingVariables.filter(
        (variable) =>
          variable.variableCollectionId === identityCollection.id &&
          variable.name === spec.name,
      );
      if (nameMatches.length > 0) {
        throw writerError(
          "UNMANAGED_ASSET",
          `Variable '${spec.name}' exists without the required Hatchkit identity.`,
          "Adopt the exact Variable through a separate reviewed migration, or rename it before retrying.",
        );
      }
    }
    preflightVariables.set(spec.stableId, { existing, spec });
  }

  if (identityCollection !== null) {
    const desiredStableIds = new Set(
      plan.variables.map(({ stableId }) => stableId),
    );
    for (const variable of existingVariables) {
      if (variable.variableCollectionId !== identityCollection.id) continue;
      const marker = readMarker(variable);
      if (marker === null) {
        throw writerError(
          "UNMANAGED_ASSET",
          `Variable '${variable.name}' is inside the managed Collection without a valid Hatchkit identity.`,
          "Move or explicitly adopt the unmanaged Variable before retrying.",
        );
      }
      if (
        marker.projectId !== plan.source.projectId ||
        marker.assetId !== plan.source.assetId ||
        marker.majorVersion !== plan.collection.majorVersion ||
        marker.role !== "variable"
      ) {
        throw writerError(
          "IDENTITY_CONFLICT",
          `Variable '${variable.name}' belongs to a different managed asset but is inside this Collection.`,
          "Move the conflicting Variable to its owning Collection before retrying.",
        );
      }
      const stableId = `${plan.collection.stableId}/variable/${marker.slotId}`;
      if (!desiredStableIds.has(stableId)) {
        throw writerError(
          "VERSION_CONFLICT",
          `Managed Variable '${marker.slotId}' is absent from the requested plan.`,
          "Treat token removal as a breaking change and create a new Major Variable Collection.",
        );
      }
    }
  }

  const completedSteps: string[] = [];
  let mutated = false;
  try {
    const collection =
      identityCollection ?? port.createCollection(plan.collection.name);
    let collectionPrepared =
      identityCollection === null ||
      readMarker(collection)?.phase === "creating";
    const prepareCollectionMutation = (): void => {
      if (collectionPrepared) return;
      setMarker(
        collection,
        creatingMarker(plan, context, "variable-collection", "root"),
      );
      collectionPrepared = true;
      mutated = true;
    };
    let collectionAction: EnsureVariablesResult["collection"]["action"] =
      identityCollection === null ? "created" : "unchanged";
    if (identityCollection === null) {
      mutated = true;
      setMarker(
        collection,
        creatingMarker(plan, context, "variable-collection", "root"),
      );
      completedSteps.push("created_variable_collection");
    } else if (collection.name !== plan.collection.name) {
      prepareCollectionMutation();
      collection.name = plan.collection.name;
      collectionAction = "updated";
      mutated = true;
    }
    if (collection.hiddenFromPublishing) {
      prepareCollectionMutation();
      collection.hiddenFromPublishing = false;
      collectionAction = collectionAction === "created" ? "created" : "updated";
      mutated = true;
    }

    let modeMap = readModeMap(collection);
    if (identityCollection === null) {
      const firstMode = plan.collection.modes[0];
      const existingFirst = collection.modes[0];
      if (firstMode === undefined || existingFirst === undefined) {
        throw new Error("Figma did not create a default Variable mode.");
      }
      collection.renameMode(existingFirst.modeId, firstMode.name);
      modeMap = new Map([[firstMode.stableId, existingFirst.modeId]]);
    } else if (modeMap.size === 0) {
      throw writerError(
        "IDENTITY_CONFLICT",
        "The managed Variable Collection has no stable Mode identity map.",
        "Run an explicit migration instead of guessing Mode identities from names.",
      );
    }
    if (identityCollection !== null) {
      const mappedModeIds = new Set(modeMap.values());
      const actualModeIds = new Set(
        collection.modes.map(({ modeId }) => modeId),
      );
      if (
        mappedModeIds.size !== actualModeIds.size ||
        [...actualModeIds].some((modeId) => !mappedModeIds.has(modeId))
      ) {
        throw writerError(
          "IDENTITY_CONFLICT",
          "The managed Variable Collection contains an unmapped or duplicate Figma Mode identity.",
          "Repair the Mode identity map through an explicit migration before retrying.",
        );
      }
    }
    const desiredModes = new Set(
      plan.collection.modes.map(({ stableId }) => stableId),
    );
    for (const existingStableId of modeMap.keys()) {
      if (!desiredModes.has(existingStableId)) {
        throw writerError(
          "VERSION_CONFLICT",
          "The requested plan removes a managed Variable mode.",
          "Create a new Major Variable Collection for destructive Mode changes.",
        );
      }
    }
    for (const mode of plan.collection.modes) {
      let modeId = modeMap.get(mode.stableId);
      if (modeId === undefined) {
        prepareCollectionMutation();
        modeId = collection.addMode(mode.name);
        modeMap.set(mode.stableId, modeId);
        collectionAction =
          collectionAction === "created" ? "created" : "updated";
        mutated = true;
      }
      const actualMode = collection.modes.find(
        (candidate) => candidate.modeId === modeId,
      );
      if (actualMode === undefined) {
        throw writerError(
          "IDENTITY_CONFLICT",
          `Managed Mode '${mode.stableId}' no longer exists in Figma.`,
          "Repair the Mode identity map through an explicit migration.",
        );
      }
      if (actualMode.name !== mode.name) {
        prepareCollectionMutation();
        collection.renameMode(modeId, mode.name);
        collectionAction =
          collectionAction === "created" ? "created" : "updated";
        mutated = true;
      }
    }
    if (
      modeMap.get(plan.collection.defaultModeId) !== collection.defaultModeId
    ) {
      throw writerError(
        "VERSION_CONFLICT",
        "The requested default Mode differs from the managed Figma default Mode.",
        "Create a new Major Variable Collection for a default Mode identity change.",
      );
    }
    const modeMapNeedsWrite =
      collection.getSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MODE_IDENTITIES_SHARED_KEY,
      ) !== canonicalizeJson(Object.fromEntries(modeMap));
    if (modeMapNeedsWrite) {
      prepareCollectionMutation();
      writeModeMap(collection, modeMap);
      collectionAction = collectionAction === "created" ? "created" : "updated";
      mutated = true;
    }
    completedSteps.push("resolved_variable_modes");

    const variablesByStableId = new Map<string, VariablePort>();
    const resolved: ResolvedVariable[] = [];
    for (const [stableId, entry] of preflightVariables) {
      const variable =
        entry.existing ??
        (() => {
          prepareCollectionMutation();
          return port.createVariable(
            entry.spec.name,
            collection,
            entry.spec.resolvedType,
          );
        })();
      if (entry.existing === null) {
        mutated = true;
        setMarker(
          variable,
          creatingMarker(plan, context, "variable", entry.spec.tokenPath),
        );
      }
      variablesByStableId.set(stableId, variable);
      resolved.push({
        action: entry.existing === null ? "created" : "unchanged",
        spec: entry.spec,
        variable,
      });
    }
    completedSteps.push("resolved_variables");

    const finalResolved: ResolvedVariable[] = [];
    for (const entry of resolved) {
      const needsUpdate =
        entry.action === "created" ||
        !hasMarker(
          entry.variable,
          appliedMarker(plan, context, "variable", entry.spec.tokenPath),
        ) ||
        variableNeedsUpdate(
          entry.variable,
          entry.spec,
          modeMap,
          variablesByStableId,
          port,
        );
      if (needsUpdate) {
        prepareCollectionMutation();
        mutated = true;
        setMarker(
          entry.variable,
          creatingMarker(plan, context, "variable", entry.spec.tokenPath),
        );
        entry.variable.name = entry.spec.name;
        entry.variable.description = entry.spec.description;
        entry.variable.hiddenFromPublishing = entry.spec.hiddenFromPublishing;
        entry.variable.scopes = [...entry.spec.scopes];
        entry.variable.setVariableCodeSyntax("WEB", entry.spec.codeSyntax);
        for (const planned of entry.spec.values) {
          const modeId = modeMap.get(planned.modeStableId);
          if (modeId === undefined)
            throw new Error("Preflight Mode disappeared.");
          entry.variable.setValueForMode(
            modeId,
            plannedValueToFigma(planned.value, variablesByStableId, port),
          );
        }
      }
      finalResolved.push({
        ...entry,
        action:
          entry.action === "created"
            ? "created"
            : needsUpdate
              ? "updated"
              : "unchanged",
      });
    }
    completedSteps.push("applied_variable_values");

    for (const entry of finalResolved) {
      auditVariable(
        entry.variable,
        entry.spec,
        modeMap,
        variablesByStableId,
        port,
      );
    }
    completedSteps.push("audited_variable_values");

    for (const entry of finalResolved) {
      setMarker(
        entry.variable,
        appliedMarker(plan, context, "variable", entry.spec.tokenPath),
      );
    }
    const finalCollectionMarker = appliedMarker(
      plan,
      context,
      "variable-collection",
      "root",
    );
    if (!hasMarker(collection, finalCollectionMarker)) {
      prepareCollectionMutation();
      setMarker(collection, finalCollectionMarker);
    }
    completedSteps.push("committed_managed_markers");

    return {
      collection: {
        action: collectionAction,
        stableId: plan.collection.stableId,
      },
      deferredTypographyCount: plan.deferredTypography.length,
      type: "variables.ensure",
      variables: {
        created: finalResolved.filter(({ action }) => action === "created")
          .length,
        unchanged: finalResolved.filter(({ action }) => action === "unchanged")
          .length,
        updated: finalResolved.filter(({ action }) => action === "updated")
          .length,
      },
    };
  } catch (cause) {
    if (cause instanceof VariablesWriterError && !mutated) throw cause;
    throw new VariablesWriterError({
      code: "PARTIAL_WRITE",
      completedSteps,
      message:
        cause instanceof Error
          ? `Figma Variables were only partially applied: ${cause.message}`
          : "Figma Variables were only partially applied.",
      recoveryInstruction:
        "Retry the same operation so the managed identities can resume convergence; do not delete partial assets blindly.",
    });
  }
}

export function bindFigmaLibraryFile(
  document: SharedPluginDataPort,
  binding: FigmaLibraryFileBinding,
): BindFigmaLibraryFileResult {
  if (!isFigmaLibraryFileBinding(binding)) {
    throw writerError(
      "VALIDATION_FAILED",
      "The requested Figma file binding is invalid.",
      "Use a stable kebab-case project ID and a valid UUID file binding ID.",
    );
  }
  const existing = getFigmaLibraryFileBinding(document);
  if (existing !== null) {
    if (canonicalizeJson(existing) !== canonicalizeJson(binding)) {
      throw writerError(
        "FILE_BINDING_MISMATCH",
        "The open Figma file is already bound to a different Hatchkit project or file identity.",
        "Cancel this action and use a separately reviewed rebind flow; automatic rebinding is prohibited.",
      );
    }
    return { binding: existing, status: "unchanged" };
  }
  document.setSharedPluginData(
    HATCHKIT_SHARED_NAMESPACE,
    FILE_BINDING_SHARED_KEY,
    canonicalizeJson(binding),
  );
  return { binding, status: "bound" };
}

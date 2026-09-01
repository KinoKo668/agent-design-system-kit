import type { RegistryDriftObservation } from "@agent-design-system-kit/core";

import type { FigmaRegistryDriftAuditPort } from "./registry-drift-audit-runner.js";
import {
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
  getFigmaLibraryFileBinding,
  type SharedPluginDataPort,
} from "./variables-writer.js";

interface DriftEntity extends SharedPluginDataPort {
  readonly id: string;
}

interface DriftVariable extends DriftEntity {
  readonly variableCollectionId: string;
}

type DriftCollection = DriftEntity;

type DriftComponent = DriftEntity;

interface DriftSceneNode extends DriftEntity {
  readonly children?: readonly DriftComponent[];
  readonly key?: string;
  readonly type: string;
}

interface RegistryDriftFigmaApi {
  loadAllPagesAsync(): Promise<void>;
  readonly root: SharedPluginDataPort & {
    findAll(): readonly DriftSceneNode[];
  };
  readonly variables: {
    getLocalVariableCollectionsAsync(): Promise<readonly DriftCollection[]>;
    getLocalVariablesAsync(): Promise<readonly DriftVariable[]>;
  };
}

type MarkerKind = "component" | "token-set";
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;
const STABLE_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*$/u;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*))*))?(?:\+([0-9a-z-]+(?:\.[0-9a-z-]+)*))?$/iu;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function marker(entity: SharedPluginDataPort): {
  readonly present: boolean;
  readonly value: unknown;
} {
  const raw = entity.getSharedPluginData(
    HATCHKIT_SHARED_NAMESPACE,
    MANAGED_ASSET_SHARED_KEY,
  );
  if (raw.length === 0) return { present: false, value: null };
  try {
    return { present: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { present: true, value: null };
  }
}

function validMarker(
  value: unknown,
  kind: MarkerKind,
  role:
    "component-set" | "component-variant" | "variable" | "variable-collection",
): value is Record<string, unknown> {
  return (
    record(value) &&
    value.schemaVersion === "1.0.0" &&
    value.assetType === kind &&
    value.channel === "library" &&
    value.role === role &&
    (value.phase === "applied" || value.phase === "creating") &&
    typeof value.projectId === "string" &&
    PROJECT_ID_PATTERN.test(value.projectId) &&
    typeof value.assetId === "string" &&
    STABLE_ID_PATTERN.test(value.assetId) &&
    Number.isSafeInteger(value.majorVersion) &&
    Number(value.majorVersion) >= 0 &&
    typeof value.slotId === "string" &&
    STABLE_ID_PATTERN.test(value.slotId) &&
    stableRoot(value, kind).length <= 192 &&
    (role === "component-set" ||
      role === "variable-collection" ||
      `${stableRoot(value, kind)}/${role === "variable" ? "variable/" : ""}${value.slotId}`
        .length <= 192) &&
    (value.phase !== "applied" ||
      (typeof value.assetVersion === "string" &&
        SEMVER_PATTERN.test(value.assetVersion) &&
        typeof value.appliedDigest === "string" &&
        DIGEST_PATTERN.test(value.appliedDigest))) &&
    (value.phase !== "creating" ||
      (typeof value.targetAssetVersion === "string" &&
        SEMVER_PATTERN.test(value.targetAssetVersion) &&
        typeof value.targetDigest === "string" &&
        DIGEST_PATTERN.test(value.targetDigest)))
  );
}

function stableRoot(value: Record<string, unknown>, kind: MarkerKind): string {
  return kind === "component"
    ? `${String(value.projectId)}/component/${String(value.assetId)}/component-set/major-${String(value.majorVersion)}`
    : `${String(value.projectId)}/token-set/${String(value.assetId)}/variables/major-${String(value.majorVersion)}`;
}

function childStableId(
  entity: SharedPluginDataPort,
  kind: MarkerKind,
  role: "component-variant" | "variable",
):
  | { readonly status: "invalid" }
  | { readonly status: "missing" }
  | { readonly stableId: string; readonly status: "valid" } {
  const candidate = marker(entity);
  if (!candidate.present) return { status: "missing" };
  if (!validMarker(candidate.value, kind, role)) return { status: "invalid" };
  const root = stableRoot(candidate.value, kind);
  return {
    stableId:
      role === "variable"
        ? `${root}/variable/${String(candidate.value.slotId)}`
        : `${root}/${String(candidate.value.slotId)}`,
    status: "valid",
  };
}

function invalidAsset(
  physicalId: string,
  kind: RegistryDriftObservation["assets"][number]["kind"],
): RegistryDriftObservation["assets"][number] {
  return {
    assetVersion: null,
    childStableIds: [],
    contentDigest: null,
    kind,
    locatorKey: null,
    markerStatus: "invalid",
    physicalId,
    stableId: null,
  };
}

function aggregate(
  entity: DriftEntity,
  kind: MarkerKind,
  role: "component-set" | "variable-collection",
  children: readonly SharedPluginDataPort[],
  childRole: "component-variant" | "variable",
  locatorKey: string | null,
): readonly RegistryDriftObservation["assets"][number][] {
  const candidate = marker(entity);
  const invalidChildren: RegistryDriftObservation["assets"][number][] = [];
  const childStableIds = children.flatMap((child, index) => {
    const result = childStableId(child, kind, childRole);
    if (result.status === "invalid") {
      const childId =
        "id" in child ? String(child.id) : `${entity.id}/${index}`;
      invalidChildren.push(
        invalidAsset(
          childId,
          kind === "component" ? "component-set" : "token-collection",
        ),
      );
      return [];
    }
    return result.status === "missing" ? [] : [result.stableId];
  });
  if (!candidate.present) return invalidChildren;
  const assetKind = kind === "component" ? "component-set" : "token-collection";
  if (!validMarker(candidate.value, kind, role)) {
    return [invalidAsset(entity.id, assetKind), ...invalidChildren];
  }
  return [
    {
      assetVersion:
        candidate.value.phase === "applied"
          ? String(candidate.value.assetVersion)
          : String(candidate.value.targetAssetVersion),
      childStableIds,
      contentDigest:
        candidate.value.phase === "applied"
          ? String(candidate.value.appliedDigest)
          : String(candidate.value.targetDigest),
      kind: assetKind,
      locatorKey,
      markerStatus: candidate.value.phase as "applied" | "creating",
      physicalId: entity.id,
      stableId: stableRoot(candidate.value, kind),
    },
    ...invalidChildren,
  ];
}

export function createFigmaRegistryDriftAuditPort(
  figmaApi: RegistryDriftFigmaApi,
): FigmaRegistryDriftAuditPort {
  return {
    document: {
      getSharedPluginData: (namespace, key) =>
        figmaApi.root.getSharedPluginData(namespace, key),
      setSharedPluginData: (namespace, key, value) =>
        figmaApi.root.setSharedPluginData(namespace, key, value),
    },
    async getObservation() {
      await figmaApi.loadAllPagesAsync();
      const binding = getFigmaLibraryFileBinding(figmaApi.root);
      if (binding === null) {
        return { assets: [], fileBindingId: "", projectId: "" };
      }
      const [collections, variables] = await Promise.all([
        figmaApi.variables.getLocalVariableCollectionsAsync(),
        figmaApi.variables.getLocalVariablesAsync(),
      ]);
      const variablesByCollection = new Map<string, DriftVariable[]>();
      for (const variable of variables) {
        variablesByCollection.set(variable.variableCollectionId, [
          ...(variablesByCollection.get(variable.variableCollectionId) ?? []),
          variable,
        ]);
      }
      const componentSets = figmaApi.root.findAll().filter(
        (
          node,
        ): node is DriftSceneNode & {
          readonly children: readonly DriftComponent[];
        } => node.type === "COMPONENT_SET" && Array.isArray(node.children),
      );
      return {
        assets: [
          ...collections.flatMap((collection) =>
            aggregate(
              collection,
              "token-set",
              "variable-collection",
              variablesByCollection.get(collection.id) ?? [],
              "variable",
              null,
            ),
          ),
          ...componentSets.flatMap((componentSet) =>
            aggregate(
              componentSet,
              "component",
              "component-set",
              componentSet.children,
              "component-variant",
              componentSet.key?.length ? componentSet.key : null,
            ),
          ),
        ],
        fileBindingId: binding.fileBindingId,
        projectId: binding.projectId,
      };
    },
  };
}

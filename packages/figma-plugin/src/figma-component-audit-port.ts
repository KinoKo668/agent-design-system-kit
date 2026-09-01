import type { FigmaComponentObservation } from "@agent-design-system-kit/core";

import type { FigmaComponentAuditPort } from "./component-audit-runner.js";
import {
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
} from "./variables-writer.js";

interface AuditNode {
  readonly id: string;
  readonly name: string;
  readonly parent?: AuditParent | null;
  readonly type: string;
  readonly variantProperties?: unknown;
  getMainComponentAsync?(): Promise<AuditNode | null>;
  getSharedPluginData(namespace: string, key: string): string;
}

interface AuditParent {
  readonly id: string;
  readonly type: string;
  getSharedPluginData(namespace: string, key: string): string;
}

interface ComponentAuditFigmaApi {
  readonly currentPage: {
    readonly id: string;
    readonly name: string;
    findAll(): readonly AuditNode[];
  };
  readonly root: {
    getSharedPluginData(namespace: string, key: string): string;
    setSharedPluginData(namespace: string, key: string, value: string): void;
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rawMarker(node: Pick<AuditNode, "getSharedPluginData">): unknown {
  try {
    return JSON.parse(
      node.getSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
      ) || "null",
    ) as unknown;
  } catch {
    return null;
  }
}

function managedInstance(
  node: AuditNode,
): FigmaComponentObservation["managedInstance"] {
  const value = rawMarker(node);
  if (!record(value) || value.assetType !== "component-instance") return null;
  const complete =
    value.schemaVersion === "1.0.0" &&
    (value.phase === "applied" || value.phase === "creating") &&
    typeof value.instanceStableId === "string" &&
    typeof value.componentSetStableId === "string" &&
    typeof value.variantStableId === "string";
  return complete
    ? {
        componentSetStableId: String(value.componentSetStableId),
        instanceStableId: String(value.instanceStableId),
        phase: value.phase as "applied" | "creating",
        variantStableId: String(value.variantStableId),
      }
    : {
        componentSetStableId: null,
        instanceStableId: null,
        phase: "invalid",
        variantStableId: null,
      };
}

function componentStableId(
  node: Pick<AuditNode, "getSharedPluginData">,
  role: "component-set" | "component-variant",
): string | null {
  const value = rawMarker(node);
  if (
    !record(value) ||
    value.schemaVersion !== "1.0.0" ||
    value.assetType !== "component" ||
    value.phase !== "applied" ||
    value.role !== role ||
    typeof value.projectId !== "string" ||
    typeof value.assetId !== "string" ||
    typeof value.majorVersion !== "number" ||
    !Number.isSafeInteger(value.majorVersion) ||
    typeof value.slotId !== "string"
  ) {
    return null;
  }
  const root = `${value.projectId}/component/${value.assetId}/component-set/major-${String(value.majorVersion)}`;
  return role === "component-set" ? root : `${root}/${value.slotId}`;
}

function variantProperties(value: unknown): Readonly<Record<string, string>> {
  if (!record(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

async function observationFor(
  node: AuditNode,
): Promise<FigmaComponentObservation> {
  const managed = managedInstance(node);
  if (node.type !== "INSTANCE" || node.getMainComponentAsync === undefined) {
    return {
      managedInstance: managed,
      node: {
        id: node.id,
        name: (node.name || node.type).slice(0, 256),
        type: node.type,
      },
      source: null,
    };
  }
  const component = await node.getMainComponentAsync();
  if (component === null) {
    return {
      managedInstance: managed,
      node: {
        id: node.id,
        name: (node.name || node.type).slice(0, 256),
        type: node.type,
      },
      source: null,
    };
  }
  const componentSet =
    component.parent?.type === "COMPONENT_SET" ? component.parent : null;
  return {
    managedInstance: managed,
    node: {
      id: node.id,
      name: (node.name || node.type).slice(0, 256),
      type: node.type,
    },
    source: {
      componentNodeId: component.id,
      componentSetNodeId: componentSet?.id ?? null,
      componentSetStableId:
        componentSet === null
          ? null
          : componentStableId(componentSet, "component-set"),
      componentStableId: componentStableId(component, "component-variant"),
      variantProperties: variantProperties(node.variantProperties),
    },
  };
}

export function createFigmaComponentAuditPort(
  figmaApi: ComponentAuditFigmaApi,
): FigmaComponentAuditPort {
  return {
    document: {
      getSharedPluginData: (namespace, key) =>
        figmaApi.root.getSharedPluginData(namespace, key),
      setSharedPluginData: (namespace, key, value) =>
        figmaApi.root.setSharedPluginData(namespace, key, value),
    },
    getCurrentPage: () => ({
      id: figmaApi.currentPage.id,
      name: (figmaApi.currentPage.name || "Page").slice(0, 256),
    }),
    async getComponentObservations() {
      const candidates = figmaApi.currentPage.findAll().filter((node) => {
        const marker = rawMarker(node);
        return (
          node.type === "INSTANCE" ||
          (record(marker) && marker.assetType === "component-instance")
        );
      });
      return Promise.all(candidates.map((node) => observationFor(node)));
    },
  };
}

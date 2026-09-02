import {
  canonicalizeJson,
  createFigmaButtonInstancePlan,
  createFigmaIconInstancePlan,
  validateDesignSystemSnapshot,
  type FigmaButtonInstancePlan,
  type FigmaIconInstancePlan,
} from "@agent-design-system-kit/core";
import { describe, expect, it } from "vitest";

import validContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };
import validTokens from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };
import iconContract from "../../../design-system/hatch-demo/components/icon-check.component.json" with { type: "json" };
import iconRegistry from "../../../design-system/hatch-demo/registry/icons.registry.json" with { type: "json" };
import iconTokens from "../../../design-system/hatch-demo/tokens/icon-foundation.tokens.json" with { type: "json" };

import {
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
  type SharedPluginDataPort,
} from "./variables-writer.js";
import {
  ButtonInstanceWriterError,
  insertFigmaButtonInstance,
  insertFigmaIconInstance,
  type ButtonInstanceComponentPort,
  type ButtonInstanceComponentSetPort,
  type ButtonInstanceNodePort,
  type FigmaButtonInstancePort,
} from "./button-instance-writer.js";

const FILE_BINDING_ID = "00000000-0000-4000-8000-000000000001";
const CONTEXT = {
  approvalId: "approval.component.button.1.0.0",
  fileBindingId: FILE_BINDING_ID,
  operationId: "2c73620e-29b0-4285-8861-1a65b18f11dc",
  projectId: "hatch-demo",
};

class SharedData implements SharedPluginDataPort {
  private readonly values = new Map<string, string>();
  writes = 0;
  getSharedPluginData(namespace: string, key: string): string {
    return this.values.get(`${namespace}/${key}`) ?? "";
  }
  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.writes += 1;
    this.values.set(`${namespace}/${key}`, value);
  }
}

class FakeInstance extends SharedData implements ButtonInstanceNodePort {
  name = "Instance";
  x = 0;
  y = 0;
  readonly properties: Record<string, string | boolean> = {
    "Label#101:999": "Button",
  };
  propertyWrites = 0;
  constructor(
    readonly id: string,
    readonly mainComponentId: string,
    private readonly failProperties: () => boolean,
  ) {
    super();
  }
  getMainComponentId(): Promise<string | null> {
    return Promise.resolve(this.mainComponentId);
  }
  getProperties(): Readonly<Record<string, string | boolean>> {
    return { ...this.properties };
  }
  setProperties(properties: Readonly<Record<string, string>>): void {
    if (this.failProperties()) throw new Error("injected property failure");
    this.propertyWrites += 1;
    Object.assign(this.properties, properties);
  }
}

class FakeComponent extends SharedData implements ButtonInstanceComponentPort {
  constructor(
    readonly id: string,
    readonly name: string,
    private readonly create: (componentId: string) => FakeInstance,
  ) {
    super();
  }
  createInstance(): ButtonInstanceNodePort {
    return this.create(this.id);
  }
}

class FakeSet extends SharedData implements ButtonInstanceComponentSetPort {
  readonly componentPropertyDefinitions;
  constructor(
    readonly id: string,
    readonly children: readonly ButtonInstanceComponentPort[],
    definitions: ButtonInstanceComponentSetPort["componentPropertyDefinitions"] = {
      Appearance: {
        type: "VARIANT",
        variantOptions: ["Primary", "Secondary"],
      },
      "Label#101:999": { type: "TEXT" },
      State: {
        type: "VARIANT",
        variantOptions: ["Default", "Disabled"],
      },
    },
  ) {
    super();
    this.componentPropertyDefinitions = definitions;
  }
}

function plan(): FigmaButtonInstancePlan {
  const snapshot = validateDesignSystemSnapshot("hatch-demo", [
    {
      kind: "token-set",
      sourcePath: "tokens/a.tokens.json",
      value: validTokens,
    },
    {
      kind: "component",
      sourcePath: "components/button.component.json",
      value: validContract,
    },
    {
      kind: "component-registry",
      sourcePath: "registry/a.registry.json",
      value: validRegistry,
    },
  ]);
  if (!snapshot.ok) throw new Error(snapshot.error.message);
  const result = createFigmaButtonInstancePlan(snapshot.data, {
    assetId: "button",
    instanceId: "screen-checkout/submit",
    label: "Place order",
    projectId: "hatch-demo",
    variantSelections: { appearance: "secondary", state: "disabled" },
    x: 120,
    y: 240,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function componentMarker(
  plan: FigmaButtonInstancePlan | FigmaIconInstancePlan,
  role: string,
  slotId: string,
) {
  return canonicalizeJson({
    appliedDigest: plan.source.contentDigest,
    approvalId: plan.source.approvalId,
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
  });
}

function fixture(
  options: { readonly nodeId?: string; readonly failOnce?: boolean } = {},
) {
  const planned = plan();
  const instances: FakeInstance[] = [];
  let fail = options.failOnce ?? false;
  const components = planned.componentSet.expectedVariantStableIds.map(
    (stableId, index) => {
      const slotId = stableId.slice(`${planned.componentSet.stableId}/`.length);
      const selected = stableId === planned.selectedVariant.stableId;
      const component = new FakeComponent(
        `101:${String(index + 1)}`,
        selected
          ? planned.selectedVariant.figmaName
          : `Variant ${String(index + 1)}`,
        (componentId) => {
          const instance = new FakeInstance(
            `200:${String(instances.length + 1)}`,
            componentId,
            () => {
              if (!fail) return false;
              fail = false;
              return true;
            },
          );
          instances.push(instance);
          return instance;
        },
      );
      component.setSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
        componentMarker(planned, "component-variant", slotId),
      );
      return component;
    },
  );
  const set = new FakeSet(
    options.nodeId ?? planned.componentSet.nodeId,
    components,
  );
  set.setSharedPluginData(
    HATCHKIT_SHARED_NAMESPACE,
    MANAGED_ASSET_SHARED_KEY,
    componentMarker(planned, "component-set", "root"),
  );
  const document = new SharedData();
  document.setSharedPluginData(
    HATCHKIT_SHARED_NAMESPACE,
    "file-binding",
    canonicalizeJson({
      fileBindingId: FILE_BINDING_ID,
      fileRole: "design-system-library",
      projectId: "hatch-demo",
      schemaVersion: "1.0.0",
    }),
  );
  const port: FigmaButtonInstancePort = {
    document,
    appendToCurrentPage: () => undefined,
    getComponentSetById: (nodeId) =>
      Promise.resolve(nodeId === set.id ? set : null),
    getComponentSets: () => Promise.resolve([set]),
    getInstances: () => Promise.resolve(instances),
  };
  return { instances, plan: planned, port, set };
}

describe("insertFigmaButtonInstance", () => {
  it("creates one real Instance and repeats without duplication", async () => {
    const current = fixture();
    const first = await insertFigmaButtonInstance(
      current.port,
      current.plan,
      CONTEXT,
    );
    const writesAfterCreate = {
      marker: current.instances[0]?.writes,
      properties: current.instances[0]?.propertyWrites,
    };
    const second = await insertFigmaButtonInstance(
      current.port,
      current.plan,
      CONTEXT,
    );
    expect(first.instance.action).toBe("created");
    expect(second.instance.action).toBe("unchanged");
    expect(current.instances).toHaveLength(1);
    expect(current.instances[0]).toMatchObject({ x: 120, y: 240 });
    expect(current.instances[0]?.properties["Label#101:999"]).toBe(
      "Place order",
    );
    expect({
      marker: current.instances[0]?.writes,
      properties: current.instances[0]?.propertyWrites,
    }).toEqual(writesAfterCreate);
  });

  it("recovers a stale Registry locator by unique managed identity", async () => {
    const current = fixture({ nodeId: "500:600" });
    const result = await insertFigmaButtonInstance(
      current.port,
      current.plan,
      CONTEXT,
    );
    expect(result.componentSet.nodeId).toBe("500:600");
  });

  it("resumes a partial creation without creating another Instance", async () => {
    const current = fixture({ failOnce: true });
    await expect(
      insertFigmaButtonInstance(current.port, current.plan, CONTEXT),
    ).rejects.toMatchObject({ code: "PARTIAL_WRITE" });
    const recovered = await insertFigmaButtonInstance(
      current.port,
      current.plan,
      CONTEXT,
    );
    expect(recovered.instance.action).toBe("recovered");
    expect(current.instances).toHaveLength(1);
  });

  it("reports applied page drift without overwriting it", async () => {
    const current = fixture();
    await insertFigmaButtonInstance(current.port, current.plan, CONTEXT);
    const instance = current.instances[0];
    if (instance === undefined) throw new Error("Expected created Instance.");
    instance.x = 999;

    await expect(
      insertFigmaButtonInstance(current.port, current.plan, CONTEXT),
    ).rejects.toMatchObject({ code: "CONTENT_DIGEST_CONFLICT" });
    expect(instance.x).toBe(999);
  });

  it("blocks duplicate stable identities", async () => {
    const current = fixture();
    await insertFigmaButtonInstance(current.port, current.plan, CONTEXT);
    current.instances.push(current.instances[0] as FakeInstance);
    await expect(
      insertFigmaButtonInstance(current.port, current.plan, CONTEXT),
    ).rejects.toBeInstanceOf(ButtonInstanceWriterError);
  });
});

function iconPlan(): FigmaIconInstancePlan {
  const entry = iconRegistry.entries[0];
  if (entry === undefined) throw new Error("Icon Registry fixture missing.");
  const snapshot = validateDesignSystemSnapshot("hatch-demo", [
    {
      kind: "token-set",
      sourcePath: "tokens/icon.tokens.json",
      value: iconTokens,
    },
    {
      kind: "component",
      sourcePath: "components/icon.component.json",
      value: iconContract,
    },
    {
      kind: "component-registry",
      sourcePath: "registry/icon.registry.json",
      value: {
        ...iconRegistry,
        entries: [
          {
            ...entry,
            figma: {
              ...entry.figma,
              appliedDigest: entry.asset.contentDigest,
              appliedVersion: entry.asset.version,
              locator: {
                componentSetKey: "icon-set-key",
                nodeId: "500:600",
              },
              status: "ready",
            },
          },
        ],
      },
    },
  ]);
  if (!snapshot.ok) throw new Error(snapshot.error.message);
  const result = createFigmaIconInstancePlan(snapshot.data, {
    assetId: "icon/check",
    instanceId: "screen-checkout/success-check",
    projectId: "hatch-demo",
    variantSelections: { size: "large" },
    x: 180,
    y: 260,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function iconFixture(failOnce = false) {
  const planned = iconPlan();
  const instances: FakeInstance[] = [];
  let fail = failOnce;
  const components = planned.componentSet.expectedVariantStableIds.map(
    (stableId, index) => {
      const slotId = stableId.slice(`${planned.componentSet.stableId}/`.length);
      const component = new FakeComponent(
        `501:${String(index + 1)}`,
        stableId === planned.selectedVariant.stableId
          ? planned.selectedVariant.figmaName
          : `Size Variant ${String(index + 1)}`,
        (componentId) => {
          const instance = new FakeInstance(
            `600:${String(instances.length + 1)}`,
            componentId,
            () => {
              if (!fail) return false;
              fail = false;
              return true;
            },
          );
          instance.properties.Size = "Small";
          instances.push(instance);
          return instance;
        },
      );
      component.setSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
        componentMarker(planned, "component-variant", slotId),
      );
      return component;
    },
  );
  const set = new FakeSet(planned.componentSet.nodeId, components, {
    Size: {
      type: "VARIANT",
      variantOptions: ["Small", "Medium", "Large"],
    },
  });
  set.setSharedPluginData(
    HATCHKIT_SHARED_NAMESPACE,
    MANAGED_ASSET_SHARED_KEY,
    componentMarker(planned, "component-set", "root"),
  );
  const document = new SharedData();
  document.setSharedPluginData(
    HATCHKIT_SHARED_NAMESPACE,
    "file-binding",
    canonicalizeJson({
      fileBindingId: FILE_BINDING_ID,
      fileRole: "design-system-library",
      projectId: "hatch-demo",
      schemaVersion: "1.0.0",
    }),
  );
  const port: FigmaButtonInstancePort = {
    document,
    appendToCurrentPage: () => undefined,
    getComponentSetById: (nodeId) =>
      Promise.resolve(nodeId === set.id ? set : null),
    getComponentSets: () => Promise.resolve([set]),
    getInstances: () => Promise.resolve(instances),
  };
  return { instances, plan: planned, port };
}

const ICON_CONTEXT = {
  ...CONTEXT,
  approvalId: "approval.component.icon.check.1.0.0",
};

describe("insertFigmaIconInstance", () => {
  it("creates one exact Icon Instance and repeats without writes", async () => {
    const current = iconFixture();
    const first = await insertFigmaIconInstance(
      current.port,
      current.plan,
      ICON_CONTEXT,
    );
    const writes = {
      marker: current.instances[0]?.writes,
      properties: current.instances[0]?.propertyWrites,
    };
    const second = await insertFigmaIconInstance(
      current.port,
      current.plan,
      ICON_CONTEXT,
    );

    expect(first.instance.action).toBe("created");
    expect(second.instance.action).toBe("unchanged");
    expect(current.instances).toHaveLength(1);
    expect(current.instances[0]).toMatchObject({ x: 180, y: 260 });
    expect(current.instances[0]?.properties.Size).toBe("Large");
    expect({
      marker: current.instances[0]?.writes,
      properties: current.instances[0]?.propertyWrites,
    }).toEqual(writes);
  });

  it("resumes a partial Icon Instance without duplication", async () => {
    const current = iconFixture(true);
    await expect(
      insertFigmaIconInstance(current.port, current.plan, ICON_CONTEXT),
    ).rejects.toMatchObject({ code: "PARTIAL_WRITE" });
    const recovered = await insertFigmaIconInstance(
      current.port,
      current.plan,
      ICON_CONTEXT,
    );
    expect(recovered.instance.action).toBe("recovered");
    expect(current.instances).toHaveLength(1);
  });
});

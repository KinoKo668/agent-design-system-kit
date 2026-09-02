import {
  canonicalizeJson,
  createFigmaInputInstancePlan,
  validateDesignSystemSnapshot,
  type FigmaInputInstancePlan,
} from "@agent-design-system-kit/core";
import { describe, expect, it } from "vitest";

import inputContract from "../../../design-system/hatch-demo/components/input-text.component.json" with { type: "json" };
import inputRegistry from "../../../design-system/hatch-demo/registry/inputs.registry.json" with { type: "json" };
import inputTokens from "../../../design-system/hatch-demo/tokens/input-foundation.tokens.json" with { type: "json" };

import type {
  ButtonInstanceComponentPort,
  ButtonInstanceComponentSetPort,
  ButtonInstanceNodePort,
  FigmaButtonInstancePort,
} from "./button-instance-writer.js";
import {
  InputInstanceWriterError,
  insertFigmaInputInstance,
} from "./input-instance-writer.js";
import {
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
  type SharedPluginDataPort,
} from "./variables-writer.js";

const FILE_BINDING_ID = "00000000-0000-4000-8000-000000000001";
const CONTEXT = {
  approvalId: "approval.component.input.text.1.0.0",
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
  readonly properties: Record<string, string | boolean> = {};
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
  constructor(
    readonly id: string,
    readonly children: readonly ButtonInstanceComponentPort[],
    readonly componentPropertyDefinitions: ButtonInstanceComponentSetPort["componentPropertyDefinitions"],
  ) {
    super();
  }
}

function plan(): FigmaInputInstancePlan {
  const entry = inputRegistry.entries[0];
  if (entry === undefined) throw new Error("Input Registry fixture missing.");
  const snapshot = validateDesignSystemSnapshot("hatch-demo", [
    {
      kind: "token-set",
      sourcePath: "tokens/input.tokens.json",
      value: inputTokens,
    },
    {
      kind: "component",
      sourcePath: "components/input.component.json",
      value: inputContract,
    },
    {
      kind: "component-registry",
      sourcePath: "registry/input.registry.json",
      value: {
        ...inputRegistry,
        entries: [
          {
            ...entry,
            figma: {
              ...entry.figma,
              appliedDigest: entry.asset.contentDigest,
              appliedVersion: entry.asset.version,
              locator: {
                componentSetKey: "input-text-component-set-key",
                nodeId: "700:800",
              },
              status: "ready",
            },
          },
        ],
      },
    },
  ]);
  if (!snapshot.ok) throw new Error(snapshot.error.message);
  const planned = createFigmaInputInstancePlan(snapshot.data, {
    assetId: "input/text",
    instanceId: "screen-sign-up/email",
    label: "Email address",
    projectId: "hatch-demo",
    supportingText: "Enter a valid work email address.",
    text: "alex@example.com",
    variantSelections: { content: "filled", state: "error" },
    x: 120,
    y: 240,
  });
  if (!planned.ok) throw new Error(planned.error.message);
  return planned.data;
}

function componentMarker(
  planned: FigmaInputInstancePlan,
  role: string,
  slotId: string,
): string {
  return canonicalizeJson({
    appliedDigest: planned.source.contentDigest,
    approvalId: planned.source.approvalId,
    assetId: planned.source.assetId,
    assetType: "component",
    assetVersion: planned.source.assetVersion,
    channel: "library",
    majorVersion: planned.componentSet.majorVersion,
    phase: "applied",
    projectId: planned.source.projectId,
    role,
    schemaVersion: "1.0.0",
    slotId,
  });
}

function variantName(slotId: string): string {
  const [statePart, contentPart] = slotId.split("/").slice(1);
  const state = statePart?.replace("state-", "") ?? "";
  const content = contentPart?.replace("content-", "") ?? "";
  return `State=${state.charAt(0).toUpperCase()}${state.slice(1)}, Content=${content.charAt(0).toUpperCase()}${content.slice(1)}`;
}

function fixture(
  options: {
    readonly failOnce?: boolean;
    readonly invalidVariantName?: boolean;
  } = {},
) {
  const planned = plan();
  const instances: FakeInstance[] = [];
  let fail = options.failOnce ?? false;
  const components = planned.componentSet.expectedVariantStableIds.map(
    (stableId, index) => {
      const slotId = stableId.slice(`${planned.componentSet.stableId}/`.length);
      const component = new FakeComponent(
        `701:${String(index + 1)}`,
        options.invalidVariantName && index === 0
          ? "State=Broken, Content=Empty"
          : variantName(slotId),
        (componentId) => {
          const instance = new FakeInstance(
            `702:${String(instances.length + 1)}`,
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
  const set = new FakeSet(planned.componentSet.nodeId, components, {
    Content: { type: "VARIANT", variantOptions: ["Empty", "Filled"] },
    "Label#700:901": { type: "TEXT" },
    State: {
      type: "VARIANT",
      variantOptions: ["Default", "Focused", "Error", "Disabled"],
    },
    "Supporting text#700:903": { type: "TEXT" },
    "Text#700:902": { type: "TEXT" },
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

describe("insertFigmaInputInstance", () => {
  it("creates one exact Instance and repeats without duplication", async () => {
    const current = fixture();
    const first = await insertFigmaInputInstance(
      current.port,
      current.plan,
      CONTEXT,
    );
    const second = await insertFigmaInputInstance(
      current.port,
      current.plan,
      CONTEXT,
    );
    expect(first.instance.action).toBe("created");
    expect(second.instance.action).toBe("unchanged");
    expect(current.instances).toHaveLength(1);
    expect(current.instances[0]).toMatchObject({
      name: "Input · email",
      x: 120,
      y: 240,
    });
    expect(current.instances[0]?.properties).toEqual({
      Content: "Filled",
      "Label#700:901": "Email address",
      State: "Error",
      "Supporting text#700:903": "Enter a valid work email address.",
      "Text#700:902": "alex@example.com",
    });
  });

  it("recovers one partial write without making another Instance", async () => {
    const current = fixture({ failOnce: true });
    await expect(
      insertFigmaInputInstance(current.port, current.plan, CONTEXT),
    ).rejects.toMatchObject({ code: "PARTIAL_WRITE" });
    const recovered = await insertFigmaInputInstance(
      current.port,
      current.plan,
      CONTEXT,
    );
    expect(recovered.instance.action).toBe("recovered");
    expect(current.instances).toHaveLength(1);
  });

  it("blocks silent property drift and malformed Variant matrices", async () => {
    const current = fixture();
    await insertFigmaInputInstance(current.port, current.plan, CONTEXT);
    const instance = current.instances[0];
    if (instance === undefined) throw new Error("Input Instance missing.");
    instance.properties.State = "Focused";
    await expect(
      insertFigmaInputInstance(current.port, current.plan, CONTEXT),
    ).rejects.toMatchObject({ code: "CONTENT_DIGEST_CONFLICT" });

    const malformed = fixture({ invalidVariantName: true });
    await expect(
      insertFigmaInputInstance(malformed.port, malformed.plan, CONTEXT),
    ).rejects.toBeInstanceOf(InputInstanceWriterError);
  });

  it("blocks a mismatched approval or file binding before mutation", async () => {
    const current = fixture();
    await expect(
      insertFigmaInputInstance(current.port, current.plan, {
        ...CONTEXT,
        approvalId: "approval.component.other.1.0.0",
      }),
    ).rejects.toMatchObject({ code: "FILE_BINDING_MISMATCH" });
    expect(current.instances).toHaveLength(0);
  });
});

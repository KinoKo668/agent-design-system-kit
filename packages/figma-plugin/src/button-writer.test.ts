import { describe, expect, it } from "vitest";

import validContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };
import {
  canonicalizeJson,
  createFigmaButtonPlan,
  type FigmaButtonPlan,
} from "@agent-design-system-kit/core";

import {
  ensureFigmaButton,
  type ButtonBoundField,
  type ButtonComponentPort,
  type ButtonComponentSetPort,
  type ButtonTextBoundField,
  type ButtonTextPort,
  type ButtonVariablePort,
  type ButtonWriterError,
  type ComponentPropertyDefinitionPort,
  type FigmaButtonPort,
} from "./button-writer.js";
import {
  FILE_BINDING_SHARED_KEY,
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
} from "./variables-writer.js";

const COMPONENT_DIGEST =
  "sha256:7e6003e59916e0fc445e7ef6d37feb148a3d77908bb7834b3bdb4185530d0e78";
const TOKEN_DIGEST = `sha256:${"a".repeat(64)}`;
const FILE_BINDING_ID = "2227db09-eb2f-4dcb-8f6a-386c6271e577";
const CONTEXT = {
  approvalId: "approval.component.button.1.0.0",
  fileBindingId: FILE_BINDING_ID,
  operationId: "39d4aa88-67a2-4de3-bf64-2b51509316be",
  projectId: "hatch-demo",
} as const;

class SharedData {
  private readonly values = new Map<string, string>();
  getSharedPluginData(namespace: string, key: string): string {
    return this.values.get(`${namespace}/${key}`) ?? "";
  }
  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.values.set(`${namespace}/${key}`, value);
  }
}

class FakeVariable extends SharedData implements ButtonVariablePort {
  constructor(
    readonly id: string,
    readonly resolvedType: "COLOR" | "FLOAT" | "STRING",
  ) {
    super();
  }
}

class FakeText extends SharedData implements ButtonTextPort {
  characters = "";
  componentPropertyReferences: { characters?: string } | null = null;
  fills: unknown = [];
  fontName = { family: "Inter", style: "Regular" };
  fontSize = 12;
  letterSpacing = { unit: "PIXELS" as const, value: 0 };
  lineHeight = { unit: "PERCENT" as const, value: 100 };
  name = "Text";
  readonly bindings = new Map<ButtonTextBoundField, string>();

  setBoundVariable(
    field: ButtonTextBoundField,
    variable: ButtonVariablePort,
  ): boolean {
    if (this.bindings.get(field) === variable.id) return false;
    this.bindings.set(field, variable.id);
    return true;
  }
}

class FakeComponent extends SharedData implements ButtonComponentPort {
  readonly id: string;
  readonly childNodes: FakeText[] = [];
  readonly bindings = new Map<ButtonBoundField, string>();
  cornerRadius = 0;
  counterAxisAlignItems = "CENTER" as const;
  counterAxisSizingMode = "FIXED" as const;
  description = "";
  fills: unknown = [];
  height = 100;
  layoutMode = "HORIZONTAL" as const;
  name = "Component";
  opacity = 1;
  paddingLeft = 0;
  paddingRight = 0;
  primaryAxisAlignItems = "CENTER" as const;
  primaryAxisSizingMode = "AUTO" as const;
  strokeAlign = "INSIDE" as const;
  strokes: unknown = [];
  strokeWeight = 0;
  x = 0;
  y = 0;

  constructor(id: number) {
    super();
    this.id = `component:${String(id)}`;
  }
  get children(): readonly ButtonTextPort[] {
    return this.childNodes;
  }
  get totalChildCount(): number {
    return this.childNodes.length;
  }
  appendChild(node: ButtonTextPort): void {
    this.childNodes.push(node as FakeText);
  }
  resizeHeight(height: number): boolean {
    if (this.height === height) return false;
    this.height = height;
    return true;
  }
  setBoundVariable(
    field: ButtonBoundField,
    variable: ButtonVariablePort,
  ): boolean {
    if (this.bindings.get(field) === variable.id) return false;
    this.bindings.set(field, variable.id);
    return true;
  }
}

class FakeComponentSet extends SharedData implements ButtonComponentSetPort {
  readonly definitions: Record<string, ComponentPropertyDefinitionPort>;
  description = "";
  name = "Component Set";

  constructor(
    readonly id: string,
    readonly children: readonly ButtonComponentPort[],
    definitions?: Record<string, ComponentPropertyDefinitionPort>,
  ) {
    super();
    this.definitions = definitions ?? {
      Appearance: {
        defaultValue: "Primary",
        type: "VARIANT",
        variantOptions: ["Primary", "Secondary"],
      },
      State: {
        defaultValue: "Default",
        type: "VARIANT",
        variantOptions: ["Default", "Disabled"],
      },
    };
  }
  get componentPropertyDefinitions(): Readonly<
    Record<string, ComponentPropertyDefinitionPort>
  > {
    return this.definitions;
  }
  addComponentProperty(
    name: string,
    type: "TEXT",
    defaultValue: string,
  ): string {
    const fullName = `${name}#fake`;
    this.definitions[fullName] = { defaultValue, type };
    return fullName;
  }
  editComponentProperty(
    name: string,
    value: { defaultValue?: string; name?: string },
  ): string {
    const previous = this.definitions[name];
    if (previous === undefined) throw new Error("Missing property.");
    const nextName = value.name ?? name;
    delete this.definitions[name];
    this.definitions[nextName] = {
      ...previous,
      ...(value.defaultValue === undefined
        ? {}
        : { defaultValue: value.defaultValue }),
    };
    return nextName;
  }
}

class FakeButtonPort implements FigmaButtonPort {
  readonly document = new SharedData();
  readonly variables: FakeVariable[] = [];
  readonly components: FakeComponent[] = [];
  readonly componentSets: FakeComponentSet[] = [];
  readonly loadedFonts: string[] = [];
  private nextId = 1;

  constructor(readonly plan: FigmaButtonPlan) {
    this.document.setSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      FILE_BINDING_SHARED_KEY,
      canonicalizeJson({
        fileBindingId: FILE_BINDING_ID,
        fileRole: "design-system-library",
        projectId: "hatch-demo",
        schemaVersion: "1.0.0",
      }),
    );
    const expected = new Map<string, ButtonVariablePort["resolvedType"]>();
    [
      ...plan.sharedBindings,
      ...plan.variants.flatMap(({ bindings }) => bindings),
    ].forEach((binding) =>
      expected.set(
        binding.variableStableId,
        binding.kind === "color" ? "COLOR" : "FLOAT",
      ),
    );
    expected.set(plan.typography.fontFamily.variableStableId, "STRING");
    expected.set(plan.typography.fontSize.variableStableId, "FLOAT");
    expected.set(plan.typography.fontWeight.variableStableId, "FLOAT");
    expected.set(plan.typography.letterSpacing.variableStableId, "FLOAT");
    for (const [stableId, type] of expected) {
      const variable = new FakeVariable(
        `variable:${String(this.nextId++)}`,
        type,
      );
      variable.setSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
        canonicalizeJson({
          appliedDigest: plan.tokenSource.contentDigest,
          assetId: plan.tokenSource.assetId,
          assetType: "token-set",
          assetVersion: plan.tokenSource.assetVersion,
          channel: "library",
          majorVersion: 1,
          phase: "applied",
          projectId: plan.tokenSource.projectId,
          role: "variable",
          schemaVersion: "1.0.0",
          slotId: stableId.split("/variable/")[1],
        }),
      );
      this.variables.push(variable);
    }
  }

  bindColor(
    variable: ButtonVariablePort,
    binding: Extract<
      FigmaButtonPlan["variants"][number]["bindings"][number],
      { kind: "color" }
    >,
  ): unknown {
    return [{ boundVariableId: variable.id, ...binding.fallback }];
  }
  combineAsVariants(
    components: readonly ButtonComponentPort[],
  ): ButtonComponentSetPort {
    const set = new FakeComponentSet(
      `component-set:${String(this.nextId++)}`,
      components,
    );
    this.componentSets.push(set);
    return set;
  }
  createComponent(): ButtonComponentPort {
    const component = new FakeComponent(this.nextId++);
    this.components.push(component);
    return component;
  }
  createText(): ButtonTextPort {
    return new FakeText();
  }
  getComponentSets(): Promise<readonly ButtonComponentSetPort[]> {
    return Promise.resolve(this.componentSets);
  }
  getComponents(): Promise<readonly ButtonComponentPort[]> {
    return Promise.resolve(this.components);
  }
  getVariables(): Promise<readonly ButtonVariablePort[]> {
    return Promise.resolve(this.variables);
  }
  loadFont(family: string, style: string): Promise<void> {
    this.loadedFonts.push(`${family}/${style}`);
    return Promise.resolve();
  }
}

function createPlan(): FigmaButtonPlan {
  const result = createFigmaButtonPlan(
    validContract,
    validTokenSet,
    COMPONENT_DIGEST,
    TOKEN_DIGEST,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

describe("Figma Button writer", () => {
  it("creates, audits and marks one Button Set with four Variants", async () => {
    const port = new FakeButtonPort(createPlan());
    const result = await ensureFigmaButton(port, port.plan, CONTEXT);

    expect(result).toMatchObject({
      componentSet: {
        action: "created",
        stableId: port.plan.componentSet.stableId,
      },
      labelPropertyName: "Label#fake",
      variants: { created: 4, unchanged: 0, updated: 0 },
    });
    expect(port.componentSets).toHaveLength(1);
    expect(port.components).toHaveLength(4);
    expect(port.components.every(({ height }) => height === 40)).toBe(true);
    expect(port.components.map(({ x, y }) => [x, y])).toEqual([
      [0, 0],
      [0, 80],
      [240, 0],
      [240, 80],
    ]);
    expect(
      port.components.every(
        ({ childNodes }) => childNodes[0]?.lineHeight.value === 143,
      ),
    ).toBe(true);
    expect(
      port.components.every(
        ({ childNodes }) =>
          childNodes[0]?.componentPropertyReferences?.characters ===
          "Label#fake",
      ),
    ).toBe(true);
    expect(port.loadedFonts).toEqual(Array(4).fill("Inter/Medium"));
    expect(
      port.componentSets[0]?.getSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
      ),
    ).toContain('"phase":"applied"');
  });

  it("is physically idempotent on a second run", async () => {
    const port = new FakeButtonPort(createPlan());
    await ensureFigmaButton(port, port.plan, CONTEXT);
    const before = port.componentSets[0]?.getSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      MANAGED_ASSET_SHARED_KEY,
    );
    const result = await ensureFigmaButton(port, port.plan, CONTEXT);

    expect(result.componentSet.action).toBe("unchanged");
    expect(result.variants).toEqual({ created: 0, unchanged: 4, updated: 0 });
    expect(port.componentSets).toHaveLength(1);
    expect(port.components).toHaveLength(4);
    expect(
      port.componentSets[0]?.getSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
      ),
    ).toBe(before);
  });

  it("recovers an unmarked Set after combineAsVariants without duplicating it", async () => {
    const port = new FakeButtonPort(createPlan());
    await ensureFigmaButton(port, port.plan, CONTEXT);
    port.componentSets[0]?.setSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      MANAGED_ASSET_SHARED_KEY,
      "",
    );

    const result = await ensureFigmaButton(port, port.plan, CONTEXT);
    expect(result.componentSet.action).toBe("updated");
    expect(port.componentSets).toHaveLength(1);
    expect(port.components).toHaveLength(4);
  });

  it("blocks a damaged existing Set before changing its Variants", async () => {
    const port = new FakeButtonPort(createPlan());
    await ensureFigmaButton(port, port.plan, CONTEXT);
    const firstName = port.components[0]?.name;
    (port.componentSets[0]?.children as ButtonComponentPort[]).pop();

    await expect(
      ensureFigmaButton(port, port.plan, CONTEXT),
    ).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
    expect(port.components[0]?.name).toBe(firstName);
  });

  it("blocks a stale required Variable before creating nodes", async () => {
    const port = new FakeButtonPort(createPlan());
    const marker = JSON.parse(
      port.variables[0]?.getSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
      ) ?? "{}",
    ) as Record<string, unknown>;
    marker.appliedDigest = `sha256:${"b".repeat(64)}`;
    port.variables[0]?.setSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      MANAGED_ASSET_SHARED_KEY,
      canonicalizeJson(marker),
    );

    await expect(
      ensureFigmaButton(port, port.plan, CONTEXT),
    ).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    } satisfies Partial<ButtonWriterError>);
    expect(port.components).toHaveLength(0);
  });

  it("refuses name-based adoption of an unmanaged Component Set", async () => {
    const port = new FakeButtonPort(createPlan());
    const unmanaged = new FakeComponentSet("component-set:unmanaged", []);
    unmanaged.name = "Button";
    port.componentSets.push(unmanaged);

    await expect(
      ensureFigmaButton(port, port.plan, CONTEXT),
    ).rejects.toMatchObject({
      code: "UNMANAGED_ASSET",
    } satisfies Partial<ButtonWriterError>);
    expect(port.components).toHaveLength(0);
  });
});

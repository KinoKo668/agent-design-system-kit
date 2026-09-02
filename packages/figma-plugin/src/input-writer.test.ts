import { describe, expect, it } from "vitest";

import validContract from "../../../design-system/hatch-demo/components/input-text.component.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/input-foundation.tokens.json" with { type: "json" };
import {
  canonicalizeJson,
  createFigmaInputPlan,
  type FigmaInputPlan,
} from "@agent-design-system-kit/core";

import type {
  ButtonTextBoundField,
  ButtonVariablePort,
  ComponentPropertyDefinitionPort,
} from "./button-writer.js";
import {
  ensureFigmaInput,
  type FigmaInputPort,
  type InputComponentBoundField,
  type InputComponentPort,
  type InputComponentSetPort,
  type InputFieldBoundField,
  type InputFieldPort,
  type InputTextPort,
  type InputVariantChildPort,
} from "./input-writer.js";
import {
  FILE_BINDING_SHARED_KEY,
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
} from "./variables-writer.js";

const COMPONENT_DIGEST =
  "sha256:cdcc977da4014343e91edef042a55335821d8eaffc8d8098dc865f798321cfc5";
const TOKEN_DIGEST =
  "sha256:84eff4f8b036b88b861f494251eb9c59b4066774531bd147389af611ff520e6d";
const FILE_BINDING_ID = "2227db09-eb2f-4dcb-8f6a-386c6271e577";
const CONTEXT = {
  approvalId: "approval.component.input.text.1.0.0",
  fileBindingId: FILE_BINDING_ID,
  operationId: "89d4aa88-67a2-4de3-bf64-2b51509316be",
  projectId: "hatch-demo",
} as const;

function plan(): FigmaInputPlan {
  const result = createFigmaInputPlan(
    validContract,
    validTokenSet,
    COMPONENT_DIGEST,
    TOKEN_DIGEST,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

class SharedData {
  private readonly data = new Map<string, string>();
  getSharedPluginData(namespace: string, key: string): string {
    return this.data.get(`${namespace}/${key}`) ?? "";
  }
  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.data.set(`${namespace}/${key}`, value);
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

class FakeText extends SharedData implements InputTextPort {
  readonly kind = "text" as const;
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

class FakeField extends SharedData implements InputFieldPort {
  readonly kind = "field" as const;
  readonly childNodes: FakeText[] = [];
  readonly bindings = new Map<InputFieldBoundField, string>();
  cornerRadius = 0;
  counterAxisAlignItems = "CENTER" as const;
  counterAxisSizingMode = "FIXED" as const;
  fills: unknown = [];
  height = 100;
  layoutMode = "HORIZONTAL" as const;
  name = "Frame";
  paddingLeft = 0;
  paddingRight = 0;
  primaryAxisSizingMode = "FIXED" as const;
  strokeAlign = "INSIDE" as const;
  strokes: unknown = [];
  strokeWeight = 0;
  width = 100;
  get children(): readonly InputTextPort[] {
    return this.childNodes;
  }
  get totalChildCount(): number {
    return this.childNodes.length;
  }
  appendChild(node: InputTextPort): void {
    this.childNodes.push(node as FakeText);
  }
  resize(width: number, height: number): boolean {
    if (this.width === width && this.height === height) return false;
    this.width = width;
    this.height = height;
    return true;
  }
  setBoundVariable(
    field: InputFieldBoundField,
    variable: ButtonVariablePort,
  ): boolean {
    if (this.bindings.get(field) === variable.id) return false;
    this.bindings.set(field, variable.id);
    return true;
  }
}

class FakeComponent extends SharedData implements InputComponentPort {
  readonly childNodes: InputVariantChildPort[] = [];
  readonly bindings = new Map<InputComponentBoundField, string>();
  counterAxisSizingMode = "FIXED" as const;
  description = "";
  itemSpacing = 0;
  layoutMode = "VERTICAL" as const;
  name = "Component";
  primaryAxisSizingMode = "AUTO" as const;
  width = 100;
  x = 0;
  y = 0;
  constructor(readonly id: string) {
    super();
  }
  get children(): readonly InputVariantChildPort[] {
    return this.childNodes;
  }
  get totalChildCount(): number {
    return this.childNodes.length;
  }
  appendChild(node: InputVariantChildPort): void {
    this.childNodes.push(node);
  }
  resizeWidth(width: number): boolean {
    if (this.width === width) return false;
    this.width = width;
    return true;
  }
  setBoundVariable(
    field: InputComponentBoundField,
    variable: ButtonVariablePort,
  ): boolean {
    if (this.bindings.get(field) === variable.id) return false;
    this.bindings.set(field, variable.id);
    return true;
  }
  setChildrenOrder(children: readonly InputVariantChildPort[]): boolean {
    if (children.every((child, index) => this.childNodes[index] === child)) {
      return false;
    }
    this.childNodes.splice(0, this.childNodes.length, ...children);
    return true;
  }
}

class FakeComponentSet extends SharedData implements InputComponentSetPort {
  readonly definitions: Record<string, ComponentPropertyDefinitionPort>;
  description = "";
  name = "Component Set";
  constructor(
    readonly id: string,
    readonly children: readonly InputComponentPort[],
    currentPlan: FigmaInputPlan,
  ) {
    super();
    this.definitions = {
      Content: {
        defaultValue: currentPlan.componentSet.properties.content.defaultValue,
        type: "VARIANT",
        variantOptions: currentPlan.componentSet.properties.content.options,
      },
      State: {
        defaultValue: currentPlan.componentSet.properties.state.defaultValue,
        type: "VARIANT",
        variantOptions: currentPlan.componentSet.properties.state.options,
      },
    };
  }
  get componentPropertyDefinitions() {
    return this.definitions;
  }
  addComponentProperty(
    name: string,
    type: "TEXT",
    defaultValue: string,
  ): string {
    const fullName = `${name}#${String(Object.keys(this.definitions).length)}`;
    this.definitions[fullName] = { defaultValue, type };
    return fullName;
  }
  editComponentProperty(
    name: string,
    value: { defaultValue?: string; name?: string },
  ): string {
    const definition = this.definitions[name];
    if (definition === undefined) throw new Error("Missing property.");
    const next = value.name ?? name;
    delete this.definitions[name];
    this.definitions[next] = {
      ...definition,
      ...(value.defaultValue === undefined
        ? {}
        : { defaultValue: value.defaultValue }),
    };
    return next;
  }
}

class FakeInputPort implements FigmaInputPort {
  readonly document = new SharedData();
  readonly variables: FakeVariable[] = [];
  readonly components: FakeComponent[] = [];
  readonly componentSets: FakeComponentSet[] = [];
  readonly fonts: string[] = [];
  private nextId = 1;
  constructor(readonly currentPlan: FigmaInputPlan) {
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
    const expected = new Map<string, "COLOR" | "FLOAT" | "STRING">();
    [
      ...currentPlan.sharedBindings,
      ...currentPlan.variants.flatMap(({ bindings }) => bindings),
    ].forEach((binding) =>
      expected.set(
        binding.variableStableId,
        binding.kind === "color" ? "COLOR" : "FLOAT",
      ),
    );
    Object.values(currentPlan.typography).forEach((typography) => {
      expected.set(typography.fontFamily.variableStableId, "STRING");
      expected.set(typography.fontSize.variableStableId, "FLOAT");
      expected.set(typography.fontWeight.variableStableId, "FLOAT");
      expected.set(typography.letterSpacing.variableStableId, "FLOAT");
    });
    for (const [stableId, type] of expected) {
      const variable = new FakeVariable(this.id("variable"), type);
      variable.setSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
        canonicalizeJson({
          appliedDigest: currentPlan.tokenSource.contentDigest,
          assetId: currentPlan.tokenSource.assetId,
          assetType: "token-set",
          assetVersion: currentPlan.tokenSource.assetVersion,
          channel: "library",
          majorVersion: 1,
          phase: "applied",
          projectId: currentPlan.tokenSource.projectId,
          role: "variable",
          schemaVersion: "1.0.0",
          slotId: stableId.split("/variable/")[1],
        }),
      );
      this.variables.push(variable);
    }
  }
  bindColor(variable: ButtonVariablePort, binding: { fallback: unknown }) {
    return [{ binding: variable.id, fallback: binding.fallback }];
  }
  combineAsVariants(
    components: readonly InputComponentPort[],
  ): InputComponentSetPort {
    const set = new FakeComponentSet(
      this.id("component-set"),
      components,
      this.currentPlan,
    );
    this.componentSets.push(set);
    return set;
  }
  createComponent(): InputComponentPort {
    const component = new FakeComponent(this.id("component"));
    this.components.push(component);
    return component;
  }
  createFrame(): InputFieldPort {
    return new FakeField();
  }
  createText(): InputTextPort {
    return new FakeText();
  }
  getComponentSets(): Promise<readonly InputComponentSetPort[]> {
    return Promise.resolve(this.componentSets);
  }
  getComponents(): Promise<readonly InputComponentPort[]> {
    return Promise.resolve(this.components);
  }
  getVariables(): Promise<readonly ButtonVariablePort[]> {
    return Promise.resolve(this.variables);
  }
  loadFont(family: string, style: string): Promise<void> {
    this.fonts.push(`${family}/${style}`);
    return Promise.resolve();
  }
  private id(kind: string): string {
    return `${String(this.nextId++)}:${kind.length}`;
  }
}

describe("Figma Input writer", () => {
  it("creates eight governed Variants and is idempotent", async () => {
    const currentPlan = plan();
    const port = new FakeInputPort(currentPlan);
    const first = await ensureFigmaInput(port, currentPlan, CONTEXT);

    expect(first).toMatchObject({
      componentSet: { action: "created" },
      type: "components.input.ensure",
      variants: { created: 8, unchanged: 0, updated: 0 },
    });
    expect(port.componentSets[0]?.name).toBe("Input / Text");
    expect(port.components).toHaveLength(8);
    const defaultEmpty = port.components[0];
    expect(
      defaultEmpty?.children.map(({ kind, name }) => [kind, name]),
    ).toEqual([
      ["text", "Label"],
      ["field", "Field"],
      ["text", "Supporting text"],
    ]);
    const field = defaultEmpty?.children[1] as FakeField;
    expect(field).toMatchObject({
      cornerRadius: 8,
      height: 48,
      paddingLeft: 12,
      paddingRight: 12,
      strokeWeight: 1,
      width: 320,
    });
    expect(field.children[0]).toMatchObject({
      characters: "name@example.com",
      name: "Text",
    });
    expect(port.components[2]?.children[1]).toMatchObject({ strokeWeight: 2 });
    expect(first.textPropertyNames).toEqual({
      label: "Label#2",
      supportingText: "Supporting text#3",
      text: "Text#4",
    });

    await expect(
      ensureFigmaInput(port, currentPlan, CONTEXT),
    ).resolves.toMatchObject({
      componentSet: { action: "unchanged" },
      variants: { created: 0, unchanged: 8, updated: 0 },
    });
    expect(port.components).toHaveLength(8);
  });

  it("fails before node creation when a required Variable is missing", async () => {
    const currentPlan = plan();
    const port = new FakeInputPort(currentPlan);
    port.variables.pop();
    await expect(
      ensureFigmaInput(port, currentPlan, CONTEXT),
    ).rejects.toMatchObject({ code: "IDENTITY_NOT_FOUND" });
    expect(port.components).toHaveLength(0);
  });

  it("blocks unmanaged name collisions and same-version digest drift", async () => {
    const currentPlan = plan();
    const unmanaged = new FakeInputPort(currentPlan);
    const collision = new FakeComponentSet("90:91", [], currentPlan);
    collision.name = currentPlan.componentSet.name;
    unmanaged.componentSets.push(collision);
    await expect(
      ensureFigmaInput(unmanaged, currentPlan, CONTEXT),
    ).rejects.toMatchObject({ code: "UNMANAGED_ASSET" });

    const port = new FakeInputPort(currentPlan);
    await ensureFigmaInput(port, currentPlan, CONTEXT);
    const changed = structuredClone(currentPlan);
    changed.source.contentDigest = `sha256:${"f".repeat(64)}`;
    await expect(
      ensureFigmaInput(port, changed, CONTEXT),
    ).rejects.toMatchObject({
      code: "CONTENT_DIGEST_CONFLICT",
    });
  });
});

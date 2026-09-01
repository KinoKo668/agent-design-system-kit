import { describe, expect, it } from "vitest";

import iconContract from "../../../design-system/hatch-demo/components/icon-check.component.json" with { type: "json" };
import iconTokens from "../../../design-system/hatch-demo/tokens/icon-foundation.tokens.json" with { type: "json" };
import {
  canonicalizeJson,
  createFigmaIconPlan,
  type FigmaIconPlan,
} from "@agent-design-system-kit/core";

import {
  ensureFigmaIcon,
  type FigmaIconPort,
  type IconComponentPort,
  type IconComponentSetPort,
  type IconFrameBoundField,
  type IconGlyphPort,
  type IconVariablePort,
  type IconWriterError,
} from "./icon-writer.js";
import {
  FILE_BINDING_SHARED_KEY,
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
} from "./variables-writer.js";

const COMPONENT_DIGEST =
  "sha256:1b1231911fc691152b6d5e0f95d9681f02995033c97457d3aafccbda592fa260";
const TOKEN_DIGEST =
  "sha256:3e6525097fe95c63b373adf9b7a6797e3153a4670665c0da9563fc971f62315e";
const FILE_BINDING_ID = "2227db09-eb2f-4dcb-8f6a-386c6271e577";
const CONTEXT = {
  approvalId: "approval.component.icon.check.1.0.0",
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

class FakeVariable extends SharedData implements IconVariablePort {
  constructor(
    readonly id: string,
    readonly resolvedType: "COLOR" | "FLOAT",
  ) {
    super();
  }
}

class FakeGlyph extends SharedData implements IconGlyphPort {
  readonly id: string;
  fills: unknown = [];
  height = 0;
  name = "Vector";
  strokeCap = "ROUND" as const;
  strokeJoin = "ROUND" as const;
  strokes: unknown = [];
  strokeWeight = 0;
  vectorPaths: readonly {
    readonly data: string;
    readonly windingRule: "NONE";
  }[] = [];
  width = 0;
  x = 0;
  y = 0;

  constructor(id: number) {
    super();
    this.id = `vector:${String(id)}`;
  }
  resize(width: number, height: number): boolean {
    if (this.width === width && this.height === height) return false;
    this.width = width;
    this.height = height;
    return true;
  }
}

class FakeComponent extends SharedData implements IconComponentPort {
  readonly id: string;
  readonly glyphs: FakeGlyph[] = [];
  readonly bindings = new Map<IconFrameBoundField, string>();
  description = "";
  height = 100;
  name = "Component";
  width = 100;
  x = 0;
  y = 0;

  constructor(id: number) {
    super();
    this.id = `component:${String(id)}`;
  }
  get children(): readonly IconGlyphPort[] {
    return this.glyphs;
  }
  get totalChildCount(): number {
    return this.glyphs.length;
  }
  appendChild(node: IconGlyphPort): void {
    this.glyphs.push(node as FakeGlyph);
  }
  resize(size: number): boolean {
    if (this.width === size && this.height === size) return false;
    this.width = size;
    this.height = size;
    return true;
  }
  setBoundVariable(
    field: IconFrameBoundField,
    variable: IconVariablePort,
  ): boolean {
    if (this.bindings.get(field) === variable.id) return false;
    this.bindings.set(field, variable.id);
    return true;
  }
}

class FakeComponentSet extends SharedData implements IconComponentSetPort {
  description = "";
  name = "Component Set";
  readonly definitions: Record<
    string,
    {
      defaultValue: string;
      type: "VARIANT";
      variantOptions: readonly string[];
    }
  > = {
    Size: {
      defaultValue: "Small",
      type: "VARIANT",
      variantOptions: ["Small", "Medium", "Large"],
    },
  };

  constructor(
    readonly id: string,
    readonly children: readonly IconComponentPort[],
  ) {
    super();
  }
  get componentPropertyDefinitions() {
    return this.definitions;
  }
  editComponentProperty(
    name: string,
    value: { defaultValue?: string },
  ): string {
    const previous = this.definitions[name];
    if (previous === undefined) throw new Error("Missing property.");
    this.definitions[name] = {
      ...previous,
      defaultValue: value.defaultValue ?? previous.defaultValue,
    };
    return name;
  }
}

class FakeIconPort implements FigmaIconPort {
  readonly document = new SharedData();
  readonly variables: FakeVariable[] = [];
  readonly components: FakeComponent[] = [];
  readonly componentSets: FakeComponentSet[] = [];
  private nextId = 1;

  constructor(readonly plan: FigmaIconPlan) {
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
    const expected = new Map<string, IconVariablePort["resolvedType"]>([
      [plan.glyph.color.variableStableId, "COLOR"],
      ...plan.variants.map(
        ({ frame }) => [frame.variableStableId, "FLOAT"] as const,
      ),
    ]);
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
    variable: IconVariablePort,
    fallback: FigmaIconPlan["glyph"]["color"]["fallback"],
  ): unknown {
    return [{ boundVariableId: variable.id, ...fallback }];
  }
  combineAsVariants(
    components: readonly IconComponentPort[],
  ): IconComponentSetPort {
    const set = new FakeComponentSet(
      `component-set:${String(this.nextId++)}`,
      components,
    );
    this.componentSets.push(set);
    return set;
  }
  createComponent(): IconComponentPort {
    const component = new FakeComponent(this.nextId++);
    this.components.push(component);
    return component;
  }
  createGlyph(): IconGlyphPort {
    return new FakeGlyph(this.nextId++);
  }
  getComponentSets(): Promise<readonly IconComponentSetPort[]> {
    return Promise.resolve(this.componentSets);
  }
  getComponents(): Promise<readonly IconComponentPort[]> {
    return Promise.resolve(this.components);
  }
  getVariables(): Promise<readonly IconVariablePort[]> {
    return Promise.resolve(this.variables);
  }
}

function createPlan(): FigmaIconPlan {
  const result = createFigmaIconPlan(
    iconContract,
    iconTokens,
    COMPONENT_DIGEST,
    TOKEN_DIGEST,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

describe("Figma Icon writer", () => {
  it("creates and marks one Icon Set with three size Variants", async () => {
    const port = new FakeIconPort(createPlan());
    const result = await ensureFigmaIcon(port, port.plan, CONTEXT);

    expect(result).toMatchObject({
      componentSet: {
        action: "created",
        stableId: port.plan.componentSet.stableId,
      },
      type: "components.icon.ensure",
      variants: { created: 3, unchanged: 0, updated: 0 },
    });
    expect(port.components.map(({ width }) => width)).toEqual([16, 24, 32]);
    expect(port.components.map(({ x }) => x)).toEqual([0, 80, 160]);
    expect(port.components.every(({ glyphs }) => glyphs.length === 1)).toBe(
      true,
    );
    expect(port.componentSets[0]?.definitions.Size?.defaultValue).toBe(
      "Medium",
    );
    expect(port.components[1]?.glyphs[0]).toMatchObject({
      height: 10,
      name: "Glyph",
      strokeWeight: 2,
      width: 14,
      x: 5,
      y: 7.5,
    });
  });

  it("performs no physical changes on an identical retry", async () => {
    const port = new FakeIconPort(createPlan());
    await ensureFigmaIcon(port, port.plan, CONTEXT);
    const before = port.componentSets[0]?.getSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      MANAGED_ASSET_SHARED_KEY,
    );
    const result = await ensureFigmaIcon(port, port.plan, CONTEXT);

    expect(result.componentSet.action).toBe("unchanged");
    expect(result.variants).toEqual({ created: 0, unchanged: 3, updated: 0 });
    expect(port.componentSets).toHaveLength(1);
    expect(port.components).toHaveLength(3);
    expect(
      port.componentSets[0]?.getSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
      ),
    ).toBe(before);
  });

  it("recovers an unmarked Set without duplicating it", async () => {
    const port = new FakeIconPort(createPlan());
    await ensureFigmaIcon(port, port.plan, CONTEXT);
    port.componentSets[0]?.setSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      MANAGED_ASSET_SHARED_KEY,
      "",
    );

    const result = await ensureFigmaIcon(port, port.plan, CONTEXT);
    expect(result.componentSet.action).toBe("updated");
    expect(port.componentSets).toHaveLength(1);
    expect(port.components).toHaveLength(3);
  });

  it("blocks a stale required Variable before creating nodes", async () => {
    const port = new FakeIconPort(createPlan());
    const marker = JSON.parse(
      port.variables[0]?.getSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
      ) ?? "{}",
    ) as Record<string, unknown>;
    marker.appliedDigest = `sha256:${"a".repeat(64)}`;
    port.variables[0]?.setSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      MANAGED_ASSET_SHARED_KEY,
      canonicalizeJson(marker),
    );

    await expect(
      ensureFigmaIcon(port, port.plan, CONTEXT),
    ).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    } satisfies Partial<IconWriterError>);
    expect(port.components).toHaveLength(0);
  });

  it("refuses name-based adoption of an unmanaged Component Set", async () => {
    const port = new FakeIconPort(createPlan());
    const unmanaged = new FakeComponentSet("component-set:unmanaged", []);
    unmanaged.name = "Icon / Check";
    port.componentSets.push(unmanaged);

    await expect(
      ensureFigmaIcon(port, port.plan, CONTEXT),
    ).rejects.toMatchObject({ code: "UNMANAGED_ASSET" });
    expect(port.components).toHaveLength(0);
  });
});

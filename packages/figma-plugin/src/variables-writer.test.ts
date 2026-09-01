import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createFigmaVariablePlan,
  type FigmaVariablePlan,
  type FigmaVariableResolvedType,
  type FigmaVariableScope,
} from "@agent-design-system-kit/core";
import { beforeEach, describe, expect, it } from "vitest";

import {
  bindFigmaLibraryFile,
  ensureFigmaVariables,
  FILE_BINDING_SHARED_KEY,
  getFigmaLibraryFileBinding,
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
  VariablesWriterError,
  type FigmaVariablesPort,
  type VariableCollectionPort,
  type VariablePort,
} from "./variables-writer.js";

const CONTENT_DIGEST = `sha256:${"a".repeat(64)}`;
const FILE_BINDING_ID = "2227db09-eb2f-4dcb-8f6a-386c6271e577";
const OPERATION_ID = "39d4aa88-67a2-4de3-bf64-2b51509316be";

class SharedData {
  private readonly data = new Map<string, string>();
  writeCount = 0;

  getSharedPluginData(namespace: string, key: string): string {
    return this.data.get(`${namespace}:${key}`) ?? "";
  }

  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.writeCount += 1;
    this.data.set(`${namespace}:${key}`, value);
  }
}

class FakeCollection extends SharedData implements VariableCollectionPort {
  readonly id: string;
  hiddenFromPublishing = false;
  readonly modes: Array<{ modeId: string; name: string }>;
  name: string;

  constructor(id: string, name: string) {
    super();
    this.id = id;
    this.name = name;
    this.modes = [{ modeId: `${id}:mode:1`, name: "Mode 1" }];
  }

  get defaultModeId(): string {
    const first = this.modes[0];
    if (first === undefined) throw new Error("Fake default Mode missing.");
    return first.modeId;
  }

  addMode(name: string): string {
    const modeId = `${this.id}:mode:${String(this.modes.length + 1)}`;
    this.modes.push({ modeId, name });
    return modeId;
  }

  renameMode(modeId: string, newName: string): void {
    const mode = this.modes.find((candidate) => candidate.modeId === modeId);
    if (mode === undefined) throw new Error("Fake Mode missing.");
    mode.name = newName;
  }
}

class FakeVariable extends SharedData implements VariablePort {
  readonly codeSyntax: Record<string, string | undefined> = {};
  description = "";
  hiddenFromPublishing = false;
  readonly id: string;
  name: string;
  readonly resolvedType: FigmaVariableResolvedType;
  scopes: FigmaVariableScope[] = [];
  readonly valuesByMode: Record<string, unknown> = {};
  readonly variableCollectionId: string;
  failNextSet = false;

  constructor(
    id: string,
    name: string,
    collectionId: string,
    resolvedType: FigmaVariableResolvedType,
  ) {
    super();
    this.id = id;
    this.name = name;
    this.variableCollectionId = collectionId;
    this.resolvedType = resolvedType;
  }

  setValueForMode(modeId: string, value: unknown): void {
    if (this.failNextSet) {
      this.failNextSet = false;
      throw new Error("Injected Figma write failure.");
    }
    this.valuesByMode[modeId] = value;
  }

  setVariableCodeSyntax(platform: "WEB", value: string): void {
    this.codeSyntax[platform] = value;
  }
}

class FakePort implements FigmaVariablesPort {
  readonly collections: FakeCollection[] = [];
  readonly document = new SharedData();
  readonly variables: FakeVariable[] = [];

  createAlias(variable: VariablePort): unknown {
    return { id: variable.id, type: "VARIABLE_ALIAS" };
  }

  createCollection(name: string): VariableCollectionPort {
    const collection = new FakeCollection(
      `collection:${String(this.collections.length + 1)}`,
      name,
    );
    this.collections.push(collection);
    return collection;
  }

  createVariable(
    name: string,
    collection: VariableCollectionPort,
    resolvedType: FigmaVariableResolvedType,
  ): VariablePort {
    const variable = new FakeVariable(
      `variable:${String(this.variables.length + 1)}`,
      name,
      collection.id,
      resolvedType,
    );
    this.variables.push(variable);
    return variable;
  }

  getCollections(): Promise<readonly VariableCollectionPort[]> {
    return Promise.resolve(this.collections);
  }

  getVariables(): Promise<readonly VariablePort[]> {
    return Promise.resolve(this.variables);
  }
}

function loadPlan(): FigmaVariablePlan {
  const fixture = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "design-system/hatch-demo/tokens/button-foundation.tokens.json",
      ),
      "utf8",
    ),
  ) as unknown;
  const result = createFigmaVariablePlan(fixture, CONTENT_DIGEST);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function context(operationId = OPERATION_ID) {
  return {
    approvalId: "approval.tokens.button-foundation.1.0.0",
    fileBindingId: FILE_BINDING_ID,
    operationId,
    projectId: "hatch-demo",
  } as const;
}

let plan: FigmaVariablePlan;
let port: FakePort;

beforeEach(() => {
  plan = loadPlan();
  port = new FakePort();
  bindFigmaLibraryFile(port.document, {
    fileBindingId: FILE_BINDING_ID,
    fileRole: "design-system-library",
    projectId: "hatch-demo",
    schemaVersion: "1.0.0",
  });
});

describe("Figma Variables writer", () => {
  it("binds an unbound file once and refuses automatic rebinding", () => {
    const unbound = new SharedData();
    const binding = {
      fileBindingId: FILE_BINDING_ID,
      fileRole: "design-system-library",
      projectId: "hatch-demo",
      schemaVersion: "1.0.0",
    } as const;

    expect(bindFigmaLibraryFile(unbound, binding)).toEqual({
      binding,
      status: "bound",
    });
    expect(bindFigmaLibraryFile(unbound, binding)).toEqual({
      binding,
      status: "unchanged",
    });
    expect(unbound.writeCount).toBe(1);
    expect(getFigmaLibraryFileBinding(unbound)).toEqual(binding);

    expect(() =>
      bindFigmaLibraryFile(unbound, {
        ...binding,
        fileBindingId: "b078e7be-5510-49c1-8b0b-9e75c6953f30",
      }),
    ).toThrowError(expect.objectContaining({ code: "FILE_BINDING_MISMATCH" }));
    expect(unbound.writeCount).toBe(1);
  });

  it("fails closed when an existing file binding is malformed", () => {
    const document = new SharedData();
    document.setSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      FILE_BINDING_SHARED_KEY,
      '{"projectId":"hatch-demo"}',
    );

    expect(() => getFigmaLibraryFileBinding(document)).toThrowError(
      expect.objectContaining({ code: "FILE_BINDING_MISMATCH" }),
    );
    expect(() =>
      bindFigmaLibraryFile(document, {
        fileBindingId: FILE_BINDING_ID,
        fileRole: "design-system-library",
        projectId: "hatch-demo",
        schemaVersion: "1.0.0",
      }),
    ).toThrowError(expect.objectContaining({ code: "FILE_BINDING_MISMATCH" }));
    expect(document.writeCount).toBe(1);
  });

  it("rejects a non-canonical binding before writing document metadata", () => {
    const document = new SharedData();

    expect(() =>
      bindFigmaLibraryFile(document, {
        fileBindingId: FILE_BINDING_ID.toUpperCase(),
        fileRole: "design-system-library",
        projectId: "a".repeat(65),
        schemaVersion: "1.0.0",
      }),
    ).toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(document.writeCount).toBe(0);
  });

  it("creates the approved collection and Variables exactly once", async () => {
    const first = await ensureFigmaVariables(port, plan, context());
    expect(first).toEqual({
      collection: { action: "created", stableId: plan.collection.stableId },
      deferredTypographyCount: 1,
      type: "variables.ensure",
      variables: { created: 30, unchanged: 0, updated: 0 },
    });
    expect(port.collections).toHaveLength(1);
    expect(port.variables).toHaveLength(30);
    const writesAfterFirst =
      port.collections.reduce(
        (total, collection) => total + collection.writeCount,
        0,
      ) +
      port.variables.reduce(
        (total, variable) => total + variable.writeCount,
        0,
      );

    const second = await ensureFigmaVariables(
      port,
      plan,
      context("4070f054-5f9b-43cd-9a1e-bbffb900d0c4"),
    );
    expect(second).toMatchObject({
      collection: { action: "unchanged" },
      variables: { created: 0, unchanged: 30, updated: 0 },
    });
    expect(port.collections).toHaveLength(1);
    expect(port.variables).toHaveLength(30);
    expect(
      port.collections.reduce(
        (total, collection) => total + collection.writeCount,
        0,
      ) +
        port.variables.reduce(
          (total, variable) => total + variable.writeCount,
          0,
        ),
    ).toBe(writesAfterFirst);
  });

  it("repairs drift without creating a duplicate Variable", async () => {
    await ensureFigmaVariables(port, plan, context());
    const variable = port.variables.find(
      ({ name }) => name === "semantic/dimension/action-radius",
    );
    if (variable === undefined) throw new Error("Radius Variable missing.");
    variable.description = "Human drift";

    const result = await ensureFigmaVariables(
      port,
      plan,
      context("4070f054-5f9b-43cd-9a1e-bbffb900d0c4"),
    );
    expect(result.variables).toEqual({ created: 0, unchanged: 29, updated: 1 });
    expect(port.variables).toHaveLength(30);
    expect(variable.description).toBe(
      plan.variables.find(
        ({ tokenPath }) => tokenPath === "semantic/dimension/action-radius",
      )?.description,
    );
  });

  it("blocks an unmanaged same-name collection before mutation", async () => {
    port.collections.push(
      new FakeCollection("unmanaged", plan.collection.name),
    );

    await expect(
      ensureFigmaVariables(port, plan, context()),
    ).rejects.toMatchObject({
      code: "UNMANAGED_ASSET",
    });
    expect(port.variables).toHaveLength(0);
    expect(port.collections).toHaveLength(1);
  });

  it("blocks an unmanaged same-name Variable instead of creating a duplicate", async () => {
    await ensureFigmaVariables(port, plan, context());
    const variable = port.variables[0];
    if (variable === undefined) throw new Error("Variable fixture missing.");
    variable.setSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      MANAGED_ASSET_SHARED_KEY,
      "",
    );

    await expect(
      ensureFigmaVariables(
        port,
        plan,
        context("4070f054-5f9b-43cd-9a1e-bbffb900d0c4"),
      ),
    ).rejects.toMatchObject({ code: "UNMANAGED_ASSET" });
    expect(port.variables).toHaveLength(30);
  });

  it("blocks any unmanaged Variable placed inside a managed Collection", async () => {
    await ensureFigmaVariables(port, plan, context());
    const collection = port.collections[0];
    if (collection === undefined)
      throw new Error("Collection fixture missing.");
    port.createVariable("manual/local-value", collection, "FLOAT");

    await expect(
      ensureFigmaVariables(
        port,
        plan,
        context("4070f054-5f9b-43cd-9a1e-bbffb900d0c4"),
      ),
    ).rejects.toMatchObject({ code: "UNMANAGED_ASSET" });
    expect(port.variables).toHaveLength(31);
  });

  it("blocks a missing or mismatched file binding before mutation", async () => {
    const mismatchedPort = new FakePort();
    bindFigmaLibraryFile(mismatchedPort.document, {
      fileBindingId: "b078e7be-5510-49c1-8b0b-9e75c6953f30",
      fileRole: "design-system-library",
      projectId: "another-project",
      schemaVersion: "1.0.0",
    });

    await expect(
      ensureFigmaVariables(mismatchedPort, plan, context()),
    ).rejects.toMatchObject({
      code: "FILE_BINDING_MISMATCH",
    });
    expect(mismatchedPort.collections).toHaveLength(0);
    expect(mismatchedPort.variables).toHaveLength(0);
  });

  it("reports a partial write and resumes from managed identities", async () => {
    const originalCreateVariable = port.createVariable.bind(port);
    let injected = false;
    port.createVariable = (name, collection, resolvedType) => {
      const variable = originalCreateVariable(name, collection, resolvedType);
      if (!injected && variable instanceof FakeVariable) {
        variable.failNextSet = true;
        injected = true;
      }
      return variable;
    };

    let caught: unknown;
    try {
      await ensureFigmaVariables(port, plan, context());
    } catch (cause) {
      caught = cause;
    }
    expect(caught).toBeInstanceOf(VariablesWriterError);
    expect(caught).toMatchObject({ code: "PARTIAL_WRITE" });
    expect(port.collections).toHaveLength(1);
    expect(port.variables).toHaveLength(30);

    const recovered = await ensureFigmaVariables(port, plan, context());
    expect(recovered.variables.created).toBe(0);
    expect(recovered.variables.updated).toBeGreaterThan(0);
    expect(port.collections).toHaveLength(1);
    expect(port.variables).toHaveLength(30);
  });

  it("blocks a SemVer prerelease downgrade before mutation", async () => {
    await ensureFigmaVariables(port, plan, context());
    const writesBefore = port.collections.reduce(
      (total, collection) => total + collection.writeCount,
      0,
    );
    const olderPlan: FigmaVariablePlan = {
      ...plan,
      source: { ...plan.source, assetVersion: "1.0.0-beta.1" },
    };

    await expect(
      ensureFigmaVariables(
        port,
        olderPlan,
        context("4070f054-5f9b-43cd-9a1e-bbffb900d0c4"),
      ),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(
      port.collections.reduce(
        (total, collection) => total + collection.writeCount,
        0,
      ),
    ).toBe(writesBefore);
  });
});

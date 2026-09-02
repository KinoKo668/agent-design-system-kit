import {
  componentRegistrySchema,
  createFigmaButtonPlan,
  createFigmaIconPlan,
  createFigmaInputPlan,
  createSuccessResult,
  writerCommandEnvelopeSchema,
  type ComponentRegistry,
  type DesignSystemSnapshot,
} from "@agent-design-system-kit/core";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import validContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };
import iconContract from "../../../design-system/hatch-demo/components/icon-check.component.json" with { type: "json" };
import iconRegistry from "../../../design-system/hatch-demo/registry/icons.registry.json" with { type: "json" };
import iconTokenSet from "../../../design-system/hatch-demo/tokens/icon-foundation.tokens.json" with { type: "json" };
import inputContract from "../../../design-system/hatch-demo/components/input-text.component.json" with { type: "json" };
import inputRegistry from "../../../design-system/hatch-demo/registry/inputs.registry.json" with { type: "json" };
import inputTokenSet from "../../../design-system/hatch-demo/tokens/input-foundation.tokens.json" with { type: "json" };

import {
  createRegistryWriteFinalizer,
  updateRegistrySourceAtomically,
} from "./registry-finalizer.js";

const COMPONENT_DIGEST =
  "sha256:7e6003e59916e0fc445e7ef6d37feb148a3d77908bb7834b3bdb4185530d0e78";
const TOKEN_DIGEST = `sha256:${"a".repeat(64)}`;
const FILE_BINDING_ID = "00000000-0000-4000-8000-000000000001";
const SOURCE_PATH = "registry/components.registry.json";

function unbuiltRegistry(): ComponentRegistry {
  const parsed = componentRegistrySchema.parse(validRegistry);
  const entry = parsed.entries[0];
  if (entry === undefined) throw new Error("Registry fixture missing.");
  return componentRegistrySchema.parse({
    ...parsed,
    entries: [
      {
        ...entry,
        figma: {
          channel: "library",
          fileBindingId: FILE_BINDING_ID,
          majorVersion: 1,
          role: "component-set",
          slotId: "root",
          status: "unbuilt",
        },
      },
    ],
  });
}

function command() {
  const planned = createFigmaButtonPlan(
    validContract,
    validTokenSet,
    COMPONENT_DIGEST,
    TOKEN_DIGEST,
  );
  if (!planned.ok) throw new Error(planned.error.message);
  return writerCommandEnvelopeSchema.parse({
    approval: {
      approvalId: "approval.component.button.1.0.0",
      mode: "approved",
      subject: { ...planned.data.source, type: "component" },
    },
    command: {
      payload: { plan: planned.data },
      type: "components.button.ensure",
    },
    idempotencyKey: "registry-finalizer-button",
    operationId: "39d4aa88-67a2-4de3-bf64-2b51509316be",
    projectId: "hatch-demo",
    schemaVersion: "1.0.0",
    source: { client: "mcp-server" },
    target: {
      fileBindingId: FILE_BINDING_ID,
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  });
}

function iconCommand() {
  const planned = createFigmaIconPlan(
    iconContract,
    iconTokenSet,
    "sha256:1b1231911fc691152b6d5e0f95d9681f02995033c97457d3aafccbda592fa260",
    "sha256:3e6525097fe95c63b373adf9b7a6797e3153a4670665c0da9563fc971f62315e",
  );
  if (!planned.ok) throw new Error(planned.error.message);
  return writerCommandEnvelopeSchema.parse({
    approval: {
      approvalId: "approval.component.icon.check.1.0.0",
      mode: "approved",
      subject: { ...planned.data.source, type: "component" },
    },
    command: {
      payload: { plan: planned.data },
      type: "components.icon.ensure",
    },
    idempotencyKey: "registry-finalizer-icon-check",
    operationId: "59d4aa88-67a2-4de3-bf64-2b51509316be",
    projectId: "hatch-demo",
    schemaVersion: "1.0.0",
    source: { client: "mcp-server" },
    target: {
      fileBindingId: FILE_BINDING_ID,
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  });
}

function inputCommand() {
  const planned = createFigmaInputPlan(
    inputContract,
    inputTokenSet,
    "sha256:cdcc977da4014343e91edef042a55335821d8eaffc8d8098dc865f798321cfc5",
    "sha256:84eff4f8b036b88b861f494251eb9c59b4066774531bd147389af611ff520e6d",
  );
  if (!planned.ok) throw new Error(planned.error.message);
  return writerCommandEnvelopeSchema.parse({
    approval: {
      approvalId: "approval.component.input.text.1.0.0",
      mode: "approved",
      subject: { ...planned.data.source, type: "component" },
    },
    command: {
      payload: { plan: planned.data },
      type: "components.input.ensure",
    },
    idempotencyKey: "registry-finalizer-input-text",
    operationId: "69d4aa88-67a2-4de3-bf64-2b51509316be",
    projectId: "hatch-demo",
    schemaVersion: "1.0.0",
    source: { client: "mcp-server" },
    target: {
      fileBindingId: FILE_BINDING_ID,
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  });
}

function instanceCommand() {
  const button = command();
  if (button.command.type !== "components.button.ensure") {
    throw new Error("Expected Button command.");
  }
  const root = button.command.payload.plan.componentSet.stableId;
  return writerCommandEnvelopeSchema.parse({
    approval: button.approval,
    command: {
      payload: {
        plan: {
          componentSet: {
            expectedVariantStableIds: button.command.payload.plan.variants.map(
              ({ stableId }) => stableId,
            ),
            majorVersion: 1,
            nodeId: "100:200",
            stableId: root,
          },
          instance: {
            stableId: "hatch-demo/instance/screen-checkout/submit",
            x: 100,
            y: 200,
          },
          properties: {
            appearance: { name: "Appearance", value: "Primary" },
            label: { name: "Label", value: "Place order" },
            state: { name: "State", value: "Default" },
          },
          schemaVersion: "1.0.0",
          selectedVariant: {
            figmaName: "Appearance=Primary, State=Default",
            selections: { appearance: "primary", state: "default" },
            slotId: "variant/appearance-primary/state-default",
            stableId: `${root}/variant/appearance-primary/state-default`,
          },
          source: {
            approvalId: "approval.component.button.1.0.0",
            assetId: "button",
            assetVersion: "1.0.0",
            contentDigest: COMPONENT_DIGEST,
            fileBindingId: FILE_BINDING_ID,
            projectId: "hatch-demo",
          },
        },
      },
      type: "instances.button.insert",
    },
    idempotencyKey: "registry-finalizer-instance",
    operationId: "49d4aa88-67a2-4de3-bf64-2b51509316be",
    projectId: "hatch-demo",
    schemaVersion: "1.0.0",
    source: { client: "mcp-server" },
    target: {
      fileBindingId: FILE_BINDING_ID,
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  });
}

const BUTTON_RESULT = {
  componentSet: {
    action: "created" as const,
    nodeId: "300:400",
    stableId: "hatch-demo/component/button/component-set/major-1",
  },
  labelPropertyName: "Label#300:401",
  type: "components.button.ensure" as const,
  typography: {
    lineHeightStrategy: "resolved-percent" as const,
    variableBindings: 4 as const,
  },
  variants: { created: 4, unchanged: 0, updated: 0 },
};

const ICON_RESULT = {
  componentSet: {
    action: "created" as const,
    nodeId: "500:600",
    stableId: "hatch-demo/component/icon/check/component-set/major-1",
  },
  type: "components.icon.ensure" as const,
  variants: { created: 3, unchanged: 0, updated: 0 },
};

const INPUT_RESULT = {
  componentSet: {
    action: "created" as const,
    nodeId: "700:800",
    stableId: "hatch-demo/component/input/text/component-set/major-1",
  },
  textPropertyNames: {
    label: "Label#700:801",
    supportingText: "Supporting text#700:803",
    text: "Text#700:802",
  },
  type: "components.input.ensure" as const,
  typography: {
    lineHeightStrategy: "resolved-percent" as const,
    variableBindings: 12 as const,
  },
  variants: { created: 8, unchanged: 0, updated: 0 },
};

function snapshot(
  registry: ComponentRegistry,
  sourcePath = SOURCE_PATH,
): DesignSystemSnapshot {
  return {
    approvals: [],
    briefs: [],
    components: [],
    directions: [],
    projectId: "hatch-demo",
    registries: [{ data: registry, sourcePath }],
    tokenSets: [],
  };
}

describe("Registry write finalizer", () => {
  it("promotes an audited Input Set through the atomic Registry path", async () => {
    let current = componentRegistrySchema.parse(inputRegistry);
    const sourcePath = "registry/inputs.registry.json";
    const updateRegistrySource = vi.fn(
      (input: { readonly updated: ComponentRegistry }) => {
        current = input.updated;
        return Promise.resolve();
      },
    );
    const finalize = createRegistryWriteFinalizer(
      { designSystemRoot: "/unused", expectedProjectId: "hatch-demo" },
      {
        loadSnapshot: () =>
          Promise.resolve(createSuccessResult(snapshot(current, sourcePath))),
        updateRegistrySource,
      },
    );

    await expect(finalize(inputCommand(), INPUT_RESULT)).resolves.toBeNull();
    expect(updateRegistrySource).toHaveBeenCalledOnce();
    expect(current.entries[0]?.figma).toMatchObject({
      appliedDigest:
        "sha256:cdcc977da4014343e91edef042a55335821d8eaffc8d8098dc865f798321cfc5",
      locator: { nodeId: "700:800" },
      status: "ready",
    });
  });

  it("promotes an audited Icon Set through the same atomic Registry path", async () => {
    let current = componentRegistrySchema.parse(iconRegistry);
    const sourcePath = "registry/icons.registry.json";
    const updateRegistrySource = vi.fn(
      (input: { readonly updated: ComponentRegistry }) => {
        current = input.updated;
        return Promise.resolve();
      },
    );
    const loadSnapshot = vi.fn(() =>
      Promise.resolve(createSuccessResult(snapshot(current, sourcePath))),
    );
    const finalize = createRegistryWriteFinalizer(
      { designSystemRoot: "/unused", expectedProjectId: "hatch-demo" },
      { loadSnapshot, updateRegistrySource },
    );

    await expect(finalize(iconCommand(), ICON_RESULT)).resolves.toBeNull();
    expect(updateRegistrySource).toHaveBeenCalledOnce();
    expect(current.entries[0]?.figma).toMatchObject({
      appliedDigest:
        "sha256:1b1231911fc691152b6d5e0f95d9681f02995033c97457d3aafccbda592fa260",
      locator: { nodeId: "500:600" },
      status: "ready",
    });
  });

  it("promotes Registry only after the Button result and verifies the reload", async () => {
    let current = unbuiltRegistry();
    const updateRegistrySource = vi.fn(
      (input: {
        readonly expected: ComponentRegistry;
        readonly updated: ComponentRegistry;
      }) => {
        expect(input.expected).toEqual(current);
        current = input.updated;
        return Promise.resolve();
      },
    );
    const loadSnapshot = vi.fn(() =>
      Promise.resolve(createSuccessResult(snapshot(current))),
    );
    const finalize = createRegistryWriteFinalizer(
      { designSystemRoot: "/unused", expectedProjectId: "hatch-demo" },
      { loadSnapshot, updateRegistrySource },
    );

    await expect(finalize(command(), BUTTON_RESULT)).resolves.toBeNull();
    expect(updateRegistrySource).toHaveBeenCalledOnce();
    expect(current.entries[0]?.figma).toMatchObject({
      locator: { nodeId: "300:400" },
      status: "ready",
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(2);

    await expect(finalize(command(), BUTTON_RESULT)).resolves.toBeNull();
    expect(updateRegistrySource).toHaveBeenCalledOnce();
  });

  it("returns PARTIAL_WRITE when Registry commit fails after Figma success", async () => {
    const current = unbuiltRegistry();
    const finalize = createRegistryWriteFinalizer(
      { designSystemRoot: "/unused", expectedProjectId: "hatch-demo" },
      {
        loadSnapshot: () =>
          Promise.resolve(createSuccessResult(snapshot(current))),
        updateRegistrySource: () =>
          Promise.reject(new Error("simulated concurrent edit")),
      },
    );

    await expect(finalize(command(), BUTTON_RESULT)).resolves.toMatchObject({
      code: "PARTIAL_WRITE",
    });
  });

  it("repairs a stale Component Set locator returned by Instance insertion", async () => {
    let current = componentRegistrySchema.parse(validRegistry);
    const finalize = createRegistryWriteFinalizer(
      { designSystemRoot: "/unused", expectedProjectId: "hatch-demo" },
      {
        loadSnapshot: () =>
          Promise.resolve(createSuccessResult(snapshot(current))),
        updateRegistrySource: (input) => {
          current = input.updated;
          return Promise.resolve();
        },
      },
    );

    await expect(
      finalize(instanceCommand(), {
        componentSet: {
          nodeId: "500:600",
          stableId: "hatch-demo/component/button/component-set/major-1",
        },
        instance: {
          action: "created",
          nodeId: "700:800",
          stableId: "hatch-demo/instance/screen-checkout/submit",
        },
        type: "instances.button.insert",
        variant: {
          stableId:
            "hatch-demo/component/button/component-set/major-1/variant/appearance-primary/state-default",
        },
      }),
    ).resolves.toBeNull();
    expect(current.entries[0]?.figma).toMatchObject({
      locator: { nodeId: "500:600" },
      status: "ready",
    });
  });
});

describe("atomic Registry source update", () => {
  it("uses optimistic source matching and leaves no lock or temporary file", async () => {
    const root = await mkdtemp(join(tmpdir(), "hatchkit-registry-"));
    try {
      await mkdir(join(root, "registry"));
      const expected = unbuiltRegistry();
      const updated = componentRegistrySchema.parse(validRegistry);
      const target = join(root, SOURCE_PATH);
      await writeFile(target, `${JSON.stringify(expected, null, 2)}\n`, "utf8");
      await chmod(target, 0o640);

      await updateRegistrySourceAtomically({
        designSystemRoot: root,
        expected,
        sourcePath: SOURCE_PATH,
        updated,
      });
      expect(JSON.parse(await readFile(target, "utf8"))).toEqual(updated);
      expect((await stat(target)).mode & 0o777).toBe(0o640);
      await expect(
        readFile(`${target}.hatchkit.lock`, "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expect(
        updateRegistrySourceAtomically({
          designSystemRoot: root,
          expected,
          sourcePath: SOURCE_PATH,
          updated,
        }),
      ).rejects.toThrow("refusing to overwrite");
      expect(JSON.parse(await readFile(target, "utf8"))).toEqual(updated);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("never removes a lock owned by another process", async () => {
    const root = await mkdtemp(join(tmpdir(), "hatchkit-registry-lock-"));
    try {
      await mkdir(join(root, "registry"));
      const expected = unbuiltRegistry();
      const target = join(root, SOURCE_PATH);
      const lockPath = `${target}.hatchkit.lock`;
      await writeFile(target, `${JSON.stringify(expected, null, 2)}\n`, "utf8");
      await writeFile(lockPath, "another-writer\n", "utf8");

      await expect(
        updateRegistrySourceAtomically({
          designSystemRoot: root,
          expected,
          sourcePath: SOURCE_PATH,
          updated: componentRegistrySchema.parse(validRegistry),
        }),
      ).rejects.toMatchObject({ code: "EEXIST" });
      expect(await readFile(lockPath, "utf8")).toBe("another-writer\n");
      expect(JSON.parse(await readFile(target, "utf8"))).toEqual(expected);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

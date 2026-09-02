import {
  WRITER_PROTOCOL_SCHEMA_VERSION,
  createFigmaButtonInstancePlan,
  createFigmaButtonPlan,
  createFigmaIconInstancePlan,
  createFigmaIconPlan,
  createFigmaInputPlan,
  createFigmaInputInstancePlan,
  createFigmaVariablePlan,
  validateDesignSystemSnapshot,
  writerCommandDeliverySchema,
  writerPluginResultSchema,
} from "@agent-design-system-kit/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import validRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };
import iconRegistry from "../../../design-system/hatch-demo/registry/icons.registry.json" with { type: "json" };
import inputRegistry from "../../../design-system/hatch-demo/registry/inputs.registry.json" with { type: "json" };

import {
  FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION,
  isWriterCommandDelivery,
  isWriterPluginResult,
} from "./writer-message-validation.js";

const PLUGIN_INSTANCE_ID = "c45c06e8-80ae-4478-ad55-9c49c60ecc56";
const OPERATION_ID = "2c73620e-29b0-4285-8861-1a65b18f11dc";

function delivery() {
  return {
    approval: { mode: "not_required", reason: "read_only_diagnostic" },
    attempt: 1,
    command: { payload: {}, type: "writer.ping" },
    idempotencyKey: "figma-validation-ping",
    operationId: OPERATION_ID,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      kind: "plugin-session",
      stableId: "hatch-demo/plugin-session",
    },
  };
}

function auditDelivery() {
  return {
    approval: { mode: "not_required", reason: "read_only_diagnostic" },
    attempt: 1,
    command: {
      payload: {
        plan: {
          fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
          projectId: "hatch-demo",
          registeredVariables: [
            {
              stableId:
                "hatch-demo/token-set/foundation/variables/major-1/variable/semantic/color/action-background",
              tokenPath: "semantic/color/action-background",
            },
          ],
          schemaVersion: "1.0.0",
          scope: "current-page",
        },
      },
      type: "audit.styles.scan",
    },
    idempotencyKey: "audit-page-1",
    operationId: OPERATION_ID,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  };
}

function componentAuditDelivery() {
  return {
    approval: { mode: "not_required", reason: "read_only_diagnostic" },
    attempt: 1,
    command: {
      payload: {
        plan: {
          fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
          projectId: "hatch-demo",
          schemaVersion: "1.0.0",
          scope: "current-page",
          sources: [
            {
              assetId: "button",
              assetVersion: "1.0.0",
              componentSetNodeId: "100:200",
              componentSetStableId:
                "hatch-demo/component/button/component-set/major-1",
              contentDigest: `sha256:${"a".repeat(64)}`,
              variants: [
                {
                  figmaName: "Appearance=Primary, State=Default",
                  properties: { Appearance: "Primary", State: "Default" },
                  slotId: "variant/appearance-primary/state-default",
                  stableId:
                    "hatch-demo/component/button/component-set/major-1/variant/appearance-primary/state-default",
                },
              ],
            },
          ],
        },
      },
      type: "audit.components.scan",
    },
    idempotencyKey: "component-audit-page-1",
    operationId: OPERATION_ID,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  };
}

function registryDriftAuditDelivery() {
  const digest = `sha256:${"a".repeat(64)}`;
  return {
    approval: { mode: "not_required", reason: "read_only_diagnostic" },
    attempt: 1,
    command: {
      payload: {
        plan: {
          componentSets: [
            {
              assetId: "button",
              assetVersion: "1.0.0",
              componentSetKey: "component-set-key",
              contentDigest: digest,
              nodeId: "100:200",
              stableId: "hatch-demo/component/button/component-set/major-1",
              variantStableIds: [
                "hatch-demo/component/button/component-set/major-1/variant/primary",
              ],
            },
          ],
          fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
          projectId: "hatch-demo",
          schemaVersion: "1.0.0",
          scope: "entire-file",
          tokenCollections: [
            {
              assetId: "foundation",
              assetVersion: "1.0.0",
              contentDigest: digest,
              stableId: "hatch-demo/token-set/foundation/variables/major-1",
              variableStableIds: [
                "hatch-demo/token-set/foundation/variables/major-1/variable/semantic/color/action",
              ],
            },
          ],
        },
      },
      type: "audit.registry-drift.scan",
    },
    idempotencyKey: "registry-drift-file-1",
    operationId: OPERATION_ID,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  };
}

function buttonDelivery() {
  const tokens = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "design-system/hatch-demo/tokens/button-foundation.tokens.json",
      ),
      "utf8",
    ),
  ) as unknown;
  const contract = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "design-system/hatch-demo/components/button.component.json",
      ),
      "utf8",
    ),
  ) as unknown;
  const planned = createFigmaButtonPlan(
    contract,
    tokens,
    "sha256:7e6003e59916e0fc445e7ef6d37feb148a3d77908bb7834b3bdb4185530d0e78",
    `sha256:${"a".repeat(64)}`,
  );
  if (!planned.ok) throw new Error(planned.error.message);
  return {
    approval: {
      approvalId: "approval.component.button.1.0.0",
      mode: "approved",
      subject: { ...planned.data.source, type: "component" },
    },
    attempt: 1,
    command: {
      payload: { plan: planned.data },
      type: "components.button.ensure",
    },
    idempotencyKey: "components-button-1.0.0",
    operationId: OPERATION_ID,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  };
}

function iconDelivery() {
  const tokens = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "design-system/hatch-demo/tokens/icon-foundation.tokens.json",
      ),
      "utf8",
    ),
  ) as unknown;
  const contract = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "design-system/hatch-demo/components/icon-check.component.json",
      ),
      "utf8",
    ),
  ) as unknown;
  const planned = createFigmaIconPlan(
    contract,
    tokens,
    "sha256:1b1231911fc691152b6d5e0f95d9681f02995033c97457d3aafccbda592fa260",
    "sha256:3e6525097fe95c63b373adf9b7a6797e3153a4670665c0da9563fc971f62315e",
  );
  if (!planned.ok) throw new Error(planned.error.message);
  return {
    approval: {
      approvalId: "approval.component.icon.check.1.0.0",
      mode: "approved",
      subject: { ...planned.data.source, type: "component" },
    },
    attempt: 1,
    command: {
      payload: { plan: planned.data },
      type: "components.icon.ensure",
    },
    idempotencyKey: "components-icon-check-1.0.0",
    operationId: OPERATION_ID,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  };
}

function inputDelivery() {
  const read = (path: string): unknown =>
    JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as unknown;
  const planned = createFigmaInputPlan(
    read("design-system/hatch-demo/components/input-text.component.json"),
    read("design-system/hatch-demo/tokens/input-foundation.tokens.json"),
    "sha256:cdcc977da4014343e91edef042a55335821d8eaffc8d8098dc865f798321cfc5",
    "sha256:84eff4f8b036b88b861f494251eb9c59b4066774531bd147389af611ff520e6d",
  );
  if (!planned.ok) throw new Error(planned.error.message);
  return {
    approval: {
      approvalId: "approval.component.input.text.1.0.0",
      mode: "approved",
      subject: { ...planned.data.source, type: "component" },
    },
    attempt: 1,
    command: {
      payload: { plan: planned.data },
      type: "components.input.ensure",
    },
    idempotencyKey: "components-input-text-1.0.0",
    operationId: OPERATION_ID,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  };
}

function variablesDelivery() {
  const fixture = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "design-system/hatch-demo/tokens/button-foundation.tokens.json",
      ),
      "utf8",
    ),
  ) as unknown;
  const planned = createFigmaVariablePlan(fixture, `sha256:${"a".repeat(64)}`);
  if (!planned.ok) throw new Error(planned.error.message);
  return {
    approval: {
      approvalId: "approval.tokens.button-foundation.1.0.0",
      mode: "approved",
      subject: { ...planned.data.source, type: "token-set" },
    },
    attempt: 1,
    command: { payload: { plan: planned.data }, type: "variables.ensure" },
    idempotencyKey: "variables-button-foundation-1.0.0",
    operationId: OPERATION_ID,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  };
}

function instanceDelivery() {
  const tokens = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "design-system/hatch-demo/tokens/button-foundation.tokens.json",
      ),
      "utf8",
    ),
  ) as unknown;
  const contract = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "design-system/hatch-demo/components/button.component.json",
      ),
      "utf8",
    ),
  ) as unknown;
  const snapshot = validateDesignSystemSnapshot("hatch-demo", [
    { kind: "token-set", sourcePath: "tokens/a.tokens.json", value: tokens },
    {
      kind: "component",
      sourcePath: "components/a.component.json",
      value: contract,
    },
    {
      kind: "component-registry",
      sourcePath: "registry/a.registry.json",
      value: validRegistry,
    },
  ]);
  if (!snapshot.ok) throw new Error(snapshot.error.message);
  const planned = createFigmaButtonInstancePlan(snapshot.data, {
    assetId: "button",
    instanceId: "screen-checkout/submit",
    label: "Place order",
    projectId: "hatch-demo",
    variantSelections: { appearance: "primary", state: "default" },
    x: 100,
    y: 200,
  });
  if (!planned.ok) throw new Error(planned.error.message);
  return {
    approval: {
      approvalId: planned.data.source.approvalId,
      mode: "approved",
      subject: {
        assetId: planned.data.source.assetId,
        assetVersion: planned.data.source.assetVersion,
        contentDigest: planned.data.source.contentDigest,
        projectId: planned.data.source.projectId,
        type: "component",
      },
    },
    attempt: 1,
    command: {
      payload: { plan: planned.data },
      type: "instances.button.insert",
    },
    idempotencyKey: "instance-screen-checkout-submit",
    operationId: OPERATION_ID,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      fileBindingId: planned.data.source.fileBindingId,
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  };
}

function iconInstanceDelivery() {
  const tokens = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "design-system/hatch-demo/tokens/icon-foundation.tokens.json",
      ),
      "utf8",
    ),
  ) as unknown;
  const contract = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "design-system/hatch-demo/components/icon-check.component.json",
      ),
      "utf8",
    ),
  ) as unknown;
  const entry = iconRegistry.entries[0];
  if (entry === undefined) throw new Error("Icon Registry fixture missing.");
  const snapshot = validateDesignSystemSnapshot("hatch-demo", [
    { kind: "token-set", sourcePath: "tokens/icon.tokens.json", value: tokens },
    {
      kind: "component",
      sourcePath: "components/icon.component.json",
      value: contract,
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
              appliedDigest: entry.asset.contentDigest,
              appliedVersion: entry.asset.version,
              channel: entry.figma.channel,
              fileBindingId: entry.figma.fileBindingId,
              locator: {
                componentSetKey: "icon-check-component-set-key",
                nodeId: "500:600",
              },
              majorVersion: entry.figma.majorVersion,
              role: "component-set",
              slotId: "root",
              status: "ready",
            },
          },
        ],
      },
    },
  ]);
  if (!snapshot.ok) throw new Error(snapshot.error.message);
  const planned = createFigmaIconInstancePlan(snapshot.data, {
    assetId: "icon/check",
    instanceId: "screen-checkout/success-check",
    projectId: "hatch-demo",
    variantSelections: { size: "large" },
    x: 180,
    y: 260,
  });
  if (!planned.ok) throw new Error(planned.error.message);
  return {
    approval: {
      approvalId: planned.data.source.approvalId,
      mode: "approved",
      subject: {
        assetId: planned.data.source.assetId,
        assetVersion: planned.data.source.assetVersion,
        contentDigest: planned.data.source.contentDigest,
        projectId: planned.data.source.projectId,
        type: "component",
      },
    },
    attempt: 1,
    command: {
      payload: { plan: planned.data },
      type: "instances.icon.insert",
    },
    idempotencyKey: "icon-instance-screen-checkout-success-check",
    operationId: OPERATION_ID,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      fileBindingId: planned.data.source.fileBindingId,
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  };
}

function inputInstanceDelivery() {
  const tokens = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "design-system/hatch-demo/tokens/input-foundation.tokens.json",
      ),
      "utf8",
    ),
  ) as unknown;
  const contract = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "design-system/hatch-demo/components/input-text.component.json",
      ),
      "utf8",
    ),
  ) as unknown;
  const entry = inputRegistry.entries[0];
  if (entry === undefined) throw new Error("Input Registry fixture missing.");
  const snapshot = validateDesignSystemSnapshot("hatch-demo", [
    {
      kind: "token-set",
      sourcePath: "tokens/input.tokens.json",
      value: tokens,
    },
    {
      kind: "component",
      sourcePath: "components/input.component.json",
      value: contract,
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
  return {
    approval: {
      approvalId: planned.data.source.approvalId,
      mode: "approved",
      subject: {
        assetId: planned.data.source.assetId,
        assetVersion: planned.data.source.assetVersion,
        contentDigest: planned.data.source.contentDigest,
        projectId: planned.data.source.projectId,
        type: "component",
      },
    },
    attempt: 1,
    command: {
      payload: { plan: planned.data },
      type: "instances.input.insert",
    },
    idempotencyKey: "input-instance-screen-sign-up-email",
    operationId: OPERATION_ID,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      fileBindingId: planned.data.source.fileBindingId,
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  };
}

describe("lightweight Figma Writer boundary validation", () => {
  it("stays version-aligned with the authoritative Core schema", () => {
    expect(FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION).toBe(
      WRITER_PROTOCOL_SCHEMA_VERSION,
    );
    expect(writerCommandDeliverySchema.safeParse(delivery()).success).toBe(
      true,
    );
    expect(isWriterCommandDelivery(delivery())).toBe(true);
    expect(writerCommandDeliverySchema.safeParse(auditDelivery()).success).toBe(
      true,
    );
    expect(isWriterCommandDelivery(auditDelivery())).toBe(true);
    expect(
      writerCommandDeliverySchema.safeParse(componentAuditDelivery()).success,
    ).toBe(true);
    expect(isWriterCommandDelivery(componentAuditDelivery())).toBe(true);
    expect(
      writerCommandDeliverySchema.safeParse(registryDriftAuditDelivery())
        .success,
    ).toBe(true);
    expect(isWriterCommandDelivery(registryDriftAuditDelivery())).toBe(true);
    expect(
      writerCommandDeliverySchema.safeParse(variablesDelivery()).success,
    ).toBe(true);
    expect(isWriterCommandDelivery(variablesDelivery())).toBe(true);
    expect(
      writerCommandDeliverySchema.safeParse(buttonDelivery()).success,
    ).toBe(true);
    expect(isWriterCommandDelivery(buttonDelivery())).toBe(true);
    expect(writerCommandDeliverySchema.safeParse(iconDelivery()).success).toBe(
      true,
    );
    expect(isWriterCommandDelivery(iconDelivery())).toBe(true);
    expect(writerCommandDeliverySchema.safeParse(inputDelivery()).success).toBe(
      true,
    );
    expect(isWriterCommandDelivery(inputDelivery())).toBe(true);
    const reorderedInput = structuredClone(inputDelivery());
    const content =
      reorderedInput.command.payload.plan.componentSet.properties.content;
    reorderedInput.command.payload.plan.componentSet.properties.content = {
      options: content.options,
      name: content.name,
      defaultValue: content.defaultValue,
    };
    expect(writerCommandDeliverySchema.safeParse(reorderedInput).success).toBe(
      true,
    );
    expect(isWriterCommandDelivery(reorderedInput)).toBe(true);
    expect(
      writerCommandDeliverySchema.safeParse(instanceDelivery()).success,
    ).toBe(true);
    expect(isWriterCommandDelivery(instanceDelivery())).toBe(true);
    expect(
      writerCommandDeliverySchema.safeParse(iconInstanceDelivery()).success,
    ).toBe(true);
    expect(isWriterCommandDelivery(iconInstanceDelivery())).toBe(true);
    expect(
      writerCommandDeliverySchema.safeParse(inputInstanceDelivery()).success,
    ).toBe(true);
    expect(isWriterCommandDelivery(inputInstanceDelivery())).toBe(true);
  });

  it("rejects the same unsafe command extensions at the Plugin boundary", () => {
    const unsafeCommands = [
      { ...delivery(), writeWithoutApproval: true },
      {
        ...delivery(),
        command: { payload: {}, type: "variables.ensure" },
      },
      { ...delivery(), attempt: 0 },
      {
        ...delivery(),
        approval: { mode: "technical-spike", reason: "bypass" },
      },
    ];
    for (const command of unsafeCommands) {
      expect(writerCommandDeliverySchema.safeParse(command).success).toBe(
        false,
      );
      expect(isWriterCommandDelivery(command)).toBe(false);
    }

    const missingAlias = structuredClone(variablesDelivery());
    const alias = missingAlias.command.payload.plan.variables
      .flatMap(({ values }) => values)
      .find(({ value }) => value.kind === "alias")?.value;
    if (alias?.kind !== "alias") throw new Error("Alias fixture missing.");
    alias.targetStableId =
      "hatch-demo/token-set/button-foundation/variables/major-1/variable/primitive/color/missing";
    expect(writerCommandDeliverySchema.safeParse(missingAlias).success).toBe(
      false,
    );
    expect(isWriterCommandDelivery(missingAlias)).toBe(false);

    const wrongVariantIdentity = structuredClone(componentAuditDelivery());
    const auditVariant =
      wrongVariantIdentity.command.payload.plan.sources[0]?.variants[0];
    if (auditVariant === undefined) throw new Error("Audit Variant missing.");
    auditVariant.stableId =
      "hatch-demo/component/button/component-set/major-1/variant/wrong";
    expect(
      writerCommandDeliverySchema.safeParse(wrongVariantIdentity).success,
    ).toBe(false);
    expect(isWriterCommandDelivery(wrongVariantIdentity)).toBe(false);

    const wrongComponentApproval = structuredClone(buttonDelivery());
    wrongComponentApproval.approval.approvalId = "approval.tokens.button.1.0.0";
    expect(
      writerCommandDeliverySchema.safeParse(wrongComponentApproval).success,
    ).toBe(false);
    expect(isWriterCommandDelivery(wrongComponentApproval)).toBe(false);

    const changedIconGeometry = structuredClone(iconDelivery()) as unknown as {
      command: { payload: { plan: { glyph: { pathData: string } } } };
    };
    changedIconGeometry.command.payload.plan.glyph.pathData =
      "M4 12L10 18L20 6";
    expect(
      writerCommandDeliverySchema.safeParse(changedIconGeometry).success,
    ).toBe(false);
    expect(isWriterCommandDelivery(changedIconGeometry)).toBe(false);

    const missingInputState = structuredClone(inputDelivery());
    missingInputState.command.payload.plan.variants.pop();
    expect(
      writerCommandDeliverySchema.safeParse(missingInputState).success,
    ).toBe(false);
    expect(isWriterCommandDelivery(missingInputState)).toBe(false);

    const wrongIconInstanceSize = structuredClone(iconInstanceDelivery());
    wrongIconInstanceSize.command.payload.plan.properties.size.value = "Small";
    expect(
      writerCommandDeliverySchema.safeParse(wrongIconInstanceSize).success,
    ).toBe(false);
    expect(isWriterCommandDelivery(wrongIconInstanceSize)).toBe(false);

    const invalidIconInstanceMajor = structuredClone(iconInstanceDelivery());
    invalidIconInstanceMajor.command.payload.plan.componentSet.majorVersion =
      -1;
    expect(
      writerCommandDeliverySchema.safeParse(invalidIconInstanceMajor).success,
    ).toBe(false);
    expect(isWriterCommandDelivery(invalidIconInstanceMajor)).toBe(false);

    const mismatchedInputState = structuredClone(inputInstanceDelivery());
    mismatchedInputState.command.payload.plan.properties.state.value =
      "Focused";
    expect(
      writerCommandDeliverySchema.safeParse(mismatchedInputState).success,
    ).toBe(false);
    expect(isWriterCommandDelivery(mismatchedInputState)).toBe(false);

    const paddedInputText = structuredClone(inputInstanceDelivery());
    paddedInputText.command.payload.plan.properties.text.value =
      " alex@example.com";
    expect(writerCommandDeliverySchema.safeParse(paddedInputText).success).toBe(
      false,
    );
    expect(isWriterCommandDelivery(paddedInputText)).toBe(false);
  });

  it("matches strict success and failure Result envelopes", () => {
    const success = {
      ok: true,
      operationId: OPERATION_ID,
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: { pong: true },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    };
    const failure = {
      error: {
        code: "VALIDATION_FAILED",
        message: "Command rejected.",
        recoveryInstruction: "Correct the command.",
      },
      ok: false,
      operationId: OPERATION_ID,
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    };
    const variables = {
      ...success,
      result: {
        collection: {
          action: "created",
          stableId: "hatch-demo/token-set/button-foundation/variables/major-1",
        },
        deferredTypographyCount: 1,
        type: "variables.ensure",
        variables: { created: 30, unchanged: 0, updated: 0 },
      },
    };
    const button = {
      ...success,
      result: {
        componentSet: {
          action: "created",
          nodeId: "1:2",
          stableId: "hatch-demo/component/button/component-set/major-1",
        },
        labelPropertyName: "Label#1:2",
        type: "components.button.ensure",
        typography: {
          lineHeightStrategy: "resolved-percent",
          variableBindings: 4,
        },
        variants: { created: 4, unchanged: 0, updated: 0 },
      },
    };
    const icon = {
      ...success,
      result: {
        componentSet: {
          action: "created",
          nodeId: "3:4",
          stableId: "hatch-demo/component/icon/check/component-set/major-1",
        },
        type: "components.icon.ensure",
        variants: { created: 3, unchanged: 0, updated: 0 },
      },
    };
    const input = {
      ...success,
      result: {
        componentSet: {
          action: "created",
          nodeId: "5:6",
          stableId: "hatch-demo/component/input/text/component-set/major-1",
        },
        textPropertyNames: {
          label: "Label#5:7",
          supportingText: "Supporting text#5:9",
          text: "Text#5:8",
        },
        type: "components.input.ensure",
        typography: {
          lineHeightStrategy: "resolved-percent",
          variableBindings: 12,
        },
        variants: { created: 8, unchanged: 0, updated: 0 },
      },
    };
    expect(writerPluginResultSchema.safeParse(success).success).toBe(true);
    expect(writerPluginResultSchema.safeParse(failure).success).toBe(true);
    expect(isWriterPluginResult(success)).toBe(true);
    expect(isWriterPluginResult(failure)).toBe(true);
    expect(writerPluginResultSchema.safeParse(icon).success).toBe(true);
    expect(isWriterPluginResult(icon)).toBe(true);
    expect(writerPluginResultSchema.safeParse(input).success).toBe(true);
    expect(isWriterPluginResult(input)).toBe(true);

    const instanceSuccess = {
      ok: true,
      operationId: OPERATION_ID,
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: {
        componentSet: {
          nodeId: "100:200",
          stableId: "hatch-demo/component/button/component-set/major-1",
        },
        instance: {
          action: "created",
          nodeId: "200:300",
          stableId: "hatch-demo/instance/screen-checkout/submit",
        },
        type: "instances.button.insert",
        variant: {
          stableId:
            "hatch-demo/component/button/component-set/major-1/variant/appearance-primary/state-default",
        },
      },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    };
    expect(writerPluginResultSchema.safeParse(instanceSuccess).success).toBe(
      true,
    );
    expect(isWriterPluginResult(instanceSuccess)).toBe(true);
    const iconInstanceSuccess = {
      ...instanceSuccess,
      result: {
        componentSet: {
          nodeId: "500:600",
          stableId: "hatch-demo/component/icon/check/component-set/major-1",
        },
        instance: {
          action: "created",
          nodeId: "600:700",
          stableId: "hatch-demo/instance/screen-checkout/success-check",
        },
        type: "instances.icon.insert",
        variant: {
          stableId:
            "hatch-demo/component/icon/check/component-set/major-1/variant/size-large",
        },
      },
    };
    expect(
      writerPluginResultSchema.safeParse(iconInstanceSuccess).success,
    ).toBe(true);
    expect(isWriterPluginResult(iconInstanceSuccess)).toBe(true);
    const inputInstanceSuccess = {
      ...instanceSuccess,
      result: {
        componentSet: {
          nodeId: "700:800",
          stableId: "hatch-demo/component/input/text/component-set/major-1",
        },
        instance: {
          action: "created",
          nodeId: "800:900",
          stableId: "hatch-demo/instance/screen-sign-up/email",
        },
        type: "instances.input.insert",
        variant: {
          stableId:
            "hatch-demo/component/input/text/component-set/major-1/variant/state-error/content-filled",
        },
      },
    };
    expect(
      writerPluginResultSchema.safeParse(inputInstanceSuccess).success,
    ).toBe(true);
    expect(isWriterPluginResult(inputInstanceSuccess)).toBe(true);
    const auditSuccess = {
      ok: true,
      operationId: OPERATION_ID,
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: {
        findings: [],
        page: { id: "1:2", name: "Page 1" },
        passed: true,
        schemaVersion: "1.0.0",
        scope: "current-page",
        summary: {
          auditedStyles: 5,
          hardCodedStyles: 0,
          nodesWithFindings: 0,
          registeredBindings: 5,
          unregisteredVariables: 0,
        },
        type: "audit.styles.scan",
      },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    };
    expect(writerPluginResultSchema.safeParse(auditSuccess).success).toBe(true);
    expect(isWriterPluginResult(auditSuccess)).toBe(true);
    expect(
      isWriterPluginResult({
        ...auditSuccess,
        result: { ...auditSuccess.result, passed: false },
      }),
    ).toBe(false);
    const componentAuditSuccess = {
      ok: true,
      operationId: OPERATION_ID,
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: {
        findings: [],
        page: { id: "1:2", name: "Page 1" },
        passed: true,
        schemaVersion: "1.0.0",
        scope: "current-page",
        summary: {
          auditedNodes: 5,
          compliantInstances: 5,
          detachedOrApproximate: 0,
          provenanceMismatches: 0,
          unregisteredSources: 0,
          unregisteredVariants: 0,
          variantPropertyMismatches: 0,
        },
        type: "audit.components.scan",
      },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    };
    expect(
      writerPluginResultSchema.safeParse(componentAuditSuccess).success,
    ).toBe(true);
    expect(isWriterPluginResult(componentAuditSuccess)).toBe(true);
    const driftAuditSuccess = {
      ok: true,
      operationId: OPERATION_ID,
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: {
        findings: [],
        passed: true,
        schemaVersion: "1.0.0",
        scope: "entire-file",
        summary: {
          auditedFigmaAssets: 2,
          duplicateAssets: 0,
          invalidMarkers: 0,
          locatorMismatches: 0,
          mismatchedChildren: 0,
          mismatchedDigests: 0,
          mismatchedVersions: 0,
          missingInFigma: 0,
          missingInRegistry: 0,
        },
        type: "audit.registry-drift.scan",
      },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    };
    expect(writerPluginResultSchema.safeParse(driftAuditSuccess).success).toBe(
      true,
    );
    expect(isWriterPluginResult(driftAuditSuccess)).toBe(true);
    const inconsistentComponentAudit = structuredClone(componentAuditSuccess);
    inconsistentComponentAudit.result.summary.auditedNodes = 4;
    expect(
      writerPluginResultSchema.safeParse(inconsistentComponentAudit).success,
    ).toBe(false);
    expect(isWriterPluginResult(inconsistentComponentAudit)).toBe(false);
    expect(writerPluginResultSchema.safeParse(variables).success).toBe(true);
    expect(isWriterPluginResult(variables)).toBe(true);
    expect(writerPluginResultSchema.safeParse(button).success).toBe(true);
    expect(isWriterPluginResult(button)).toBe(true);
    expect(isWriterPluginResult({ ...success, token: "unsafe" })).toBe(false);
  });
});

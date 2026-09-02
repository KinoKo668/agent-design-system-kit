import { describe, expect, it } from "vitest";

import validContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };
import iconContract from "../../../design-system/hatch-demo/components/icon-check.component.json" with { type: "json" };
import iconTokens from "../../../design-system/hatch-demo/tokens/icon-foundation.tokens.json" with { type: "json" };

import { createFigmaButtonPlan } from "./figma-button-plan.js";
import { createFigmaIconPlan } from "./figma-icon-plan.js";

import {
  WRITER_PROTOCOL_SCHEMA_VERSION,
  toWriterCommandFingerprintSubject,
  writerCommandEnvelopeSchema,
  writerPluginHelloSchema,
  writerPluginResultSchema,
  type WriterCommandEnvelope,
} from "./writer-protocol.js";

function validCommand(): WriterCommandEnvelope {
  return {
    approval: {
      mode: "not_required",
      reason: "read_only_diagnostic",
    },
    command: { payload: {}, type: "writer.ping" },
    idempotencyKey: "ping-hatch-demo",
    operationId: "9f1bc0f4-fbb5-4b9c-b5f4-91f1d542a52d",
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      kind: "plugin-session",
      stableId: "hatch-demo/plugin-session",
    },
  };
}

function variablesCommand(): unknown {
  const plan = {
    collection: {
      defaultModeId:
        "hatch-demo/token-set/foundation/variables/major-1/mode/light",
      description: "Foundation variables.",
      majorVersion: 1,
      modes: [
        {
          name: "Light",
          stableId:
            "hatch-demo/token-set/foundation/variables/major-1/mode/light",
        },
      ],
      name: "Foundation / v1",
      stableId: "hatch-demo/token-set/foundation/variables/major-1",
    },
    deferredTypography: [],
    schemaVersion: "1.0.0",
    source: {
      assetId: "foundation",
      assetVersion: "1.0.0",
      contentDigest: `sha256:${"a".repeat(64)}`,
      projectId: "hatch-demo",
    },
    variables: [
      {
        codeSyntax: "var(--hatch-demo-primitive-number-scale)",
        description: "Scale.",
        hiddenFromPublishing: true,
        name: "primitive/number/scale",
        resolvedType: "FLOAT",
        scopes: [],
        stableId:
          "hatch-demo/token-set/foundation/variables/major-1/variable/primitive/number/scale",
        tokenPath: "primitive/number/scale",
        tokenType: "number",
        values: [
          {
            modeStableId:
              "hatch-demo/token-set/foundation/variables/major-1/mode/light",
            value: { kind: "float", value: 1 },
          },
        ],
      },
    ],
  };
  return {
    approval: {
      approvalId: "approval.tokens.foundation.1.0.0",
      mode: "approved",
      subject: { ...plan.source, type: "token-set" },
    },
    command: { payload: { plan }, type: "variables.ensure" },
    idempotencyKey: "variables-foundation-1.0.0",
    operationId: "39d4aa88-67a2-4de3-bf64-2b51509316be",
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

function buttonCommand(): unknown {
  const planned = createFigmaButtonPlan(
    validContract,
    validTokenSet,
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
    command: {
      payload: { plan: planned.data },
      type: "components.button.ensure",
    },
    idempotencyKey: "components-button-1.0.0",
    operationId: "39d4aa88-67a2-4de3-bf64-2b51509316be",
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

function iconCommand(): unknown {
  const planned = createFigmaIconPlan(
    iconContract,
    iconTokens,
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
    command: {
      payload: { plan: planned.data },
      type: "components.icon.ensure",
    },
    idempotencyKey: "components-icon-check-1.0.0",
    operationId: "79d4aa88-67a2-4de3-bf64-2b51509316be",
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

function iconInstanceCommand(): unknown {
  const root = "hatch-demo/component/icon/check/component-set/major-1";
  const plan = {
    componentSet: {
      expectedVariantStableIds: [
        `${root}/variant/size-small`,
        `${root}/variant/size-medium`,
        `${root}/variant/size-large`,
      ],
      majorVersion: 1,
      nodeId: "500:600",
      stableId: root,
    },
    instance: {
      stableId: "hatch-demo/instance/checkout/success-check",
      x: 180,
      y: 260,
    },
    properties: { size: { name: "Size", value: "Large" } },
    schemaVersion: "1.0.0",
    selectedVariant: {
      figmaName: "Size=Large",
      selections: { size: "large" },
      slotId: "variant/size-large",
      stableId: `${root}/variant/size-large`,
    },
    source: {
      approvalId: "approval.component.icon.check.1.0.0",
      assetId: "icon/check",
      assetVersion: "1.0.0",
      contentDigest:
        "sha256:1b1231911fc691152b6d5e0f95d9681f02995033c97457d3aafccbda592fa260",
      fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
      projectId: "hatch-demo",
    },
  };
  return {
    approval: {
      approvalId: plan.source.approvalId,
      mode: "approved",
      subject: {
        assetId: plan.source.assetId,
        assetVersion: plan.source.assetVersion,
        contentDigest: plan.source.contentDigest,
        projectId: plan.source.projectId,
        type: "component",
      },
    },
    command: { payload: { plan }, type: "instances.icon.insert" },
    idempotencyKey: "icon-instance-checkout-success-check",
    operationId: "89d4aa88-67a2-4de3-bf64-2b51509316be",
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      fileBindingId: plan.source.fileBindingId,
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  };
}

function styleAuditCommand(): unknown {
  return {
    approval: {
      mode: "not_required",
      reason: "read_only_diagnostic",
    },
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
    idempotencyKey: "style-audit-page-1",
    operationId: "49d4aa88-67a2-4de3-bf64-2b51509316be",
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

function componentAuditCommand(): unknown {
  return {
    approval: { mode: "not_required", reason: "read_only_diagnostic" },
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
    operationId: "59d4aa88-67a2-4de3-bf64-2b51509316be",
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

function registryDriftAuditCommand(): unknown {
  const digest = `sha256:${"a".repeat(64)}`;
  return {
    approval: { mode: "not_required", reason: "read_only_diagnostic" },
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
    idempotencyKey: "registry-drift-audit-file-1",
    operationId: "69d4aa88-67a2-4de3-bf64-2b51509316be",
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

describe("Writer protocol", () => {
  it("accepts diagnostic, audit, and approved Variable commands", () => {
    expect(writerCommandEnvelopeSchema.parse(validCommand())).toEqual(
      validCommand(),
    );

    expect(
      writerCommandEnvelopeSchema.safeParse(variablesCommand()).success,
    ).toBe(true);
    expect(writerCommandEnvelopeSchema.safeParse(buttonCommand()).success).toBe(
      true,
    );
    expect(writerCommandEnvelopeSchema.safeParse(iconCommand()).success).toBe(
      true,
    );
    expect(
      writerCommandEnvelopeSchema.safeParse(iconInstanceCommand()).success,
    ).toBe(true);
    expect(
      writerCommandEnvelopeSchema.safeParse(styleAuditCommand()).success,
    ).toBe(true);
    expect(
      writerCommandEnvelopeSchema.safeParse(componentAuditCommand()).success,
    ).toBe(true);
    expect(
      writerCommandEnvelopeSchema.safeParse(registryDriftAuditCommand())
        .success,
    ).toBe(true);
    const mismatchedTokenPath = structuredClone(styleAuditCommand()) as {
      command: {
        payload: { plan: { registeredVariables: [{ tokenPath: string }] } };
      };
    };
    mismatchedTokenPath.command.payload.plan.registeredVariables[0].tokenPath =
      "semantic/color/other";
    expect(
      writerCommandEnvelopeSchema.safeParse(mismatchedTokenPath).success,
    ).toBe(false);
  });

  it("rejects unknown fields and an approval bypass", () => {
    expect(
      writerCommandEnvelopeSchema.safeParse({
        ...validCommand(),
        approval: { mode: "technical-spike", reference: null },
      }).success,
    ).toBe(false);
    const variables = variablesCommand() as Record<string, unknown>;
    expect(
      writerCommandEnvelopeSchema.safeParse({
        ...variables,
        approval: {
          mode: "not_required",
          reason: "read_only_diagnostic",
        },
      }).success,
    ).toBe(false);
    expect(
      writerCommandEnvelopeSchema.safeParse({
        ...validCommand(),
        writeWithoutApproval: true,
      }).success,
    ).toBe(false);
  });

  it("excludes operation, idempotency, and source fields from fingerprint input", () => {
    expect(toWriterCommandFingerprintSubject(validCommand())).toEqual({
      approval: {
        mode: "not_required",
        reason: "read_only_diagnostic",
      },
      command: { payload: {}, type: "writer.ping" },
      projectId: "hatch-demo",
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
      target: {
        kind: "plugin-session",
        stableId: "hatch-demo/plugin-session",
      },
    });
  });

  it("validates strict plugin hello and result envelopes", () => {
    expect(
      writerPluginHelloSchema.safeParse({
        context: { fileName: "Demo", pageName: "Page 1" },
        pluginInstanceId: "c45c06e8-80ae-4478-ad55-9c49c60ecc56",
        schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
        transport: "http",
      }).success,
    ).toBe(true);
    expect(
      writerPluginResultSchema.safeParse({
        ok: true,
        operationId: validCommand().operationId,
        pluginInstanceId: "c45c06e8-80ae-4478-ad55-9c49c60ecc56",
        result: {
          collection: {
            action: "created",
            stableId: "hatch-demo/token-set/foundation/variables/major-1",
          },
          deferredTypographyCount: 1,
          type: "variables.ensure",
          variables: { created: 30, unchanged: 0, updated: 0 },
        },
        schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
      }).success,
    ).toBe(true);
    expect(
      writerPluginResultSchema.safeParse({
        ok: true,
        operationId: validCommand().operationId,
        pluginInstanceId: "c45c06e8-80ae-4478-ad55-9c49c60ecc56",
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
      }).success,
    ).toBe(true);
    expect(
      writerPluginResultSchema.safeParse({
        ok: true,
        operationId: validCommand().operationId,
        pluginInstanceId: "c45c06e8-80ae-4478-ad55-9c49c60ecc56",
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
      }).success,
    ).toBe(true);
    expect(
      writerPluginResultSchema.safeParse({
        ok: true,
        operationId: validCommand().operationId,
        pluginInstanceId: "c45c06e8-80ae-4478-ad55-9c49c60ecc56",
        result: {
          findings: [],
          page: { id: "1:2", name: "Page 1" },
          passed: false,
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
      }).success,
    ).toBe(false);
    expect(
      writerPluginResultSchema.safeParse({
        ok: true,
        operationId: validCommand().operationId,
        pluginInstanceId: "c45c06e8-80ae-4478-ad55-9c49c60ecc56",
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
      }).success,
    ).toBe(true);
    expect(
      writerPluginResultSchema.safeParse({
        ok: true,
        operationId: validCommand().operationId,
        pluginInstanceId: "c45c06e8-80ae-4478-ad55-9c49c60ecc56",
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
        schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
      }).success,
    ).toBe(true);
    expect(
      writerPluginResultSchema.safeParse({
        ok: true,
        operationId: validCommand().operationId,
        pluginInstanceId: "c45c06e8-80ae-4478-ad55-9c49c60ecc56",
        result: { pong: true },
        schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
      }).success,
    ).toBe(true);
    expect(
      writerPluginResultSchema.safeParse({
        ok: false,
        operationId: validCommand().operationId,
        pluginInstanceId: "c45c06e8-80ae-4478-ad55-9c49c60ecc56",
        schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
      }).success,
    ).toBe(false);
  });
});

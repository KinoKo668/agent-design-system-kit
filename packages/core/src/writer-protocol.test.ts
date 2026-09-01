import { describe, expect, it } from "vitest";

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

describe("Writer protocol", () => {
  it("accepts the diagnostic and approved Variable commands", () => {
    expect(writerCommandEnvelopeSchema.parse(validCommand())).toEqual(
      validCommand(),
    );

    expect(
      writerCommandEnvelopeSchema.safeParse(variablesCommand()).success,
    ).toBe(true);
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

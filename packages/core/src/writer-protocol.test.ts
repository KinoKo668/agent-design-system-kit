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

describe("Writer protocol", () => {
  it("accepts only the read-only diagnostic command in FIG-002", () => {
    expect(writerCommandEnvelopeSchema.parse(validCommand())).toEqual(
      validCommand(),
    );

    const unsafe = {
      ...validCommand(),
      command: { payload: {}, type: "variables.ensure" },
    };
    expect(writerCommandEnvelopeSchema.safeParse(unsafe).success).toBe(false);
  });

  it("rejects unknown fields and an approval bypass", () => {
    expect(
      writerCommandEnvelopeSchema.safeParse({
        ...validCommand(),
        approval: { mode: "technical-spike", reference: null },
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

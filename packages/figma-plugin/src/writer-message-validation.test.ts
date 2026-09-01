import {
  WRITER_PROTOCOL_SCHEMA_VERSION,
  writerCommandDeliverySchema,
  writerPluginResultSchema,
} from "@agent-design-system-kit/core";
import { describe, expect, it } from "vitest";

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

describe("lightweight Figma Writer boundary validation", () => {
  it("stays version-aligned with the authoritative Core schema", () => {
    expect(FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION).toBe(
      WRITER_PROTOCOL_SCHEMA_VERSION,
    );
    expect(writerCommandDeliverySchema.safeParse(delivery()).success).toBe(
      true,
    );
    expect(isWriterCommandDelivery(delivery())).toBe(true);
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
    expect(writerPluginResultSchema.safeParse(success).success).toBe(true);
    expect(writerPluginResultSchema.safeParse(failure).success).toBe(true);
    expect(isWriterPluginResult(success)).toBe(true);
    expect(isWriterPluginResult(failure)).toBe(true);
    expect(isWriterPluginResult({ ...success, token: "unsafe" })).toBe(false);
  });
});

import {
  WRITER_PROTOCOL_SCHEMA_VERSION,
  createFigmaVariablePlan,
  writerCommandDeliverySchema,
  writerPluginResultSchema,
} from "@agent-design-system-kit/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

describe("lightweight Figma Writer boundary validation", () => {
  it("stays version-aligned with the authoritative Core schema", () => {
    expect(FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION).toBe(
      WRITER_PROTOCOL_SCHEMA_VERSION,
    );
    expect(writerCommandDeliverySchema.safeParse(delivery()).success).toBe(
      true,
    );
    expect(isWriterCommandDelivery(delivery())).toBe(true);
    expect(
      writerCommandDeliverySchema.safeParse(variablesDelivery()).success,
    ).toBe(true);
    expect(isWriterCommandDelivery(variablesDelivery())).toBe(true);
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
    expect(writerPluginResultSchema.safeParse(success).success).toBe(true);
    expect(writerPluginResultSchema.safeParse(failure).success).toBe(true);
    expect(isWriterPluginResult(success)).toBe(true);
    expect(isWriterPluginResult(failure)).toBe(true);
    expect(writerPluginResultSchema.safeParse(variables).success).toBe(true);
    expect(isWriterPluginResult(variables)).toBe(true);
    expect(isWriterPluginResult({ ...success, token: "unsafe" })).toBe(false);
  });
});

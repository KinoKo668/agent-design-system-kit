import {
  WRITER_PROTOCOL_SCHEMA_VERSION,
  type WriterPluginResult,
} from "@agent-design-system-kit/core";
import { describe, expect, it } from "vitest";

import { shouldCacheWriterResult } from "./writer-replay-policy.js";

const OPERATION_ID = "2c73620e-29b0-4285-8861-1a65b18f11dc";
const PLUGIN_INSTANCE_ID = "c45c06e8-80ae-4478-ad55-9c49c60ecc56";

function failure(
  code: "IDENTITY_CONFLICT" | "PARTIAL_WRITE",
): WriterPluginResult {
  return {
    error: {
      code,
      message: "Writer failed.",
      recoveryInstruction: "Follow the recovery policy.",
    },
    ok: false,
    operationId: OPERATION_ID,
    pluginInstanceId: PLUGIN_INSTANCE_ID,
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
  };
}

const success = {
  ok: true,
  operationId: OPERATION_ID,
  pluginInstanceId: PLUGIN_INSTANCE_ID,
  result: { pong: true },
  schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
} as const satisfies WriterPluginResult;

describe("Writer replay cache policy", () => {
  it("caches only read-only success and terminal failures", () => {
    expect(shouldCacheWriterResult("writer.ping", success)).toBe(true);
    expect(shouldCacheWriterResult("audit.styles.scan", success)).toBe(true);
    expect(shouldCacheWriterResult("audit.components.scan", success)).toBe(
      true,
    );
    expect(shouldCacheWriterResult("audit.registry-drift.scan", success)).toBe(
      true,
    );
    expect(shouldCacheWriterResult("variables.ensure", success)).toBe(false);
    expect(shouldCacheWriterResult("components.button.ensure", success)).toBe(
      false,
    );
    expect(shouldCacheWriterResult("instances.button.insert", success)).toBe(
      false,
    );
    expect(
      shouldCacheWriterResult(
        "instances.button.insert",
        failure("PARTIAL_WRITE"),
      ),
    ).toBe(false);
    expect(
      shouldCacheWriterResult(
        "instances.button.insert",
        failure("IDENTITY_CONFLICT"),
      ),
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { createToolkitError } from "./errors.js";
import { LOG_SCHEMA_VERSION, createLogEvent } from "./logging.js";
import { REDACTED_PATH, REDACTED_VALUE } from "./security.js";

describe("structured log events", () => {
  it("uses caller-provided time and correlation values deterministically", () => {
    const event = createLogEvent({
      attributes: { attempt: 2, queue: "figma-writer" },
      correlation: {
        idempotencyKeyHash: "sha256:example",
        operationId: "operation-123",
        requestId: "request-456",
      },
      event: "writer.command_dispatched",
      level: "info",
      message: "Dispatched one command to the Figma writer.",
      sensitiveValues: [],
      source: "mcp-server",
      timestamp: "2026-08-31T12:00:00.000Z",
    });

    expect(event).toEqual({
      attributes: { attempt: 2, queue: "figma-writer" },
      correlation: {
        idempotencyKeyHash: "sha256:example",
        operationId: "operation-123",
        requestId: "request-456",
      },
      event: "writer.command_dispatched",
      level: "info",
      message: "Dispatched one command to the Figma writer.",
      schemaVersion: LOG_SCHEMA_VERSION,
      source: "mcp-server",
      timestamp: "2026-08-31T12:00:00.000Z",
    });
  });

  it("logs only the error code and category, not its full context", () => {
    const error = createToolkitError({
      code: "FILE_BINDING_MISMATCH",
      context: {
        actual: { projectId: "other-project" },
        expected: { projectId: "kite" },
      },
      message: "The open Figma file belongs to another project.",
      recoveryInstruction: "Open the bound file or explicitly rebind it.",
    });
    const event = createLogEvent({
      error,
      event: "writer.file_binding_rejected",
      level: "error",
      message: "Figma file binding did not match the command target.",
      sensitiveValues: [],
      source: "figma-plugin",
      timestamp: "2026-08-31T12:00:00.000Z",
    });

    expect(event.error).toEqual({
      category: "identity",
      code: "FILE_BINDING_MISMATCH",
    });
    expect(event.error).not.toHaveProperty("message");
    expect(event.error).not.toHaveProperty("context");
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });

  it("redacts exact secrets, sensitive fields and local identifiers", () => {
    const sessionToken = "runtime-session-token-123";
    const event = createLogEvent({
      attributes: {
        authorization: `Bearer ${sessionToken}`,
        bridgeToken: sessionToken,
        nested: {
          figmaFileKey: "private-file-key",
          safeAssetId: "ads://kite/component/button",
        },
        sourcePath: "/Users/example/private-project/command.json",
      },
      event: "bridge.request_rejected",
      level: "warn",
      message: `Rejected Bearer ${sessionToken} from https://www.figma.com/design/private-file/design?node-id=1-2.`,
      sensitiveValues: [sessionToken],
      source: "mcp-server",
      timestamp: "2026-08-31T12:00:00.000Z",
    });

    expect(event.message).toBe(
      "Rejected Bearer [REDACTED] from [REDACTED_FIGMA_URL]",
    );
    expect(event.attributes).toEqual({
      authorization: REDACTED_VALUE,
      bridgeToken: REDACTED_VALUE,
      nested: {
        figmaFileKey: REDACTED_VALUE,
        safeAssetId: "ads://kite/component/button",
      },
      sourcePath: REDACTED_PATH,
    });
    expect(JSON.stringify(event)).not.toContain(sessionToken);
    expect(event).not.toHaveProperty("sensitiveValues");
  });
});

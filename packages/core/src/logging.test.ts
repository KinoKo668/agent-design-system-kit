import { describe, expect, it } from "vitest";

import { createToolkitError } from "./errors.js";
import { LOG_SCHEMA_VERSION, createLogEvent } from "./logging.js";

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
});

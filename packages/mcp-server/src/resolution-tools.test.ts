import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { COMPONENT_CHANGE_REQUEST_PROHIBITED_ACTIONS } from "@agent-design-system-kit/core";

import {
  HATCHKIT_COMPONENT_CHANGE_REQUEST_TOOL_NAME,
  HATCHKIT_COMPONENT_RESOLVE_TOOL_NAME,
} from "./resolution-tools.js";
import { createHatchkitMcpServer } from "./server.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
const SUBMISSION = {
  intendedUse:
    "Use the requested capability in a settings footer without introducing one-off UI.",
  rationale:
    "The exact request cannot be represented by the current registered component catalog.",
  requestId: "00000000-0000-4000-8000-000000000030",
  submittedAt: "2026-09-01T16:50:00Z",
  submittedBy: { id: "codex", type: "agent" },
  summary: "Review a missing component capability",
} as const;

let client: Client;
let server: ReturnType<typeof createHatchkitMcpServer>;

beforeEach(async () => {
  server = createHatchkitMcpServer({
    designSystemRoot: resolve(WORKSPACE_ROOT, "design-system/hatch-demo"),
    expectedProjectId: "hatch-demo",
  });
  client = new Client({ name: "hatchkit-resolve-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterEach(async () => {
  await Promise.allSettled([client.close(), server.close()]);
});

function resultWarnings(result: { readonly structuredContent?: unknown }) {
  const content = result.structuredContent;
  return content !== null &&
    typeof content === "object" &&
    "warnings" in content
    ? content.warnings
    : undefined;
}

describe("Hatchkit MCP resolution tools", () => {
  it("resolves one exact active Button Variant without authorizing a write", async () => {
    const result = await client.callTool({
      arguments: {
        assetId: "button",
        variantSelections: {
          appearance: "secondary",
          state: "disabled",
        },
      },
      name: HATCHKIT_COMPONENT_RESOLVE_TOOL_NAME,
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      data: {
        nextAction: "verify-approval-and-audit-then-insert-instance",
        selectedVariant: {
          id: "appearance-secondary/state-disabled",
        },
        sources: {
          contractSourcePath: "components/button.component.json",
          registrySourcePath: "registry/components.registry.json",
        },
        status: "figma-ready",
        variantSelections: {
          appearance: "secondary",
          state: "disabled",
        },
      },
      ok: true,
    });
    expect(resultWarnings(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "APPROVAL_GUARD_REQUIRED" }),
        expect.objectContaining({ code: "FIGMA_AUDIT_REQUIRED" }),
      ]),
    );
    expect(JSON.stringify(result)).toContain("nodeId");
    expect(JSON.stringify(result)).not.toContain("writerCommand");
    expect(JSON.stringify(result)).not.toContain("enqueue-figma-write");
  });

  it("resolves an exact unbuilt Icon size without inventing a Figma asset", async () => {
    const result = await client.callTool({
      arguments: {
        assetId: "icon/check",
        variantSelections: { size: "large" },
      },
      name: HATCHKIT_COMPONENT_RESOLVE_TOOL_NAME,
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      data: {
        contract: { profile: "icon-v1" },
        nextAction: "verify-approval-then-ensure-library-asset",
        selectedVariant: { id: "size-large" },
        sources: {
          contractSourcePath: "components/icon-check.component.json",
          registrySourcePath: "registry/icons.registry.json",
        },
        status: "ensure-required",
        variantSelections: { size: "large" },
      },
      ok: true,
    });
    expect(resultWarnings(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "APPROVAL_GUARD_REQUIRED" }),
        expect.objectContaining({ code: "FIGMA_ENSURE_REQUIRED" }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("nodeId");
  });

  it("returns the original Not Found failure from exact Resolve", async () => {
    const result = await client.callTool({
      arguments: { assetId: "select" },
      name: HATCHKIT_COMPONENT_RESOLVE_TOOL_NAME,
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(JSON.stringify(result)).toContain("IDENTITY_NOT_FOUND");
    expect(JSON.stringify(result)).not.toContain(WORKSPACE_ROOT);
  });

  it("creates a deterministic proposed request for a missing Component", async () => {
    const input = { assetId: "select", submission: SUBMISSION };
    const first = await client.callTool({
      arguments: input,
      name: HATCHKIT_COMPONENT_CHANGE_REQUEST_TOOL_NAME,
    });
    const second = await client.callTool({
      arguments: input,
      name: HATCHKIT_COMPONENT_CHANGE_REQUEST_TOOL_NAME,
    });

    expect(first).toEqual(second);
    expect(first.structuredContent).toMatchObject({
      data: {
        changeRequest: {
          changeKind: "create-component",
          existingCandidates: [],
          nextAction: "human-triage",
          prohibitedActions: COMPONENT_CHANGE_REQUEST_PROHIBITED_ACTIONS,
          requestId: SUBMISSION.requestId,
          status: "proposed",
          target: { assetId: "select", requestedVersion: null },
        },
        outcome: "change-request-required",
      },
      ok: true,
    });
    expect(JSON.stringify(first)).not.toContain("nodeId");
    expect(JSON.stringify(first)).not.toContain("componentSetKey");
    expect(JSON.stringify(first)).not.toContain("writerCommand");
  });

  it("creates an extension request with exact Variant evidence", async () => {
    const result = await client.callTool({
      arguments: {
        assetId: "button",
        assetVersion: "1.0.0",
        submission: {
          ...SUBMISSION,
          requestId: "00000000-0000-4000-8000-000000000031",
        },
        variantSelections: { appearance: "tertiary", state: "default" },
      },
      name: HATCHKIT_COMPONENT_CHANGE_REQUEST_TOOL_NAME,
    });

    expect(result.structuredContent).toMatchObject({
      data: {
        changeRequest: {
          changeKind: "extend-component",
          existingCandidates: [
            {
              asset: { id: "button", version: "1.0.0" },
              sources: {
                contractSourcePath: "components/button.component.json",
                registrySourcePath: "registry/components.registry.json",
              },
            },
          ],
          resolutionEvidence: {
            errorCode: "VALIDATION_FAILED",
            issues: [
              {
                code: "unsupported_variant_option",
                path: "/variantSelections/appearance",
              },
            ],
          },
        },
        outcome: "change-request-required",
      },
      ok: true,
    });
    expect(JSON.stringify(result)).not.toContain("fileBindingId");
    expect(JSON.stringify(result)).not.toContain("nodeId");
  });

  it("returns resolved when the requested capability already exists", async () => {
    const result = await client.callTool({
      arguments: { assetId: "button", submission: SUBMISSION },
      name: HATCHKIT_COMPONENT_CHANGE_REQUEST_TOOL_NAME,
    });

    expect(result.structuredContent).toMatchObject({
      data: {
        outcome: "resolved",
        resolution: { status: "figma-ready" },
      },
      ok: true,
    });
    expect(JSON.stringify(result)).not.toContain("change-request-required");
  });

  it("rejects invalid caller-supplied request identity before execution", async () => {
    const result = await client.callTool({
      arguments: {
        assetId: "select",
        submission: { ...SUBMISSION, requestId: "server-generate-one" },
      },
      name: HATCHKIT_COMPONENT_CHANGE_REQUEST_TOOL_NAME,
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(JSON.stringify(result)).toContain("Input validation error");
  });
});

import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import type {
  WriterCommandEnvelope,
  WriterSuccessResult,
} from "@agent-design-system-kit/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HATCHKIT_COMPONENT_CHANGE_REQUEST_TOOL_NAME,
  HATCHKIT_COMPONENT_RESOLVE_TOOL_NAME,
} from "./resolution-tools.js";
import {
  HATCHKIT_BRIEF_QUERY_TOOL_NAME,
  HATCHKIT_COMPONENT_SEARCH_TOOL_NAME,
  HATCHKIT_DIRECTION_QUERY_TOOL_NAME,
  HATCHKIT_TOKEN_QUERY_TOOL_NAME,
} from "./query-tools.js";
import {
  WRITER_OPERATION_SCHEMA_VERSION,
  type WriterOperation,
} from "./writer-queue.js";
import {
  HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
  HATCHKIT_COMPONENT_AUDIT_TOOL_NAME,
  HATCHKIT_COMPONENT_ENSURE_TOOL_NAME,
  HATCHKIT_ICON_INSTANCE_INSERT_TOOL_NAME,
  HATCHKIT_INPUT_INSTANCE_INSERT_TOOL_NAME,
  HATCHKIT_VARIABLES_ENSURE_TOOL_NAME,
  HATCHKIT_REGISTRY_DRIFT_AUDIT_TOOL_NAME,
  HATCHKIT_STYLE_AUDIT_TOOL_NAME,
} from "./write-tools.js";
import {
  HATCHKIT_MCP_SERVER_INSTRUCTIONS,
  HATCHKIT_MCP_SERVER_NAME,
  HATCHKIT_MCP_SERVER_VERSION,
  HATCHKIT_STATUS_TOOL_NAME,
  createHatchkitMcpServer,
  type HatchkitMcpServerOptions,
} from "./server.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
const clients: Client[] = [];
const servers: ReturnType<typeof createHatchkitMcpServer>[] = [];

function resultForWriterCommand(
  command: WriterCommandEnvelope,
): WriterSuccessResult {
  switch (command.command.type) {
    case "variables.ensure":
      return {
        collection: {
          action: "created",
          stableId: command.command.payload.plan.collection.stableId,
        },
        deferredTypographyCount:
          command.command.payload.plan.deferredTypography.length,
        type: command.command.type,
        variables: { created: 30, unchanged: 0, updated: 0 },
      };
    case "components.button.ensure":
      return {
        componentSet: {
          action: "created",
          nodeId: "100:200",
          stableId: command.command.payload.plan.componentSet.stableId,
        },
        labelPropertyName: "Label#100:201",
        type: command.command.type,
        typography: {
          lineHeightStrategy: "resolved-percent",
          variableBindings: 4,
        },
        variants: { created: 4, unchanged: 0, updated: 0 },
      };
    case "instances.button.insert":
      return {
        componentSet: {
          nodeId: "100:200",
          stableId: "hatch-demo/component/button/component-set/major-1",
        },
        instance: {
          action: "created",
          nodeId: "300:400",
          stableId: "hatch-demo/instance/settings/save-button",
        },
        type: command.command.type,
        variant: {
          stableId:
            "hatch-demo/component/button/component-set/major-1/variant/appearance-secondary/state-disabled",
        },
      };
    default:
      throw new Error(`Unexpected Writer command '${command.command.type}'.`);
  }
}

function operationForWriterCommand(
  command: WriterCommandEnvelope,
): WriterOperation {
  return {
    attempt: 1,
    commandFingerprint: `sha256:${"a".repeat(64)}`,
    commandType: command.command.type,
    completedAt: "2026-09-01T20:00:01.000Z",
    dispatchedAt: "2026-09-01T20:00:00.500Z",
    idempotencyKeyHash: `sha256:${"b".repeat(64)}`,
    operationId: command.operationId,
    projectId: command.projectId,
    queuedAt: "2026-09-01T20:00:00.000Z",
    result: resultForWriterCommand(command),
    schemaVersion: WRITER_OPERATION_SCHEMA_VERSION,
    status: "succeeded",
    targetStableId: command.target.stableId,
  };
}

async function connect(options: HatchkitMcpServerOptions): Promise<Client> {
  const server = createHatchkitMcpServer(options);
  const client = new Client({ name: "hatchkit-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  servers.push(server);
  clients.push(client);
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map((client) => client.close()));
  await Promise.allSettled(servers.splice(0).map((server) => server.close()));
});

describe("createHatchkitMcpServer", () => {
  it("advertises stable identity, instructions, and only read-only tools", async () => {
    const client = await connect({
      designSystemRoot: resolve(WORKSPACE_ROOT, "design-system/hatch-demo"),
      expectedProjectId: "hatch-demo",
    });

    expect(client.getServerVersion()).toEqual({
      name: HATCHKIT_MCP_SERVER_NAME,
      version: HATCHKIT_MCP_SERVER_VERSION,
    });
    expect(client.getInstructions()).toBe(HATCHKIT_MCP_SERVER_INSTRUCTIONS);
    expect(HATCHKIT_MCP_SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(512);
    const tools = await client.listTools();
    expect(tools.tools.map(({ name }) => name)).toEqual([
      HATCHKIT_STATUS_TOOL_NAME,
      HATCHKIT_BRIEF_QUERY_TOOL_NAME,
      HATCHKIT_DIRECTION_QUERY_TOOL_NAME,
      HATCHKIT_TOKEN_QUERY_TOOL_NAME,
      HATCHKIT_COMPONENT_SEARCH_TOOL_NAME,
      HATCHKIT_COMPONENT_RESOLVE_TOOL_NAME,
      HATCHKIT_COMPONENT_CHANGE_REQUEST_TOOL_NAME,
    ]);
    for (const tool of tools.tools) {
      expect(tool).toEqual(
        expect.objectContaining({
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
          },
        }),
      );
    }
    expect(tools.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
          },
          name: HATCHKIT_STATUS_TOOL_NAME,
          title: "Check Hatchkit status",
        }),
      ]),
    );
  });

  it("validates the real catalog through the status tool", async () => {
    const client = await connect({
      designSystemRoot: resolve(WORKSPACE_ROOT, "design-system/hatch-demo"),
      expectedProjectId: "hatch-demo",
    });
    await client.listTools();

    const result = await client.callTool({
      arguments: {},
      name: HATCHKIT_STATUS_TOOL_NAME,
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      data: {
        catalog: {
          counts: {
            briefs: 1,
            components: 3,
            directions: 1,
            registries: 3,
            tokenSets: 3,
          },
          projectId: "hatch-demo",
          sources: [
            "briefs/hatch-demo.brief.json",
            "components/button.component.json",
            "components/icon-check.component.json",
            "components/input-text.component.json",
            "directions/hatch-demo.direction-review.json",
            "registry/components.registry.json",
            "registry/icons.registry.json",
            "registry/inputs.registry.json",
            "tokens/button-foundation.tokens.json",
            "tokens/icon-foundation.tokens.json",
            "tokens/input-foundation.tokens.json",
          ],
        },
        server: {
          access: "read-only",
          name: "hatchkit",
          transport: "stdio",
          version: HATCHKIT_MCP_SERVER_VERSION,
        },
        status: "ready",
      },
      ok: true,
      schemaVersion: "1.0.0",
      warnings: [],
    });
  });

  it("exposes and calls governed library and Instance Tools only with a local Writer", async () => {
    const requestId = "2c73620e-29b0-4285-8861-1a65b18f11dc";
    const execute = vi.fn((command: WriterCommandEnvelope) =>
      Promise.resolve({
        data: operationForWriterCommand(command),
        ok: true as const,
        schemaVersion: "1.0.0" as const,
        warnings: [],
      }),
    );
    const client = await connect({
      designSystemRoot: resolve(WORKSPACE_ROOT, "design-system/hatch-demo"),
      expectedProjectId: "hatch-demo",
      writer: { execute },
    });
    const tools = await client.listTools();
    expect(
      tools.tools.find(({ name }) => name === HATCHKIT_STYLE_AUDIT_TOOL_NAME),
    ).toMatchObject({
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
    });
    expect(
      tools.tools.find(
        ({ name }) => name === HATCHKIT_COMPONENT_AUDIT_TOOL_NAME,
      ),
    ).toMatchObject({
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
    });
    expect(
      tools.tools.find(
        ({ name }) => name === HATCHKIT_REGISTRY_DRIFT_AUDIT_TOOL_NAME,
      ),
    ).toMatchObject({
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
    });
    expect(
      tools.tools.find(
        ({ name }) => name === HATCHKIT_ICON_INSTANCE_INSERT_TOOL_NAME,
      ),
    ).toMatchObject({
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
    });
    expect(
      tools.tools.find(
        ({ name }) => name === HATCHKIT_INPUT_INSTANCE_INSERT_TOOL_NAME,
      ),
    ).toMatchObject({
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
    });
    for (const name of [
      HATCHKIT_VARIABLES_ENSURE_TOOL_NAME,
      HATCHKIT_COMPONENT_ENSURE_TOOL_NAME,
    ]) {
      expect(tools.tools.find((tool) => tool.name === name)).toMatchObject({
        annotations: {
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
          readOnlyHint: false,
        },
      });
    }
    expect(tools.tools.at(-1)).toMatchObject({
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      name: HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
    });
    const status = await client.callTool({
      arguments: {},
      name: HATCHKIT_STATUS_TOOL_NAME,
    });
    expect(status.structuredContent).toMatchObject({
      data: { server: { access: "writer-enabled" } },
    });

    const variables = await client.callTool({
      arguments: {
        assetId: "button-foundation",
        assetVersion: "1.0.0",
        requestId: "0c73620e-29b0-4285-8861-1a65b18f11dc",
        waitTimeoutMs: 5_000,
      },
      name: HATCHKIT_VARIABLES_ENSURE_TOOL_NAME,
    });
    expect(variables.isError).not.toBe(true);
    expect(variables.structuredContent).toMatchObject({
      data: { status: "ensured" },
      ok: true,
    });

    const component = await client.callTool({
      arguments: {
        assetId: "button",
        assetVersion: "1.0.0",
        requestId: "1c73620e-29b0-4285-8861-1a65b18f11dc",
        waitTimeoutMs: 5_000,
      },
      name: HATCHKIT_COMPONENT_ENSURE_TOOL_NAME,
    });
    expect(component.isError).not.toBe(true);
    expect(component.structuredContent).toMatchObject({
      data: {
        resolution: { commandType: "components.button.ensure" },
        status: "ensured",
      },
      ok: true,
    });
    expect(execute).toHaveBeenCalledTimes(2);

    const unbuiltIcon = await client.callTool({
      arguments: {
        assetId: "icon/check",
        instanceId: "settings/check-icon",
        requestId: "3c73620e-29b0-4285-8861-1a65b18f11dc",
        variantSelections: { size: "medium" },
        waitTimeoutMs: 5_000,
        x: 280,
        y: 240,
      },
      name: HATCHKIT_ICON_INSTANCE_INSERT_TOOL_NAME,
    });
    expect(unbuiltIcon.isError).toBe(true);
    expect(JSON.stringify(unbuiltIcon)).toContain("IDENTITY_NOT_FOUND");
    expect(execute).toHaveBeenCalledTimes(2);

    const unbuiltInput = await client.callTool({
      arguments: {
        assetId: "input/text",
        instanceId: "settings/email",
        label: "Email address",
        requestId: "4c73620e-29b0-4285-8861-1a65b18f11dc",
        supportingText: "Use your work email address.",
        text: "alex@example.com",
        variantSelections: { content: "filled", state: "default" },
        waitTimeoutMs: 5_000,
        x: 320,
        y: 320,
      },
      name: HATCHKIT_INPUT_INSTANCE_INSERT_TOOL_NAME,
    });
    expect(unbuiltInput.isError).toBe(true);
    expect(JSON.stringify(unbuiltInput)).toContain("IDENTITY_NOT_FOUND");
    expect(execute).toHaveBeenCalledTimes(2);

    const result = await client.callTool({
      arguments: {
        assetId: "button",
        instanceId: "settings/save-button",
        label: "Save changes",
        requestId,
        variantSelections: { appearance: "secondary", state: "disabled" },
        waitTimeoutMs: 5_000,
        x: 320,
        y: 240,
      },
      name: HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      data: {
        operation: { instanceNodeId: "300:400", status: "succeeded" },
        status: "inserted",
      },
      ok: true,
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("returns a tool-level failure without leaking an invalid absolute root", async () => {
    const missingRoot = resolve(WORKSPACE_ROOT, "private-missing-catalog");
    const client = await connect({
      designSystemRoot: missingRoot,
      expectedProjectId: "hatch-demo",
    });

    const result = await client.callTool({
      arguments: {},
      name: HATCHKIT_STATUS_TOOL_NAME,
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(JSON.stringify(result)).toContain("IDENTITY_NOT_FOUND");
    expect(JSON.stringify(result)).not.toContain(missingRoot);
  });
});

import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";

import {
  HATCHKIT_COMPONENT_CHANGE_REQUEST_TOOL_NAME,
  HATCHKIT_COMPONENT_RESOLVE_TOOL_NAME,
} from "./resolution-tools.js";
import {
  HATCHKIT_BRIEF_QUERY_TOOL_NAME,
  HATCHKIT_COMPONENT_SEARCH_TOOL_NAME,
  HATCHKIT_TOKEN_QUERY_TOOL_NAME,
} from "./query-tools.js";
import {
  WRITER_OPERATION_SCHEMA_VERSION,
  type WriterOperation,
} from "./writer-queue.js";
import { HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME } from "./write-tools.js";
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
            components: 1,
            registries: 1,
            tokenSets: 1,
          },
          projectId: "hatch-demo",
          sources: [
            "briefs/hatch-demo.brief.json",
            "components/button.component.json",
            "registry/components.registry.json",
            "tokens/button-foundation.tokens.json",
          ],
        },
        server: {
          access: "read-only",
          name: "hatchkit",
          transport: "stdio",
          version: "0.0.0",
        },
        status: "ready",
      },
      ok: true,
      schemaVersion: "1.0.0",
      warnings: [],
    });
  });

  it("exposes one additive write Tool only when a local Writer is configured", async () => {
    const requestId = "2c73620e-29b0-4285-8861-1a65b18f11dc";
    const operation: WriterOperation = {
      attempt: 1,
      commandFingerprint: `sha256:${"a".repeat(64)}`,
      commandType: "instances.button.insert",
      completedAt: "2026-09-01T20:00:01.000Z",
      dispatchedAt: "2026-09-01T20:00:00.500Z",
      idempotencyKeyHash: `sha256:${"b".repeat(64)}`,
      operationId: requestId,
      projectId: "hatch-demo",
      queuedAt: "2026-09-01T20:00:00.000Z",
      result: {
        componentSet: {
          nodeId: "100:200",
          stableId: "hatch-demo/component/button/component-set/major-1",
        },
        instance: {
          action: "created",
          nodeId: "300:400",
          stableId: "hatch-demo/instance/settings/save-button",
        },
        type: "instances.button.insert",
        variant: {
          stableId:
            "hatch-demo/component/button/component-set/major-1/variant/appearance-secondary/state-disabled",
        },
      },
      schemaVersion: WRITER_OPERATION_SCHEMA_VERSION,
      status: "succeeded",
      targetStableId: "hatch-demo/figma-file/library",
    };
    const client = await connect({
      designSystemRoot: resolve(WORKSPACE_ROOT, "design-system/hatch-demo"),
      expectedProjectId: "hatch-demo",
      writer: {
        execute: () =>
          Promise.resolve({
            data: operation,
            ok: true,
            schemaVersion: "1.0.0",
            warnings: [],
          }),
      },
    });
    const tools = await client.listTools();
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

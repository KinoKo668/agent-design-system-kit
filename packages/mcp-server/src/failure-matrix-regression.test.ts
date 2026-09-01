import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
  WRITER_PROTOCOL_SCHEMA_VERSION,
  type FigmaButtonInstancePlan,
} from "@agent-design-system-kit/core";
import { afterEach, describe, expect, it } from "vitest";

import { createFigmaBridge, type FigmaBridge } from "./figma-bridge.js";
import { createLocalWriterClient } from "./local-writer-client.js";
import { createHatchkitMcpServer } from "./server.js";
import { HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME } from "./write-tools.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
const SESSION_TOKEN = "qa002-local-session-token-32-characters";
const PLUGIN_INSTANCE_ID = "90000000-0000-4000-8000-000000000001";
const DISCONNECTED_REQUEST_ID = "90000000-0000-4000-8000-000000000002";
const REPLAY_REQUEST_ID = "90000000-0000-4000-8000-000000000003";

const clients: Client[] = [];
const servers: ReturnType<typeof createHatchkitMcpServer>[] = [];
const bridges: FigmaBridge[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map((client) => client.close()));
  await Promise.allSettled(servers.splice(0).map((server) => server.close()));
  await Promise.allSettled(bridges.splice(0).map((bridge) => bridge.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function harness(options: { readonly fastTimeout: boolean }) {
  const operationDirectory = await mkdtemp(join(tmpdir(), "hatchkit-qa002-"));
  temporaryDirectories.push(operationDirectory);
  const bridge = createFigmaBridge({
    authorizeWrite: () => null,
    leaseMs: 100,
    longPollMs: options.fastTimeout ? 20 : 2_000,
    operationDirectory,
    port: 0,
    sessionToken: SESSION_TOKEN,
  });
  bridges.push(bridge);
  const address = await bridge.start();
  let monotonic = 0;
  const writer = createLocalWriterClient({
    ...(options.fastTimeout
      ? {
          nowMonotonicMs: () => {
            monotonic += 1_000;
            return monotonic;
          },
          pollIntervalMs: 1,
          wait: () => Promise.resolve(),
        }
      : { pollIntervalMs: 2 }),
    sessionToken: SESSION_TOKEN,
    url: address.url,
  });
  const server = createHatchkitMcpServer({
    designSystemRoot: resolve(WORKSPACE_ROOT, "design-system/hatch-demo"),
    expectedProjectId: "hatch-demo",
    writer,
  });
  const client = new Client({
    name: "hatchkit-failure-matrix",
    version: "1.0.0",
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  servers.push(server);
  clients.push(client);
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { address, bridge, client };
}

function insertArguments(requestId: string) {
  return {
    assetId: "button",
    instanceId: "qa/failure-matrix/submit",
    label: "Continue",
    requestId,
    variantSelections: { appearance: "primary", state: "default" },
    waitTimeoutMs: 1_000,
    x: 100,
    y: 200,
  };
}

async function post(url: string, path: string, body: unknown) {
  const response = await fetch(`${url}${path}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${SESSION_TOKEN}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  return { body: await response.json(), status: response.status };
}

describe("QA-002 system failure matrix", () => {
  it("blocks missing, disconnected, replayed, and conflicting intents before Plugin dispatch", async () => {
    const { bridge, client } = await harness({ fastTimeout: true });

    const missing = await client.callTool({
      arguments: {
        ...insertArguments(DISCONNECTED_REQUEST_ID),
        assetId: "missing-button",
      },
      name: HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
    });
    expect(missing.isError).toBe(true);
    expect(JSON.stringify(missing)).toContain("IDENTITY_NOT_FOUND");
    expect(bridge.snapshot().queue.operations).toHaveLength(0);

    const disconnected = await client.callTool({
      arguments: insertArguments(DISCONNECTED_REQUEST_ID),
      name: HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
    });
    expect(disconnected.isError).toBe(true);
    expect(JSON.stringify(disconnected)).toContain("OPERATION_TIMEOUT");
    expect(bridge.snapshot()).toMatchObject({
      pluginConnected: false,
      queue: {
        inFlightOperationId: null,
        operations: [
          {
            attempt: 0,
            operationId: DISCONNECTED_REQUEST_ID,
            status: "queued",
          },
        ],
        queuedOperationIds: [DISCONNECTED_REQUEST_ID],
      },
    });

    const exactRetry = await client.callTool({
      arguments: insertArguments(DISCONNECTED_REQUEST_ID),
      name: HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
    });
    expect(exactRetry.isError).toBe(true);
    expect(JSON.stringify(exactRetry)).toContain("OPERATION_TIMEOUT");
    expect(bridge.snapshot().queue.operations).toHaveLength(1);

    const conflict = await client.callTool({
      arguments: {
        ...insertArguments(DISCONNECTED_REQUEST_ID),
        label: "A different intent",
      },
      name: HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
    });
    expect(conflict.isError).toBe(true);
    expect(JSON.stringify(conflict)).toContain("IDEMPOTENCY_CONFLICT");
    const finalSnapshot = bridge.snapshot();
    expect(finalSnapshot.queue.operations).toHaveLength(1);
    expect(finalSnapshot.queue.operations[0]).toMatchObject({
      attempt: 0,
      status: "queued",
    });
    expect(finalSnapshot.queue.inFlightOperationId).toBeNull();
  });

  it("delivers one Figma command for an exact successful replay and rejects later intent drift", async () => {
    const { address, bridge, client } = await harness({ fastTimeout: false });
    await post(address.url, "/v1/plugin/connect", {
      context: { fileName: "QA-002", pageName: "Golden Failure Matrix" },
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
      transport: "http",
    });
    const next = post(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    const firstCall = client.callTool({
      arguments: {
        ...insertArguments(REPLAY_REQUEST_ID),
        waitTimeoutMs: 5_000,
      },
      name: HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
    });
    const delivery = await next;
    expect(delivery.status).toBe(200);
    const delivered = delivery.body as {
      data: {
        command: {
          command: {
            payload: { plan: FigmaButtonInstancePlan };
            type: "instances.button.insert";
          };
          operationId: string;
        };
      };
    };
    const command = delivered.data.command;
    const plan = command.command.payload.plan;
    const reported = await post(address.url, "/v1/plugin/results", {
      ok: true,
      operationId: command.operationId,
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: {
        componentSet: {
          nodeId: plan.componentSet.nodeId,
          stableId: plan.componentSet.stableId,
        },
        instance: {
          action: "created",
          nodeId: "400:500",
          stableId: plan.instance.stableId,
        },
        type: "instances.button.insert",
        variant: { stableId: plan.selectedVariant.stableId },
      },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(reported.status).toBe(202);
    const first = await firstCall;
    expect(first.isError).not.toBe(true);

    const replay = await client.callTool({
      arguments: {
        ...insertArguments(REPLAY_REQUEST_ID),
        waitTimeoutMs: 5_000,
      },
      name: HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
    });
    expect(replay.structuredContent).toEqual(first.structuredContent);
    expect(bridge.snapshot()).toMatchObject({
      pluginConnected: true,
      queue: {
        inFlightOperationId: null,
        operations: [
          {
            attempt: 1,
            operationId: REPLAY_REQUEST_ID,
            status: "succeeded",
          },
        ],
        queuedOperationIds: [],
      },
    });

    const conflict = await client.callTool({
      arguments: {
        ...insertArguments(REPLAY_REQUEST_ID),
        label: "Changed after success",
        waitTimeoutMs: 5_000,
      },
      name: HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
    });
    expect(conflict.isError).toBe(true);
    expect(JSON.stringify(conflict)).toContain("IDEMPOTENCY_CONFLICT");
    expect(bridge.snapshot().queue.operations).toHaveLength(1);
    expect(bridge.snapshot().queue.operations[0]?.attempt).toBe(1);
  });
});

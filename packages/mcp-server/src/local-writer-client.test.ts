import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WRITER_PROTOCOL_SCHEMA_VERSION } from "@agent-design-system-kit/core";
import { afterEach, describe, expect, it } from "vitest";

import { createFigmaBridge, type FigmaBridge } from "./figma-bridge.js";
import { createLocalWriterClient } from "./local-writer-client.js";

const SESSION_TOKEN = "loop002-test-session-token-32-characters";
const PLUGIN_INSTANCE_ID = "c45c06e8-80ae-4478-ad55-9c49c60ecc56";
const OPERATION_ID = "2c73620e-29b0-4285-8861-1a65b18f11dc";
const bridges: FigmaBridge[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function ping() {
  return {
    approval: {
      mode: "not_required" as const,
      reason: "read_only_diagnostic" as const,
    },
    command: { payload: {}, type: "writer.ping" as const },
    idempotencyKey: `ping:${OPERATION_ID}`,
    operationId: OPERATION_ID,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "hatchkit-mcp" },
    target: {
      kind: "plugin-session" as const,
      stableId: "hatch-demo/plugin-session",
    },
  };
}

async function startBridge() {
  const operationDirectory = await mkdtemp(join(tmpdir(), "loop002-bridge-"));
  temporaryDirectories.push(operationDirectory);
  const bridge = createFigmaBridge({
    leaseMs: 100,
    longPollMs: 20,
    operationDirectory,
    port: 0,
    sessionToken: SESSION_TOKEN,
  });
  bridges.push(bridge);
  return bridge.start();
}

async function post(url: string, path: string, body: unknown) {
  return fetch(`${url}${path}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${SESSION_TOKEN}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
}

describe("local Writer client", () => {
  it("submits, waits, and validates a terminal Bridge result", async () => {
    const address = await startBridge();
    await post(address.url, "/v1/plugin/connect", {
      context: { fileName: "Loop Contract", pageName: "Page 1" },
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
      transport: "http",
    });
    const client = createLocalWriterClient({
      pollIntervalMs: 5,
      sessionToken: SESSION_TOKEN,
      url: address.url,
    });

    const executing = client.execute(ping(), { timeoutMs: 2_000 });
    const deliveryResponse = await post(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    const delivery = (await deliveryResponse.json()) as {
      data: { command: { operationId: string } };
    };
    await post(address.url, "/v1/plugin/results", {
      ok: true,
      operationId: delivery.data.command.operationId,
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: { pong: true },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });

    await expect(executing).resolves.toMatchObject({
      data: {
        operationId: OPERATION_ID,
        result: { pong: true },
        status: "succeeded",
      },
      ok: true,
    });
  });

  it("returns a resumable timeout when no Plugin completes the operation", async () => {
    const address = await startBridge();
    const client = createLocalWriterClient({
      pollIntervalMs: 1,
      sessionToken: SESSION_TOKEN,
      url: address.url,
    });

    const result = await client.execute(ping(), { timeoutMs: 5 });

    expect(result).toMatchObject({
      error: {
        code: "OPERATION_TIMEOUT",
        recovery: { retry: "retry_same_request" },
        target: { logicalId: OPERATION_ID },
      },
      ok: false,
    });
  });

  it("allows only an authenticated loopback origin", () => {
    expect(() =>
      createLocalWriterClient({
        sessionToken: SESSION_TOKEN,
        url: "https://example.com",
      }),
    ).toThrow("127.0.0.1");
    expect(() => createLocalWriterClient({ sessionToken: "short" })).toThrow(
      "32 to 256",
    );
    expect(() =>
      createLocalWriterClient({
        sessionToken: SESSION_TOKEN,
        url: `http://127.0.0.1:38451/?token=${SESSION_TOKEN}`,
      }),
    ).toThrow("without credentials");
  });

  it("does not expose credentials in transport failures", async () => {
    const client = createLocalWriterClient({
      fetch: () => Promise.reject(new Error(SESSION_TOKEN)),
      sessionToken: SESSION_TOKEN,
    });
    const result = await client.execute(ping(), { timeoutMs: 5 });

    expect(result).toMatchObject({
      error: { code: "TRANSPORT_UNAVAILABLE" },
      ok: false,
    });
    expect(JSON.stringify(result)).not.toContain(SESSION_TOKEN);
  });
});

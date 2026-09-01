import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WRITER_PROTOCOL_SCHEMA_VERSION } from "@agent-design-system-kit/core";
import { afterEach, describe, expect, it } from "vitest";

import { createFigmaBridge, type FigmaBridge } from "./figma-bridge.js";

const SESSION_TOKEN = "fig002-test-session-token-32-chars-minimum";
const PLUGIN_INSTANCE_ID = "c45c06e8-80ae-4478-ad55-9c49c60ecc56";
const OTHER_PLUGIN_INSTANCE_ID = "fc11eead-06a5-4818-abec-2d140a948e94";
const OPERATION_IDS = [
  "2c73620e-29b0-4285-8861-1a65b18f11dc",
  "ae8ee112-0337-4168-93fe-b7b04fa1367e",
  "77f50469-046a-460c-8336-c4dc010e4773",
] as const;

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

async function startBridge(
  overrides: Partial<Parameters<typeof createFigmaBridge>[0]> = {},
) {
  const operationDirectory = await mkdtemp(
    join(tmpdir(), "hatchkit-figma-bridge-"),
  );
  temporaryDirectories.push(operationDirectory);
  const bridge = createFigmaBridge({
    leaseMs: 100,
    longPollMs: 20,
    operationDirectory,
    port: 0,
    sessionToken: SESSION_TOKEN,
    ...overrides,
  });
  bridges.push(bridge);
  const address = await bridge.start();
  return { address, bridge, operationDirectory };
}

function command(
  operationId: string,
  idempotencyKey = `key-${operationId}`,
  projectId = "hatch-demo",
) {
  return {
    approval: {
      mode: "not_required",
      reason: "read_only_diagnostic",
    },
    command: { payload: {}, type: "writer.ping" },
    idempotencyKey,
    operationId,
    projectId,
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      kind: "plugin-session",
      stableId: `${projectId}/plugin-session`,
    },
  };
}

function hello(pluginInstanceId = PLUGIN_INSTANCE_ID) {
  return {
    context: { fileName: "Bridge Contract", pageName: "Page 1" },
    pluginInstanceId,
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    transport: "http",
  };
}

async function request(
  url: string,
  path: string,
  body: unknown,
  options: { authorization?: string; contentType?: string } = {},
) {
  const response = await fetch(`${url}${path}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: options.authorization ?? `Bearer ${SESSION_TOKEN}`,
      "content-type": options.contentType ?? "application/json",
    },
    method: "POST",
  });
  return {
    body:
      response.status === 204
        ? null
        : (JSON.parse(await response.text()) as unknown),
    response,
  };
}

describe("local Figma Bridge", () => {
  it("exposes a non-sensitive health check and rejects unsafe authentication", async () => {
    const { address } = await startBridge();
    const healthResponse = await fetch(`${address.url}/v1/health`);
    const health = JSON.parse(await healthResponse.text()) as unknown;
    expect(healthResponse.status).toBe(200);
    expect(health).toMatchObject({
      data: {
        inFlight: false,
        pluginConnected: false,
        queued: 0,
        sessionExpired: false,
      },
      ok: true,
      schemaVersion: "1.0.0",
      warnings: [],
    });
    expect(JSON.stringify(health)).not.toContain(SESSION_TOKEN);

    const missing = await fetch(`${address.url}/v1/plugin/connect`, {
      body: JSON.stringify(hello()),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(missing.status).toBe(401);
    expect(await missing.text()).toContain("CREDENTIAL_REQUIRED");

    const invalid = await request(address.url, "/v1/plugin/connect", hello(), {
      authorization: "Bearer incorrect-session-token-value",
    });
    expect(invalid.response.status).toBe(401);
    expect(invalid.body).toMatchObject({
      error: { code: "CREDENTIAL_INVALID" },
      ok: false,
    });

    const query = await fetch(
      `${address.url}/v1/plugin/connect?token=${SESSION_TOKEN}`,
      { method: "POST" },
    );
    expect(query.status).toBe(400);
    expect(await query.text()).toContain("UNSAFE_CREDENTIAL_SOURCE");
  });

  it("allows exactly one Plugin owner and binds results to that instance", async () => {
    const { address } = await startBridge();
    const connected = await request(address.url, "/v1/plugin/connect", hello());
    expect(connected.response.status).toBe(200);
    expect(connected.body).toMatchObject({
      data: { pluginInstanceId: PLUGIN_INSTANCE_ID, transport: "http" },
      ok: true,
    });

    const conflict = await request(
      address.url,
      "/v1/plugin/connect",
      hello(OTHER_PLUGIN_INSTANCE_ID),
    );
    expect(conflict.response.status).toBe(409);
    expect(conflict.body).toMatchObject({
      error: { code: "IDENTITY_CONFLICT" },
      ok: false,
    });

    await request(address.url, "/v1/operations", command(OPERATION_IDS[0]));
    await request(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    const foreignResult = await request(address.url, "/v1/plugin/results", {
      ok: true,
      operationId: OPERATION_IDS[0],
      pluginInstanceId: OTHER_PLUGIN_INSTANCE_ID,
      result: { pong: true },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(foreignResult.response.status).toBe(409);
    expect(foreignResult.body).toMatchObject({
      error: { code: "IDENTITY_CONFLICT" },
      ok: false,
    });
  });

  it("dispatches FIFO with one in-flight command and accepts an idempotent result replay", async () => {
    const { address } = await startBridge();
    await request(address.url, "/v1/plugin/connect", hello());
    await request(address.url, "/v1/operations", command(OPERATION_IDS[0]));
    await request(address.url, "/v1/operations", command(OPERATION_IDS[1]));

    const first = await request(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(first.body).toMatchObject({
      data: {
        command: { attempt: 1, operationId: OPERATION_IDS[0] },
      },
      ok: true,
    });

    const blocked = await request(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(blocked.response.status).toBe(204);

    const result = {
      ok: true,
      operationId: OPERATION_IDS[0],
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: { pong: true },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    };
    const accepted = await request(address.url, "/v1/plugin/results", result);
    expect(accepted.response.status).toBe(202);
    expect(accepted.body).toMatchObject({
      data: { operation: { status: "succeeded" }, replayed: false },
      ok: true,
    });
    const replay = await request(address.url, "/v1/plugin/results", result);
    expect(replay.response.status).toBe(200);
    expect(replay.body).toMatchObject({ data: { replayed: true }, ok: true });

    const second = await request(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(second.body).toMatchObject({
      data: { command: { operationId: OPERATION_IDS[1] } },
      ok: true,
    });
  });

  it("replays matching idempotency and rejects conflicting command reuse", async () => {
    const { address } = await startBridge();
    const first = await request(
      address.url,
      "/v1/operations",
      command(OPERATION_IDS[0], "same-key"),
    );
    expect(first.response.status).toBe(202);
    expect(first.body).toMatchObject({
      data: { idempotentReplay: false },
      ok: true,
    });

    const replay = await request(
      address.url,
      "/v1/operations",
      command(OPERATION_IDS[1], "same-key"),
    );
    expect(replay.response.status).toBe(200);
    expect(replay.body).toMatchObject({
      data: {
        idempotentReplay: true,
        operation: { operationId: OPERATION_IDS[0] },
      },
      ok: true,
    });

    const conflict = await request(
      address.url,
      "/v1/operations",
      command(OPERATION_IDS[2], "same-key", "another-project"),
    );
    expect(conflict.response.status).toBe(409);
    expect(conflict.body).toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
      ok: false,
    });
  });

  it("releases the Writer on expiry and invalidates an explicit disconnect", async () => {
    let monotonic = 0;
    const { address, bridge } = await startBridge({
      nowMonotonicMs: () => monotonic,
      sessionTtlMs: 100,
    });
    await request(address.url, "/v1/plugin/connect", hello());
    await request(address.url, "/v1/operations", command(OPERATION_IDS[0]));
    await request(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    monotonic = 101;

    const expired = await request(address.url, "/v1/operations/get", {
      operationId: OPERATION_IDS[0],
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(expired.response.status).toBe(401);
    expect(expired.body).toMatchObject({
      error: { code: "CREDENTIAL_EXPIRED" },
      ok: false,
    });
    expect(bridge.snapshot()).toMatchObject({
      pluginConnected: false,
      queue: {
        inFlightOperationId: null,
        queuedOperationIds: [OPERATION_IDS[0]],
      },
      sessionExpired: true,
    });

    const fresh = await startBridge();
    await request(fresh.address.url, "/v1/plugin/connect", hello());
    const disconnected = await request(
      fresh.address.url,
      "/v1/plugin/disconnect",
      {
        pluginInstanceId: PLUGIN_INSTANCE_ID,
        schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
      },
    );
    expect(disconnected.response.status).toBe(200);
    const afterDisconnect = await request(
      fresh.address.url,
      "/v1/plugin/connect",
      hello(),
    );
    expect(afterDisconnect.response.status).toBe(401);
    expect(afterDisconnect.body).toMatchObject({
      error: { code: "CREDENTIAL_EXPIRED" },
      ok: false,
    });
  });

  it("enforces request limits and never persists raw credentials or idempotency keys", async () => {
    const { address, operationDirectory } = await startBridge();
    const wrongContentType = await request(
      address.url,
      "/v1/operations",
      command(OPERATION_IDS[0]),
      { contentType: "text/plain" },
    );
    expect(wrongContentType.response.status).toBe(400);
    expect(wrongContentType.body).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
      ok: false,
    });

    const oversized = await request(address.url, "/v1/operations", {
      padding: "x".repeat(65 * 1024),
    });
    expect(oversized.response.status).toBe(400);
    expect(oversized.body).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
      ok: false,
    });

    await request(
      address.url,
      "/v1/operations",
      command(OPERATION_IDS[0], "never-persist-this-key"),
    );
    const files = await readdir(operationDirectory);
    const content = await readFile(
      join(operationDirectory, files[0] ?? "missing"),
      "utf8",
    );
    expect(content).not.toContain(SESSION_TOKEN);
    expect(content).not.toContain("never-persist-this-key");
    expect(content).toContain("sha256:");
  });
});

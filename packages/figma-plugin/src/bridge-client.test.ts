import { WRITER_PROTOCOL_SCHEMA_VERSION } from "@agent-design-system-kit/core";
import { describe, expect, it } from "vitest";

import {
  FigmaBridgeClientError,
  createFigmaBridgeClient,
} from "./bridge-client.js";

const SESSION_TOKEN = "fig002-client-session-token-32-chars-minimum";
const PLUGIN_INSTANCE_ID = "c45c06e8-80ae-4478-ad55-9c49c60ecc56";
const OPERATION_ID = "2c73620e-29b0-4285-8861-1a65b18f11dc";

function commandDelivery() {
  return {
    approval: { mode: "not_required", reason: "read_only_diagnostic" },
    attempt: 1,
    command: { payload: {}, type: "writer.ping" },
    idempotencyKey: "client-ping-key",
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

function success(data: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({
      data,
      ok: true,
      schemaVersion: "1.0.0",
      warnings: [],
    }),
    { status },
  );
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

describe("Figma Bridge browser client", () => {
  it("keeps credentials in authorization headers and completes the ping protocol", async () => {
    const requests: Array<{ authorization: string | null; path: string }> = [];
    const responses = [
      success({
        leaseMs: 5_000,
        pluginInstanceId: PLUGIN_INSTANCE_ID,
        schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
        transport: "http",
      }),
      success({ command: commandDelivery() }),
      success(
        {
          operation: { status: "succeeded" },
          replayed: false,
        },
        202,
      ),
      success({ disconnected: true }),
    ];
    const fetchImplementation: typeof fetch = (input, init) => {
      requests.push({
        authorization: new Headers(init?.headers).get("authorization"),
        path: new URL(requestUrl(input)).pathname,
      });
      const response = responses.shift();
      if (response === undefined) {
        return Promise.reject(new Error("Unexpected browser client request."));
      }
      return Promise.resolve(response);
    };
    const client = createFigmaBridgeClient({
      fetchImplementation,
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      sessionToken: SESSION_TOKEN,
    });

    await client.connect({ fileName: "Demo", pageName: "Page 1" });
    expect(await client.next()).toEqual(commandDelivery());
    await expect(
      client.report({
        ok: true,
        operationId: OPERATION_ID,
        pluginInstanceId: PLUGIN_INSTANCE_ID,
        result: { pong: true },
        schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
      }),
    ).resolves.toEqual({ error: null, status: "succeeded" });
    await client.disconnect();

    expect(requests.map((request) => request.path)).toEqual([
      "/v1/plugin/connect",
      "/v1/plugin/next",
      "/v1/plugin/results",
      "/v1/plugin/disconnect",
    ]);
    expect(
      requests.every(
        (request) => request.authorization === `Bearer ${SESSION_TOKEN}`,
      ),
    ).toBe(true);
    expect(
      requests.some((request) => request.path.includes(SESSION_TOKEN)),
    ).toBe(false);

    await expect(client.next()).rejects.toMatchObject({
      view: { code: "CREDENTIAL_EXPIRED" },
    });
  });

  it("rejects invalid local tokens before opening a network request", () => {
    let requests = 0;
    const fetchImplementation: typeof fetch = () => {
      requests += 1;
      return Promise.resolve(success({}));
    };
    expect(() =>
      createFigmaBridgeClient({
        fetchImplementation,
        pluginInstanceId: PLUGIN_INSTANCE_ID,
        sessionToken: "short",
      }),
    ).toThrow(FigmaBridgeClientError);
    expect(requests).toBe(0);
  });

  it("preserves structured recovery guidance from the local Bridge", async () => {
    const fetchImplementation: typeof fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: "CREDENTIAL_INVALID",
              message: "The token is invalid.",
              recovery: {
                action: "reconnect_with_current_token",
                instruction: "Paste the current token.",
                retry: "retry_after_correction",
              },
            },
            ok: false,
            schemaVersion: "1.0.0",
            warnings: [],
          }),
          { status: 401 },
        ),
      );
    const client = createFigmaBridgeClient({
      fetchImplementation,
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      sessionToken: SESSION_TOKEN,
    });

    await expect(
      client.connect({ fileName: "Demo", pageName: "Page 1" }),
    ).rejects.toMatchObject({
      view: {
        code: "CREDENTIAL_INVALID",
        message: "The token is invalid.",
        recoveryInstruction: "Paste the current token.",
      },
    });
  });

  it("returns a recoverable partial status after Figma succeeds but Registry finalization fails", async () => {
    const responses = [
      success({
        leaseMs: 5_000,
        pluginInstanceId: PLUGIN_INSTANCE_ID,
        schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
        transport: "http",
      }),
      success(
        {
          operation: {
            error: {
              code: "PARTIAL_WRITE",
              message: "The Registry locator was not committed.",
              recovery: {
                action: "retry_operation",
                instruction:
                  "Resolve the Registry conflict and retry the same command.",
                retry: "retry_after_correction",
              },
            },
            status: "partial",
          },
          replayed: false,
        },
        202,
      ),
    ];
    const fetchImplementation: typeof fetch = () => {
      const response = responses.shift();
      return response === undefined
        ? Promise.reject(new Error("Unexpected browser client request."))
        : Promise.resolve(response);
    };
    const client = createFigmaBridgeClient({
      fetchImplementation,
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      sessionToken: SESSION_TOKEN,
    });
    await client.connect({ fileName: "Demo", pageName: "Page 1" });

    await expect(
      client.report({
        ok: true,
        operationId: OPERATION_ID,
        pluginInstanceId: PLUGIN_INSTANCE_ID,
        result: { pong: true },
        schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
      }),
    ).resolves.toMatchObject({
      error: {
        code: "PARTIAL_WRITE",
        message: "The Registry locator was not committed.",
        recoveryInstruction:
          "Resolve the Registry conflict and retry the same command.",
      },
      status: "partial",
    });
  });

  it("rejects a command outside the strict FIG-002 delivery contract", async () => {
    const responses = [
      success({
        leaseMs: 5_000,
        pluginInstanceId: PLUGIN_INSTANCE_ID,
        schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
        transport: "http",
      }),
      success({
        command: {
          ...commandDelivery(),
          command: { payload: {}, type: "variables.ensure" },
        },
      }),
    ];
    const fetchImplementation: typeof fetch = () => {
      const response = responses.shift();
      if (response === undefined) {
        return Promise.reject(new Error("Unexpected browser client request."));
      }
      return Promise.resolve(response);
    };
    const client = createFigmaBridgeClient({
      fetchImplementation,
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      sessionToken: SESSION_TOKEN,
    });
    await client.connect({ fileName: "Demo", pageName: "Page 1" });

    await expect(client.next()).rejects.toMatchObject({
      view: { code: "VALIDATION_FAILED" },
    });
  });

  it("rejects an oversized response from an unexpected local service", async () => {
    const fetchImplementation: typeof fetch = () =>
      Promise.resolve(new Response("x".repeat(257 * 1024)));
    const client = createFigmaBridgeClient({
      fetchImplementation,
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      sessionToken: SESSION_TOKEN,
    });

    await expect(
      client.connect({ fileName: "Demo", pageName: "Page 1" }),
    ).rejects.toMatchObject({
      view: {
        code: "TRANSPORT_UNAVAILABLE",
        message: "The local Bridge response exceeds the protocol limit.",
      },
    });
  });
});

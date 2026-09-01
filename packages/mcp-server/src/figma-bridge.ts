import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import process from "node:process";
import type { Socket } from "node:net";

import {
  WRITER_PROTOCOL_SCHEMA_VERSION,
  createFailureResult,
  createSuccessResult,
  createToolkitError,
  redactJsonValue,
  writerPluginDisconnectSchema,
  writerPluginHelloSchema,
  writerPluginPollSchema,
  writerPluginResultSchema,
  writerCommandEnvelopeSchema,
  type ErrorCode,
  type JsonValue,
  type ToolkitError,
  type WriterCommandEnvelope,
  type WriterPluginResult,
  type WriterSuccessResult,
} from "@agent-design-system-kit/core";
import * as z from "zod";

import { createOperationLog } from "./operation-log.js";
import {
  createWriterQueue,
  type WriterQueue,
  type WriterQueueSnapshot,
} from "./writer-queue.js";

export const FIGMA_BRIDGE_HOST = "127.0.0.1" as const;
export const FIGMA_BRIDGE_DEFAULT_PORT = 38_451;
export const FIGMA_BRIDGE_DEFAULT_LEASE_MS = 5_000;
export const FIGMA_BRIDGE_DEFAULT_LONG_POLL_MS = 12_000;
export const FIGMA_BRIDGE_DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1_000;

const MAX_BODY_BYTES = 64 * 1024;
const operationLookupSchema = z
  .object({
    operationId: z.uuid().max(64),
    schemaVersion: z.literal(WRITER_PROTOCOL_SCHEMA_VERSION),
  })
  .strict();

interface ActivePlugin {
  readonly context: {
    readonly fileName: string;
    readonly pageName: string;
  };
  readonly pluginInstanceId: string;
}

interface PendingPoll {
  readonly pluginInstanceId: string;
  readonly response: ServerResponse;
  readonly timer: ReturnType<typeof setTimeout>;
}

class FigmaBridgeRequestError extends Error {
  readonly toolkitError: ToolkitError;

  constructor(toolkitError: ToolkitError) {
    super(toolkitError.message);
    this.name = "FigmaBridgeRequestError";
    this.toolkitError = toolkitError;
  }
}

export interface FigmaBridgeOptions {
  readonly authorizeWrite?: (
    command: WriterCommandEnvelope,
  ) => Promise<ToolkitError | null> | ToolkitError | null;
  readonly leaseMs?: number;
  readonly finalizeWrite?: (
    command: WriterCommandEnvelope,
    result: WriterSuccessResult,
  ) => Promise<ToolkitError | null> | ToolkitError | null;
  readonly longPollMs?: number;
  readonly now?: () => Date;
  readonly nowMonotonicMs?: () => number;
  readonly operationDirectory?: string;
  readonly port?: number;
  readonly sessionToken?: string;
  readonly sessionTtlMs?: number;
}

export interface FigmaBridgeAddress {
  readonly host: typeof FIGMA_BRIDGE_HOST;
  readonly pluginUrl: string;
  readonly port: number;
  readonly url: string;
}

export interface FigmaBridge {
  readonly close: () => Promise<void>;
  readonly getSessionToken: () => string;
  readonly snapshot: () => {
    readonly pluginConnected: boolean;
    readonly queue: WriterQueueSnapshot;
    readonly sessionExpired: boolean;
  };
  readonly start: () => Promise<FigmaBridgeAddress>;
}

function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function bridgeError(
  code: ErrorCode,
  message: string,
  recoveryInstruction: string,
): ToolkitError {
  return createToolkitError({ code, message, recoveryInstruction });
}

function authorizationDigest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function readAuthorization(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  return typeof header === "string" ? header : undefined;
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  if (response.writableEnded) {
    return;
  }
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function sendFailure(
  response: ServerResponse,
  statusCode: number,
  error: ToolkitError,
): void {
  sendJson(response, statusCode, createFailureResult(error));
}

function setCors(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader(
    "access-control-allow-headers",
    "authorization, content-type",
  );
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-max-age", "600");
  response.setHeader("cache-control", "no-store");
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers["content-type"];
  if (
    typeof contentType !== "string" ||
    !contentType.toLowerCase().startsWith("application/json")
  ) {
    throw new FigmaBridgeRequestError(
      bridgeError(
        "VALIDATION_FAILED",
        "Bridge requests must use application/json.",
        "Set the Content-Type header and submit valid JSON.",
      ),
    );
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const chunkValue: unknown = chunk;
    const buffer =
      typeof chunkValue === "string"
        ? Buffer.from(chunkValue)
        : chunkValue instanceof Uint8Array
          ? Buffer.from(chunkValue)
          : null;
    if (buffer === null) {
      throw new Error("Node HTTP produced an unsupported request chunk.");
    }
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) {
      throw new FigmaBridgeRequestError(
        bridgeError(
          "VALIDATION_FAILED",
          "Bridge request body exceeds 64 KiB.",
          "Reduce the request payload and submit it again.",
        ),
      );
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new FigmaBridgeRequestError(
      bridgeError(
        "VALIDATION_FAILED",
        "Bridge request body is not valid JSON.",
        "Correct the JSON syntax and submit it again.",
      ),
    );
  }
}

function statusForError(code: ErrorCode): number {
  switch (code) {
    case "CREDENTIAL_EXPIRED":
    case "CREDENTIAL_INVALID":
    case "CREDENTIAL_REQUIRED":
      return 401;
    case "APPROVAL_CHANGES_REQUESTED":
    case "APPROVAL_INCOMPLETE":
    case "APPROVAL_IN_REVIEW":
    case "APPROVAL_REJECTED":
    case "APPROVAL_REQUIRED":
    case "APPROVAL_REVOKED":
    case "APPROVAL_STALE":
    case "APPROVAL_SUPERSEDED":
      return 403;
    case "IDENTITY_NOT_FOUND":
      return 404;
    case "IDENTITY_CONFLICT":
    case "IDEMPOTENCY_CONFLICT":
    case "OPERATION_ID_CONFLICT":
      return 409;
    case "VALIDATION_FAILED":
      return 400;
    default:
      return 500;
  }
}

export function createFigmaBridge(
  options: FigmaBridgeOptions = {},
): FigmaBridge {
  const port = options.port ?? FIGMA_BRIDGE_DEFAULT_PORT;
  const leaseMs = options.leaseMs ?? FIGMA_BRIDGE_DEFAULT_LEASE_MS;
  const longPollMs = options.longPollMs ?? FIGMA_BRIDGE_DEFAULT_LONG_POLL_MS;
  const sessionTtlMs =
    options.sessionTtlMs ?? FIGMA_BRIDGE_DEFAULT_SESSION_TTL_MS;
  const now = options.now ?? (() => new Date());
  const nowMonotonicMs = options.nowMonotonicMs ?? (() => performance.now());
  const sessionToken =
    options.sessionToken ?? randomBytes(24).toString("base64url");
  const operationDirectory = resolve(
    options.operationDirectory ??
      joinRuntimeDirectory(process.cwd(), ".agent-design-system-kit"),
  );

  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Figma Bridge port must be an integer from 0 to 65535.");
  }
  validatePositiveInteger(leaseMs, "Figma Bridge leaseMs");
  validatePositiveInteger(longPollMs, "Figma Bridge longPollMs");
  validatePositiveInteger(sessionTtlMs, "Figma Bridge sessionTtlMs");
  if (sessionToken.length < 32 || sessionToken.length > 256) {
    throw new Error(
      "Figma Bridge Session Token must contain 32 to 256 characters.",
    );
  }

  const expectedAuthorizationDigest = authorizationDigest(
    `Bearer ${sessionToken}`,
  );
  const log = createOperationLog({
    directory: operationDirectory,
    sensitiveValues: [sessionToken, `Bearer ${sessionToken}`],
  });
  const queue: WriterQueue = createWriterQueue({
    leaseMs,
    log,
    now,
    nowMonotonicMs,
  });
  const sockets = new Set<Socket>();
  let activePlugin: ActivePlugin | null = null;
  let pendingPoll: PendingPoll | null = null;
  let startedAtMonotonicMs: number | null = null;
  let tokenInvalidated = false;
  let actualPort: number | null = null;
  let dispatchChain = Promise.resolve();
  let queueInitialized = false;

  function sessionExpired(): boolean {
    return (
      tokenInvalidated ||
      (startedAtMonotonicMs !== null &&
        nowMonotonicMs() - startedAtMonotonicMs >= sessionTtlMs)
    );
  }

  function authenticate(request: IncomingMessage): ToolkitError | null {
    if (sessionExpired()) {
      return bridgeError(
        "CREDENTIAL_EXPIRED",
        "The local Bridge Session Token has expired.",
        "Restart the local Bridge and reconnect the Figma Plugin.",
      );
    }
    const authorization = readAuthorization(request);
    if (authorization === undefined) {
      return bridgeError(
        "CREDENTIAL_REQUIRED",
        "A local Bridge Session Token is required.",
        "Provide the token through the Plugin's in-memory connection field.",
      );
    }
    const receivedDigest = authorizationDigest(authorization);
    if (!timingSafeEqual(receivedDigest, expectedAuthorizationDigest)) {
      return bridgeError(
        "CREDENTIAL_INVALID",
        "The local Bridge Session Token is invalid.",
        "Replace it with the current in-memory Session Token and reconnect.",
      );
    }
    return null;
  }

  function clearPendingPoll(statusCode = 204): void {
    if (pendingPoll === null) {
      return;
    }
    const current = pendingPoll;
    pendingPoll = null;
    clearTimeout(current.timer);
    if (!current.response.writableEnded) {
      current.response.writeHead(statusCode, {
        "cache-control": "no-store",
      });
      current.response.end();
    }
  }

  function dispatchPending(): Promise<void> {
    dispatchChain = dispatchChain.then(async () => {
      if (pendingPoll === null || activePlugin === null) {
        return;
      }
      const delivery = await queue.leaseNext();
      if (delivery === null || pendingPoll === null) {
        return;
      }
      const current = pendingPoll;
      pendingPoll = null;
      clearTimeout(current.timer);
      sendJson(
        current.response,
        200,
        createSuccessResult({ command: delivery }),
      );
    });
    return dispatchChain;
  }

  async function releasePlugin(invalidateToken: boolean): Promise<void> {
    clearPendingPoll();
    activePlugin = null;
    if (invalidateToken) {
      tokenInvalidated = true;
    }
    await queue.disconnectWriter();
  }

  const server = createServer(
    {
      headersTimeout: 10_000,
      keepAliveTimeout: 5_000,
      maxHeaderSize: 16 * 1024,
      requestTimeout: Math.max(longPollMs + 5_000, 20_000),
    },
    (request, response) => {
      void handleRequest(request, response).catch((cause: unknown) => {
        const error =
          cause instanceof FigmaBridgeRequestError
            ? cause.toolkitError
            : isToolkitError(cause) && cause.code !== "INTERNAL_ERROR"
              ? cause
              : bridgeError(
                  "INTERNAL_ERROR",
                  "The local Figma Bridge could not complete the request.",
                  "Inspect the local Bridge health and retry after correcting the failure.",
                );
        sendFailure(response, statusForError(error.code), error);
      });
    },
  );

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    setCors(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.search.length > 0) {
      sendFailure(
        response,
        400,
        bridgeError(
          "UNSAFE_CREDENTIAL_SOURCE",
          "Figma Bridge requests must not place values in the URL query.",
          "Move request data to the authenticated JSON body.",
        ),
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/health") {
      const snapshot = queue.snapshot();
      sendJson(
        response,
        200,
        createSuccessResult({
          inFlight: snapshot.inFlightOperationId !== null,
          pluginConnected: activePlugin !== null,
          queued: snapshot.queuedOperationIds.length,
          schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
          sessionExpired: sessionExpired(),
        }),
      );
      return;
    }

    const authenticationError = authenticate(request);
    if (authenticationError !== null) {
      if (
        authenticationError.code === "CREDENTIAL_EXPIRED" &&
        (activePlugin !== null || pendingPoll !== null)
      ) {
        await releasePlugin(false);
      }
      sendFailure(response, 401, authenticationError);
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/plugin/connect") {
      const parsed = writerPluginHelloSchema.safeParse(await readJson(request));
      if (!parsed.success) {
        sendFailure(
          response,
          400,
          bridgeError(
            "VALIDATION_FAILED",
            "Plugin connection data does not match the Writer protocol.",
            "Correct the Plugin hello message and reconnect.",
          ),
        );
        return;
      }
      if (
        activePlugin !== null &&
        activePlugin.pluginInstanceId !== parsed.data.pluginInstanceId
      ) {
        sendFailure(
          response,
          409,
          bridgeError(
            "IDENTITY_CONFLICT",
            "Another Figma Plugin instance owns the Writer session.",
            "Disconnect the active Writer before connecting this Plugin instance.",
          ),
        );
        return;
      }
      activePlugin = {
        context: parsed.data.context,
        pluginInstanceId: parsed.data.pluginInstanceId,
      };
      sendJson(
        response,
        200,
        createSuccessResult({
          leaseMs,
          pluginInstanceId: parsed.data.pluginInstanceId,
          schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
          transport: "http" as const,
        }),
      );
      await dispatchPending();
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/plugin/disconnect") {
      const parsed = writerPluginDisconnectSchema.safeParse(
        await readJson(request),
      );
      if (!parsed.success || activePlugin === null) {
        sendFailure(
          response,
          409,
          bridgeError(
            "IDENTITY_CONFLICT",
            "The Figma Plugin does not own the active Writer session.",
            "Reconnect the current Plugin instance before disconnecting it.",
          ),
        );
        return;
      }
      if (activePlugin.pluginInstanceId !== parsed.data.pluginInstanceId) {
        sendFailure(
          response,
          409,
          bridgeError(
            "IDENTITY_CONFLICT",
            "The Figma Plugin instance does not match the active Writer.",
            "Disconnect the Plugin instance that owns the Writer session.",
          ),
        );
        return;
      }
      await releasePlugin(true);
      sendJson(response, 200, createSuccessResult({ disconnected: true }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/plugin/next") {
      const parsed = writerPluginPollSchema.safeParse(await readJson(request));
      if (
        !parsed.success ||
        activePlugin === null ||
        activePlugin.pluginInstanceId !== parsed.data.pluginInstanceId
      ) {
        sendFailure(
          response,
          409,
          bridgeError(
            "IDENTITY_CONFLICT",
            "The polling Plugin instance does not own the Writer session.",
            "Connect this Plugin instance before polling for commands.",
          ),
        );
        return;
      }
      const delivery = await queue.leaseNext();
      if (delivery !== null) {
        sendJson(response, 200, createSuccessResult({ command: delivery }));
        return;
      }
      if (pendingPoll !== null) {
        sendFailure(
          response,
          409,
          bridgeError(
            "IDENTITY_CONFLICT",
            "Only one long poll may be open for the Writer session.",
            "Wait for the current poll to finish before opening another.",
          ),
        );
        return;
      }
      const timer = setTimeout(() => clearPendingPoll(), longPollMs);
      pendingPoll = {
        pluginInstanceId: parsed.data.pluginInstanceId,
        response,
        timer,
      };
      response.once("close", () => {
        if (pendingPoll?.response === response && !response.writableEnded) {
          clearTimeout(pendingPoll.timer);
          pendingPoll = null;
        }
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/plugin/results") {
      if (activePlugin === null) {
        sendFailure(
          response,
          409,
          bridgeError(
            "IDENTITY_CONFLICT",
            "No Figma Plugin owns the Writer session.",
            "Reconnect the Plugin before reporting a result.",
          ),
        );
        return;
      }
      const input = redactJsonValue((await readJson(request)) as JsonValue, {
        sensitiveValues: [sessionToken, `Bearer ${sessionToken}`],
      });
      const parsed = writerPluginResultSchema.safeParse(input);
      if (!parsed.success) {
        sendFailure(
          response,
          400,
          bridgeError(
            "VALIDATION_FAILED",
            "The Plugin Result does not match the FIG-002 protocol.",
            "Correct the result envelope and report it again.",
          ),
        );
        return;
      }
      if (parsed.data.pluginInstanceId !== activePlugin.pluginInstanceId) {
        sendFailure(
          response,
          409,
          bridgeError(
            "IDENTITY_CONFLICT",
            "The result does not belong to the active Figma Plugin instance.",
            "Reconnect the owning Plugin instance and report the result again.",
          ),
        );
        return;
      }
      let acceptedResult: WriterPluginResult = parsed.data;
      if (parsed.data.ok && options.finalizeWrite !== undefined) {
        const command = queue.getDispatchedCommand(parsed.data.operationId);
        if (command !== null) {
          let finalizationError: ToolkitError | null;
          try {
            finalizationError = await options.finalizeWrite(
              command,
              parsed.data.result,
            );
          } catch {
            finalizationError = bridgeError(
              "PARTIAL_WRITE",
              "The Figma write succeeded, but local finalization failed unexpectedly.",
              "Keep the Figma asset, inspect the local Registry, and retry the same approved command.",
            );
          }
          if (finalizationError !== null) {
            acceptedResult = {
              error: {
                code: "PARTIAL_WRITE",
                message: finalizationError.message,
                recoveryInstruction: finalizationError.recovery.instruction,
              },
              ok: false,
              operationId: parsed.data.operationId,
              pluginInstanceId: parsed.data.pluginInstanceId,
              schemaVersion: parsed.data.schemaVersion,
            };
          }
        }
      }
      const accepted = await queue.acceptResult(acceptedResult);
      if (!accepted.ok) {
        sendFailure(
          response,
          statusForError(accepted.error.code),
          accepted.error,
        );
        return;
      }
      sendJson(
        response,
        accepted.data.replayed ? 200 : 202,
        createSuccessResult(accepted.data),
      );
      await dispatchPending();
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/operations") {
      const input = await readJson(request);
      const parsed = writerCommandEnvelopeSchema.safeParse(input);
      if (!parsed.success) {
        sendFailure(
          response,
          400,
          bridgeError(
            "VALIDATION_FAILED",
            "Writer Command does not match the current protocol.",
            "Correct the command fields and submit it again.",
          ),
        );
        return;
      }
      if (
        parsed.data.command.type !== "writer.ping" &&
        parsed.data.command.type !== "audit.styles.scan" &&
        parsed.data.command.type !== "audit.components.scan" &&
        parsed.data.command.type !== "audit.registry-drift.scan"
      ) {
        const authorizationError =
          options.authorizeWrite === undefined
            ? bridgeError(
                "APPROVAL_REQUIRED",
                "The Bridge has no configured approval verifier for Figma writes.",
                "Start the Writer through the project control plane so it can re-read and verify the Git approval record.",
              )
            : await options.authorizeWrite(parsed.data);
        if (authorizationError !== null) {
          sendFailure(
            response,
            statusForError(authorizationError.code),
            authorizationError,
          );
          return;
        }
      }
      const submitted = await queue.submit(parsed.data);
      if (!submitted.ok) {
        sendFailure(
          response,
          statusForError(submitted.error.code),
          submitted.error,
        );
        return;
      }
      sendJson(
        response,
        submitted.data.idempotentReplay ? 200 : 202,
        createSuccessResult(submitted.data),
      );
      await dispatchPending();
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/operations/get") {
      const parsed = operationLookupSchema.safeParse(await readJson(request));
      if (!parsed.success) {
        sendFailure(
          response,
          400,
          bridgeError(
            "VALIDATION_FAILED",
            "Operation lookup does not match the Writer protocol.",
            "Provide the schema version and a valid operation ID.",
          ),
        );
        return;
      }
      const operation = queue.getOperation(parsed.data.operationId);
      if (!operation.ok) {
        sendFailure(response, 404, operation.error);
        return;
      }
      sendJson(response, 200, operation);
      return;
    }

    sendFailure(
      response,
      404,
      bridgeError(
        "IDENTITY_NOT_FOUND",
        "The Figma Bridge endpoint was not found.",
        "Use a documented FIG-002 endpoint.",
      ),
    );
  }

  return {
    async start() {
      if (server.listening && actualPort !== null) {
        return addressFor(actualPort);
      }
      await queue.initialize();
      queueInitialized = true;
      await new Promise<void>((resolvePromise, rejectPromise) => {
        const onError = (error: Error): void => rejectPromise(error);
        server.once("error", onError);
        server.listen(port, FIGMA_BRIDGE_HOST, () => {
          server.off("error", onError);
          resolvePromise();
        });
      });
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Figma Bridge did not receive a TCP address.");
      }
      actualPort = address.port;
      startedAtMonotonicMs = nowMonotonicMs();
      return addressFor(actualPort);
    },

    async close() {
      if (activePlugin !== null || pendingPoll !== null) {
        await releasePlugin(true);
      } else {
        tokenInvalidated = true;
      }
      for (const socket of sockets) {
        socket.destroy();
      }
      if (!server.listening) {
        return;
      }
      await new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error === undefined) {
            resolvePromise();
          } else {
            rejectPromise(error);
          }
        });
      });
    },

    getSessionToken() {
      if (sessionExpired()) {
        throw new Error("The Figma Bridge Session Token is no longer active.");
      }
      return sessionToken;
    },

    snapshot() {
      return {
        pluginConnected: activePlugin !== null,
        queue: queueInitialized
          ? queue.snapshot()
          : {
              inFlightOperationId: null,
              operations: [],
              queuedOperationIds: [],
            },
        sessionExpired: sessionExpired(),
      };
    },
  };
}

function joinRuntimeDirectory(workspace: string, directory: string): string {
  return resolve(workspace, directory, "runtime", "operations");
}

function addressFor(port: number): FigmaBridgeAddress {
  return {
    host: FIGMA_BRIDGE_HOST,
    pluginUrl: `http://localhost:${String(port)}`,
    port,
    url: `http://${FIGMA_BRIDGE_HOST}:${String(port)}`,
  };
}

function isToolkitError(value: unknown): value is ToolkitError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "category" in value &&
    "message" in value &&
    "recovery" in value
  );
}

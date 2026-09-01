import {
  ERROR_DEFINITIONS,
  type ErrorCode,
  type WriterCommandDelivery,
  type WriterPluginResult,
} from "@agent-design-system-kit/core";

import type { FigmaDocumentContext, PluginErrorView } from "./status-model.js";
import {
  FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION,
  isWriterCommandDelivery,
  isWriterPluginResult,
} from "./writer-message-validation.js";

export const FIGMA_BRIDGE_ENDPOINT = "http://localhost:38451" as const;

const REQUEST_TIMEOUT_MS = 5_000;
const POLL_TIMEOUT_MS = 17_000;
const MAX_RESPONSE_BYTES = 256 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorView(
  code: ErrorCode,
  message: string,
  recoveryInstruction: string,
): PluginErrorView {
  const definition = ERROR_DEFINITIONS[code];
  return {
    category: definition.category,
    code,
    message,
    recoveryInstruction,
    retry: definition.retry,
  };
}

function parseRemoteError(value: unknown): PluginErrorView | null {
  if (
    !isRecord(value) ||
    value.ok !== false ||
    !isRecord(value.error) ||
    typeof value.error.code !== "string" ||
    !Object.hasOwn(ERROR_DEFINITIONS, value.error.code) ||
    typeof value.error.message !== "string" ||
    !isRecord(value.error.recovery) ||
    typeof value.error.recovery.instruction !== "string"
  ) {
    return null;
  }
  return errorView(
    value.error.code as ErrorCode,
    value.error.message,
    value.error.recovery.instruction,
  );
}

export class FigmaBridgeClientError extends Error {
  readonly view: PluginErrorView;

  constructor(view: PluginErrorView) {
    super(view.message);
    this.name = "FigmaBridgeClientError";
    this.view = view;
  }
}

export interface FigmaBridgeClientOptions {
  readonly fetchImplementation?: typeof fetch;
  readonly pluginInstanceId: string;
  readonly sessionToken: string;
}

export interface FigmaBridgeClient {
  readonly connect: (context: FigmaDocumentContext) => Promise<void>;
  readonly disconnect: () => Promise<void>;
  readonly next: () => Promise<WriterCommandDelivery | null>;
  readonly report: (result: WriterPluginResult) => Promise<void>;
}

export function createFigmaBridgeClient(
  options: FigmaBridgeClientOptions,
): FigmaBridgeClient {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  let sessionToken: string | null = options.sessionToken;
  if (sessionToken.length < 32 || sessionToken.length > 256) {
    throw new FigmaBridgeClientError(
      errorView(
        "CREDENTIAL_INVALID",
        "The local Bridge Session Token must contain 32 to 256 characters.",
        "Paste the current token shown by the local Hatchkit process.",
      ),
    );
  }

  async function request(
    path: string,
    body: unknown,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    if (sessionToken === null) {
      throw new FigmaBridgeClientError(
        errorView(
          "CREDENTIAL_EXPIRED",
          "The local Writer session has already been disconnected.",
          "Restart the local Bridge and connect with its new Session Token.",
        ),
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImplementation(
        `${FIGMA_BRIDGE_ENDPOINT}${path}`,
        {
          body: JSON.stringify(body),
          cache: "no-store",
          credentials: "omit",
          headers: {
            authorization: `Bearer ${sessionToken}`,
            "content-type": "application/json",
          },
          method: "POST",
          redirect: "error",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        },
      );
      if (response.status === 204) {
        return null;
      }
      const text = await readBoundedResponseText(response);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new FigmaBridgeClientError(
          errorView(
            "TRANSPORT_UNAVAILABLE",
            "The local Bridge returned an unreadable response.",
            "Restart the local Bridge and reconnect this Plugin.",
          ),
        );
      }
      const remoteError = parseRemoteError(parsed);
      if (!response.ok || remoteError !== null) {
        throw new FigmaBridgeClientError(
          remoteError ??
            errorView(
              "TRANSPORT_UNAVAILABLE",
              "The local Bridge rejected the request.",
              "Inspect the Bridge status and reconnect this Plugin.",
            ),
        );
      }
      if (!isRecord(parsed) || parsed.ok !== true || !("data" in parsed)) {
        throw new FigmaBridgeClientError(
          errorView(
            "TRANSPORT_UNAVAILABLE",
            "The local Bridge response does not match the protocol.",
            "Update Hatchkit so the local process and Plugin use the same version.",
          ),
        );
      }
      return parsed.data;
    } catch (cause: unknown) {
      if (cause instanceof FigmaBridgeClientError) {
        throw cause;
      }
      throw new FigmaBridgeClientError(
        errorView(
          "TRANSPORT_UNAVAILABLE",
          "The Figma Plugin could not reach the local Bridge.",
          "Start Hatchkit locally, then reconnect with the current Session Token.",
        ),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async connect(context) {
      const data = await request("/v1/plugin/connect", {
        context,
        pluginInstanceId: options.pluginInstanceId,
        schemaVersion: FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION,
        transport: "http",
      });
      if (
        !isRecord(data) ||
        data.pluginInstanceId !== options.pluginInstanceId ||
        data.schemaVersion !== FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION ||
        data.transport !== "http" ||
        !Number.isSafeInteger(data.leaseMs) ||
        Number(data.leaseMs) <= 0
      ) {
        throw new FigmaBridgeClientError(
          errorView(
            "TRANSPORT_UNAVAILABLE",
            "The local Bridge connection response is incompatible.",
            "Update Hatchkit so the local process and Plugin use the same version.",
          ),
        );
      }
    },

    async disconnect() {
      try {
        await request("/v1/plugin/disconnect", {
          pluginInstanceId: options.pluginInstanceId,
          schemaVersion: FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION,
        });
      } finally {
        sessionToken = null;
      }
    },

    async next() {
      const data = await request(
        "/v1/plugin/next",
        {
          pluginInstanceId: options.pluginInstanceId,
          schemaVersion: FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION,
        },
        POLL_TIMEOUT_MS,
      );
      if (data === null) {
        return null;
      }
      if (!isRecord(data)) {
        throw new FigmaBridgeClientError(
          errorView(
            "TRANSPORT_UNAVAILABLE",
            "The local Bridge delivered an invalid Writer Command.",
            "Update Hatchkit and reconnect before accepting more commands.",
          ),
        );
      }
      if (!isWriterCommandDelivery(data.command)) {
        throw new FigmaBridgeClientError(
          errorView(
            "VALIDATION_FAILED",
            "The local Bridge delivered a command outside the FIG-002 contract.",
            "Reject the command and update the local Hatchkit process.",
          ),
        );
      }
      return data.command;
    },

    async report(result) {
      if (
        !isWriterPluginResult(result) ||
        result.pluginInstanceId !== options.pluginInstanceId
      ) {
        throw new FigmaBridgeClientError(
          errorView(
            "VALIDATION_FAILED",
            "The Plugin Result does not match the active Writer session.",
            "Discard the result and reconnect the current Plugin instance.",
          ),
        );
      }
      await request("/v1/plugin/results", result);
    },
  };
}

async function readBoundedResponseText(response: Response): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > MAX_RESPONSE_BYTES
  ) {
    throw new FigmaBridgeClientError(
      errorView(
        "TRANSPORT_UNAVAILABLE",
        "The local Bridge response exceeds the protocol limit.",
        "Stop the unexpected local service and restart Hatchkit.",
      ),
    );
  }
  if (response.body === null) {
    return "";
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      return `${text}${decoder.decode()}`;
    }
    size += chunk.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new FigmaBridgeClientError(
        errorView(
          "TRANSPORT_UNAVAILABLE",
          "The local Bridge response exceeds the protocol limit.",
          "Stop the unexpected local service and restart Hatchkit.",
        ),
      );
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
}

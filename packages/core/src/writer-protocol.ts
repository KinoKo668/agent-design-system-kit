import * as z from "zod";

import { ERROR_DEFINITIONS, type ErrorCode } from "./errors.js";
import type { JsonObject } from "./json.js";
import {
  stableAssetIdSchema,
  stableIdSegmentSchema,
} from "./schema-primitives.js";

export const WRITER_PROTOCOL_SCHEMA_VERSION = "1.0.0" as const;

const operationIdSchema = z.uuid().max(64);
const idempotencyKeySchema = z
  .string()
  .min(1, "Must not be empty.")
  .max(256, "Must contain at most 256 characters.");
const pluginInstanceIdSchema = z.uuid().max(64);
const ERROR_CODES = Object.keys(ERROR_DEFINITIONS) as [
  ErrorCode,
  ...ErrorCode[],
];

export const writerTargetSchema = z
  .object({
    kind: z.literal("plugin-session"),
    stableId: stableAssetIdSchema,
  })
  .strict();

export const writerApprovalSchema = z
  .object({
    mode: z.literal("not_required"),
    reason: z.literal("read_only_diagnostic"),
  })
  .strict();

export const writerCommandSourceSchema = z
  .object({
    client: stableIdSegmentSchema,
  })
  .strict();

export const writerPingCommandSchema = z
  .object({
    payload: z.object({}).strict(),
    type: z.literal("writer.ping"),
  })
  .strict();

export const writerCommandEnvelopeSchema = z
  .object({
    approval: writerApprovalSchema,
    command: writerPingCommandSchema,
    idempotencyKey: idempotencyKeySchema,
    operationId: operationIdSchema,
    projectId: stableIdSegmentSchema,
    schemaVersion: z.literal(WRITER_PROTOCOL_SCHEMA_VERSION),
    source: writerCommandSourceSchema,
    target: writerTargetSchema,
  })
  .strict();

export type WriterCommandEnvelope = z.infer<typeof writerCommandEnvelopeSchema>;

export const writerCommandDeliverySchema = writerCommandEnvelopeSchema.extend({
  attempt: z.number().int().positive(),
});

export type WriterCommandDelivery = z.infer<typeof writerCommandDeliverySchema>;

export const writerPluginHelloSchema = z
  .object({
    context: z
      .object({
        fileName: z.string().min(1).max(256),
        pageName: z.string().min(1).max(256),
      })
      .strict(),
    pluginInstanceId: pluginInstanceIdSchema,
    schemaVersion: z.literal(WRITER_PROTOCOL_SCHEMA_VERSION),
    transport: z.literal("http"),
  })
  .strict();

export type WriterPluginHello = z.infer<typeof writerPluginHelloSchema>;

export const writerPluginPollSchema = z
  .object({
    pluginInstanceId: pluginInstanceIdSchema,
    schemaVersion: z.literal(WRITER_PROTOCOL_SCHEMA_VERSION),
  })
  .strict();

export type WriterPluginPoll = z.infer<typeof writerPluginPollSchema>;

export const writerPluginDisconnectSchema = writerPluginPollSchema;
export type WriterPluginDisconnect = WriterPluginPoll;

const writerPluginErrorSchema = z
  .object({
    code: z.enum(ERROR_CODES),
    message: z.string().min(1).max(1024),
    recoveryInstruction: z.string().min(1).max(1024),
  })
  .strict();

export const writerPluginResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      operationId: operationIdSchema,
      pluginInstanceId: pluginInstanceIdSchema,
      result: z.object({ pong: z.literal(true) }).strict(),
      schemaVersion: z.literal(WRITER_PROTOCOL_SCHEMA_VERSION),
    })
    .strict(),
  z
    .object({
      error: writerPluginErrorSchema,
      ok: z.literal(false),
      operationId: operationIdSchema,
      pluginInstanceId: pluginInstanceIdSchema,
      schemaVersion: z.literal(WRITER_PROTOCOL_SCHEMA_VERSION),
    })
    .strict(),
]);

export type WriterPluginResult = z.infer<typeof writerPluginResultSchema>;

export interface WriterCommandFingerprintSubject extends JsonObject {
  readonly approval: JsonObject;
  readonly command: JsonObject;
  readonly projectId: string;
  readonly schemaVersion: typeof WRITER_PROTOCOL_SCHEMA_VERSION;
  readonly target: JsonObject;
}

export function toWriterCommandFingerprintSubject(
  command: WriterCommandEnvelope,
): WriterCommandFingerprintSubject {
  return {
    approval: command.approval,
    command: command.command,
    projectId: command.projectId,
    schemaVersion: command.schemaVersion,
    target: command.target,
  };
}

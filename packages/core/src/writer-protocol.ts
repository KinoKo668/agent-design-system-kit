import * as z from "zod";

import { ERROR_DEFINITIONS, type ErrorCode } from "./errors.js";
import type { JsonObject } from "./json.js";
import {
  contentDigestSchema,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";
import { figmaVariablePlanSchema } from "./figma-variable-plan.js";
import { figmaButtonPlanSchema } from "./figma-button-plan.js";
import { figmaButtonInstancePlanSchema } from "./figma-button-instance-plan.js";

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

export const writerPluginSessionTargetSchema = z
  .object({
    kind: z.literal("plugin-session"),
    stableId: stableAssetIdSchema,
  })
  .strict();

export const writerFigmaFileTargetSchema = z
  .object({
    fileBindingId: z.uuid().max(64),
    kind: z.literal("figma-file"),
    stableId: stableAssetIdSchema,
  })
  .strict();

export const writerTargetSchema = z.discriminatedUnion("kind", [
  writerFigmaFileTargetSchema,
  writerPluginSessionTargetSchema,
]);

const approvedWriterSubjectSchema = z.discriminatedUnion("type", [
  z
    .object({
      assetId: stableAssetIdSchema,
      assetVersion: strictSemverSchema,
      contentDigest: contentDigestSchema,
      projectId: stableIdSegmentSchema,
      type: z.literal("token-set"),
    })
    .strict(),
  z
    .object({
      assetId: stableAssetIdSchema,
      assetVersion: strictSemverSchema,
      contentDigest: contentDigestSchema,
      projectId: stableIdSegmentSchema,
      type: z.literal("component"),
    })
    .strict(),
]);

export const writerApprovalSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("not_required"),
      reason: z.literal("read_only_diagnostic"),
    })
    .strict(),
  z
    .object({
      approvalId: z
        .string()
        .min(1)
        .max(320)
        .regex(/^approval\.(?:component|tokens)\.[a-z0-9.+-]+$/u),
      mode: z.literal("approved"),
      subject: approvedWriterSubjectSchema,
    })
    .strict()
    .superRefine((approval, context) => {
      const prefix =
        approval.subject.type === "token-set"
          ? "approval.tokens."
          : "approval.component.";
      if (!approval.approvalId.startsWith(prefix)) {
        context.addIssue({
          code: "custom",
          message: "Approval ID namespace must match its subject type.",
          path: ["approvalId"],
        });
      }
    }),
]);

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

export const writerEnsureVariablesCommandSchema = z
  .object({
    payload: z.object({ plan: figmaVariablePlanSchema }).strict(),
    type: z.literal("variables.ensure"),
  })
  .strict();

export const writerEnsureButtonCommandSchema = z
  .object({
    payload: z.object({ plan: figmaButtonPlanSchema }).strict(),
    type: z.literal("components.button.ensure"),
  })
  .strict();

export const writerInsertButtonInstanceCommandSchema = z
  .object({
    payload: z.object({ plan: figmaButtonInstancePlanSchema }).strict(),
    type: z.literal("instances.button.insert"),
  })
  .strict();

export const writerCommandSchema = z.discriminatedUnion("type", [
  writerInsertButtonInstanceCommandSchema,
  writerEnsureButtonCommandSchema,
  writerEnsureVariablesCommandSchema,
  writerPingCommandSchema,
]);

export const writerCommandEnvelopeSchema = z
  .object({
    approval: writerApprovalSchema,
    command: writerCommandSchema,
    idempotencyKey: idempotencyKeySchema,
    operationId: operationIdSchema,
    projectId: stableIdSegmentSchema,
    schemaVersion: z.literal(WRITER_PROTOCOL_SCHEMA_VERSION),
    source: writerCommandSourceSchema,
    target: writerTargetSchema,
  })
  .strict()
  .superRefine((envelope, context) => {
    if (envelope.command.type === "writer.ping") {
      if (envelope.approval.mode !== "not_required") {
        context.addIssue({
          code: "custom",
          message: "writer.ping must use read-only diagnostic approval.",
          path: ["approval"],
        });
      }
      if (envelope.target.kind !== "plugin-session") {
        context.addIssue({
          code: "custom",
          message: "writer.ping must target the active Plugin session.",
          path: ["target", "kind"],
        });
      }
      return;
    }

    const plan = envelope.command.payload.plan;
    if (envelope.approval.mode !== "approved") {
      context.addIssue({
        code: "custom",
        message: `${envelope.command.type} requires a verified approval.`,
        path: ["approval"],
      });
      return;
    }
    if (envelope.target.kind !== "figma-file") {
      context.addIssue({
        code: "custom",
        message: `${envelope.command.type} must target a bound Figma file.`,
        path: ["target", "kind"],
      });
    }
    const subject = envelope.approval.subject;
    const expectedSubjectType =
      envelope.command.type === "variables.ensure" ? "token-set" : "component";
    const mismatches: string[] = [
      subject.type !== expectedSubjectType ? "type" : null,
      subject.projectId !== plan.source.projectId ? "projectId" : null,
      subject.assetId !== plan.source.assetId ? "assetId" : null,
      subject.assetVersion !== plan.source.assetVersion ? "assetVersion" : null,
      subject.contentDigest !== plan.source.contentDigest
        ? "contentDigest"
        : null,
      envelope.projectId !== plan.source.projectId ? "envelopeProjectId" : null,
    ].filter((value): value is string => value !== null);
    if (envelope.command.type === "instances.button.insert") {
      if (
        envelope.approval.approvalId !==
        envelope.command.payload.plan.source.approvalId
      ) {
        mismatches.push("approvalId");
      }
      if (
        envelope.target.kind === "figma-file" &&
        envelope.target.fileBindingId !==
          envelope.command.payload.plan.source.fileBindingId
      ) {
        mismatches.push("fileBindingId");
      }
    }
    if (mismatches.length > 0) {
      context.addIssue({
        code: "custom",
        message: `Approval does not match the ${envelope.command.type} plan: ${mismatches.join(", ")}.`,
        path: ["approval", "subject"],
      });
    }
  });

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
    completedSteps: z.array(z.string().min(1).max(120)).max(20).optional(),
    message: z.string().min(1).max(1024),
    recoveryInstruction: z.string().min(1).max(1024),
  })
  .strict();

export const writerVariablesResultSchema = z
  .object({
    collection: z
      .object({
        action: z.enum(["created", "unchanged", "updated"]),
        stableId: stableAssetIdSchema,
      })
      .strict(),
    deferredTypographyCount: z.number().int().nonnegative(),
    type: z.literal("variables.ensure"),
    variables: z
      .object({
        created: z.number().int().nonnegative(),
        unchanged: z.number().int().nonnegative(),
        updated: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const writerButtonResultSchema = z
  .object({
    componentSet: z
      .object({
        action: z.enum(["created", "unchanged", "updated"]),
        nodeId: z
          .string()
          .max(128, "Must contain at most 128 characters.")
          .regex(/^\d+:\d+$/u, "Must be a Figma Plugin node ID."),
        stableId: stableAssetIdSchema,
      })
      .strict(),
    labelPropertyName: z.string().min(1).max(120),
    type: z.literal("components.button.ensure"),
    typography: z
      .object({
        lineHeightStrategy: z.literal("resolved-percent"),
        variableBindings: z.literal(4),
      })
      .strict(),
    variants: z
      .object({
        created: z.number().int().nonnegative(),
        unchanged: z.number().int().nonnegative(),
        updated: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const writerButtonInstanceResultSchema = z
  .object({
    componentSet: z
      .object({
        nodeId: z
          .string()
          .max(128)
          .regex(/^\d+:\d+$/u),
        stableId: stableAssetIdSchema,
      })
      .strict(),
    instance: z
      .object({
        action: z.enum(["created", "recovered", "unchanged"]),
        nodeId: z
          .string()
          .max(128)
          .regex(/^\d+:\d+$/u),
        stableId: stableAssetIdSchema,
      })
      .strict(),
    type: z.literal("instances.button.insert"),
    variant: z.object({ stableId: stableAssetIdSchema }).strict(),
  })
  .strict();

export const writerSuccessResultSchema = z.union([
  z.object({ pong: z.literal(true) }).strict(),
  writerButtonResultSchema,
  writerButtonInstanceResultSchema,
  writerVariablesResultSchema,
]);
export type WriterSuccessResult = z.infer<typeof writerSuccessResultSchema>;

export const writerPluginResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      operationId: operationIdSchema,
      pluginInstanceId: pluginInstanceIdSchema,
      result: writerSuccessResultSchema,
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

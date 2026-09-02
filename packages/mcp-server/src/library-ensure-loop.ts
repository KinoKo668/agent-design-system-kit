import {
  WRITER_PROTOCOL_SCHEMA_VERSION,
  approvalIdForSubject,
  createFailureResult,
  createFigmaButtonPlan,
  createFigmaIconPlan,
  createFigmaInputPlan,
  createFigmaVariablePlan,
  createSuccessResult,
  createToolkitError,
  resolveComponent,
  stableAssetIdSchema,
  strictSemverSchema,
  toTokenSetDigestSubject,
  writerSuccessResultSchema,
  type ComponentContract,
  type DesignSystemSnapshot,
  type FigmaButtonPlan,
  type FigmaIconPlan,
  type FigmaInputPlan,
  type FigmaVariablePlan,
  type TokenSet,
  type ToolkitResult,
  type WriterCommandEnvelope,
} from "@agent-design-system-kit/core";
import * as z from "zod";

import { computeJsonContentDigest } from "./registry-files.js";
import type {
  ExecuteWriterCommandOptions,
  LocalWriterClient,
  WriterOperation,
} from "./local-writer-client.js";

const requestIdentitySchema = z.strictObject({
  assetId: stableAssetIdSchema,
  assetVersion: strictSemverSchema.describe(
    "Exact approved asset SemVer; library writes never infer a version.",
  ),
  requestId: z
    .uuid()
    .describe("Stable UUID for this ensure intent and every exact retry."),
});

export const variablesEnsureLoopInputSchema = requestIdentitySchema;
export const componentEnsureLoopInputSchema = requestIdentitySchema;

export type VariablesEnsureLoopInput = z.infer<
  typeof variablesEnsureLoopInputSchema
>;
export type ComponentEnsureLoopInput = z.infer<
  typeof componentEnsureLoopInputSchema
>;

const operationOutputSchema = z.strictObject({
  attempt: z.number().int().positive(),
  operationId: z.uuid(),
  status: z.literal("succeeded"),
});

const actionSchema = z.enum(["created", "unchanged", "updated"]);

const variablesEnsureLoopOutputDataSchema = z.strictObject({
  collection: z.strictObject({
    action: actionSchema,
    stableId: stableAssetIdSchema,
  }),
  operation: operationOutputSchema,
  resolution: z.strictObject({
    approvalId: z.string().min(1).max(320),
    assetId: stableAssetIdSchema,
    assetVersion: strictSemverSchema,
    contentDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    fileBindingId: z.uuid(),
  }),
  status: z.literal("ensured"),
  variables: z.strictObject({
    created: z.number().int().nonnegative(),
    deferredTypographyCount: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
  }),
});

export const variablesEnsureLoopOutputSchema = z.strictObject({
  data: variablesEnsureLoopOutputDataSchema,
  ok: z.literal(true),
  schemaVersion: z.literal("1.0.0"),
  warnings: z.array(z.unknown()),
});

const componentEnsureLoopOutputDataSchema = z.strictObject({
  componentSet: z.strictObject({
    action: actionSchema,
    nodeId: z.string().regex(/^\d+:\d+$/u),
    stableId: stableAssetIdSchema,
  }),
  operation: operationOutputSchema,
  resolution: z.strictObject({
    approvalId: z.string().min(1).max(320),
    assetId: stableAssetIdSchema,
    assetVersion: strictSemverSchema,
    commandType: z.enum([
      "components.button.ensure",
      "components.icon.ensure",
      "components.input.ensure",
    ]),
    contentDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    fileBindingId: z.uuid(),
    profile: z.enum(["button-v1", "icon-v1", "input-v1"]),
  }),
  status: z.literal("ensured"),
  variants: z.strictObject({
    created: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
  }),
});

export const componentEnsureLoopOutputSchema = z.strictObject({
  data: componentEnsureLoopOutputDataSchema,
  ok: z.literal(true),
  schemaVersion: z.literal("1.0.0"),
  warnings: z.array(z.unknown()),
});

export type VariablesEnsureLoopOutput = z.infer<
  typeof variablesEnsureLoopOutputDataSchema
>;
export type ComponentEnsureLoopOutput = z.infer<
  typeof componentEnsureLoopOutputDataSchema
>;

export interface LibraryEnsureLoopOptions {
  readonly expectedProjectId: string;
  readonly writer: LocalWriterClient;
}

function invalidRequest(kind: "Component" | "Variables") {
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      message: `The ${kind} ensure request is invalid.`,
      recoveryInstruction:
        "Provide an exact registered asset ID and SemVer plus one stable request UUID for retries.",
      target: {
        logicalId: `${kind.toLowerCase()}-ensure-loop`,
        type: "operation",
      },
    }),
  );
}

function projectMismatch(snapshot: DesignSystemSnapshot) {
  return createFailureResult(
    createToolkitError({
      code: "IDENTITY_CONFLICT",
      message:
        "The loaded design system does not match the configured project.",
      recoveryInstruction:
        "Reload the configured project before requesting a Figma write.",
      target: { logicalId: snapshot.projectId, type: "project" },
    }),
  );
}

function identityFailure(
  code: "IDENTITY_CONFLICT" | "IDENTITY_NOT_FOUND",
  message: string,
  logicalId: string,
  type: "component" | "token-set",
) {
  return createFailureResult(
    createToolkitError({
      code,
      message,
      recoveryInstruction:
        "Correct the Git catalog so the requested identity and Figma file binding are unique, then retry.",
      target: { logicalId, type },
    }),
  );
}

function resolveTokenSet(
  snapshot: DesignSystemSnapshot,
  request: VariablesEnsureLoopInput,
): ToolkitResult<TokenSet> {
  const matches = snapshot.tokenSets
    .map(({ data }) => data)
    .filter(
      (tokenSet) =>
        tokenSet.projectId === snapshot.projectId &&
        tokenSet.assetId === request.assetId &&
        tokenSet.assetVersion === request.assetVersion,
    );
  if (matches.length === 0) {
    return identityFailure(
      "IDENTITY_NOT_FOUND",
      `No Token Set '${request.assetId}' matched the exact ensure request.`,
      request.assetId,
      "token-set",
    );
  }
  if (matches.length > 1) {
    return identityFailure(
      "IDENTITY_CONFLICT",
      `Token Set '${request.assetId}@${request.assetVersion}' is defined more than once.`,
      request.assetId,
      "token-set",
    );
  }
  const selected = matches[0];
  if (selected === undefined) {
    return createFailureResult(
      createToolkitError({
        code: "INTERNAL_ERROR",
        message: "Token Set resolution drifted after a non-empty match.",
        recoveryInstruction:
          "Reload the validated catalog and report the local resolver failure if it repeats.",
        target: { logicalId: request.assetId, type: "token-set" },
      }),
    );
  }
  return createSuccessResult(selected);
}

function componentForEntry(
  snapshot: DesignSystemSnapshot,
  assetId: string,
  assetVersion: string,
): ComponentContract | undefined {
  return snapshot.components.find(
    ({ data }) =>
      data.projectId === snapshot.projectId &&
      data.assetId === assetId &&
      data.assetVersion === assetVersion,
  )?.data;
}

function resolveTokenFileBinding(
  snapshot: DesignSystemSnapshot,
  tokenSet: TokenSet,
): ToolkitResult<string> {
  const bindings = new Set<string>();
  for (const { data: registry } of snapshot.registries) {
    for (const entry of registry.entries) {
      if (entry.lifecycle !== "active") continue;
      const component = componentForEntry(
        snapshot,
        entry.asset.id,
        entry.asset.version,
      );
      if (
        component?.tokenSource.projectId === tokenSet.projectId &&
        component.tokenSource.assetId === tokenSet.assetId &&
        component.tokenSource.assetVersion === tokenSet.assetVersion
      ) {
        bindings.add(entry.figma.fileBindingId);
      }
    }
  }
  if (bindings.size === 0) {
    return identityFailure(
      "IDENTITY_NOT_FOUND",
      `Token Set '${tokenSet.assetId}' is not referenced by an active Component Registry entry with a Figma file binding.`,
      tokenSet.assetId,
      "token-set",
    );
  }
  if (bindings.size > 1) {
    return identityFailure(
      "IDENTITY_CONFLICT",
      `Token Set '${tokenSet.assetId}' resolves to more than one Figma file binding.`,
      tokenSet.assetId,
      "token-set",
    );
  }
  const binding = [...bindings][0];
  return binding === undefined
    ? identityFailure(
        "IDENTITY_CONFLICT",
        "Token Set file binding resolution drifted.",
        tokenSet.assetId,
        "token-set",
      )
    : createSuccessResult(binding);
}

function variablesCommand(
  request: VariablesEnsureLoopInput,
  plan: FigmaVariablePlan,
  fileBindingId: string,
): WriterCommandEnvelope {
  const approvalId = approvalIdForSubject({
    assetId: plan.source.assetId,
    assetVersion: plan.source.assetVersion,
    type: "token-set",
  });
  return {
    approval: {
      approvalId,
      mode: "approved",
      subject: { ...plan.source, type: "token-set" },
    },
    command: { payload: { plan }, type: "variables.ensure" },
    idempotencyKey: `variables-ensure:${request.requestId}`,
    operationId: request.requestId,
    projectId: plan.source.projectId,
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "hatchkit-mcp" },
    target: {
      fileBindingId,
      kind: "figma-file",
      stableId: `${plan.source.projectId}/figma-file/library`,
    },
  };
}

type ComponentPlan = FigmaButtonPlan | FigmaIconPlan | FigmaInputPlan;
type ComponentCommandType =
  | "components.button.ensure"
  | "components.icon.ensure"
  | "components.input.ensure";

function createComponentPlan(
  contract: ComponentContract,
  tokenSet: TokenSet,
  componentDigest: string,
  tokenDigest: string,
): ToolkitResult<{
  readonly commandType: ComponentCommandType;
  readonly plan: ComponentPlan;
}> {
  switch (contract.profile) {
    case "button-v1": {
      const planned = createFigmaButtonPlan(
        contract,
        tokenSet,
        componentDigest,
        tokenDigest,
      );
      return planned.ok
        ? createSuccessResult({
            commandType: "components.button.ensure",
            plan: planned.data,
          })
        : planned;
    }
    case "icon-v1": {
      const planned = createFigmaIconPlan(
        contract,
        tokenSet,
        componentDigest,
        tokenDigest,
      );
      return planned.ok
        ? createSuccessResult({
            commandType: "components.icon.ensure",
            plan: planned.data,
          })
        : planned;
    }
    case "input-v1": {
      const planned = createFigmaInputPlan(
        contract,
        tokenSet,
        componentDigest,
        tokenDigest,
      );
      return planned.ok
        ? createSuccessResult({
            commandType: "components.input.ensure",
            plan: planned.data,
          })
        : planned;
    }
  }
}

function componentCommand(
  request: ComponentEnsureLoopInput,
  approvalId: string,
  commandType: ComponentCommandType,
  plan: ComponentPlan,
  fileBindingId: string,
): WriterCommandEnvelope {
  const base = {
    approval: {
      approvalId,
      mode: "approved" as const,
      subject: { ...plan.source, type: "component" as const },
    },
    idempotencyKey: `component-ensure:${request.requestId}`,
    operationId: request.requestId,
    projectId: plan.source.projectId,
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "hatchkit-mcp" as const },
    target: {
      fileBindingId,
      kind: "figma-file" as const,
      stableId: `${plan.source.projectId}/figma-file/library`,
    },
  };
  switch (commandType) {
    case "components.button.ensure":
      return {
        ...base,
        command: {
          payload: { plan: plan as FigmaButtonPlan },
          type: commandType,
        },
      };
    case "components.icon.ensure":
      return {
        ...base,
        command: {
          payload: { plan: plan as FigmaIconPlan },
          type: commandType,
        },
      };
    case "components.input.ensure":
      return {
        ...base,
        command: {
          payload: { plan: plan as FigmaInputPlan },
          type: commandType,
        },
      };
  }
}

function invalidWriterResult(
  operation: WriterOperation,
  kind: "Component" | "Variables",
) {
  return createFailureResult(
    createToolkitError({
      code: "INTERNAL_ERROR",
      message: `The completed Writer Operation did not contain an audited ${kind} ensure result.`,
      recoveryInstruction:
        "Inspect the local Operation Log and Plugin version before retrying.",
      target: { logicalId: operation.operationId, type: "operation" },
    }),
  );
}

export async function runVariablesEnsureLoop(
  snapshot: DesignSystemSnapshot,
  input: unknown,
  options: LibraryEnsureLoopOptions,
  executeOptions: ExecuteWriterCommandOptions = {},
): Promise<ToolkitResult<VariablesEnsureLoopOutput>> {
  const request = variablesEnsureLoopInputSchema.safeParse(input);
  if (!request.success) return invalidRequest("Variables");
  if (snapshot.projectId !== options.expectedProjectId) {
    return projectMismatch(snapshot);
  }
  const resolved = resolveTokenSet(snapshot, request.data);
  if (!resolved.ok) return resolved;
  const fileBinding = resolveTokenFileBinding(snapshot, resolved.data);
  if (!fileBinding.ok) return fileBinding;
  const contentDigest = computeJsonContentDigest(
    toTokenSetDigestSubject(resolved.data),
  );
  const planned = createFigmaVariablePlan(resolved.data, contentDigest);
  if (!planned.ok) return planned;
  const operationResult = await options.writer.execute(
    variablesCommand(request.data, planned.data, fileBinding.data),
    executeOptions,
  );
  if (!operationResult.ok) return operationResult;
  const operation = operationResult.data;
  const parsed = writerSuccessResultSchema.safeParse(operation.result);
  if (
    operation.status !== "succeeded" ||
    !parsed.success ||
    !("type" in parsed.data) ||
    parsed.data.type !== "variables.ensure" ||
    parsed.data.collection.stableId !== planned.data.collection.stableId
  ) {
    return invalidWriterResult(operation, "Variables");
  }
  return createSuccessResult({
    collection: parsed.data.collection,
    operation: {
      attempt: operation.attempt,
      operationId: operation.operationId,
      status: "succeeded",
    },
    resolution: {
      approvalId: approvalIdForSubject({
        assetId: resolved.data.assetId,
        assetVersion: resolved.data.assetVersion,
        type: "token-set",
      }),
      assetId: resolved.data.assetId,
      assetVersion: resolved.data.assetVersion,
      contentDigest,
      fileBindingId: fileBinding.data,
    },
    status: "ensured",
    variables: {
      ...parsed.data.variables,
      deferredTypographyCount: parsed.data.deferredTypographyCount,
    },
  });
}

export async function runComponentEnsureLoop(
  snapshot: DesignSystemSnapshot,
  input: unknown,
  options: LibraryEnsureLoopOptions,
  executeOptions: ExecuteWriterCommandOptions = {},
): Promise<ToolkitResult<ComponentEnsureLoopOutput>> {
  const request = componentEnsureLoopInputSchema.safeParse(input);
  if (!request.success) return invalidRequest("Component");
  if (snapshot.projectId !== options.expectedProjectId) {
    return projectMismatch(snapshot);
  }
  const resolved = resolveComponent(snapshot, {
    assetId: request.data.assetId,
    assetVersion: request.data.assetVersion,
    projectId: options.expectedProjectId,
    variantSelections: {},
  });
  if (!resolved.ok) return resolved;
  const contract = resolved.data.contract;
  const tokenSet = snapshot.tokenSets.find(
    ({ data }) =>
      data.projectId === contract.tokenSource.projectId &&
      data.assetId === contract.tokenSource.assetId &&
      data.assetVersion === contract.tokenSource.assetVersion,
  )?.data;
  if (tokenSet === undefined) {
    return identityFailure(
      "IDENTITY_NOT_FOUND",
      "The resolved Component Token dependency is missing.",
      contract.tokenSource.assetId,
      "token-set",
    );
  }
  const planned = createComponentPlan(
    contract,
    tokenSet,
    resolved.data.registryEntry.asset.contentDigest,
    computeJsonContentDigest(toTokenSetDigestSubject(tokenSet)),
  );
  if (!planned.ok) return planned;
  const operationResult = await options.writer.execute(
    componentCommand(
      request.data,
      resolved.data.registryEntry.approvalId,
      planned.data.commandType,
      planned.data.plan,
      resolved.data.registryEntry.figma.fileBindingId,
    ),
    executeOptions,
  );
  if (!operationResult.ok) return operationResult;
  const operation = operationResult.data;
  const parsed = writerSuccessResultSchema.safeParse(operation.result);
  if (
    operation.status !== "succeeded" ||
    !parsed.success ||
    !("type" in parsed.data) ||
    ![
      "components.button.ensure",
      "components.icon.ensure",
      "components.input.ensure",
    ].includes(parsed.data.type) ||
    parsed.data.type !== planned.data.commandType ||
    parsed.data.componentSet.stableId !==
      planned.data.plan.componentSet.stableId
  ) {
    return invalidWriterResult(operation, "Component");
  }
  return createSuccessResult({
    componentSet: parsed.data.componentSet,
    operation: {
      attempt: operation.attempt,
      operationId: operation.operationId,
      status: "succeeded",
    },
    resolution: {
      approvalId: resolved.data.registryEntry.approvalId,
      assetId: contract.assetId,
      assetVersion: contract.assetVersion,
      commandType: planned.data.commandType,
      contentDigest: resolved.data.registryEntry.asset.contentDigest,
      fileBindingId: resolved.data.registryEntry.figma.fileBindingId,
      profile: contract.profile,
    },
    status: "ensured",
    variants: parsed.data.variants,
  });
}

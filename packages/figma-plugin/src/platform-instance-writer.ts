import {
  canonicalizeJson,
  type ErrorCode,
  type FigmaPlatformInstancePlan,
} from "@agent-design-system-kit/core";

import {
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
  getFigmaLibraryFileBinding,
  type SharedPluginDataPort,
} from "./variables-writer.js";

interface PlatformInstanceMarker {
  readonly approvalId: string;
  readonly assetType: "official-platform-instance";
  readonly bindingId: string;
  readonly bindingVersion: string;
  readonly componentKey: string;
  readonly contentDigest: string;
  readonly instanceStableId: string;
  readonly libraryId: string;
  readonly phase: "applied" | "creating";
  readonly platformTargetId: string;
  readonly platformTargetVersion: string;
  readonly projectId: string;
  readonly schemaVersion: "1.0.0";
  readonly x: number;
  readonly y: number;
}

export interface PlatformInstanceNodePort extends SharedPluginDataPort {
  readonly id: string;
  name: string;
  x: number;
  y: number;
  getMainComponent(): Promise<{
    readonly key: string;
    readonly remote: boolean;
  } | null>;
  remove(): void;
  setProperties(properties: Readonly<Record<string, string>>): void;
}

export interface RemoteComponentPort {
  readonly key: string;
  readonly remote: boolean;
  createInstance(): PlatformInstanceNodePort;
}

export interface FigmaPlatformInstancePort {
  readonly document: SharedPluginDataPort;
  appendToCurrentPage(instance: PlatformInstanceNodePort): void;
  getInstances(): Promise<readonly PlatformInstanceNodePort[]>;
  importComponentByKey(key: string): Promise<RemoteComponentPort>;
}

export interface InsertPlatformInstanceContext {
  readonly approvalId: string;
  readonly fileBindingId: string;
  readonly operationId: string;
  readonly projectId: string;
}

export interface InsertPlatformInstanceResult {
  readonly component: { readonly key: string; readonly remote: true };
  readonly instance: {
    readonly action: "created" | "recovered" | "unchanged";
    readonly detached: false;
    readonly nodeId: string;
    readonly stableId: string;
  };
  readonly type: "instances.platform.insert";
}

export class PlatformInstanceWriterError extends Error {
  readonly code: ErrorCode;
  readonly completedSteps: readonly string[];
  readonly recoveryInstruction: string;

  constructor(input: {
    readonly code: ErrorCode;
    readonly completedSteps?: readonly string[];
    readonly message: string;
    readonly recoveryInstruction: string;
  }) {
    super(input.message);
    this.name = "PlatformInstanceWriterError";
    this.code = input.code;
    this.completedSteps = input.completedSteps ?? [];
    this.recoveryInstruction = input.recoveryInstruction;
  }
}

function fail(
  code: ErrorCode,
  message: string,
  recoveryInstruction: string,
  completedSteps: readonly string[] = [],
): PlatformInstanceWriterError {
  return new PlatformInstanceWriterError({
    code,
    completedSteps,
    message,
    recoveryInstruction,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function marker(node: PlatformInstanceNodePort): PlatformInstanceMarker | null {
  try {
    const value = JSON.parse(
      node.getSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
      ) || "null",
    ) as unknown;
    return isRecord(value) &&
      value.assetType === "official-platform-instance" &&
      value.schemaVersion === "1.0.0" &&
      (value.phase === "applied" || value.phase === "creating")
      ? (value as unknown as PlatformInstanceMarker)
      : null;
  } catch {
    return null;
  }
}

function expectedMarker(
  plan: FigmaPlatformInstancePlan,
  context: InsertPlatformInstanceContext,
  phase: PlatformInstanceMarker["phase"],
): PlatformInstanceMarker {
  return {
    approvalId: context.approvalId,
    assetType: "official-platform-instance",
    bindingId: plan.source.bindingId,
    bindingVersion: plan.source.bindingVersion,
    componentKey: plan.source.componentKey,
    contentDigest: plan.source.contentDigest,
    instanceStableId: plan.instance.stableId,
    libraryId: plan.source.libraryId,
    phase,
    platformTargetId: plan.source.platformTargetId,
    platformTargetVersion: plan.source.platformTargetVersion,
    projectId: plan.source.projectId,
    schemaVersion: "1.0.0",
    x: plan.instance.x,
    y: plan.instance.y,
  };
}

function assertFile(
  port: FigmaPlatformInstancePort,
  plan: FigmaPlatformInstancePlan,
  context: InsertPlatformInstanceContext,
): void {
  const binding = getFigmaLibraryFileBinding(port.document);
  if (
    binding === null ||
    binding.fileRole !== "design-page" ||
    binding.projectId !== context.projectId ||
    binding.fileBindingId !== context.fileBindingId ||
    plan.source.fileBindingId !== context.fileBindingId
  ) {
    throw fail(
      "FILE_BINDING_MISMATCH",
      "The open Figma file does not match the requested page file binding.",
      "Open or bind the exact target Figma file before inserting the official Instance.",
    );
  }
}

function exactMarkerMatches(
  actual: PlatformInstanceMarker | null,
  expected: PlatformInstanceMarker,
): boolean {
  return (
    actual !== null &&
    canonicalizeJson({ ...actual, phase: "applied" }) ===
      canonicalizeJson({ ...expected, phase: "applied" })
  );
}

async function assertRemoteMainComponent(
  instance: PlatformInstanceNodePort,
  expectedKey: string,
  completedSteps: readonly string[],
): Promise<void> {
  const main = await instance.getMainComponent();
  if (main === null) {
    throw fail(
      "UNMANAGED_ASSET",
      "The official Instance has no Main Component and may have been detached.",
      "Remove the detached node and reinsert it from the enabled official Library.",
      completedSteps,
    );
  }
  if (!main.remote || main.key !== expectedKey) {
    throw fail(
      "IDENTITY_CONFLICT",
      "The Instance Main Component is not the exact approved remote component.",
      "Verify Library access and the registered published Component Key before retrying.",
      completedSteps,
    );
  }
}

export async function insertFigmaPlatformInstance(
  port: FigmaPlatformInstancePort,
  plan: FigmaPlatformInstancePlan,
  context: InsertPlatformInstanceContext,
): Promise<InsertPlatformInstanceResult> {
  assertFile(port, plan, context);
  if (
    context.approvalId !== plan.source.approvalId ||
    context.projectId !== plan.source.projectId
  ) {
    throw fail(
      "APPROVAL_STALE",
      "Writer context does not match the approved Platform Binding.",
      "Rebuild the command from the current approved Platform Registry entry.",
    );
  }
  const expectedApplied = expectedMarker(plan, context, "applied");
  const existing = (await port.getInstances()).filter(
    (instance) => marker(instance)?.instanceStableId === plan.instance.stableId,
  );
  if (existing.length > 1) {
    throw fail(
      "IDENTITY_CONFLICT",
      "More than one Instance uses the requested stable identity.",
      "Resolve duplicate managed Instance identities before retrying.",
    );
  }
  const recovered = existing[0];
  if (recovered !== undefined) {
    const recoveredMarker = marker(recovered);
    if (!exactMarkerMatches(recoveredMarker, expectedApplied)) {
      throw fail(
        "CONTENT_DIGEST_CONFLICT",
        "An existing Instance identity belongs to a different approved Platform Binding.",
        "Use a new stable Instance identity or remove the conflicting managed node.",
      );
    }
    await assertRemoteMainComponent(recovered, plan.source.componentKey, [
      "existing-instance-resolved",
    ]);
    const action =
      recoveredMarker?.phase === "creating" ? "recovered" : "unchanged";
    if (action === "recovered") {
      recovered.setSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
        canonicalizeJson(expectedApplied),
      );
    }
    return {
      component: { key: plan.source.componentKey, remote: true },
      instance: {
        action,
        detached: false,
        nodeId: recovered.id,
        stableId: plan.instance.stableId,
      },
      type: "instances.platform.insert",
    };
  }

  let component: RemoteComponentPort;
  try {
    component = await port.importComponentByKey(plan.source.componentKey);
  } catch {
    throw fail(
      "CREDENTIAL_REQUIRED",
      "The official published Component could not be imported with the current Figma access.",
      "Enable the official Library, accept its terms if prompted, confirm access, and retry the same operation.",
    );
  }
  if (!component.remote || component.key !== plan.source.componentKey) {
    throw fail(
      "IDENTITY_CONFLICT",
      "The imported Component is not the exact approved remote asset.",
      "Correct the Platform Registry Component Key after real Figma verification.",
      ["component-imported"],
    );
  }
  const instance = component.createInstance();
  instance.setSharedPluginData(
    HATCHKIT_SHARED_NAMESPACE,
    MANAGED_ASSET_SHARED_KEY,
    canonicalizeJson(expectedMarker(plan, context, "creating")),
  );
  instance.name = `Hatchkit Official / ${plan.source.bindingId}`;
  instance.x = plan.instance.x;
  instance.y = plan.instance.y;
  const overrides = Object.fromEntries(
    plan.propertyOverrides.map(({ figmaPropertyName, value }) => [
      figmaPropertyName,
      value,
    ]),
  );
  try {
    if (Object.keys(overrides).length > 0) instance.setProperties(overrides);
  } catch {
    instance.remove();
    throw fail(
      "CONTENT_DIGEST_CONFLICT",
      "The official Component property API no longer matches the approved mapping.",
      "Re-verify the official kit, create a new Platform Binding version, and obtain approval.",
      ["component-imported", "instance-created"],
    );
  }
  port.appendToCurrentPage(instance);
  await assertRemoteMainComponent(instance, plan.source.componentKey, [
    "component-imported",
    "instance-created",
    "instance-appended",
  ]);
  instance.setSharedPluginData(
    HATCHKIT_SHARED_NAMESPACE,
    MANAGED_ASSET_SHARED_KEY,
    canonicalizeJson(expectedApplied),
  );
  return {
    component: { key: plan.source.componentKey, remote: true },
    instance: {
      action: "created",
      detached: false,
      nodeId: instance.id,
      stableId: plan.instance.stableId,
    },
    type: "instances.platform.insert",
  };
}

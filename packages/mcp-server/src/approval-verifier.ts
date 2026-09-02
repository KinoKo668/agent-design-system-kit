import {
  canonicalizeJson,
  checkApprovalForUse,
  createFigmaButtonInstancePlan,
  createFigmaButtonPlan,
  createFigmaIconPlan,
  createFigmaIconInstancePlan,
  createFigmaInputPlan,
  createFigmaVariablePlan,
  createToolkitError,
  type DesignSystemSnapshot,
  type ToolkitError,
  type ToolkitResult,
  type WriterCommandEnvelope,
} from "@agent-design-system-kit/core";

import { loadDesignSystemFromDirectory } from "./registry-files.js";

export interface ApprovalVerifierOptions {
  readonly designSystemRoot: string;
  readonly expectedProjectId: string;
}

export interface ApprovalVerifierAdapters {
  readonly loadSnapshot: (
    options: ApprovalVerifierOptions,
  ) => Promise<ToolkitResult<DesignSystemSnapshot>>;
}

export type WriterApprovalVerifier = (
  command: WriterCommandEnvelope,
) => Promise<ToolkitError | null>;

const DEFAULT_ADAPTERS: ApprovalVerifierAdapters = {
  loadSnapshot: loadDesignSystemFromDirectory,
};

function planMismatchError(command: WriterCommandEnvelope): ToolkitError {
  return createToolkitError({
    code: "APPROVAL_STALE",
    message:
      "The Writer plan is not the deterministic plan generated from the current approved Git source.",
    recoveryInstruction:
      "Discard the client plan, reload the current approved source, and regenerate the Writer Command.",
    target: {
      logicalId:
        command.approval.mode === "approved"
          ? command.approval.subject.assetId
          : command.projectId,
      type: "operation",
    },
  });
}

function verifyDeterministicPlan(
  snapshot: DesignSystemSnapshot,
  command: WriterCommandEnvelope,
): ToolkitError | null {
  if (
    command.command.type === "writer.ping" ||
    command.approval.mode !== "approved"
  )
    return null;
  const subject = command.approval.subject;
  const approvalId = command.approval.approvalId;
  if (command.command.type === "variables.ensure") {
    const tokenSet = snapshot.tokenSets.find(
      ({ data }) =>
        data.projectId === subject.projectId &&
        data.assetId === subject.assetId &&
        data.assetVersion === subject.assetVersion,
    );
    if (tokenSet === undefined) return planMismatchError(command);
    const expected = createFigmaVariablePlan(
      tokenSet.data,
      subject.contentDigest,
    );
    return !expected.ok ||
      canonicalizeJson(expected.data) !==
        canonicalizeJson(command.command.payload.plan)
      ? planMismatchError(command)
      : null;
  }

  if (
    command.command.type === "instances.button.insert" ||
    command.command.type === "instances.icon.insert"
  ) {
    if (command.command.type === "instances.button.insert") {
      const plan = command.command.payload.plan;
      const prefix = `${plan.source.projectId}/instance/`;
      if (!plan.instance.stableId.startsWith(prefix)) {
        return planMismatchError(command);
      }
      const expected = createFigmaButtonInstancePlan(snapshot, {
        assetId: plan.source.assetId,
        assetVersion: plan.source.assetVersion,
        instanceId: plan.instance.stableId.slice(prefix.length),
        label: plan.properties.label.value,
        projectId: plan.source.projectId,
        variantSelections: plan.selectedVariant.selections,
        x: plan.instance.x,
        y: plan.instance.y,
      });
      return !expected.ok ||
        canonicalizeJson(expected.data) !== canonicalizeJson(plan)
        ? planMismatchError(command)
        : null;
    }
    const plan = command.command.payload.plan;
    const prefix = `${plan.source.projectId}/instance/`;
    if (!plan.instance.stableId.startsWith(prefix)) {
      return planMismatchError(command);
    }
    const expected = createFigmaIconInstancePlan(snapshot, {
      assetId: plan.source.assetId,
      assetVersion: plan.source.assetVersion,
      instanceId: plan.instance.stableId.slice(prefix.length),
      projectId: plan.source.projectId,
      variantSelections: plan.selectedVariant.selections,
      x: plan.instance.x,
      y: plan.instance.y,
    });
    return !expected.ok ||
      canonicalizeJson(expected.data) !== canonicalizeJson(plan)
      ? planMismatchError(command)
      : null;
  }

  const component = snapshot.components.find(
    ({ data }) =>
      data.projectId === subject.projectId &&
      data.assetId === subject.assetId &&
      data.assetVersion === subject.assetVersion,
  );
  const approval = snapshot.approvals.find(
    ({ data }) => data.approvalId === approvalId,
  )?.data;
  const tokenDependency = approval?.dependencies.find(
    (dependency) => dependency.type === "token-set",
  );
  const tokenSet =
    component === undefined || tokenDependency === undefined
      ? undefined
      : snapshot.tokenSets.find(
          ({ data }) =>
            data.projectId === component.data.tokenSource.projectId &&
            data.assetId === component.data.tokenSource.assetId &&
            data.assetVersion === component.data.tokenSource.assetVersion &&
            data.projectId === tokenDependency.projectId &&
            data.assetId === tokenDependency.assetId &&
            data.assetVersion === tokenDependency.assetVersion,
        );
  if (
    component === undefined ||
    tokenSet === undefined ||
    tokenDependency === undefined
  )
    return planMismatchError(command);
  if (
    (component.data.profile === "button-v1" &&
      command.command.type !== "components.button.ensure") ||
    (component.data.profile === "icon-v1" &&
      command.command.type !== "components.icon.ensure") ||
    (component.data.profile === "input-v1" &&
      command.command.type !== "components.input.ensure")
  ) {
    return planMismatchError(command);
  }
  const expected = (() => {
    switch (component.data.profile) {
      case "button-v1":
        return createFigmaButtonPlan(
          component.data,
          tokenSet.data,
          subject.contentDigest,
          tokenDependency.contentDigest,
        );
      case "icon-v1":
        return createFigmaIconPlan(
          component.data,
          tokenSet.data,
          subject.contentDigest,
          tokenDependency.contentDigest,
        );
      case "input-v1":
        return createFigmaInputPlan(
          component.data,
          tokenSet.data,
          subject.contentDigest,
          tokenDependency.contentDigest,
        );
    }
  })();
  return !expected.ok ||
    canonicalizeJson(expected.data) !==
      canonicalizeJson(command.command.payload.plan)
    ? planMismatchError(command)
    : null;
}

export function createGitApprovalVerifier(
  options: ApprovalVerifierOptions,
  adapters: ApprovalVerifierAdapters = DEFAULT_ADAPTERS,
): WriterApprovalVerifier {
  return async (command) => {
    if (command.command.type === "writer.ping") return null;
    if (
      command.projectId !== options.expectedProjectId ||
      command.approval.mode !== "approved"
    ) {
      return createToolkitError({
        code: "APPROVAL_REQUIRED",
        message:
          "The Writer Command does not target the configured project with an approved subject.",
        recoveryInstruction:
          "Use the configured project and submit an exact human Approval Record before retrying.",
        target: {
          logicalId: command.projectId,
          type: "project",
        },
      });
    }

    const snapshotResult = await adapters.loadSnapshot(options);
    if (!snapshotResult.ok) return snapshotResult.error;
    const subject = command.approval.subject;
    const approvalError = checkApprovalForUse(
      snapshotResult.data.approvals.map(({ data }) => data),
      {
        approvalId: command.approval.approvalId,
        assetId: subject.assetId,
        assetVersion: subject.assetVersion,
        contentDigest: subject.contentDigest,
        projectId: subject.projectId,
        type: subject.type,
      },
    );
    return (
      approvalError ?? verifyDeterministicPlan(snapshotResult.data, command)
    );
  };
}

import {
  checkApprovalForUse,
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
    return checkApprovalForUse(
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
  };
}

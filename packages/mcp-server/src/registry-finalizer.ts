import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import process from "node:process";

import {
  canonicalizeJson,
  createToolkitError,
  markComponentRegistryReady,
  validateComponentRegistry,
  type ComponentRegistry,
  type DesignSystemSnapshot,
  type ToolkitError,
  type ToolkitResult,
  type WriterCommandEnvelope,
  type WriterSuccessResult,
} from "@agent-design-system-kit/core";

import { loadDesignSystemFromDirectory } from "./registry-files.js";

const MAX_REGISTRY_BYTES = 2 * 1_024 * 1_024;

export interface RegistryFinalizerOptions {
  readonly designSystemRoot: string;
  readonly expectedProjectId: string;
}

export interface RegistryFinalizerAdapters {
  readonly loadSnapshot: (
    options: RegistryFinalizerOptions,
  ) => Promise<ToolkitResult<DesignSystemSnapshot>>;
  readonly updateRegistrySource: (input: {
    readonly designSystemRoot: string;
    readonly expected: ComponentRegistry;
    readonly sourcePath: string;
    readonly updated: ComponentRegistry;
  }) => Promise<void>;
}

export type RegistryWriteFinalizer = (
  command: WriterCommandEnvelope,
  result: WriterSuccessResult,
) => Promise<ToolkitError | null>;

class RegistrySourceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistrySourceConflictError";
  }
}

function isInsideRoot(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

export async function updateRegistrySourceAtomically(input: {
  readonly designSystemRoot: string;
  readonly expected: ComponentRegistry;
  readonly sourcePath: string;
  readonly updated: ComponentRegistry;
}): Promise<void> {
  const expectedResult = validateComponentRegistry(input.expected);
  const updatedResult = validateComponentRegistry(input.updated);
  if (!expectedResult.ok || !updatedResult.ok) {
    throw new RegistrySourceConflictError(
      "Registry atomic update requires valid expected and updated documents.",
    );
  }
  const root = await realpath(resolve(input.designSystemRoot));
  const target = resolve(root, input.sourcePath);
  if (!isInsideRoot(root, target)) {
    throw new RegistrySourceConflictError(
      "Registry source resolves outside the design-system root.",
    );
  }
  const directory = dirname(target);
  const resolvedDirectory = await realpath(directory);
  if (!isInsideRoot(root, resolvedDirectory)) {
    throw new RegistrySourceConflictError(
      "Registry directory resolves outside the design-system root.",
    );
  }
  const lockPath = `${target}.hatchkit.lock`;
  const temporaryPath = resolve(
    directory,
    `.${basename(target)}.hatchkit-${randomUUID()}.tmp`,
  );
  let lockHandle: Awaited<ReturnType<typeof open>> | undefined;
  let lockIdentity: { readonly dev: number; readonly ino: number } | undefined;
  let sourceHandle: Awaited<ReturnType<typeof open>> | undefined;
  let temporaryHandle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    lockHandle = await open(
      lockPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    await lockHandle.writeFile(
      `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
      "utf8",
    );
    await lockHandle.sync();
    const lockStat = await lockHandle.stat();
    lockIdentity = { dev: lockStat.dev, ino: lockStat.ino };
    sourceHandle = await open(
      target,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const stat = await sourceHandle.stat();
    if (!stat.isFile() || stat.size > MAX_REGISTRY_BYTES) {
      throw new RegistrySourceConflictError(
        "Registry source is not a bounded regular file.",
      );
    }
    const sourceMode = stat.mode & 0o777;
    const sourceText = await sourceHandle.readFile("utf8");
    let sourceValue: unknown;
    try {
      sourceValue = JSON.parse(sourceText) as unknown;
    } catch {
      throw new RegistrySourceConflictError(
        "Registry source changed to invalid JSON before commit.",
      );
    }
    const current = validateComponentRegistry(sourceValue);
    if (
      !current.ok ||
      canonicalizeJson(current.data) !== canonicalizeJson(expectedResult.data)
    ) {
      throw new RegistrySourceConflictError(
        "Registry source changed after planning; refusing to overwrite it.",
      );
    }
    await sourceHandle.close();
    sourceHandle = undefined;
    temporaryHandle = await open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    await temporaryHandle.writeFile(
      `${JSON.stringify(updatedResult.data, null, 2)}\n`,
      "utf8",
    );
    await temporaryHandle.chmod(sourceMode);
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;
    const commitStat = await lstat(target);
    if (
      !commitStat.isFile() ||
      commitStat.dev !== stat.dev ||
      commitStat.ino !== stat.ino ||
      commitStat.size !== stat.size ||
      commitStat.mtimeMs !== stat.mtimeMs ||
      commitStat.ctimeMs !== stat.ctimeMs
    ) {
      throw new RegistrySourceConflictError(
        "Registry source changed during commit; refusing to overwrite it.",
      );
    }
    await rename(temporaryPath, target);
    const directoryHandle = await open(directory, constants.O_RDONLY);
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } finally {
    await temporaryHandle?.close().catch(() => undefined);
    await sourceHandle?.close().catch(() => undefined);
    await lockHandle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    if (lockIdentity !== undefined) {
      const currentLock = await lstat(lockPath).catch(() => undefined);
      if (
        currentLock?.dev === lockIdentity.dev &&
        currentLock.ino === lockIdentity.ino
      ) {
        await unlink(lockPath).catch(() => undefined);
      }
    }
  }
}

const DEFAULT_ADAPTERS: RegistryFinalizerAdapters = {
  loadSnapshot: loadDesignSystemFromDirectory,
  updateRegistrySource: updateRegistrySourceAtomically,
};

function partialRegistryError(command: WriterCommandEnvelope): ToolkitError {
  return createToolkitError({
    code: "PARTIAL_WRITE",
    message:
      "The Figma Button was audited successfully, but its Registry locator was not committed.",
    recoveryInstruction:
      "Keep the Figma asset, resolve the Registry conflict, then retry the same approved command and idempotency key.",
    target: {
      logicalId:
        command.approval.mode === "approved"
          ? command.approval.subject.assetId
          : command.projectId,
      type: "registry",
    },
  });
}

export function createRegistryWriteFinalizer(
  options: RegistryFinalizerOptions,
  adapters: RegistryFinalizerAdapters = DEFAULT_ADAPTERS,
): RegistryWriteFinalizer {
  return async (command, result) => {
    if (
      !("type" in result) ||
      (result.type !== "components.button.ensure" &&
        result.type !== "instances.button.insert")
    ) {
      return null;
    }
    const plan =
      result.type === "components.button.ensure" &&
      command.command.type === "components.button.ensure"
        ? command.command.payload.plan
        : result.type === "instances.button.insert" &&
            command.command.type === "instances.button.insert"
          ? command.command.payload.plan
          : null;
    if (
      plan === null ||
      command.approval.mode !== "approved" ||
      command.target.kind !== "figma-file"
    )
      return partialRegistryError(command);
    const componentSetResult = result.componentSet;
    const target = command.target;
    try {
      const snapshotResult = await adapters.loadSnapshot(options);
      if (!snapshotResult.ok) return partialRegistryError(command);
      const matches = snapshotResult.data.registries.filter(({ data }) =>
        data.entries.some(
          ({ asset }) =>
            asset.id === plan.source.assetId &&
            asset.version === plan.source.assetVersion,
        ),
      );
      if (matches.length !== 1) return partialRegistryError(command);
      const located = matches[0];
      if (located === undefined) return partialRegistryError(command);
      const update = markComponentRegistryReady(located.data, {
        approvalId: command.approval.approvalId,
        assetId: plan.source.assetId,
        assetVersion: plan.source.assetVersion,
        componentSetStableId: componentSetResult.stableId,
        contentDigest: plan.source.contentDigest,
        fileBindingId: target.fileBindingId,
        majorVersion: plan.componentSet.majorVersion,
        nodeId: componentSetResult.nodeId,
        projectId: plan.source.projectId,
      });
      if (!update.ok) return partialRegistryError(command);
      if (update.data.action === "unchanged") return null;
      await adapters.updateRegistrySource({
        designSystemRoot: options.designSystemRoot,
        expected: located.data,
        sourcePath: located.sourcePath,
        updated: update.data.registry,
      });
      const verified = await adapters.loadSnapshot(options);
      if (!verified.ok) return partialRegistryError(command);
      const ready = verified.data.registries.some(({ data, sourcePath }) => {
        if (sourcePath !== located.sourcePath) return false;
        const entry = data.entries.find(
          ({ asset }) =>
            asset.id === plan.source.assetId &&
            asset.version === plan.source.assetVersion,
        );
        return (
          entry?.figma.status === "ready" &&
          entry.figma.fileBindingId === target.fileBindingId &&
          entry.figma.locator.nodeId === componentSetResult.nodeId &&
          entry.figma.appliedDigest === plan.source.contentDigest
        );
      });
      return ready ? null : partialRegistryError(command);
    } catch {
      return partialRegistryError(command);
    }
  };
}

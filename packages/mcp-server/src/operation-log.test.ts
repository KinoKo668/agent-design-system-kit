import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createOperationLog, type OperationLogEvent } from "./operation-log.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "hatchkit-operation-log-"));
  temporaryDirectories.push(directory);
  return directory;
}

function event(
  operationId: string,
  timestamp: string,
  status: OperationLogEvent["status"] = "queued",
): OperationLogEvent {
  return {
    attempt: status === "queued" ? 0 : 1,
    commandFingerprint:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    commandType: "writer.ping",
    idempotencyKeyHash:
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    operationId,
    projectId: "hatch-demo",
    schemaVersion: "1.0.0",
    status,
    targetStableId: "hatch-demo/plugin-session",
    timestamp,
  };
}

describe("append-only Writer operation log", () => {
  it("serializes concurrent appends with private file permissions", async () => {
    const directory = await temporaryDirectory();
    const log = createOperationLog({ directory, sensitiveValues: [] });
    await Promise.all([
      log.append(
        event(
          "2c73620e-29b0-4285-8861-1a65b18f11dc",
          "2026-09-01T12:00:00.000Z",
        ),
      ),
      log.append(
        event(
          "ae8ee112-0337-4168-93fe-b7b04fa1367e",
          "2026-09-01T12:00:01.000Z",
          "dispatched",
        ),
      ),
    ]);

    const entries = await readdir(directory);
    const path = join(directory, entries[0] ?? "missing");
    const metadata = await lstat(path);
    expect(metadata.mode & 0o777).toBe(0o600);
    expect((await readFile(path, "utf8")).trim().split("\n")).toHaveLength(2);
    expect(
      await log.readEvents(new Date("2026-09-01T12:01:00.000Z")),
    ).toHaveLength(2);
  });

  it("retains only events inside the exact rolling window", async () => {
    const directory = await temporaryDirectory();
    const log = createOperationLog({
      directory,
      retentionDays: 1,
      sensitiveValues: [],
    });
    await log.append(
      event("2c73620e-29b0-4285-8861-1a65b18f11dc", "2026-08-31T11:59:59.000Z"),
    );
    await log.append(
      event("ae8ee112-0337-4168-93fe-b7b04fa1367e", "2026-08-31T12:00:00.000Z"),
    );

    const events = await log.readEvents(new Date("2026-09-01T12:00:00.000Z"));
    expect(events.map((entry) => entry.operationId)).toEqual([
      "ae8ee112-0337-4168-93fe-b7b04fa1367e",
    ]);
  });

  it("rejects a symbolic-link directory before reading or appending", async () => {
    const parent = await temporaryDirectory();
    const target = join(parent, "target");
    const link = join(parent, "link");
    await mkdir(target);
    await symlink(target, link);
    const log = createOperationLog({ directory: link, sensitiveValues: [] });

    await expect(
      log.readEvents(new Date("2026-09-01T12:00:00.000Z")),
    ).rejects.toThrow("real local directory");
    await expect(
      log.append(
        event(
          "2c73620e-29b0-4285-8861-1a65b18f11dc",
          "2026-09-01T12:00:00.000Z",
        ),
      ),
    ).rejects.toThrow("real local directory");
  });
});

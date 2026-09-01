import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  WRITER_PROTOCOL_SCHEMA_VERSION,
  type WriterCommandEnvelope,
} from "@agent-design-system-kit/core";
import { afterEach, describe, expect, it } from "vitest";

import { createOperationLog } from "./operation-log.js";
import { createWriterQueue } from "./writer-queue.js";

const temporaryDirectories: string[] = [];
const IDS = [
  "2c73620e-29b0-4285-8861-1a65b18f11dc",
  "ae8ee112-0337-4168-93fe-b7b04fa1367e",
  "77f50469-046a-460c-8336-c4dc010e4773",
  "f0eaf7cb-7df8-47fb-b074-7aeff801a1ed",
] as const;
const PLUGIN_INSTANCE_ID = "c45c06e8-80ae-4478-ad55-9c49c60ecc56";

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function temporaryLogDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "hatchkit-writer-queue-"));
  temporaryDirectories.push(directory);
  return directory;
}

function command(
  operationId: string,
  idempotencyKey = `key-${operationId}`,
  projectId = "hatch-demo",
): WriterCommandEnvelope {
  return {
    approval: {
      mode: "not_required",
      reason: "read_only_diagnostic",
    },
    command: { payload: {}, type: "writer.ping" },
    idempotencyKey,
    operationId,
    projectId,
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      kind: "plugin-session",
      stableId: `${projectId}/plugin-session`,
    },
  };
}

function clock() {
  let milliseconds = Date.parse("2026-09-01T12:00:00.000Z");
  let monotonic = 0;
  return {
    advance(value: number) {
      milliseconds += value;
      monotonic += value;
    },
    now: () => new Date(milliseconds),
    nowMonotonicMs: () => monotonic,
  };
}

async function queueFixture(directory: string, currentClock = clock()) {
  const log = createOperationLog({
    directory,
    sensitiveValues: ["session-secret"],
  });
  const queue = createWriterQueue({
    leaseMs: 100,
    log,
    now: currentClock.now,
    nowMonotonicMs: currentClock.nowMonotonicMs,
  });
  await queue.initialize();
  return { currentClock, log, queue };
}

describe("formal Writer queue", () => {
  it("keeps one command in flight and preserves FIFO order", async () => {
    const fixture = await queueFixture(await temporaryLogDirectory());
    await fixture.queue.submit(command(IDS[0]));
    await fixture.queue.submit(command(IDS[1]));

    expect((await fixture.queue.leaseNext())?.operationId).toBe(IDS[0]);
    expect(await fixture.queue.leaseNext()).toBeNull();
    await fixture.queue.acceptResult({
      ok: true,
      operationId: IDS[0],
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: { pong: true },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect((await fixture.queue.leaseNext())?.operationId).toBe(IDS[1]);
  });

  it("redelivers the same operation after its lease expires", async () => {
    const fixture = await queueFixture(await temporaryLogDirectory());
    await fixture.queue.submit(command(IDS[0]));

    expect((await fixture.queue.leaseNext())?.attempt).toBe(1);
    fixture.currentClock.advance(101);
    const redelivered = await fixture.queue.leaseNext();
    expect(redelivered?.operationId).toBe(IDS[0]);
    expect(redelivered?.attempt).toBe(2);
  });

  it("requeues the active command when the writer disconnects", async () => {
    const fixture = await queueFixture(await temporaryLogDirectory());
    await fixture.queue.submit(command(IDS[0]));
    await fixture.queue.leaseNext();

    await fixture.queue.disconnectWriter();
    expect((await fixture.queue.leaseNext())?.operationId).toBe(IDS[0]);
  });

  it("rejects a result for an operation that was never dispatched", async () => {
    const fixture = await queueFixture(await temporaryLogDirectory());
    await fixture.queue.submit(command(IDS[0]));
    expect(fixture.queue.getDispatchedCommand(IDS[0])).toBeNull();

    const result = await fixture.queue.acceptResult({
      ok: true,
      operationId: IDS[0],
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: { pong: true },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("OPERATION_ID_CONFLICT");
    expect(fixture.queue.getOperation(IDS[0])).toMatchObject({
      data: { status: "queued" },
      ok: true,
    });
  });

  it("replays the same idempotent command and rejects conflicting reuse", async () => {
    const fixture = await queueFixture(await temporaryLogDirectory());
    const first = await fixture.queue.submit(command(IDS[0], "shared-key"));
    expect(first.ok && first.data.idempotentReplay).toBe(false);

    const replay = await fixture.queue.submit(command(IDS[1], "shared-key"));
    expect(replay.ok && replay.data.idempotentReplay).toBe(true);
    expect(replay.ok && replay.data.operation.operationId).toBe(IDS[0]);

    const conflict = await fixture.queue.submit(
      command(IDS[2], "shared-key", "another-project"),
    );
    expect(conflict.ok).toBe(false);
    expect(!conflict.ok && conflict.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("rejects operation ID reuse with a different idempotency identity", async () => {
    const fixture = await queueFixture(await temporaryLogDirectory());
    await fixture.queue.submit(command(IDS[0], "first-key"));

    const conflict = await fixture.queue.submit(command(IDS[0], "second-key"));
    expect(conflict.ok).toBe(false);
    expect(!conflict.ok && conflict.error.code).toBe("OPERATION_ID_CONFLICT");
  });

  it("records terminal results and treats duplicate results as replay", async () => {
    const fixture = await queueFixture(await temporaryLogDirectory());
    await fixture.queue.submit(command(IDS[0]));
    await fixture.queue.leaseNext();
    const dispatched = fixture.queue.getDispatchedCommand(IDS[0]);
    expect(dispatched).toEqual(command(IDS[0]));
    if (dispatched !== null) {
      (dispatched as { projectId: string }).projectId = "mutated-copy";
    }
    expect(fixture.queue.getDispatchedCommand(IDS[0])?.projectId).toBe(
      "hatch-demo",
    );
    const result = {
      ok: true as const,
      operationId: IDS[0],
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: { pong: true },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    };

    const accepted = await fixture.queue.acceptResult(result);
    const replay = await fixture.queue.acceptResult(result);
    expect(accepted.ok && accepted.data.replayed).toBe(false);
    expect(replay.ok && replay.data.replayed).toBe(true);
    expect(fixture.queue.getOperation(IDS[0])).toMatchObject({
      data: { status: "succeeded" },
      ok: true,
    });
    expect(fixture.queue.getDispatchedCommand(IDS[0])).toBeNull();
  });

  it("preserves completed steps for a recoverable partial write", async () => {
    const fixture = await queueFixture(await temporaryLogDirectory());
    await fixture.queue.submit(command(IDS[0]));
    await fixture.queue.leaseNext();
    const accepted = await fixture.queue.acceptResult({
      error: {
        code: "PARTIAL_WRITE",
        completedSteps: ["resolved_variable_modes", "resolved_variables"],
        message: "The Variable write stopped after creating managed skeletons.",
        recoveryInstruction: "Retry the same operation.",
      },
      ok: false,
      operationId: IDS[0],
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(accepted.ok).toBe(true);

    expect(fixture.queue.getOperation(IDS[0])).toMatchObject({
      data: {
        error: {
          code: "PARTIAL_WRITE",
          context: {
            completedSteps: ["resolved_variable_modes", "resolved_variables"],
          },
        },
        status: "partial",
      },
      ok: true,
    });

    const resumed = await fixture.queue.submit(
      command(IDS[1], `key-${IDS[0]}`),
    );
    expect(resumed).toMatchObject({
      data: {
        idempotentReplay: true,
        operation: { operationId: IDS[0], status: "queued" },
      },
      ok: true,
    });
    expect(await fixture.queue.leaseNext()).toMatchObject({
      attempt: 2,
      operationId: IDS[0],
    });
  });

  it("marks unfinished operations interrupted on restart and resumes only on resubmit", async () => {
    const directory = await temporaryLogDirectory();
    const first = await queueFixture(directory);
    await first.queue.submit(command(IDS[0], "restart-key"));
    await first.queue.leaseNext();

    const second = await queueFixture(directory, first.currentClock);
    expect(second.queue.getOperation(IDS[0])).toMatchObject({
      data: { status: "interrupted" },
      ok: true,
    });
    expect(await second.queue.leaseNext()).toBeNull();

    const resumed = await second.queue.submit(command(IDS[1], "restart-key"));
    expect(resumed).toMatchObject({
      data: {
        idempotentReplay: true,
        operation: { operationId: IDS[0], status: "queued" },
      },
      ok: true,
    });
    expect((await second.queue.leaseNext())?.operationId).toBe(IDS[0]);
  });

  it("stores only idempotency hashes and redacts sensitive results", async () => {
    const directory = await temporaryLogDirectory();
    const fixture = await queueFixture(directory);
    await fixture.queue.submit(command(IDS[0], "never-persist-raw-key"));
    await fixture.log.append({
      attempt: 1,
      commandFingerprint:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      commandType: "writer.ping",
      idempotencyKeyHash:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      operationId: IDS[3],
      projectId: "hatch-demo",
      result: { authorization: "Bearer session-secret" },
      schemaVersion: "1.0.0",
      status: "succeeded",
      targetStableId: "hatch-demo/plugin-session",
      timestamp: fixture.currentClock.now().toISOString(),
    });

    const files = await readdir(directory);
    const content = await readFile(
      join(directory, files[0] ?? "missing"),
      "utf8",
    );
    expect(content).not.toContain("never-persist-raw-key");
    expect(content).not.toContain("session-secret");
    expect(content).toContain("[REDACTED]");
  });
});

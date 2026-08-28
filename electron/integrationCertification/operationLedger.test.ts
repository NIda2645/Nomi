import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CertificationPersistenceError,
  OperationLedger,
  type OperationLedgerWrite,
} from "./operationLedger";
import { ProductionRunLockBusyError } from "../productionRun/productionRunLock";

const roots: string[] = [];

function ledger(dependencies: { write?: OperationLedgerWrite } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-cert-ledger-"));
  roots.push(root);
  const filePath = path.join(root, "private", "operations.json");
  return { filePath, ledger: new OperationLedger(filePath, dependencies) };
}

function beginInput(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run-1",
    contractDigest: "a".repeat(64),
    idempotencyKey: "integration-user-confirmation-1",
    lineageRootVendorKey: "api-example-com",
    leaseOwner: "run-1",
    leaseToken: "lease-1",
    attempt: 1,
    childRunRef: { runId: "run-1", revisionDigest: "b".repeat(64) },
    now: "2026-08-28T00:00:00.000Z",
    ...overrides,
  } as const;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("OperationLedger", () => {
  it("serializes two real ledger instances and gives only one process the create lease", () => {
    const { ledger: first, filePath } = ledger();
    const second = new OperationLedger(filePath);
    const canonical = first.begin(beginInput());
    const duplicate = second.begin({
      ...beginInput(),
      runId: "run-2",
      leaseOwner: "worker-2",
      leaseToken: "lease-2",
    });

    expect(duplicate.runId).toBe(canonical.runId);
    const firstLease = first.markSubmitting("run-1", {
      operationKey: "paint-v2/text_to_image/1",
      providerIdempotency: "unsupported",
      expectedRevision: canonical.revision,
      now: "2026-08-28T00:00:01.000Z",
    });
    expect(() => second.markSubmitting("run-1", {
      operationKey: "paint-v2/text_to_image/1",
      providerIdempotency: "unsupported",
      expectedRevision: canonical.revision,
      now: "2026-08-28T00:00:01.000Z",
    })).toThrowError(/revision|submitting|lease/i);
    expect(new OperationLedger(filePath).getByRunId("run-1")?.revision).toBe(firstLease.revision);
  });

  it("stores only an idempotency hash and keeps the same key stable", () => {
    const { ledger: store, filePath } = ledger();
    store.begin(beginInput());
    const persisted = fs.readFileSync(filePath, "utf8");

    expect(persisted).not.toContain("integration-user-confirmation-1");
    expect((store.getByRunId("run-1") as unknown as { idempotencyHash?: string }).idempotencyHash)
      .toMatch(/^[a-f0-9]{64}$/);
    expect(store.begin({ ...beginInput(), runId: "run-2" }).runId).toBe("run-1");
  });

  it("persists independent mode operations and their exact settled outcomes", () => {
    const { ledger: store, filePath } = ledger();
    const run = store.begin(beginInput());
    store.markSubmitting("run-1", {
      operationKey: "paint-v2/text_to_image/1",
      modelKey: "paint-v2",
      taskKind: "text_to_image",
      providerIdempotency: "unsupported",
      expectedRevision: run.revision,
      now: "2026-08-28T00:00:01.000Z",
    });
    let current = new OperationLedger(filePath).getByRunId("run-1")!;
    store.markSettled("run-1", {
      operationKey: "paint-v2/text_to_image/1",
      expectedRevision: current.revision,
      result: { ok: true, taskKind: "text_to_image" },
      now: "2026-08-28T00:00:02.000Z",
    });
    current = new OperationLedger(filePath).getByRunId("run-1")!;
    store.markSubmitting("run-1", {
      operationKey: "paint-v2/image_edit/1",
      modelKey: "paint-v2",
      taskKind: "image_edit",
      providerIdempotency: "unsupported",
      expectedRevision: current.revision,
      now: "2026-08-28T00:00:03.000Z",
    });
    current = new OperationLedger(filePath).getByRunId("run-1")!;
    store.markSettled("run-1", {
      operationKey: "paint-v2/image_edit/1",
      expectedRevision: current.revision,
      result: { ok: false, taskKind: "image_edit", stage: "create", errorCategory: "input" },
      now: "2026-08-28T00:00:04.000Z",
    });

    const recovered = new OperationLedger(filePath).getByRunId("run-1") as unknown as {
      modeOperationKeys: Record<string, string>;
      modeOperations: Record<string, { settledResult?: { ok: boolean } }>;
    };
    expect(recovered.modeOperationKeys).toEqual({
      "paint-v2/text_to_image": "paint-v2/text_to_image/1",
      "paint-v2/image_edit": "paint-v2/image_edit/1",
    });
    expect(recovered.modeOperations[recovered.modeOperationKeys["paint-v2/text_to_image"]].settledResult?.ok).toBe(true);
    expect(recovered.modeOperations[recovered.modeOperationKeys["paint-v2/image_edit"]].settledResult?.ok).toBe(false);
  });

  it("returns the original operation for a duplicate idempotency key and rejects contract drift", () => {
    const { ledger: store } = ledger();
    const first = store.begin(beginInput());
    const duplicate = store.begin({ ...beginInput(), runId: "run-2", leaseOwner: "run-2", leaseToken: "lease-2" });

    expect(duplicate).toEqual(first);
    expect(store.snapshot().operations).toHaveLength(1);
    expect(() => store.begin({ ...beginInput(), contractDigest: "c".repeat(64) }))
      .toThrowError(/idempotency.*different contract/i);
  });

  it("persists every submission checkpoint and never permits unknown submission to create again", () => {
    const { ledger: store, filePath } = ledger();
    store.begin(beginInput());
    store.markSubmitting("run-1", {
      operationKey: "paint-v2/text_to_image/1",
      providerIdempotency: "unsupported",
      expectedRevision: 1,
      now: "2026-08-28T00:00:01.000Z",
    });
    expect(new OperationLedger(filePath).getByRunId("run-1")).toMatchObject({
      checkpoint: "submitting",
      submissionState: "submitting",
    });

    store.markSubmitted("run-1", {
      remoteTaskId: "remote-accepted-1",
      expectedRevision: 2,
      now: "2026-08-28T00:00:01.500Z",
    });
    expect(new OperationLedger(filePath).getByRunId("run-1")).toMatchObject({
      checkpoint: "submitted",
      submissionState: "submitted",
      remoteTaskId: "remote-accepted-1",
    });

    store.markUnknown("run-1", {
      expectedRevision: 3,
      userAction: "reconcile_or_contact_provider",
      now: "2026-08-28T00:00:02.000Z",
    });
    expect(new OperationLedger(filePath).getByRunId("run-1")).toMatchObject({
      checkpoint: "submission_unknown",
      submissionState: "unknown",
      userAction: "reconcile_or_contact_provider",
    });
    expect(() => store.markSubmitting("run-1", {
      operationKey: "paint-v2/text_to_image/1",
      providerIdempotency: "unsupported",
      expectedRevision: 4,
      now: "2026-08-28T00:00:03.000Z",
    })).toThrowError(/reconcile/i);

    store.markReconciled("run-1", {
      remoteTaskId: "remote-accepted-1",
      expectedRevision: 4,
      now: "2026-08-28T00:00:04.000Z",
    });
    store.markSettled("run-1", {
      expectedRevision: 5,
      artifactEvidence: [{
        kind: "image",
        contentType: "image/png",
        byteLength: 93,
        sha256: "d".repeat(64),
        metadata: { width: 2, height: 2 },
      }],
      now: "2026-08-28T00:00:05.000Z",
    });
    expect(new OperationLedger(filePath).getByRunId("run-1")).toMatchObject({
      checkpoint: "settled",
      submissionState: "settled",
      remoteTaskId: "remote-accepted-1",
    });
  });

  it("recovers each post-submission and promotion checkpoint after a fresh process", () => {
    const { ledger: store, filePath } = ledger();
    let current = store.begin(beginInput());
    current = store.markSubmitting("run-1", {
      operationKey: "paint-v2/text_to_image/1",
      providerIdempotency: "supported",
      expectedRevision: current.revision,
      now: "2026-08-28T00:00:01.000Z",
    });
    current = store.markSettled("run-1", {
      expectedRevision: current.revision,
      now: "2026-08-28T00:00:02.000Z",
    });
    for (const checkpoint of ["promotion_prepared", "promotion_committed", "finalized"] as const) {
      current = store.markCheckpoint("run-1", {
        checkpoint,
        expectedRevision: current.revision,
        now: "2026-08-28T00:00:03.000Z",
      });
      expect(new OperationLedger(filePath).getByRunId("run-1")?.checkpoint).toBe(checkpoint);
    }
  });

  it("uses revision and lease CAS for concurrent start/cancel despite clock skew", () => {
    const { ledger: store } = ledger();
    store.begin(beginInput());
    store.cancel("run-1", { expectedRevision: 1, leaseToken: "lease-1", now: "2026-08-28T00:00:10.000Z" });

    expect(() => store.markSubmitting("run-1", {
      operationKey: "paint-v2/text_to_image/1",
      providerIdempotency: "supported",
      expectedRevision: 1,
      now: "2026-08-27T00:00:00.000Z",
    })).toThrowError(/revision|cancel/i);
    expect(() => store.cancel("run-1", {
      expectedRevision: 2,
      leaseToken: "stale-lease",
      now: "2026-08-29T00:00:00.000Z",
    })).toThrowError(/lease/i);
  });

  it("times out on a live foreign owner and rejects a lost lock before publishing", () => {
    const busy = {
      acquire: () => { throw new ProductionRunLockBusyError(); },
      assertOwned: () => undefined,
      release: () => undefined,
    };
    const { filePath } = ledger();
    expect(() => new OperationLedger(filePath, { lock: busy, lockTimeoutMs: 1 } as never).begin(beginInput()))
      .toThrowError(/lock timed out/i);

    const lost = {
      acquire: () => ({ ownerId: "lost-owner" }),
      assertOwned: () => { throw new Error("lease lost"); },
      release: () => undefined,
    };
    expect(() => new OperationLedger(filePath, { lock: lost } as never).begin(beginInput())).toThrowError(/lease lost/i);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("fails closed for corrupt, truncated, oversized, and future-version ledgers", () => {
    const { filePath } = ledger();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    for (const payload of ["{", JSON.stringify({ version: 99, operations: [] }), "x".repeat(1_048_577)]) {
      fs.writeFileSync(filePath, payload, "utf8");
      expect(() => new OperationLedger(filePath)).toThrowError(CertificationPersistenceError);
    }
  });

  it("rejects sensitive or contradictory fields anywhere in a recovered operation", () => {
    const { ledger: store, filePath } = ledger();
    store.begin(beginInput());
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as { operations: Array<Record<string, unknown>> };
    raw.operations[0].apiKey = "SENTINEL-SECRET";
    fs.writeFileSync(filePath, JSON.stringify(raw));
    expect(() => new OperationLedger(filePath)).toThrowError(/apiKey|field/i);

    delete raw.operations[0].apiKey;
    const transaction = raw.operations[0].startTransaction as Record<string, unknown>;
    transaction.stagedVendorKey = "candidate-provider";
    fs.writeFileSync(filePath, JSON.stringify(raw));
    expect(() => new OperationLedger(filePath)).toThrowError(/unstaged|transaction/i);
  });

  it("keeps the previous in-memory and on-disk state when fsync or rename fails", () => {
    let fail = false;
    const write: OperationLedgerWrite = (filePath, state) => {
      if (fail) throw new Error("simulated fsync failure");
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    };
    const { ledger: store, filePath } = ledger({ write });
    store.begin(beginInput());
    const before = fs.readFileSync(filePath, "utf8");
    fail = true;

    expect(() => store.markSubmitting("run-1", {
      operationKey: "paint-v2/text_to_image/1",
      providerIdempotency: "unknown",
      expectedRevision: 1,
      now: "2026-08-28T00:00:01.000Z",
    })).toThrowError(/fsync/);
    expect(store.getByRunId("run-1")?.checkpoint).toBe("prepared");
    expect(fs.readFileSync(filePath, "utf8")).toBe(before);
  });

  it("does not publish an in-memory operation when the atomic rename fails", () => {
    const { ledger: store, filePath } = ledger();
    vi.spyOn(fs, "renameSync").mockImplementation(() => {
      const error = new Error("simulated rename failure") as NodeJS.ErrnoException;
      error.code = "EIO";
      throw error;
    });

    expect(() => store.begin(beginInput())).toThrowError(/rename/);
    expect(store.snapshot().operations).toEqual([]);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.readdirSync(path.dirname(filePath)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("rejects URL-shaped remote task ids instead of persisting signed provider URLs", () => {
    const { ledger: store } = ledger();
    let current = store.begin(beginInput());
    current = store.markSubmitting("run-1", {
      operationKey: "paint-v2/text_to_image/1",
      providerIdempotency: "unknown",
      expectedRevision: current.revision,
      now: "2026-08-28T00:00:01.000Z",
    });
    expect(() => store.markSubmitted("run-1", {
      remoteTaskId: "https://cdn.invalid/output?token=SECRET",
      expectedRevision: current.revision,
      now: "2026-08-28T00:00:02.000Z",
    })).toThrowError(/remote task id/i);
  });

  it.each([
    "folder/task-1",
    "task?token=secret",
    "task#fragment",
    "task%2Fchild",
    "//cdn.invalid/task",
    "task\u0000id",
    "x".repeat(129),
  ])("rejects non-opaque remote task id %j", (remoteTaskId) => {
    const { ledger: store } = ledger();
    let current = store.begin(beginInput());
    current = store.markSubmitting("run-1", {
      operationKey: "paint-v2/text_to_image/1",
      providerIdempotency: "unknown",
      expectedRevision: current.revision,
      now: "2026-08-28T00:00:01.000Z",
    });
    expect(() => store.markSubmitted("run-1", {
      remoteTaskId,
      expectedRevision: current.revision,
      now: "2026-08-28T00:00:02.000Z",
    })).toThrowError(/remote task id/i);
  });

  it("rejects unknown or sensitive artifact evidence fields instead of silently filtering them", () => {
    const { ledger: store } = ledger();
    let current = store.begin(beginInput());
    current = store.markSubmitting("run-1", {
      operationKey: "paint-v2/text_to_image/1",
      providerIdempotency: "unknown",
      expectedRevision: current.revision,
      now: "2026-08-28T00:00:01.000Z",
    });
    expect(() => store.markSettled("run-1", {
      expectedRevision: current.revision,
      artifactEvidence: [{
        kind: "image",
        contentType: "image/png",
        byteLength: 93,
        sha256: "d".repeat(64),
        metadata: { width: 2, token: "secret", localPath: "/tmp/private.png" },
      } as never],
      now: "2026-08-28T00:00:02.000Z",
    })).toThrowError(/metadata|sensitive|field/i);
  });

  it.each([
    { checkpoint: "prepared", submissionState: "settled", remoteTaskId: undefined, evidence: [] },
    { checkpoint: "submitting", submissionState: "submitting", remoteTaskId: "remote-1", evidence: [] },
    { checkpoint: "submitted", submissionState: "submitted", remoteTaskId: undefined, evidence: [] },
    { checkpoint: "submission_unknown", submissionState: "unknown", remoteTaskId: undefined, evidence: [{ kind: "image" }] },
    { checkpoint: "settled", submissionState: "settled", remoteTaskId: undefined, evidence: [] },
  ])("fails closed on contradictory semantic state %#", (invalid) => {
    const { ledger: store, filePath } = ledger();
    store.begin(beginInput());
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as { operations: Array<Record<string, unknown>> };
    Object.assign(raw.operations[0], {
      checkpoint: invalid.checkpoint,
      submissionState: invalid.submissionState,
      ...(invalid.remoteTaskId ? { remoteTaskId: invalid.remoteTaskId } : {}),
      artifactEvidence: invalid.evidence,
    });
    fs.writeFileSync(filePath, JSON.stringify(raw));
    expect(() => new OperationLedger(filePath)).toThrowError(CertificationPersistenceError);
  });

  it("cleans failed atomic temp files and only removes stale startup temps", () => {
    const { filePath } = ledger();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const stale = path.join(path.dirname(filePath), `.${path.basename(filePath)}.stale.tmp`);
    const active = path.join(path.dirname(filePath), `.${path.basename(filePath)}.active.tmp`);
    fs.writeFileSync(stale, "stale");
    fs.writeFileSync(active, "active");
    const old = new Date(Date.now() - 60 * 60_000);
    fs.utimesSync(stale, old, old);

    new OperationLedger(filePath);
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(active)).toBe(true);

    const original = fs.writeFileSync;
    vi.spyOn(fs, "writeFileSync").mockImplementation((target, ...args) => {
      if (typeof target === "number") throw new Error("simulated write failure");
      return (original as (...values: unknown[]) => unknown)(target, ...args) as never;
    });
    expect(() => new OperationLedger(filePath).begin(beginInput())).toThrowError(/write failure/);
    expect(fs.readdirSync(path.dirname(filePath)).filter((name) =>
      name.startsWith(`.${path.basename(filePath)}.`) && !name.includes(".lock.") && name.endsWith(".tmp"),
    )).toEqual([
      path.basename(active),
    ]);
  });

  it("compacts terminal details into permanent bounded tombstones before size limits", () => {
    const { filePath } = ledger();
    const compacting = new OperationLedger(filePath, { maxActiveOperations: 3, maxInlineTombstones: 2 } as never);
    for (let index = 0; index < 8; index += 1) {
      const runId = `run-${index}`;
      const record = compacting.begin(beginInput({
        runId,
        idempotencyKey: `confirmation-${index}`,
        leaseOwner: runId,
        leaseToken: `lease-${index}`,
      }));
      compacting.markCheckpoint(runId, {
        checkpoint: "finalized",
        expectedRevision: record.revision,
        now: "2026-08-28T00:00:10.000Z",
      });
    }
    const raw = fs.readFileSync(filePath, "utf8");
    expect(Buffer.byteLength(raw)).toBeLessThan(1_048_576);
    expect(raw).not.toContain("artifactEvidence");
    expect((new OperationLedger(filePath) as unknown as { canonicalRunForIdempotencyKey: (key: string) => string })
      .canonicalRunForIdempotencyKey("confirmation-0")).toBe("run-0");
  });

  it("keeps the prior ledger intact across compaction crash and rejects oversized/versioned archives", () => {
    const { filePath } = ledger();
    const crashing = new OperationLedger(filePath, {
      maxActiveOperations: 1,
      maxInlineTombstones: 0,
      writeArchive: () => { throw new Error("simulated compaction crash"); },
    } as never);
    const first = crashing.begin(beginInput());
    crashing.markCheckpoint(first.runId, { checkpoint: "finalized", expectedRevision: first.revision, now: "2026-08-28T00:00:10.000Z" });
    expect(() => crashing.begin(beginInput({ runId: "run-2", idempotencyKey: "confirmation-2", leaseOwner: "run-2", leaseToken: "lease-2" })))
      .toThrowError(/compaction crash/);
    expect(new OperationLedger(filePath).canonicalRunForIdempotencyKey(beginInput().idempotencyKey)).toBe("run-1");

    const compacting = new OperationLedger(filePath, { maxActiveOperations: 1, maxInlineTombstones: 1 } as never);
    const second = compacting.begin(beginInput({ runId: "run-2", idempotencyKey: "confirmation-2", leaseOwner: "run-2", leaseToken: "lease-2" }));
    compacting.markCheckpoint(second.runId, { checkpoint: "finalized", expectedRevision: second.revision, now: "2026-08-28T00:00:11.000Z" });
    compacting.begin(beginInput({ runId: "run-3", idempotencyKey: "confirmation-3", leaseOwner: "run-3", leaseToken: "lease-3" }));
    const archiveDir = `${filePath}.archive`;
    const compactedState = JSON.parse(fs.readFileSync(filePath, "utf8")) as { archives: Array<{ fileName: string }> };
    const archivePath = path.join(archiveDir, compactedState.archives[0].fileName);
    const archive = JSON.parse(fs.readFileSync(archivePath, "utf8")) as Record<string, unknown>;
    archive.version = 99;
    fs.writeFileSync(archivePath, JSON.stringify(archive));
    expect(() => new OperationLedger(filePath).canonicalRunForIdempotencyKey(beginInput().idempotencyKey))
      .toThrowError(/version/i);

    fs.writeFileSync(filePath, JSON.stringify({ version: 2, operations: Array.from({ length: 1_001 }, () => ({})), tombstones: [], archives: [] }));
    expect(() => new OperationLedger(filePath)).toThrowError(/entries|invalid|too many/i);
  });

  it("creates private directories/files and persists no secret, header, URL, body, or local path", () => {
    const { ledger: store, filePath } = ledger();
    store.begin(beginInput());
    const persisted = fs.readFileSync(filePath, "utf8");

    expect(fs.statSync(path.dirname(filePath)).mode & 0o777).toBe(0o700);
    expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
    expect(persisted).not.toMatch(/apiKey|authorization|headers|signedUrl|rawBody|localPath|https?:\/\//i);
  });
});

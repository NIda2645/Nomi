import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CertificationPersistenceError,
  OperationLedger,
  type OperationLedgerWrite,
} from "./operationLedger";

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

  it("fails closed for corrupt, truncated, oversized, and future-version ledgers", () => {
    const { filePath } = ledger();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    for (const payload of ["{", JSON.stringify({ version: 99, operations: [] }), "x".repeat(1_048_577)]) {
      fs.writeFileSync(filePath, payload, "utf8");
      expect(() => new OperationLedger(filePath)).toThrowError(CertificationPersistenceError);
    }
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

  it("creates private directories/files and persists no secret, header, URL, body, or local path", () => {
    const { ledger: store, filePath } = ledger();
    store.begin(beginInput());
    const persisted = fs.readFileSync(filePath, "utf8");

    expect(fs.statSync(path.dirname(filePath)).mode & 0o777).toBe(0o700);
    expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
    expect(persisted).not.toMatch(/apiKey|authorization|headers|signedUrl|rawBody|localPath|https?:\/\//i);
  });
});

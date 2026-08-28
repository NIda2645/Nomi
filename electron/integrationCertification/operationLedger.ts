import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fsyncIfDurable, isDurable } from "../durability";
import { renameSyncWithRetry } from "../jsonFile";
import type { CertificationMediaEvidence } from "../providerAdapter/certificationMedia";
import {
  CERTIFICATION_LEDGER_VERSION,
  CERTIFICATION_SUBMISSION_STATES,
  type CertificationOperationLedgerState,
  type CertificationOperationRecord,
  type RemoteIdempotencyCapability,
} from "./types";

const MAX_FILE_BYTES = 1_048_576;
const MAX_OPERATIONS = 1_000;
const MAX_EVIDENCE = 32;
const EMPTY_STATE: CertificationOperationLedgerState = { version: CERTIFICATION_LEDGER_VERSION, operations: [] };

export class CertificationPersistenceError extends Error {
  constructor(
    readonly reason: "corrupt" | "unsupported_version" | "oversized" | "invalid_state",
    message: string,
  ) {
    super(message);
    this.name = "CertificationPersistenceError";
  }
}

export type OperationLedgerWrite = (filePath: string, state: CertificationOperationLedgerState) => void;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeToken(value: unknown, name: string, max = 256): string {
  if (typeof value !== "string" || !value || value.length > max || /[\r\n]/.test(value) || /:\/\//.test(value)) {
    throw new CertificationPersistenceError("invalid_state", `Invalid ${name}`);
  }
  return value;
}

function digest(value: unknown, name: string): string {
  const normalized = safeToken(value, name, 64);
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new CertificationPersistenceError("invalid_state", `Invalid ${name}`);
  return normalized;
}

function iso(value: unknown, name: string): string {
  const normalized = safeToken(value, name, 64);
  if (!Number.isFinite(Date.parse(normalized))) throw new CertificationPersistenceError("invalid_state", `Invalid ${name}`);
  return normalized;
}

function sanitizeEvidence(items: readonly CertificationMediaEvidence[] = []): CertificationMediaEvidence[] {
  if (items.length > MAX_EVIDENCE) throw new CertificationPersistenceError("invalid_state", "Too much artifact evidence");
  return items.map((item) => {
    if (!item || !["image", "video", "audio", "model3d"].includes(item.kind)) {
      throw new CertificationPersistenceError("invalid_state", "Invalid artifact kind");
    }
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(item.contentType)) {
      throw new CertificationPersistenceError("invalid_state", "Invalid artifact content type");
    }
    if (!Number.isSafeInteger(item.byteLength) || item.byteLength <= 0) {
      throw new CertificationPersistenceError("invalid_state", "Invalid artifact byte length");
    }
    digest(item.sha256, "artifact digest");
    const metadata = Object.fromEntries(Object.entries(item.metadata || {}).filter(([, value]) =>
      (typeof value === "number" && Number.isFinite(value) && value >= 0)
      || (typeof value === "string" && /^[A-Za-z0-9_.+-]{1,64}$/.test(value)),
    ));
    return { kind: item.kind, contentType: item.contentType, byteLength: item.byteLength, sha256: item.sha256, metadata };
  });
}

function validateOperation(raw: unknown): CertificationOperationRecord {
  if (!isRecord(raw) || raw.version !== 1 || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1) {
    throw new CertificationPersistenceError("invalid_state", "Invalid certification operation");
  }
  if (!isRecord(raw.lease) || !isRecord(raw.childRunRef)) {
    throw new CertificationPersistenceError("invalid_state", "Invalid operation references");
  }
  const checkpoints = new Set([
    "prepared", "submitting", "submitted", "submission_unknown", "settled",
    "promotion_prepared", "promotion_committed", "finalized", "cancelled", "superseded",
  ]);
  const submissions = new Set<string>(CERTIFICATION_SUBMISSION_STATES);
  const remoteCapabilities = new Set(["supported", "unsupported", "unknown"]);
  if (!checkpoints.has(String(raw.checkpoint)) || !submissions.has(String(raw.submissionState))
    || !remoteCapabilities.has(String(raw.providerIdempotency))) {
    throw new CertificationPersistenceError("invalid_state", "Invalid operation state");
  }
  const operation: CertificationOperationRecord = {
    version: 1,
    revision: Number(raw.revision),
    runId: safeToken(raw.runId, "run id"),
    contractDigest: digest(raw.contractDigest, "contract digest"),
    idempotencyKey: safeToken(raw.idempotencyKey, "idempotency key"),
    lineageRootVendorKey: safeToken(raw.lineageRootVendorKey, "lineage root"),
    lease: { ownerId: safeToken(raw.lease.ownerId, "lease owner"), token: safeToken(raw.lease.token, "lease token") },
    attempt: Number(raw.attempt),
    checkpoint: raw.checkpoint as CertificationOperationRecord["checkpoint"],
    providerIdempotency: raw.providerIdempotency as RemoteIdempotencyCapability,
    submissionState: raw.submissionState as CertificationOperationRecord["submissionState"],
    artifactEvidence: sanitizeEvidence(Array.isArray(raw.artifactEvidence) ? raw.artifactEvidence as CertificationMediaEvidence[] : []),
    childRunRef: {
      runId: safeToken(raw.childRunRef.runId, "child run id"),
      revisionDigest: digest(raw.childRunRef.revisionDigest, "child revision digest"),
    },
    createdAt: iso(raw.createdAt, "created at"),
    updatedAt: iso(raw.updatedAt, "updated at"),
  };
  if (!Number.isSafeInteger(operation.attempt) || operation.attempt < 1 || operation.attempt > 100) {
    throw new CertificationPersistenceError("invalid_state", "Invalid attempt");
  }
  if (raw.operationKey !== undefined) operation.operationKey = safeToken(raw.operationKey, "operation key", 512);
  if (raw.remoteTaskId !== undefined) operation.remoteTaskId = safeToken(raw.remoteTaskId, "remote task id", 512);
  if (raw.userAction === "reconcile_or_contact_provider" || raw.userAction === "review_newer_certification") {
    operation.userAction = raw.userAction;
  }
  return operation;
}

function readState(filePath: string): CertificationOperationLedgerState {
  if (!fs.existsSync(filePath)) return clone(EMPTY_STATE);
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_BYTES) throw new CertificationPersistenceError("oversized", "Certification ledger exceeds size limit");
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw new CertificationPersistenceError("corrupt", "Certification ledger is corrupt or truncated");
  }
  if (!isRecord(parsed) || parsed.version !== 1) {
    const reason = isRecord(parsed) && typeof parsed.version === "number" ? "unsupported_version" : "corrupt";
    throw new CertificationPersistenceError(reason, "Unsupported certification ledger version");
  }
  if (!Array.isArray(parsed.operations) || parsed.operations.length > MAX_OPERATIONS) {
    throw new CertificationPersistenceError("invalid_state", "Invalid certification ledger entries");
  }
  const operations = parsed.operations.map(validateOperation);
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const operation of operations) {
    if (ids.has(operation.runId) || keys.has(operation.idempotencyKey)) {
      throw new CertificationPersistenceError("invalid_state", "Duplicate certification ledger identity");
    }
    ids.add(operation.runId);
    keys.add(operation.idempotencyKey);
  }
  return { version: 1, operations };
}

export function writeCertificationJsonAtomic(filePath: string, state: unknown): void {
  const serialized = `${JSON.stringify(state, null, 2)}\n`;
  if (Buffer.byteLength(serialized) > MAX_FILE_BYTES) {
    throw new CertificationPersistenceError("oversized", "Certification persistence exceeds size limit");
  }
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
  const fd = fs.openSync(tempPath, "wx", 0o600);
  try {
    fs.writeFileSync(fd, serialized, "utf8");
    fsyncIfDurable(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    renameSyncWithRetry(tempPath, filePath);
    fs.chmodSync(filePath, 0o600);
    if (isDurable()) {
      try {
        const dirFd = fs.openSync(dir, "r");
        try { fsyncIfDurable(dirFd); } finally { fs.closeSync(dirFd); }
      } catch (error) {
        if (process.platform !== "win32") throw error;
      }
    }
  } catch (error) {
    try { fs.rmSync(tempPath, { force: true }); } catch { /* preserve original error */ }
    throw error;
  }
}

export class OperationLedger {
  private state: CertificationOperationLedgerState;
  private readonly write: OperationLedgerWrite;

  constructor(private readonly filePath: string, dependencies: { write?: OperationLedgerWrite } = {}) {
    this.state = readState(filePath);
    this.write = dependencies.write || writeCertificationJsonAtomic;
  }

  snapshot(): CertificationOperationLedgerState {
    return clone(this.state);
  }

  getByRunId(runId: string): CertificationOperationRecord | undefined {
    const found = this.state.operations.find((item) => item.runId === runId);
    return found ? clone(found) : undefined;
  }

  getByIdempotencyKey(idempotencyKey: string): CertificationOperationRecord | undefined {
    const found = this.state.operations.find((item) => item.idempotencyKey === idempotencyKey);
    return found ? clone(found) : undefined;
  }

  begin(input: {
    runId: string;
    contractDigest: string;
    idempotencyKey: string;
    lineageRootVendorKey: string;
    leaseOwner: string;
    leaseToken: string;
    attempt: number;
    childRunRef: { runId: string; revisionDigest: string };
    providerIdempotency?: RemoteIdempotencyCapability;
    now: string;
  }): CertificationOperationRecord {
    const existing = this.getByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      if (existing.contractDigest !== input.contractDigest) {
        throw new Error("The idempotency key is already bound to a different contract");
      }
      return existing;
    }
    const operation = validateOperation({
      version: 1,
      revision: 1,
      runId: input.runId,
      contractDigest: input.contractDigest,
      idempotencyKey: input.idempotencyKey,
      lineageRootVendorKey: input.lineageRootVendorKey,
      lease: { ownerId: input.leaseOwner, token: input.leaseToken },
      attempt: input.attempt,
      checkpoint: "prepared",
      providerIdempotency: input.providerIdempotency || "unknown",
      submissionState: "idle",
      artifactEvidence: [],
      childRunRef: input.childRunRef,
      createdAt: input.now,
      updatedAt: input.now,
    });
    this.commit({ ...this.state, operations: [...this.state.operations, operation] });
    return clone(operation);
  }

  markSubmitting(runId: string, input: {
    operationKey: string;
    providerIdempotency: RemoteIdempotencyCapability;
    expectedRevision: number;
    now: string;
  }): CertificationOperationRecord {
    return this.update(runId, input.expectedRevision, (current) => {
      if (current.checkpoint === "cancelled" || current.checkpoint === "superseded") throw new Error("Certification is cancelled");
      if (current.submissionState === "unknown" || current.submissionState === "submitted") {
        throw new Error("Unknown or submitted work must reconcile before another create");
      }
      if (current.submissionState === "submitting") throw new Error("Provider create is already submitting");
      return {
        ...current,
        operationKey: safeToken(input.operationKey, "operation key", 512),
        providerIdempotency: input.providerIdempotency,
        submissionState: "submitting",
        checkpoint: "submitting",
        remoteTaskId: undefined,
        userAction: undefined,
        attempt: current.attempt + (current.submissionState === "settled" ? 1 : 0),
        updatedAt: iso(input.now, "updated at"),
      };
    });
  }

  markSubmitted(runId: string, input: { remoteTaskId: string; expectedRevision: number; now: string }): CertificationOperationRecord {
    return this.update(runId, input.expectedRevision, (current) => {
      if (current.submissionState !== "submitting") throw new Error("Only submitting work can become submitted");
      return {
        ...current,
        submissionState: "submitted",
        checkpoint: "submitted",
        remoteTaskId: safeToken(input.remoteTaskId, "remote task id", 512),
        updatedAt: iso(input.now, "updated at"),
      };
    });
  }

  markUnknown(runId: string, input: {
    expectedRevision: number;
    userAction: "reconcile_or_contact_provider";
    now: string;
    remoteTaskId?: string;
  }): CertificationOperationRecord {
    return this.update(runId, input.expectedRevision, (current) => {
      if (current.submissionState !== "submitting" && current.submissionState !== "submitted") {
        throw new Error("Only in-flight work can become unknown");
      }
      return {
        ...current,
        submissionState: "unknown",
        checkpoint: "submission_unknown",
        userAction: input.userAction,
        ...(input.remoteTaskId ? { remoteTaskId: safeToken(input.remoteTaskId, "remote task id", 512) } : {}),
        updatedAt: iso(input.now, "updated at"),
      };
    });
  }

  markReconciled(runId: string, input: { remoteTaskId: string; expectedRevision: number; now: string }): CertificationOperationRecord {
    return this.update(runId, input.expectedRevision, (current) => {
      if (current.submissionState !== "unknown" && current.submissionState !== "submitted") {
        throw new Error("Only submitted or unknown work can reconcile");
      }
      return {
        ...current,
        submissionState: "submitted",
        checkpoint: "submitted",
        remoteTaskId: safeToken(input.remoteTaskId, "remote task id", 512),
        userAction: undefined,
        updatedAt: iso(input.now, "updated at"),
      };
    });
  }

  markSettled(runId: string, input: {
    expectedRevision: number;
    artifactEvidence?: readonly CertificationMediaEvidence[];
    now: string;
  }): CertificationOperationRecord {
    return this.update(runId, input.expectedRevision, (current) => {
      if (current.submissionState !== "submitting" && current.submissionState !== "submitted") {
        throw new Error("Only submitted work can settle");
      }
      return {
        ...current,
        submissionState: "settled",
        checkpoint: "settled",
        artifactEvidence: sanitizeEvidence([...(current.artifactEvidence || []), ...(input.artifactEvidence || [])]),
        userAction: undefined,
        updatedAt: iso(input.now, "updated at"),
      };
    });
  }

  markCheckpoint(runId: string, input: {
    checkpoint: "promotion_prepared" | "promotion_committed" | "finalized" | "superseded";
    expectedRevision: number;
    now: string;
  }): CertificationOperationRecord {
    return this.update(runId, input.expectedRevision, (current) => ({
      ...current,
      checkpoint: input.checkpoint,
      updatedAt: iso(input.now, "updated at"),
    }));
  }

  cancel(runId: string, input: { expectedRevision: number; leaseToken: string; now: string }): CertificationOperationRecord {
    return this.update(runId, input.expectedRevision, (current) => {
      if (current.lease.token !== input.leaseToken) throw new Error("Certification lease does not match");
      if (current.submissionState === "submitting" || current.submissionState === "submitted" || current.submissionState === "unknown") {
        throw new Error("Submitted provider work cannot be represented as cancelled");
      }
      return { ...current, checkpoint: "cancelled", updatedAt: iso(input.now, "updated at") };
    });
  }

  private update(
    runId: string,
    expectedRevision: number,
    update: (current: CertificationOperationRecord) => CertificationOperationRecord,
  ): CertificationOperationRecord {
    const index = this.state.operations.findIndex((item) => item.runId === runId);
    if (index < 0) throw new Error(`Certification operation not found: ${runId}`);
    const current = this.state.operations[index];
    if (current.revision !== expectedRevision) throw new Error("Certification operation revision conflict");
    const next = validateOperation({ ...update(clone(current)), version: 1, revision: current.revision + 1 });
    const operations = [...this.state.operations];
    operations[index] = next;
    this.commit({ version: 1, operations });
    return clone(next);
  }

  private commit(next: CertificationOperationLedgerState): void {
    if (next.operations.length > MAX_OPERATIONS) throw new CertificationPersistenceError("oversized", "Too many certification operations");
    this.write(this.filePath, next);
    this.state = clone(next);
  }
}

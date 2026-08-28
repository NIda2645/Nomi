import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fsyncIfDurable, isDurable } from "../durability";
import { renameSyncWithRetry } from "../jsonFile";
import {
  ProductionRunLockBusyError,
  createProductionRunLock,
  type ProductionRunLock,
} from "../productionRun/productionRunLock";
import type { CertificationMediaEvidence } from "../providerAdapter/certificationMedia";
import {
  CERTIFICATION_LEDGER_VERSION,
  CERTIFICATION_SUBMISSION_STATES,
  type CertificationArchiveRef,
  type CertificationModeOperation,
  type CertificationOperationLedgerState,
  type CertificationOperationRecord,
  type CertificationOperationTombstone,
  type CertificationSettledResult,
  type RemoteIdempotencyCapability,
} from "./types";
const MAX_FILE_BYTES = 1_048_576;
const MAX_OPERATIONS = 1_000;
const MAX_EVIDENCE = 32;
const TMP_STALE_MS = 5 * 60_000;
const DEFAULT_MAX_ACTIVE = 800;
const DEFAULT_MAX_INLINE_TOMBSTONES = 400;
const EMPTY_STATE: CertificationOperationLedgerState = {
  version: CERTIFICATION_LEDGER_VERSION,
  operations: [],
  tombstones: [],
  archives: [],
};
const EVIDENCE_KEYS = new Set(["kind", "contentType", "byteLength", "sha256", "metadata"]);
const EVIDENCE_METADATA_NUMBERS = new Set([
  "width", "height", "durationSeconds", "fps", "sampleRate", "channels", "streamCount",
]);
const EVIDENCE_METADATA_STRINGS = new Set(["videoCodec", "audioCodec"]);
const SUBMISSION_CHECKPOINTS = new Set(["prepared", "submitting", "submitted", "submission_unknown", "settled"]);
const TERMINAL_CHECKPOINTS = new Set(["finalized", "cancelled", "superseded"]);
export class CertificationPersistenceError extends Error {
  constructor(
    readonly reason: "corrupt" | "unsupported_version" | "oversized" | "invalid_state" | "lock_timeout",
    message: string,
  ) {
    super(message);
    this.name = "CertificationPersistenceError";
  }
}
export type OperationLedgerWrite = (filePath: string, state: CertificationOperationLedgerState) => void;
export type OperationArchiveWrite = (filePath: string, state: unknown) => void;
type OperationLedgerDependencies = {
  write?: OperationLedgerWrite;
  writeArchive?: OperationArchiveWrite;
  lock?: ProductionRunLock;
  lockTimeoutMs?: number;
  maxActiveOperations?: number;
  maxInlineTombstones?: number;
};
function clone<T>(value: T): T {
  return structuredClone(value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function safeToken(value: unknown, name: string, max = 256): string {
  if (typeof value !== "string" || !value || value.length > max || /[\u0000-\u001f\u007f]/.test(value) || /:\/\//.test(value)) {
    throw new CertificationPersistenceError("invalid_state", `Invalid ${name}`);
  }
  return value;
}
function opaqueRemoteTaskId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new CertificationPersistenceError("invalid_state", "Invalid remote task id");
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
function rejectUnknownKeys(raw: Record<string, unknown>, allowed: ReadonlySet<string>, name: string): void {
  const unknown = Object.keys(raw).find((key) => !allowed.has(key));
  if (unknown) throw new CertificationPersistenceError("invalid_state", `Invalid ${name} field: ${unknown}`);
}
function sanitizeEvidence(items: readonly CertificationMediaEvidence[] = []): CertificationMediaEvidence[] {
  if (items.length > MAX_EVIDENCE) throw new CertificationPersistenceError("invalid_state", "Too much artifact evidence");
  return items.map((rawItem) => {
    if (!isRecord(rawItem)) throw new CertificationPersistenceError("invalid_state", "Invalid artifact evidence");
    rejectUnknownKeys(rawItem, EVIDENCE_KEYS, "artifact evidence");
    if (!["image", "video", "audio", "model3d"].includes(String(rawItem.kind))) {
      throw new CertificationPersistenceError("invalid_state", "Invalid artifact kind");
    }
    if (typeof rawItem.contentType !== "string" || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(rawItem.contentType)) {
      throw new CertificationPersistenceError("invalid_state", "Invalid artifact content type");
    }
    if (!Number.isSafeInteger(rawItem.byteLength) || Number(rawItem.byteLength) <= 0) {
      throw new CertificationPersistenceError("invalid_state", "Invalid artifact byte length");
    }
    const sha256 = digest(rawItem.sha256, "artifact digest");
    if (!isRecord(rawItem.metadata)) throw new CertificationPersistenceError("invalid_state", "Invalid artifact metadata");
    const metadata: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(rawItem.metadata)) {
      if (EVIDENCE_METADATA_NUMBERS.has(key) && typeof value === "number" && Number.isFinite(value) && value >= 0) {
        metadata[key] = value;
      } else if (EVIDENCE_METADATA_STRINGS.has(key) && typeof value === "string" && /^[A-Za-z0-9_.+-]{1,64}$/.test(value)) {
        metadata[key] = value;
      } else {
        throw new CertificationPersistenceError("invalid_state", `Invalid artifact metadata field: ${key}`);
      }
    }
    return {
      kind: rawItem.kind as CertificationMediaEvidence["kind"],
      contentType: rawItem.contentType,
      byteLength: Number(rawItem.byteLength),
      sha256,
      metadata,
    };
  });
}
function validateSettledResult(raw: unknown): CertificationSettledResult {
  if (!isRecord(raw) || typeof raw.ok !== "boolean") {
    throw new CertificationPersistenceError("invalid_state", "Settled mode is missing its exact result");
  }
  rejectUnknownKeys(raw, new Set(["ok", "taskKind", "stage", "errorCategory", "reasonCode"]), "settled result");
  const result: CertificationSettledResult = {
    ok: raw.ok,
    taskKind: safeToken(raw.taskKind, "settled task kind") as CertificationSettledResult["taskKind"],
  };
  if (raw.stage !== undefined) {
    if (!["localize_reference", "create", "poll", "verify_asset"].includes(String(raw.stage))) {
      throw new CertificationPersistenceError("invalid_state", "Invalid settled result stage");
    }
    result.stage = raw.stage as CertificationSettledResult["stage"];
  }
  if (raw.errorCategory !== undefined) {
    if (!["auth", "balance", "quota", "input", "server", "network", "timeout", "unknown"].includes(String(raw.errorCategory))) {
      throw new CertificationPersistenceError("invalid_state", "Invalid settled error category");
    }
    result.errorCategory = raw.errorCategory as CertificationSettledResult["errorCategory"];
  }
  if (raw.reasonCode !== undefined) result.reasonCode = safeToken(raw.reasonCode, "settled reason code", 96);
  return result;
}

function assertSubmissionSemantics(input: {
  checkpoint: string;
  submissionState: string;
  remoteTaskId?: string;
  artifactEvidence: CertificationMediaEvidence[];
  settledResult?: CertificationSettledResult;
  userAction?: string;
}): void {
  if (input.checkpoint === "prepared" && input.submissionState !== "idle") throw new CertificationPersistenceError("invalid_state", "Prepared work must be idle");
  if (input.checkpoint === "submitting" && input.submissionState !== "submitting") throw new CertificationPersistenceError("invalid_state", "Submitting checkpoint mismatch");
  if (input.checkpoint === "submitted" && input.submissionState !== "submitted") throw new CertificationPersistenceError("invalid_state", "Submitted checkpoint mismatch");
  if (input.checkpoint === "submission_unknown" && input.submissionState !== "unknown") throw new CertificationPersistenceError("invalid_state", "Unknown checkpoint mismatch");
  if (input.checkpoint === "settled" && input.submissionState !== "settled") throw new CertificationPersistenceError("invalid_state", "Settled checkpoint mismatch");
  if ((input.checkpoint === "submitting" || input.checkpoint === "prepared") && input.remoteTaskId) {
    throw new CertificationPersistenceError("invalid_state", "Pre-submission work cannot have a remote task id");
  }
  if (input.checkpoint === "submitted" && !input.remoteTaskId) throw new CertificationPersistenceError("invalid_state", "Submitted work requires a remote task id");
  if (input.checkpoint === "submission_unknown" && input.userAction !== "reconcile_or_contact_provider") {
    throw new CertificationPersistenceError("invalid_state", "Unknown work requires a recovery action");
  }
  if (input.checkpoint !== "settled" && (input.artifactEvidence.length || input.settledResult)) {
    throw new CertificationPersistenceError("invalid_state", "Unsettled work cannot contain settled evidence or results");
  }
  if (input.checkpoint === "settled" && !input.settledResult) {
    throw new CertificationPersistenceError("invalid_state", "Settled work requires its exact result");
  }
  if (input.settledResult && !input.settledResult.ok && input.artifactEvidence.length) {
    throw new CertificationPersistenceError("invalid_state", "Failed work cannot contain promoted artifact evidence");
  }
}

function validateMode(raw: unknown): CertificationModeOperation {
  if (!isRecord(raw)) throw new CertificationPersistenceError("invalid_state", "Invalid mode operation");
  rejectUnknownKeys(raw, new Set(["operationKey", "modelKey", "taskKind", "attempt", "checkpoint", "providerIdempotency", "submissionState", "remoteTaskId", "artifactEvidence", "settledResult", "userAction", "createdAt", "updatedAt"]), "mode operation");
  const operationKey = safeToken(raw.operationKey, "operation key", 512);
  const modelKey = safeToken(raw.modelKey, "model key");
  const taskKind = safeToken(raw.taskKind, "task kind") as CertificationModeOperation["taskKind"];
  const artifactEvidence = sanitizeEvidence(Array.isArray(raw.artifactEvidence) ? raw.artifactEvidence as CertificationMediaEvidence[] : []);
  const mode: CertificationModeOperation = {
    operationKey,
    modelKey,
    taskKind,
    attempt: Number(raw.attempt),
    checkpoint: raw.checkpoint as CertificationModeOperation["checkpoint"],
    providerIdempotency: raw.providerIdempotency as RemoteIdempotencyCapability,
    submissionState: raw.submissionState as CertificationModeOperation["submissionState"],
    artifactEvidence,
    createdAt: iso(raw.createdAt, "mode created at"),
    updatedAt: iso(raw.updatedAt, "mode updated at"),
  };
  if (!Number.isSafeInteger(mode.attempt) || mode.attempt < 1 || mode.attempt > 100) throw new CertificationPersistenceError("invalid_state", "Invalid mode attempt");
  if (!SUBMISSION_CHECKPOINTS.has(String(mode.checkpoint)) || !CERTIFICATION_SUBMISSION_STATES.includes(mode.submissionState)) {
    throw new CertificationPersistenceError("invalid_state", "Invalid mode state");
  }
  if (!["supported", "unsupported", "unknown"].includes(mode.providerIdempotency)) throw new CertificationPersistenceError("invalid_state", "Invalid mode idempotency capability");
  if (raw.remoteTaskId !== undefined) mode.remoteTaskId = opaqueRemoteTaskId(raw.remoteTaskId);
  if (raw.settledResult !== undefined) mode.settledResult = validateSettledResult(raw.settledResult);
  if (raw.userAction === "reconcile_or_contact_provider") mode.userAction = raw.userAction;
  assertSubmissionSemantics(mode);
  return mode;
}

function validateStartTransaction(raw: unknown): CertificationOperationRecord["startTransaction"] {
  if (!isRecord(raw) || !["intent", "run_persisted", "catalog_staged", "committed", "rolled_back"].includes(String(raw.state))) {
    throw new CertificationPersistenceError("invalid_state", "Invalid certification start transaction");
  }
  rejectUnknownKeys(raw, new Set(["state", "sourceVendorKey", "stagedVendorKey", "selectedModels", "createdAt", "updatedAt"]), "start transaction");
  if (!Array.isArray(raw.selectedModels) || raw.selectedModels.length > 200) {
    throw new CertificationPersistenceError("invalid_state", "Invalid certification start models");
  }
  const selectedModels = raw.selectedModels.map((value) => {
    if (!isRecord(value) || !["text", "image", "video", "audio", "model3d"].includes(String(value.kind)))
      throw new CertificationPersistenceError("invalid_state", "Invalid certification start model");
    rejectUnknownKeys(value, new Set(["modelKey", "labelZh", "kind"]), "start model");
    return { modelKey: safeToken(value.modelKey, "start model key"), labelZh: safeToken(value.labelZh, "start model label"),
      kind: value.kind as "text" | "image" | "video" | "audio" | "model3d" };
  });
  const result: CertificationOperationRecord["startTransaction"] = {
    state: raw.state as CertificationOperationRecord["startTransaction"]["state"],
    sourceVendorKey: safeToken(raw.sourceVendorKey, "start source vendor"),
    selectedModels,
    createdAt: iso(raw.createdAt, "start transaction created at"),
    updatedAt: iso(raw.updatedAt, "start transaction updated at"),
  };
  if (raw.stagedVendorKey !== undefined) result.stagedVendorKey = safeToken(raw.stagedVendorKey, "staged vendor key");
  if (["catalog_staged", "committed"].includes(result.state) && !result.stagedVendorKey)
    throw new CertificationPersistenceError("invalid_state", "Staged start transaction requires a vendor key");
  if (["intent", "run_persisted"].includes(result.state) && result.stagedVendorKey)
    throw new CertificationPersistenceError("invalid_state", "Unstaged start transaction cannot have a vendor key");
  return result;
}

function validateOperation(raw: unknown): CertificationOperationRecord {
  if (!isRecord(raw) || raw.version !== 2 || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1 || !isRecord(raw.lease) || !isRecord(raw.childRunRef)) {
    throw new CertificationPersistenceError("invalid_state", "Invalid certification operation");
  }
  rejectUnknownKeys(raw, new Set(["version", "revision", "runId", "contractDigest", "idempotencyHash", "credentialFingerprint", "catalogIdentityFingerprint", "customHeaderIdentityFingerprint", "lineageRootVendorKey", "lease", "attempt", "checkpoint", "operationKey", "providerIdempotency", "submissionState", "remoteTaskId", "artifactEvidence", "settledResult", "modeOperationKeys", "modeOperations", "childRunRef", "startTransaction", "userAction", "createdAt", "updatedAt"]), "certification operation");
  rejectUnknownKeys(raw.lease, new Set(["ownerId", "token"]), "certification lease");
  rejectUnknownKeys(raw.childRunRef, new Set(["runId", "revisionDigest"]), "child run reference");
  const modeOperations = isRecord(raw.modeOperations)
    ? Object.fromEntries(Object.entries(raw.modeOperations).map(([key, value]) => {
        const mode = validateMode(value);
        if (key !== mode.operationKey) throw new CertificationPersistenceError("invalid_state", "Mode operation key mismatch");
        return [key, mode];
      }))
    : {};
  const modeOperationKeys = isRecord(raw.modeOperationKeys)
    ? Object.fromEntries(Object.entries(raw.modeOperationKeys).map(([key, value]) => [safeToken(key, "mode identity", 512), safeToken(value, "mode operation reference", 512)]))
    : {};
  for (const [identity, key] of Object.entries(modeOperationKeys)) {
    const mode = modeOperations[key];
    if (!mode || identity !== `${mode.modelKey}/${mode.taskKind}`) throw new CertificationPersistenceError("invalid_state", "Mode operation reference mismatch");
  }
  const artifactEvidence = sanitizeEvidence(Array.isArray(raw.artifactEvidence) ? raw.artifactEvidence as CertificationMediaEvidence[] : []);
  const operation: CertificationOperationRecord = {
    version: 2,
    revision: Number(raw.revision),
    runId: safeToken(raw.runId, "run id"),
    contractDigest: digest(raw.contractDigest, "contract digest"),
    idempotencyHash: digest(raw.idempotencyHash, "idempotency hash"),
    lineageRootVendorKey: safeToken(raw.lineageRootVendorKey, "lineage root"),
    lease: { ownerId: safeToken(raw.lease.ownerId, "lease owner"), token: safeToken(raw.lease.token, "lease token") },
    attempt: Number(raw.attempt),
    checkpoint: raw.checkpoint as CertificationOperationRecord["checkpoint"],
    providerIdempotency: raw.providerIdempotency as RemoteIdempotencyCapability,
    submissionState: raw.submissionState as CertificationOperationRecord["submissionState"],
    artifactEvidence,
    modeOperationKeys,
    modeOperations,
    startTransaction: validateStartTransaction(raw.startTransaction),
    childRunRef: {
      runId: safeToken(raw.childRunRef.runId, "child run id"),
      revisionDigest: digest(raw.childRunRef.revisionDigest, "child revision digest"),
    },
    createdAt: iso(raw.createdAt, "created at"),
    updatedAt: iso(raw.updatedAt, "updated at"),
  };
  if (!Number.isSafeInteger(operation.attempt) || operation.attempt < 1 || operation.attempt > 100) throw new CertificationPersistenceError("invalid_state", "Invalid attempt");
  if (!["supported", "unsupported", "unknown"].includes(operation.providerIdempotency)) throw new CertificationPersistenceError("invalid_state", "Invalid idempotency capability");
  if (raw.operationKey !== undefined) operation.operationKey = safeToken(raw.operationKey, "operation key", 512);
  if (raw.remoteTaskId !== undefined) operation.remoteTaskId = opaqueRemoteTaskId(raw.remoteTaskId);
  if (raw.settledResult !== undefined) operation.settledResult = validateSettledResult(raw.settledResult);
  if (raw.userAction === "reconcile_or_contact_provider" || raw.userAction === "review_newer_certification") operation.userAction = raw.userAction;
  for (const key of ["credentialFingerprint", "catalogIdentityFingerprint", "customHeaderIdentityFingerprint"] as const) {
    if (raw[key] !== undefined) operation[key] = digest(raw[key], key);
  }
  const checkpoints = new Set([
    "prepared", "submitting", "submitted", "submission_unknown", "settled",
    "promotion_prepared", "promotion_committed", "finalized", "cancelled", "superseded",
  ]);
  if (!checkpoints.has(operation.checkpoint) || !CERTIFICATION_SUBMISSION_STATES.includes(operation.submissionState)) throw new CertificationPersistenceError("invalid_state", "Invalid operation state");
  if (SUBMISSION_CHECKPOINTS.has(operation.checkpoint)) assertSubmissionSemantics(operation);
  else {
    if (!["idle", "settled"].includes(operation.submissionState)) throw new CertificationPersistenceError("invalid_state", "Lifecycle checkpoint has unresolved submission state");
    if (operation.submissionState === "idle" && (operation.remoteTaskId || operation.artifactEvidence.length || operation.settledResult)) throw new CertificationPersistenceError("invalid_state", "Idle lifecycle cannot contain submission evidence");
    if (operation.submissionState === "settled" && !operation.settledResult) throw new CertificationPersistenceError("invalid_state", "Settled lifecycle requires its exact result");
    if (operation.settledResult && !operation.settledResult.ok && operation.artifactEvidence.length) throw new CertificationPersistenceError("invalid_state", "Failed lifecycle cannot contain artifact evidence");
  }
  if (operation.operationKey && SUBMISSION_CHECKPOINTS.has(operation.checkpoint)) {
    const mode = operation.modeOperations[operation.operationKey];
    if (!mode || mode.checkpoint !== operation.checkpoint || mode.submissionState !== operation.submissionState
      || mode.remoteTaskId !== operation.remoteTaskId || mode.settledResult?.ok !== operation.settledResult?.ok) {
      throw new CertificationPersistenceError("invalid_state", "Top-level mode projection is contradictory");
    }
  }
  return operation;
}

function validateTombstone(raw: unknown): CertificationOperationTombstone {
  if (!isRecord(raw) || raw.version !== 1 || !TERMINAL_CHECKPOINTS.has(String(raw.terminalSummary))) throw new CertificationPersistenceError("invalid_state", "Invalid operation tombstone");
  return {
    version: 1,
    idempotencyHash: digest(raw.idempotencyHash, "tombstone idempotency hash"),
    contractDigest: digest(raw.contractDigest, "tombstone contract digest"),
    canonicalRunId: safeToken(raw.canonicalRunId, "canonical run id"),
    terminalSummary: raw.terminalSummary as CertificationOperationTombstone["terminalSummary"],
    terminalAt: iso(raw.terminalAt, "terminal at"),
  };
}

function validateArchiveRef(raw: unknown): CertificationArchiveRef {
  if (!isRecord(raw) || raw.version !== 1 || !Number.isSafeInteger(raw.count) || Number(raw.count) < 1) throw new CertificationPersistenceError("invalid_state", "Invalid archive reference");
  const fileName = safeToken(raw.fileName, "archive file name", 128);
  if (!/^segment-[a-f0-9]{64}\.json$/.test(fileName)) throw new CertificationPersistenceError("invalid_state", "Invalid archive file name");
  return { version: 1, fileName, sha256: digest(raw.sha256, "archive digest"), count: Number(raw.count) };
}

function cleanupStaleTemps(filePath: string, nowMs = Date.now()): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) return;
  const prefix = `.${path.basename(filePath)}.`;
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith(prefix) || !name.endsWith(".tmp")) continue;
    const target = path.join(dir, name);
    try {
      if (nowMs - fs.statSync(target).mtimeMs >= TMP_STALE_MS) fs.rmSync(target, { force: true });
    } catch { /* concurrent writer owns or removed it */ }
  }
}

function readState(filePath: string): CertificationOperationLedgerState {
  if (!fs.existsSync(filePath)) return clone(EMPTY_STATE);
  if (fs.statSync(filePath).size > MAX_FILE_BYTES) throw new CertificationPersistenceError("oversized", "Certification ledger exceeds size limit");
  let parsed: unknown;
  try { parsed = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch {
    throw new CertificationPersistenceError("corrupt", "Certification ledger is corrupt or truncated");
  }
  if (!isRecord(parsed) || parsed.version !== 2) {
    throw new CertificationPersistenceError(isRecord(parsed) && typeof parsed.version === "number" ? "unsupported_version" : "corrupt", "Unsupported certification ledger version");
  }
  if (!Array.isArray(parsed.operations) || !Array.isArray(parsed.tombstones) || !Array.isArray(parsed.archives)
    || parsed.operations.length > MAX_OPERATIONS || parsed.tombstones.length > MAX_OPERATIONS || parsed.archives.length > MAX_OPERATIONS) {
    throw new CertificationPersistenceError("invalid_state", "Invalid certification ledger entries");
  }
  const state: CertificationOperationLedgerState = {
    version: 2,
    operations: parsed.operations.map(validateOperation),
    tombstones: parsed.tombstones.map(validateTombstone),
    archives: parsed.archives.map(validateArchiveRef),
  };
  const ids = new Set<string>();
  const hashes = new Set<string>();
  for (const operation of state.operations) {
    if (ids.has(operation.runId) || hashes.has(operation.idempotencyHash)) throw new CertificationPersistenceError("invalid_state", "Duplicate certification ledger identity");
    ids.add(operation.runId);
    hashes.add(operation.idempotencyHash);
  }
  for (const tombstone of state.tombstones) {
    if (ids.has(tombstone.canonicalRunId) || hashes.has(tombstone.idempotencyHash)) throw new CertificationPersistenceError("invalid_state", "Duplicate certification tombstone identity");
    ids.add(tombstone.canonicalRunId);
    hashes.add(tombstone.idempotencyHash);
  }
  return state;
}

export function writeCertificationJsonAtomic(filePath: string, state: unknown): void {
  const serialized = `${JSON.stringify(state, null, 2)}\n`;
  if (Buffer.byteLength(serialized) > MAX_FILE_BYTES) throw new CertificationPersistenceError("oversized", "Certification persistence exceeds size limit");
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
  let renamed = false;
  try {
    const fd = fs.openSync(tempPath, "wx", 0o600);
    try {
      fs.writeFileSync(fd, serialized, "utf8");
      fsyncIfDurable(fd);
    } finally {
      fs.closeSync(fd);
    }
    renameSyncWithRetry(tempPath, filePath);
    renamed = true;
    fs.chmodSync(filePath, 0o600);
    if (isDurable()) {
      try {
        const dirFd = fs.openSync(dir, "r");
        try { fsyncIfDurable(dirFd); } finally { fs.closeSync(dirFd); }
      } catch (error) {
        if (process.platform !== "win32") throw error;
      }
    }
  } finally {
    if (!renamed) {
      try { fs.rmSync(tempPath, { force: true }); } catch { /* preserve original failure */ }
    }
  }
}

export class OperationLedger {
  private state: CertificationOperationLedgerState;
  private readonly write: OperationLedgerWrite;
  private readonly writeArchive: OperationArchiveWrite;
  private readonly lock: ProductionRunLock;
  private readonly lockTimeoutMs: number;
  private readonly maxActiveOperations: number;
  private readonly maxInlineTombstones: number;
  private readonly archiveDir: string;

  constructor(private readonly filePath: string, dependencies: OperationLedgerDependencies = {}) {
    cleanupStaleTemps(filePath);
    this.state = readState(filePath);
    this.write = dependencies.write || writeCertificationJsonAtomic;
    this.writeArchive = dependencies.writeArchive || writeCertificationJsonAtomic;
    this.lockTimeoutMs = dependencies.lockTimeoutMs ?? 3_000;
    this.maxActiveOperations = dependencies.maxActiveOperations ?? DEFAULT_MAX_ACTIVE;
    this.maxInlineTombstones = dependencies.maxInlineTombstones ?? DEFAULT_MAX_INLINE_TOMBSTONES;
    this.archiveDir = path.join(path.dirname(filePath), `${path.basename(filePath)}.archive`);
    this.lock = dependencies.lock || createProductionRunLock({
      filePath: `${filePath}.lock`,
      epochPath: `${filePath}.lock.epoch`,
      ownerId: `certification-ledger-${process.pid}-${crypto.randomUUID()}`,
      pid: process.pid,
      leaseMs: 30_000,
    });
  }

  snapshot(): CertificationOperationLedgerState {
    return clone(this.refresh());
  }

  getByRunId(runId: string): CertificationOperationRecord | undefined {
    const found = this.refresh().operations.find((item) => item.runId === runId);
    return found ? clone(found) : undefined;
  }

  getByIdempotencyKey(idempotencyKey: string): CertificationOperationRecord | undefined {
    const idempotencyHash = hash(idempotencyKey);
    const found = this.refresh().operations.find((item) => item.idempotencyHash === idempotencyHash);
    return found ? clone(found) : undefined;
  }

  canonicalRunForIdempotencyKey(idempotencyKey: string): string | undefined {
    const idempotencyHash = hash(idempotencyKey);
    const state = this.refresh();
    const active = state.operations.find((item) => item.idempotencyHash === idempotencyHash);
    if (active) return active.runId;
    const inline = state.tombstones.find((item) => item.idempotencyHash === idempotencyHash);
    if (inline) return inline.canonicalRunId;
    return this.readArchiveTombstones().find((item) => item.idempotencyHash === idempotencyHash)?.canonicalRunId;
  }

  bindingForIdempotencyKey(idempotencyKey: string): { canonicalRunId: string; contractDigest: string } | undefined {
    const idempotencyHash = hash(idempotencyKey);
    const state = this.refresh();
    const active = state.operations.find((item) => item.idempotencyHash === idempotencyHash);
    if (active) return { canonicalRunId: active.runId, contractDigest: active.contractDigest };
    const terminal = [...state.tombstones, ...this.readArchiveTombstones()].find((item) => item.idempotencyHash === idempotencyHash);
    return terminal ? { canonicalRunId: terminal.canonicalRunId, contractDigest: terminal.contractDigest } : undefined;
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
    credentialFingerprint?: string;
    catalogIdentityFingerprint?: string;
    customHeaderIdentityFingerprint?: string;
    sourceVendorKey?: string;
    selectedModels?: CertificationOperationRecord["startTransaction"]["selectedModels"];
    now: string;
  }): CertificationOperationRecord {
    return this.mutate((state) => {
      const idempotencyHash = hash(input.idempotencyKey);
      const existing = state.operations.find((item) => item.idempotencyHash === idempotencyHash);
      if (existing) {
        if (existing.contractDigest !== input.contractDigest) throw new Error("The idempotency key is already bound to a different contract");
        return { state, result: existing };
      }
      const tombstone = [...state.tombstones, ...this.readArchiveTombstones()]
        .find((item) => item.idempotencyHash === idempotencyHash);
      if (tombstone) {
        if (tombstone.contractDigest !== input.contractDigest) throw new Error("The idempotency key is already bound to a different contract");
        throw new Error(`Certification duplicate was compacted; canonical run is ${tombstone.canonicalRunId}`);
      }
      const operation = validateOperation({
        version: 2,
        revision: 1,
        runId: input.runId,
        contractDigest: input.contractDigest,
        idempotencyHash,
        lineageRootVendorKey: input.lineageRootVendorKey,
        lease: { ownerId: input.leaseOwner, token: input.leaseToken },
        attempt: input.attempt,
        checkpoint: "prepared",
        providerIdempotency: input.providerIdempotency || "unknown",
        submissionState: "idle",
        artifactEvidence: [],
        modeOperationKeys: {},
        modeOperations: {},
        startTransaction: {
          state: "intent",
          sourceVendorKey: input.sourceVendorKey || input.lineageRootVendorKey,
          selectedModels: input.selectedModels || [],
          createdAt: input.now,
          updatedAt: input.now,
        },
        childRunRef: input.childRunRef,
        ...(input.credentialFingerprint ? { credentialFingerprint: input.credentialFingerprint } : {}),
        ...(input.catalogIdentityFingerprint ? { catalogIdentityFingerprint: input.catalogIdentityFingerprint } : {}),
        ...(input.customHeaderIdentityFingerprint ? { customHeaderIdentityFingerprint: input.customHeaderIdentityFingerprint } : {}),
        createdAt: input.now,
        updatedAt: input.now,
      });
      return { state: { ...state, operations: [...state.operations, operation] }, result: operation };
    });
  }

  markStartTransaction(runId: string, input: {
    state: CertificationOperationRecord["startTransaction"]["state"];
    expectedRevision: number;
    stagedVendorKey?: string;
    lineageRootVendorKey?: string;
    now: string;
  }): CertificationOperationRecord {
    const order = ["intent", "run_persisted", "catalog_staged", "committed"];
    return this.update(runId, input.expectedRevision, (current) => {
      const from = current.startTransaction.state;
      if (from === input.state) return current;
      if (input.state !== "rolled_back" && (from === "rolled_back" || order.indexOf(input.state) !== order.indexOf(from) + 1))
        throw new Error(`Invalid certification start transition: ${from} -> ${input.state}`);
      return {
        ...current,
        ...(input.lineageRootVendorKey ? { lineageRootVendorKey: input.lineageRootVendorKey } : {}),
        startTransaction: {
          ...current.startTransaction,
          state: input.state,
          ...(input.stagedVendorKey ? { stagedVendorKey: input.stagedVendorKey } : {}),
          updatedAt: input.now,
        },
        updatedAt: input.now,
      };
    });
  }

  markSubmitting(runId: string, input: {
    operationKey: string;
    modelKey?: string;
    taskKind?: CertificationModeOperation["taskKind"];
    providerIdempotency: RemoteIdempotencyCapability;
    expectedRevision: number;
    now: string;
  }): CertificationOperationRecord {
    return this.update(runId, input.expectedRevision, (current) => {
      if (["cancelled", "superseded"].includes(current.checkpoint)) throw new Error("Certification is cancelled");
      const parsed = input.operationKey.split("/");
      const modelKey = input.modelKey || parsed[0];
      const taskKind = input.taskKind || parsed[1] as CertificationModeOperation["taskKind"];
      const attempt = Number(parsed[2] || current.attempt);
      const priorKey = current.modeOperationKeys[`${modelKey}/${taskKind}`];
      const prior = priorKey ? current.modeOperations[priorKey] : undefined;
      if (prior && ["submitting", "submitted", "unknown"].includes(prior.submissionState)) throw new Error("Unknown or submitted work must reconcile before another create");
      const mode = validateMode({
        operationKey: input.operationKey,
        modelKey,
        taskKind,
        attempt,
        checkpoint: "submitting",
        providerIdempotency: input.providerIdempotency,
        submissionState: "submitting",
        artifactEvidence: [],
        createdAt: prior?.createdAt || input.now,
        updatedAt: input.now,
      });
      return this.withModeProjection(current, mode);
    });
  }

  markSubmitted(runId: string, input: { operationKey?: string; remoteTaskId: string; expectedRevision: number; now: string }): CertificationOperationRecord {
    return this.update(runId, input.expectedRevision, (current) => this.updateCurrentMode(current, input.operationKey, (mode) => {
      if (mode.submissionState !== "submitting") throw new Error("Only submitting work can become submitted");
      return validateMode({ ...mode, submissionState: "submitted", checkpoint: "submitted", remoteTaskId: input.remoteTaskId, updatedAt: input.now });
    }));
  }

  markUnknown(runId: string, input: { operationKey?: string; expectedRevision: number; userAction: "reconcile_or_contact_provider"; now: string; remoteTaskId?: string }): CertificationOperationRecord {
    return this.update(runId, input.expectedRevision, (current) => this.updateCurrentMode(current, input.operationKey, (mode) => {
      if (!["submitting", "submitted"].includes(mode.submissionState)) throw new Error("Only in-flight work can become unknown");
      return validateMode({
        ...mode,
        submissionState: "unknown",
        checkpoint: "submission_unknown",
        userAction: input.userAction,
        ...(input.remoteTaskId ? { remoteTaskId: input.remoteTaskId } : {}),
        updatedAt: input.now,
      });
    }));
  }

  markReconciled(runId: string, input: { operationKey?: string; remoteTaskId: string; expectedRevision: number; now: string }): CertificationOperationRecord {
    return this.update(runId, input.expectedRevision, (current) => this.updateCurrentMode(current, input.operationKey, (mode) => {
      if (!["unknown", "submitted"].includes(mode.submissionState)) throw new Error("Only submitted or unknown work can reconcile");
      return validateMode({ ...mode, submissionState: "submitted", checkpoint: "submitted", remoteTaskId: input.remoteTaskId, userAction: undefined, updatedAt: input.now });
    }));
  }

  markSettled(runId: string, input: {
    operationKey?: string;
    expectedRevision: number;
    artifactEvidence?: readonly CertificationMediaEvidence[];
    result?: CertificationSettledResult;
    now: string;
  }): CertificationOperationRecord {
    return this.update(runId, input.expectedRevision, (current) => this.updateCurrentMode(current, input.operationKey, (mode) => {
      if (!["submitting", "submitted"].includes(mode.submissionState)) throw new Error("Only submitted work can settle");
      const result = input.result || { ok: true, taskKind: mode.taskKind };
      return validateMode({
        ...mode,
        submissionState: "settled",
        checkpoint: "settled",
        artifactEvidence: input.artifactEvidence || [],
        settledResult: result,
        userAction: undefined,
        updatedAt: input.now,
      });
    }));
  }

  markCheckpoint(runId: string, input: { checkpoint: "promotion_prepared" | "promotion_committed" | "finalized" | "superseded"; expectedRevision: number; now: string }): CertificationOperationRecord {
    return this.update(runId, input.expectedRevision, (current) => ({ ...current, checkpoint: input.checkpoint, updatedAt: input.now }));
  }

  cancel(runId: string, input: { expectedRevision: number; leaseToken: string; now: string }): CertificationOperationRecord {
    return this.update(runId, input.expectedRevision, (current) => {
      if (current.lease.token !== input.leaseToken) throw new Error("Certification lease does not match");
      if (Object.values(current.modeOperations).some((mode) => ["submitting", "submitted", "unknown"].includes(mode.submissionState))) {
        throw new Error("Submitted provider work cannot be represented as cancelled");
      }
      return { ...current, checkpoint: "cancelled", updatedAt: input.now };
    });
  }

  private update(runId: string, expectedRevision: number, update: (current: CertificationOperationRecord) => CertificationOperationRecord): CertificationOperationRecord {
    return this.mutate((state) => {
      const index = state.operations.findIndex((item) => item.runId === runId);
      if (index < 0) throw new Error(`Certification operation not found: ${runId}`);
      const current = state.operations[index];
      if (current.revision !== expectedRevision) throw new Error("Certification operation revision conflict");
      const next = validateOperation({ ...update(clone(current)), version: 2, revision: current.revision + 1 });
      const operations = [...state.operations];
      operations[index] = next;
      return { state: { ...state, operations }, result: next };
    });
  }

  private updateCurrentMode(
    current: CertificationOperationRecord,
    operationKey: string | undefined,
    update: (mode: CertificationModeOperation) => CertificationModeOperation,
  ): CertificationOperationRecord {
    const key = operationKey || current.operationKey;
    if (!key || !current.modeOperations[key]) throw new Error("Certification mode operation not found");
    return this.withModeProjection(current, update(clone(current.modeOperations[key])));
  }

  private withModeProjection(current: CertificationOperationRecord, mode: CertificationModeOperation): CertificationOperationRecord {
    return {
      ...current,
      operationKey: mode.operationKey,
      checkpoint: mode.checkpoint,
      providerIdempotency: mode.providerIdempotency,
      submissionState: mode.submissionState,
      remoteTaskId: mode.remoteTaskId,
      artifactEvidence: mode.artifactEvidence,
      settledResult: mode.settledResult,
      userAction: mode.userAction,
      attempt: mode.attempt,
      modeOperationKeys: { ...current.modeOperationKeys, [`${mode.modelKey}/${mode.taskKind}`]: mode.operationKey },
      modeOperations: { ...current.modeOperations, [mode.operationKey]: mode },
      updatedAt: mode.updatedAt,
    };
  }

  private mutate<T>(fn: (state: CertificationOperationLedgerState) => { state: CertificationOperationLedgerState; result: T }): T {
    const deadline = Date.now() + this.lockTimeoutMs;
    let lease: ReturnType<ProductionRunLock["acquire"]> | undefined;
    const spin = new Int32Array(new SharedArrayBuffer(4));
    while (!lease) {
      try { lease = this.lock.acquire(); } catch (error) {
        if (!(error instanceof ProductionRunLockBusyError)) throw error;
        if (Date.now() >= deadline) throw new CertificationPersistenceError("lock_timeout", "Certification ledger lock timed out");
        Atomics.wait(spin, 0, 0, 10);
      }
    }
    try {
      const fresh = readState(this.filePath);
      const mutation = fn(fresh);
      const compacted = this.compact(mutation.state);
      this.lock.assertOwned(lease);
      this.write(this.filePath, compacted);
      this.state = clone(compacted);
      return clone(mutation.result);
    } finally {
      try { this.lock.release(lease); } catch { /* lease loss must not mask mutation result */ }
    }
  }

  private compact(state: CertificationOperationLedgerState): CertificationOperationLedgerState {
    let next = clone(state);
    const needsCompaction = next.operations.length > this.maxActiveOperations
      || Buffer.byteLength(JSON.stringify(next)) > Math.floor(MAX_FILE_BYTES * 0.8)
      || (next.operations.some((item) => TERMINAL_CHECKPOINTS.has(item.checkpoint))
        && (next.tombstones.length > 0 || next.archives.length > 0));
    if (needsCompaction) {
      const terminal = next.operations.filter((item) => TERMINAL_CHECKPOINTS.has(item.checkpoint));
      if (terminal.length) {
        next = {
          ...next,
          operations: next.operations.filter((item) => !TERMINAL_CHECKPOINTS.has(item.checkpoint)),
          tombstones: [...next.tombstones, ...terminal.map((item): CertificationOperationTombstone => ({
            version: 1,
            idempotencyHash: item.idempotencyHash,
            contractDigest: item.contractDigest,
            canonicalRunId: item.runId,
            terminalSummary: item.checkpoint as CertificationOperationTombstone["terminalSummary"],
            terminalAt: item.updatedAt,
          }))],
        };
      }
    }
    if (next.tombstones.length > this.maxInlineTombstones) {
      const archived = next.tombstones.slice(0, next.tombstones.length - this.maxInlineTombstones);
      const payload = { version: 1, tombstones: archived };
      const sha256 = hash(JSON.stringify(payload));
      const fileName = `segment-${sha256}.json`;
      fs.mkdirSync(this.archiveDir, { recursive: true, mode: 0o700 });
      const archivePath = path.join(this.archiveDir, fileName);
      if (!fs.existsSync(archivePath)) this.writeArchive(archivePath, payload);
      const ref: CertificationArchiveRef = { version: 1, fileName, sha256, count: archived.length };
      next = {
        ...next,
        tombstones: next.tombstones.slice(-this.maxInlineTombstones),
        archives: next.archives.some((item) => item.fileName === fileName) ? next.archives : [...next.archives, ref],
      };
    }
    if (next.operations.length > MAX_OPERATIONS) throw new CertificationPersistenceError("oversized", "Too many active certification operations");
    return next;
  }

  private readArchiveTombstones(): CertificationOperationTombstone[] {
    if (!fs.existsSync(this.archiveDir)) return [];
    const result: CertificationOperationTombstone[] = [];
    for (const name of fs.readdirSync(this.archiveDir).filter((item) => /^segment-[a-f0-9]{64}\.json$/.test(item)).sort()) {
      const filePath = path.join(this.archiveDir, name);
      if (fs.statSync(filePath).size > MAX_FILE_BYTES) throw new CertificationPersistenceError("oversized", "Certification archive exceeds size limit");
      let parsed: unknown;
      try { parsed = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { throw new CertificationPersistenceError("corrupt", "Certification archive is corrupt"); }
      if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.tombstones)) throw new CertificationPersistenceError("unsupported_version", "Unsupported certification archive version");
      result.push(...parsed.tombstones.map(validateTombstone));
    }
    return result;
  }

  private refresh(): CertificationOperationLedgerState {
    this.state = readState(this.filePath);
    return this.state;
  }
}

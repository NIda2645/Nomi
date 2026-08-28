import fs from "node:fs";
import type { ProfileKind } from "../catalog/types";
import {
  CertificationPersistenceError,
  writeCertificationJsonAtomic,
} from "./operationLedger";
import {
  PROMOTION_JOURNAL_VERSION,
  PROMOTION_JOURNAL_STATES,
  type PromotionJournalEntry,
  type PromotionJournalState,
} from "./types";

const MAX_FILE_BYTES = 1_048_576;
const MAX_ENTRIES = 1_000;
export type PromotionJournalWrite = (filePath: string, state: PromotionJournalState) => void;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function safe(value: unknown, name: string, max = 256): string {
  if (typeof value !== "string" || !value || value.length > max || /[\r\n]/.test(value) || /:\/\//.test(value)) {
    throw new CertificationPersistenceError("invalid_state", `Invalid ${name}`);
  }
  return value;
}

function digest(value: unknown, name: string): string {
  const normalized = safe(value, name, 64);
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new CertificationPersistenceError("invalid_state", `Invalid ${name}`);
  return normalized;
}

function validateEntry(raw: unknown): PromotionJournalEntry {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CertificationPersistenceError("invalid_state", "Invalid promotion journal entry");
  }
  const item = raw as Record<string, unknown>;
  const child = item.childRunRef as Record<string, unknown> | undefined;
  if (item.version !== 1 || !Number.isSafeInteger(item.revision) || Number(item.revision) < 1 || !child) {
    throw new CertificationPersistenceError("invalid_state", "Invalid promotion journal entry");
  }
  if (!Array.isArray(item.verifiedModes) || item.verifiedModes.length > 256) {
    throw new CertificationPersistenceError("invalid_state", "Invalid promotion mode list");
  }
  const states = new Set<string>(PROMOTION_JOURNAL_STATES);
  if (!states.has(String(item.state))) throw new CertificationPersistenceError("invalid_state", "Invalid promotion state");
  const createdAt = safe(item.createdAt, "created at", 64);
  const updatedAt = safe(item.updatedAt, "updated at", 64);
  if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt))) {
    throw new CertificationPersistenceError("invalid_state", "Invalid promotion timestamp");
  }
  return {
    version: 1,
    revision: Number(item.revision),
    journalId: safe(item.journalId, "journal id"),
    runId: safe(item.runId, "run id"),
    lineageRootVendorKey: safe(item.lineageRootVendorKey, "lineage root"),
    leaseToken: safe(item.leaseToken, "lease token"),
    ...(item.expectedActiveRevision ? { expectedActiveRevision: safe(item.expectedActiveRevision, "expected revision") } : {}),
    proposedRevisionId: safe(item.proposedRevisionId, "proposed revision"),
    contractDigest: digest(item.contractDigest, "contract digest"),
    verifiedModes: item.verifiedModes.map((mode) => {
      if (!mode || typeof mode !== "object" || Array.isArray(mode)) {
        throw new CertificationPersistenceError("invalid_state", "Invalid verified mode");
      }
      const entry = mode as Record<string, unknown>;
      return { modelKey: safe(entry.modelKey, "model key"), taskKind: safe(entry.taskKind, "task kind") as ProfileKind };
    }),
    childRunRef: { runId: safe(child.runId, "child run id"), revisionDigest: digest(child.revisionDigest, "child revision digest") },
    ...(item.terminalStage === "completed" || item.terminalStage === "partial" ? { terminalStage: item.terminalStage } : {}),
    state: item.state as PromotionJournalEntry["state"],
    ...(item.userAction === "review_newer_certification" ? { userAction: item.userAction } : {}),
    ...(item.runFinalizedAt ? { runFinalizedAt: safe(item.runFinalizedAt, "run finalized at", 64) } : {}),
    createdAt,
    updatedAt,
  };
}

function readState(filePath: string): PromotionJournalState {
  if (!fs.existsSync(filePath)) return { version: PROMOTION_JOURNAL_VERSION, entries: [] };
  if (fs.statSync(filePath).size > MAX_FILE_BYTES) throw new CertificationPersistenceError("oversized", "Promotion journal exceeds size limit");
  let parsed: unknown;
  try { parsed = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch {
    throw new CertificationPersistenceError("corrupt", "Promotion journal is corrupt or truncated");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || (parsed as { version?: unknown }).version !== 1) {
    throw new CertificationPersistenceError("unsupported_version", "Unsupported promotion journal version");
  }
  const entries = (parsed as { entries?: unknown }).entries;
  if (!Array.isArray(entries) || entries.length > MAX_ENTRIES) {
    throw new CertificationPersistenceError("invalid_state", "Invalid promotion journal entries");
  }
  return { version: 1, entries: entries.map(validateEntry) };
}

export class PromotionJournal {
  private state: PromotionJournalState;
  private readonly write: PromotionJournalWrite;

  constructor(private readonly filePath: string, dependencies: { write?: PromotionJournalWrite } = {}) {
    this.state = readState(filePath);
    this.write = dependencies.write || writeCertificationJsonAtomic;
  }

  get(journalId: string): PromotionJournalEntry | undefined {
    const found = this.state.entries.find((entry) => entry.journalId === journalId);
    return found ? clone(found) : undefined;
  }

  prepare(input: Omit<PromotionJournalEntry, "version" | "revision" | "state" | "createdAt" | "updatedAt"> & { now: string }): PromotionJournalEntry {
    const existing = this.get(input.journalId);
    if (existing) {
      if (existing.contractDigest !== input.contractDigest || existing.proposedRevisionId !== input.proposedRevisionId) {
        throw new Error("Promotion journal id is already bound to a different revision");
      }
      return existing;
    }
    const entry = validateEntry({ ...input, version: 1, revision: 1, state: "prepared", createdAt: input.now, updatedAt: input.now });
    this.commit({ version: 1, entries: [...this.state.entries, entry] });
    return clone(entry);
  }

  markCatalogCommitted(journalId: string, input: {
    expectedRevision: number;
    committedModes: Array<{ modelKey: string; taskKind: ProfileKind }>;
    now: string;
  }): PromotionJournalEntry {
    return this.update(journalId, input.expectedRevision, (current) => ({
      ...current,
      state: "catalog_committed",
      verifiedModes: input.committedModes,
      updatedAt: input.now,
    }));
  }

  replay(input: {
    commitCatalog: (entry: PromotionJournalEntry) =>
      | { status: "committed"; committedModes: Array<{ modelKey: string; taskKind: ProfileKind }> }
      | { status: "no-lease" };
    finalizeRun: (entry: PromotionJournalEntry) => void;
    now: () => string;
  }): void {
    for (const snapshot of this.state.entries) {
      let entry = this.get(snapshot.journalId)!;
      if (entry.state === "committed" || entry.state === "aborted") continue;
      if (entry.state === "prepared") {
        const promoted = input.commitCatalog(entry);
        if (promoted.status === "no-lease") {
          this.update(entry.journalId, entry.revision, (current) => ({
            ...current,
            state: "aborted",
            userAction: "review_newer_certification",
            updatedAt: input.now(),
          }));
          continue;
        }
        entry = this.markCatalogCommitted(entry.journalId, {
          expectedRevision: entry.revision,
          committedModes: promoted.committedModes,
          now: input.now(),
        });
      }
      if (entry.state === "catalog_committed") {
        entry = this.update(entry.journalId, entry.revision, (current) => ({
          ...current,
          state: "committed",
          updatedAt: input.now(),
        }));
      }
      if (entry.state === "committed" && !entry.runFinalizedAt) {
        input.finalizeRun(entry);
        this.update(entry.journalId, entry.revision, (current) => ({
          ...current,
          runFinalizedAt: input.now(),
          updatedAt: input.now(),
        }));
      }
    }
  }

  private update(
    journalId: string,
    expectedRevision: number,
    update: (entry: PromotionJournalEntry) => PromotionJournalEntry,
  ): PromotionJournalEntry {
    const index = this.state.entries.findIndex((entry) => entry.journalId === journalId);
    if (index < 0) throw new Error(`Promotion journal entry not found: ${journalId}`);
    const current = this.state.entries[index];
    if (current.revision !== expectedRevision) throw new Error("Promotion journal revision conflict");
    const next = validateEntry({ ...update(clone(current)), revision: current.revision + 1 });
    const entries = [...this.state.entries];
    entries[index] = next;
    this.commit({ version: 1, entries });
    return clone(next);
  }

  private commit(next: PromotionJournalState): void {
    this.write(this.filePath, next);
    this.state = clone(next);
  }
}

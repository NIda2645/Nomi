import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { writeJsonFileAtomic } from "../jsonFile";
import { getSettingsRoot } from "../runtimePaths";
import type {
  ProviderAdapterRevision,
  ProviderAdapterRun,
  ProviderAdapterStoreState,
} from "./types";

const EMPTY_STATE: ProviderAdapterStoreState = { version: 1, runs: [], revisions: [] };
export const TERMINAL_ADAPTER_STAGES = new Set<ProviderAdapterRun["stage"]>([
  "completed",
  "partial",
  "failed",
  "needs_ai",
  "cancelled",
  "timed_out",
  "stale",
]);

export function isTerminalAdapterStage(stage: ProviderAdapterRun["stage"]): boolean {
  return TERMINAL_ADAPTER_STAGES.has(stage);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function loadState(filePath: string): ProviderAdapterStoreState {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<ProviderAdapterStoreState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.runs) || !Array.isArray(parsed.revisions)) return clone(EMPTY_STATE);
    return parsed as ProviderAdapterStoreState;
  } catch {
    return clone(EMPTY_STATE);
  }
}

export function providerAdapterStorePath(settingsRoot = getSettingsRoot()): string {
  return path.join(settingsRoot, "provider-adapters.json");
}

export class ProviderAdapterStore {
  private state: ProviderAdapterStoreState;

  constructor(private readonly filePath = providerAdapterStorePath()) {
    this.state = loadState(filePath);
  }

  snapshot(): ProviderAdapterStoreState {
    return clone(this.state);
  }

  getRun(id: string): ProviderAdapterRun | undefined {
    const found = this.state.runs.find((run) => run.id === id);
    return found ? clone(found) : undefined;
  }

  latestRun(vendorKey: string): ProviderAdapterRun | undefined {
    const found = [...this.state.runs].reverse().find((run) => run.vendorKey === vendorKey);
    return found ? clone(found) : undefined;
  }

  listRuns(options: { vendorKey?: string; activeOnly?: boolean; limit?: number } = {}): ProviderAdapterRun[] {
    const limit = Math.max(1, Math.min(200, Math.trunc(options.limit || 50)));
    return this.state.runs
      .filter((run) => !options.vendorKey || run.vendorKey === options.vendorKey)
      .filter((run) => !options.activeOnly || !isTerminalAdapterStage(run.stage))
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, limit)
      .map(clone);
  }

  upsertRun(run: ProviderAdapterRun): ProviderAdapterRun {
    const next = clone(run);
    const index = this.state.runs.findIndex((item) => item.id === run.id);
    if (index >= 0) this.state.runs[index] = next;
    else this.state.runs.push(next);
    this.persist();
    return clone(next);
  }

  updateRun(id: string, update: (current: ProviderAdapterRun) => ProviderAdapterRun): ProviderAdapterRun {
    const index = this.state.runs.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`Provider adapter run not found: ${id}`);
    const next = update(clone(this.state.runs[index]));
    this.state.runs[index] = clone(next);
    this.persist();
    return clone(next);
  }

  upsertRevision(revision: ProviderAdapterRevision): ProviderAdapterRevision {
    const index = this.state.revisions.findIndex((item) => item.id === revision.id);
    if (index >= 0) this.state.revisions[index] = clone(revision);
    else this.state.revisions.push(clone(revision));
    this.persist();
    return clone(revision);
  }

  getRevision(id: string): ProviderAdapterRevision | undefined {
    const found = this.state.revisions.find((revision) => revision.id === id);
    return found ? clone(found) : undefined;
  }

  markStaleIfConnectionChanged(id: string, currentFingerprint: string): ProviderAdapterRun | undefined {
    const run = this.getRun(id);
    if (!run || isTerminalAdapterStage(run.stage) || run.connectionFingerprint === currentFingerprint) return run;
    return this.updateRun(id, (current) => ({
      ...current,
      stage: "stale",
      error: "Provider connection changed before verification completed",
      updatedAt: new Date().toISOString(),
    }));
  }

  private persist(): void {
    writeJsonFileAtomic(this.filePath, this.state);
  }
}

export function recoverableAdapterRuns(runs: readonly ProviderAdapterRun[]): ProviderAdapterRun[] {
  return runs.filter((run) => !isTerminalAdapterStage(run.stage)).map(clone);
}

export function connectionFingerprint(input: {
  baseUrl: string;
  authType: string;
  apiKey: string;
  selectedModelKeys: readonly string[];
  headers?: Record<string, string>;
}): string {
  const normalized = {
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
    authType: input.authType,
    keyDigest: crypto.createHash("sha256").update(input.apiKey).digest("hex"),
    selectedModelKeys: [...input.selectedModelKeys].sort(),
    headers: Object.fromEntries(Object.entries(input.headers || {}).sort(([a], [b]) => a.localeCompare(b))),
  };
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

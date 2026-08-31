import crypto from "node:crypto";
import { isJsonRecord, nowIso } from "../jsonUtils";
import type { HttpOperation, Mapping, ProfileKind } from "./types";

export function extractLegacyStages(raw: unknown): {
  create?: HttpOperation;
  query?: HttpOperation;
  statusMapping?: Record<string, string[]>;
} {
  if (!isJsonRecord(raw)) return {};
  const out: { create?: HttpOperation; query?: HttpOperation; statusMapping?: Record<string, string[]> } = {};
  const opFrom = (value: unknown): HttpOperation | undefined => {
    if (!isJsonRecord(value)) return undefined;
    const inner = isJsonRecord(value.default) ? value.default : value;
    return typeof inner.method === "string" && typeof inner.path === "string"
      ? inner as unknown as HttpOperation
      : undefined;
  };
  // A bare operation can itself contain HTTP query parameters. Only treat the
  // payload as an envelope when its v2 marker or nested operations prove it.
  if (typeof raw.method === "string" && typeof raw.path === "string") {
    out.create = raw as unknown as HttpOperation;
  } else if (raw.version === "v2" || opFrom(raw.create) || opFrom(raw.query)) {
    const create = opFrom(raw.create);
    const query = opFrom(raw.query);
    if (create) out.create = create;
    if (query) out.query = query;
    if (isJsonRecord(raw.status_mapping)) out.statusMapping = raw.status_mapping as Record<string, string[]>;
  }
  return out;
}

export function normalizeLegacyMappings(rawMappings: unknown): Mapping[] {
  const list = Array.isArray(rawMappings) ? rawMappings : [];
  const grouped = new Map<string, Mapping>();
  for (const item of list) {
    if (!isJsonRecord(item)) continue;
    const vendorKey = String(item.vendorKey || "").trim();
    const taskKind = (item.taskKind as ProfileKind) || "chat";
    if (!vendorKey) continue;
    const key = `${vendorKey}|${taskKind}`;
    const existing = grouped.get(key);
    const name = String(item.name || "");
    const isQueryRow = /\bquery\b/i.test(name);
    const stages: { create?: HttpOperation; query?: HttpOperation; statusMapping?: Record<string, string[]> } = {};
    for (const stage of [extractLegacyStages(item.requestMapping), extractLegacyStages(item.responseMapping)]) {
      if (stage.create && isQueryRow && !stage.query) stages.query ||= stage.create;
      else {
        if (stage.create) stages.create ||= stage.create;
        if (stage.query) stages.query ||= stage.query;
      }
      if (stage.statusMapping) stages.statusMapping = { ...(stages.statusMapping || {}), ...stage.statusMapping };
    }
    const id = String(item.id || "").trim() || `mapping-${crypto.randomUUID()}`;
    if (!existing) {
      if (!stages.create && !stages.query) continue;
      grouped.set(key, {
        id,
        vendorKey,
        taskKind,
        name: name.replace(/\s*\((create|query)\)\s*$/i, "").trim() || taskKind,
        enabled: typeof item.enabled === "boolean" ? item.enabled : true,
        create: stages.create || (stages.query as HttpOperation),
        ...(stages.query ? { query: stages.query } : {}),
        ...(stages.statusMapping ? { statusMapping: stages.statusMapping } : {}),
        createdAt: String(item.createdAt || nowIso()),
        updatedAt: nowIso(),
      });
      continue;
    }
    if (!existing.query && stages.query) existing.query = stages.query;
    if (!existing.query && stages.create && isQueryRow) existing.query = stages.create;
    if (stages.statusMapping) existing.statusMapping = { ...(existing.statusMapping || {}), ...stages.statusMapping };
    existing.updatedAt = nowIso();
  }
  return Array.from(grouped.values());
}

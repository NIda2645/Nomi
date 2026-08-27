import { ARCHETYPE_MODE_MANIFEST } from "../catalog/archetypeModes.generated";
import { archetypeIdForModel } from "../catalog/archetypeIdentity";

export type CapabilityModeModel = {
  modelKey?: string;
  modelAlias?: string | null;
  meta?: unknown;
};

export type CapabilityModeManifest = {
  archetypeId: string;
  defaultModeId: string;
  modes: Record<string, string>;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validModeStorageKey(value: string): boolean {
  return Boolean(value) && value !== "__proto__" && value !== "prototype" && value !== "constructor";
}

function explicitArchetypeId(meta: unknown): string {
  const metadata = record(meta);
  if (!metadata) return "";
  const direct = trim(metadata.archetypeId);
  if (direct) return direct;
  return trim(record(metadata.archetype)?.id);
}

function customCapabilityModeManifest(model: CapabilityModeModel): CapabilityModeManifest | null {
  const contract = record(record(model.meta)?.customCapabilityContract);
  if (!contract || contract.version !== 1 || !Array.isArray(contract.modes)) return null;
  const defaultModeId = trim(contract.defaultModeId);
  const rootTaskKind = trim(contract.transportTaskKind);
  const identifier = trim(model.modelKey) || trim(model.modelAlias);
  if (!defaultModeId || !rootTaskKind || !identifier || contract.modes.length === 0 || contract.modes.length > 16) return null;

  const modes: Record<string, string> = {};
  for (const rawMode of contract.modes) {
    const mode = record(rawMode);
    if (!mode) return null;
    const modeId = trim(mode.id);
    const taskKind = trim(mode.transportTaskKind) || rootTaskKind;
    if (!validModeStorageKey(modeId) || !taskKind || Object.prototype.hasOwnProperty.call(modes, modeId)) return null;
    modes[modeId] = taskKind;
  }
  if (!Object.prototype.hasOwnProperty.call(modes, defaultModeId)) return null;
  return {
    archetypeId: `custom-capability:${encodeURIComponent(identifier)}`,
    defaultModeId,
    modes,
  };
}

function builtInModeManifest(model: CapabilityModeModel): CapabilityModeManifest | null {
  const explicitId = explicitArchetypeId(model.meta);
  const inferredId = archetypeIdForModel(model.modelKey, model.modelAlias);
  const archetypeId = explicitId && ARCHETYPE_MODE_MANIFEST[explicitId] ? explicitId : inferredId;
  if (!archetypeId) return null;
  const manifest = ARCHETYPE_MODE_MANIFEST[archetypeId];
  return manifest ? { archetypeId, ...manifest } : null;
}

/** Exact mode identity used by both custom-call dispatch and publication. */
export function resolveCapabilityModeManifest(model: CapabilityModeModel): CapabilityModeManifest | null {
  return customCapabilityModeManifest(model) || builtInModeManifest(model);
}

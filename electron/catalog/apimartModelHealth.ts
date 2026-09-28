import { createHash } from "node:crypto";
import { APIMART_AUDIO_MODELS } from "./apimartAudios";
import { APIMART_IMAGE_MODELS } from "./apimartImages";
import { APIMART_VIDEO_MODELS } from "./apimartVideos";
import { modeTransportFor, resolveArchetypeForModel, specializeArchetypeForVariant } from "../shared/modelArchetypes";
import type { HttpOperation, ProfileKind } from "./types";
import type { ArchetypeMode, ArchetypeReferenceSlot } from "../shared/modelArchetypes/types";

/** The zero-cost health inventory is derived from the curated catalog, never hand-maintained. */
export const APIMART_GENERATION_TASK_KINDS = [
  "text_to_image", "image_edit", "text_to_video", "image_to_video", "text_to_audio",
] as const satisfies readonly ProfileKind[];

type GenerationTaskKind = (typeof APIMART_GENERATION_TASK_KINDS)[number];
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type ApimartHealthEntry = {
  vendor: "apimart";
  modelKey: string;
  kind: "image" | "video" | "audio";
  archetypeId: string;
  modeId: string;
  taskKind: GenerationTaskKind;
  labelZh: string;
  params: JsonValue;
  referenceChannels: JsonValue;
  contract: {
    create: JsonValue;
    query: JsonValue | null;
    statusMapping: JsonValue | null;
    paramMap: JsonValue | null;
    referenceChannels: JsonValue;
  };
  contractFingerprint: string;
};

type CatalogModel = {
  modelKey: string;
  labelZh: string;
  kind: "image" | "video" | "audio";
  archetypeId: string;
  mappings: { id: string; taskKind: ProfileKind; name: string; create: HttpOperation; query?: HttpOperation; statusMapping?: Record<string, string[]> }[];
};

const MODE_KINDS = new Set<string>(APIMART_GENERATION_TASK_KINDS);
const CATALOG_MODELS: CatalogModel[] = [
  ...APIMART_IMAGE_MODELS.map((m) => ({ ...m, kind: "image" as const })),
  ...APIMART_VIDEO_MODELS.map((m) => ({ ...m, kind: "video" as const })),
  ...APIMART_AUDIO_MODELS.map((m) => ({ ...m, kind: "audio" as const })),
];

function jsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item !== "undefined" && typeof item !== "function") out[key] = jsonValue(item);
    }
    return out;
  }
  return null;
}

/** Canonical JSON: object key order is irrelevant; array order remains meaningful. */
export function stableSerialize(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.keys(input as Record<string, unknown>).sort().map((key) => [key, canonical((input as Record<string, unknown>)[key])]));
    }
    return input;
  };
  return JSON.stringify(canonical(value));
}

export function contractFingerprint(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function modeFor(archetypeId: string, modelKey: string, taskKind: ProfileKind, index: number): ArchetypeMode | null {
  const archetype = resolveArchetypeForModel({ modelKey, vendorKey: "apimart", meta: { archetypeId } });
  if (!archetype) return null;
  const modes = archetype.modes.filter((mode) => modeTransportFor(mode, archetype, "apimart") === taskKind);
  return modes[index] ?? modes[0] ?? null;
}

function parameterRange(mode: ArchetypeMode | null): JsonValue {
  if (!mode) return [];
  return mode.params.map((param) => ({
    key: param.key,
    type: param.type,
    defaultValue: param.defaultValue ?? null,
    min: param.min ?? null,
    max: param.max ?? null,
    step: param.step ?? null,
    options: param.options.map((option) => option.value),
    optionConstraints: (param.optionConstraints ?? []).map((constraint) => ({ when: constraint.when, values: constraint.values })),
  }));
}

function referenceChannels(mode: ArchetypeMode | null, create: HttpOperation): JsonValue {
  const slots = (mode?.slots ?? []).map((slot: ArchetypeReferenceSlot) => ({
    kind: slot.kind, inputKey: slot.inputKey ?? null, min: slot.min, max: slot.max ?? null,
    asArray: slot.asArray ?? null, characterIndexed: slot.characterIndexed ?? false,
  }));
  const body = create.body && typeof create.body === "object" ? create.body as Record<string, unknown> : {};
  const wireKeys = Object.keys(body).filter((key) => /(?:image|video|audio|reference|frame|_urls$)/i.test(key)).sort();
  return { slots, wireKeys };
}

function entryFor(model: CatalogModel, mapping: CatalogModel["mappings"][number], modeIndex: number): ApimartHealthEntry | null {
  if (!MODE_KINDS.has(mapping.taskKind)) return null;
  const taskKind = mapping.taskKind as GenerationTaskKind;
  const mode = modeFor(model.archetypeId, model.modelKey, taskKind, modeIndex);
  const references = referenceChannels(mode, mapping.create);
  const archetype = resolveArchetypeForModel({ modelKey: model.modelKey, vendorKey: "apimart", meta: { archetypeId: model.archetypeId } });
  const variantFacts = archetype?.variants?.map((variant) => {
    const specialized = specializeArchetypeForVariant(archetype, variant.id);
    const variantMode = specialized.modes.find((candidate) => candidate.id === mode?.id);
    return { id: variant.id, modelKey: variant.modelKey, params: parameterRange(variantMode ?? null) };
  }) ?? [];
  const params = { mode: parameterRange(mode), variants: variantFacts };
  const contract = {
    create: jsonValue(mapping.create),
    query: mapping.query ? jsonValue(mapping.query) : null,
    statusMapping: mapping.statusMapping ? jsonValue(mapping.statusMapping) : null,
    paramMap: mapping.create.paramMap ? jsonValue(mapping.create.paramMap) : null,
    referenceChannels: references,
  };
  return {
    vendor: "apimart", modelKey: model.modelKey, kind: model.kind, archetypeId: model.archetypeId,
    modeId: mode?.id ?? mapping.id, taskKind, labelZh: mapping.name, params, referenceChannels: references,
    contract, contractFingerprint: contractFingerprint(contract),
  };
}

export function buildApimartHealthInventory(): ApimartHealthEntry[] {
  return CATALOG_MODELS.flatMap((model) => {
    const seenKinds = new Map<ProfileKind, number>();
    return model.mappings.flatMap((mapping) => {
      const index = seenKinds.get(mapping.taskKind) ?? 0;
      seenKinds.set(mapping.taskKind, index + 1);
      const entry = entryFor(model, mapping, index);
      return entry ? [entry] : [];
    });
  });
}

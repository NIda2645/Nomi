export type PublishedExecutionModel = {
  enabled?: boolean;
  vendorKey?: string;
  modelKey?: string;
  kind?: string;
  meta?: unknown;
  customCall?: {
    script?: unknown;
    modes?: Record<string, { script?: unknown } | null | undefined>;
  } | null;
};

export type PublishedExecutionMapping = {
  enabled?: boolean;
  vendorKey?: string;
  modelKey?: string;
  taskKind?: string;
};

export type PublishedExecutionEvidence = {
  mappings?: readonly PublishedExecutionMapping[];
  /** Provider Adapter historically requires an actual legacy text path or contract. */
  legacyWithoutAdapter?: "preserve-enabled" | "text-only";
};

const EXECUTABLE_TASKS_BY_KIND: Record<string, readonly string[]> = {
  image: ["text_to_image", "image_edit"],
  video: ["text_to_video", "image_to_video"],
  audio: ["text_to_audio", "image_to_audio", "transcribe"],
  model3d: ["text_to_3d", "image_to_3d"],
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasCustomCall(model: PublishedExecutionModel): boolean {
  if (typeof model.customCall?.script === "string" && model.customCall.script.trim()) return true;
  return Object.values(model.customCall?.modes || {}).some(
    (mode) => typeof mode?.script === "string" && Boolean(mode.script.trim()),
  );
}

function hasExecutableMapping(
  model: PublishedExecutionModel,
  mappings: readonly PublishedExecutionMapping[],
): boolean {
  const taskKinds = EXECUTABLE_TASKS_BY_KIND[String(model.kind || "")];
  if (!taskKinds) return false;
  return mappings.some((mapping) =>
    mapping.enabled === true &&
    mapping.vendorKey === model.vendorKey &&
    taskKinds.includes(String(mapping.taskKind || "")) &&
    (!mapping.modelKey || mapping.modelKey.trim() === model.modelKey));
}

/**
 * Single publication predicate shared by Electron and renderer projections.
 *
 * Electron callers pass mappings and get the exact executable-contract check.
 * Renderer model DTOs do not carry mappings, so adapter-less legacy rows keep
 * their historical visibility; adapter-managed rows still require an active
 * revision or an executable custom call and cannot pass by `enabled` alone.
 */
export function modelHasPublishedExecution(
  model: PublishedExecutionModel | null | undefined,
  evidence: PublishedExecutionEvidence = {},
): boolean {
  if (!model?.enabled) return false;
  const adapter = record(record(model.meta)?.adapter);
  if (typeof adapter?.activeRevision === "string" && adapter.activeRevision.trim()) return true;
  if (hasCustomCall(model)) return true;
  if (evidence.mappings && hasExecutableMapping(model, evidence.mappings)) return true;
  if (!adapter && (evidence.legacyWithoutAdapter !== "text-only" || model.kind === "text")) return true;
  return false;
}

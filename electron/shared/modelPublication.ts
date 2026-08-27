import { resolveCapabilityModeManifest } from "./capabilityModeManifest";

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
  /** Retained for source compatibility; legacy publication is always text-only. */
  legacyWithoutAdapter?: "preserve-enabled" | "text-only";
};

export type PublishedExecution = {
  published: boolean;
  publishedModes: string[];
};

const EXECUTABLE_TASKS_BY_KIND: Record<string, readonly string[]> = {
  text: ["chat", "prompt_refine"],
  image: ["text_to_image", "image_edit"],
  video: ["text_to_video", "image_to_video"],
  audio: ["text_to_audio", "image_to_audio", "transcribe"],
  model3d: ["text_to_3d", "image_to_3d"],
};

const DEFAULT_CUSTOM_CALL_TASK_BY_KIND: Record<string, string> = {
  text: "chat",
  image: "text_to_image",
  video: "text_to_video",
  audio: "text_to_audio",
  model3d: "text_to_3d",
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyScript(value: unknown): boolean {
  return typeof value === "string" && Boolean(value.trim());
}

function contractedCustomCallModes(
  model: PublishedExecutionModel,
  scriptedModeIds: ReadonlySet<string>,
  supported: readonly string[],
): string[] {
  const manifest = resolveCapabilityModeManifest(model);
  if (!manifest) return [];
  return Object.entries(manifest.modes)
    .filter(([modeId, taskKind]) => scriptedModeIds.has(modeId) && supported.includes(taskKind))
    .map(([, taskKind]) => taskKind);
}

function customCallModes(model: PublishedExecutionModel, supported: readonly string[]): string[] {
  const customCall = model.customCall;
  if (!customCall) return [];
  const published = new Set<string>();
  if (nonEmptyScript(customCall.script)) {
    const defaultTask = DEFAULT_CUSTOM_CALL_TASK_BY_KIND[String(model.kind || "")];
    if (defaultTask && supported.includes(defaultTask)) published.add(defaultTask);
  }
  const scriptedModeIds = new Set(
    Object.entries(customCall.modes || {})
      .filter(([, mode]) => nonEmptyScript(mode?.script))
      .map(([modeId]) => modeId),
  );
  if (scriptedModeIds.size === 0) return [...published];

  for (const taskKind of contractedCustomCallModes(model, scriptedModeIds, supported)) published.add(taskKind);
  return [...published];
}

export function derivePublishedExecution(
  model: PublishedExecutionModel | null | undefined,
  evidence: PublishedExecutionEvidence = {},
): PublishedExecution {
  if (!model?.enabled) return { published: false, publishedModes: [] };
  const supported = EXECUTABLE_TASKS_BY_KIND[String(model.kind || "")] || [];
  const modes = new Set<string>();

  for (const mapping of evidence.mappings || []) {
    if (
      mapping.enabled === true &&
      mapping.vendorKey === model.vendorKey &&
      supported.includes(String(mapping.taskKind || "")) &&
      (!mapping.modelKey || mapping.modelKey.trim() === model.modelKey)
    ) {
      modes.add(String(mapping.taskKind));
    }
  }
  for (const taskKind of customCallModes(model, supported)) modes.add(taskKind);

  const adapter = record(record(model.meta)?.adapter);
  const activeRevision = typeof adapter?.activeRevision === "string" && Boolean(adapter.activeRevision.trim());
  if (activeRevision && Array.isArray(adapter?.modes)) {
    for (const rawMode of adapter.modes) {
      const mode = record(rawMode);
      if (mode?.state === "verified" && typeof mode.taskKind === "string" && supported.includes(mode.taskKind)) {
        modes.add(mode.taskKind);
      }
    }
  }
  if (activeRevision && model.kind === "text") modes.add("chat");

  if (!adapter && model.kind === "text") modes.add("chat");
  const publishedModes = supported.filter((taskKind) => modes.has(taskKind));
  return { published: activeRevision || publishedModes.length > 0, publishedModes };
}

export function modelHasPublishedExecution(
  model: PublishedExecutionModel | null | undefined,
  evidence: PublishedExecutionEvidence = {},
): boolean {
  return derivePublishedExecution(model, evidence).published;
}

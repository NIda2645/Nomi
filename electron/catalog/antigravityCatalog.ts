import { ANTIGRAVITY_IMAGE_MODEL_KEY, ANTIGRAVITY_VENDOR_KEY, type AntigravityConnectionStatus } from "../shared/antigravity";
import { isJsonRecord } from "../jsonUtils";
import type { Mapping, Model } from "./types";

export function projectAntigravityModels(status: AntigravityConnectionStatus, existing: Model[]): Model[] {
  if (!status.models.length) return [];
  const now = new Date(status.checkedAt).toISOString();
  return [
    { id: "auto", label: "Antigravity · Auto", kind: "text" as const, identity: "automatic" },
    ...status.models.map((model) => ({ ...model, kind: "text" as const, identity: "model" })),
    { id: ANTIGRAVITY_IMAGE_MODEL_KEY, label: "Antigravity · generate_image", kind: "image" as const, identity: "tool" },
  ].map((entry) => {
    const previous = existing.find((model) => model.vendorKey === ANTIGRAVITY_VENDOR_KEY && model.modelKey === entry.id);
    const modelId = entry.kind === "image" ? "auto" : entry.id;
    const checks = (status.checks ?? []).filter((check) => check.modelId === modelId && check.version === status.version);
    const legacyAutomatic = entry.id === "auto" && previous && (!isJsonRecord(previous.meta) || previous.meta.antigravityKind !== "automatic");
    const passed = (capability: string) => checks.some((check) => check.capability === capability && check.state === "passed");
    return { ...previous, modelKey: entry.id, vendorKey: ANTIGRAVITY_VENDOR_KEY, labelZh: previous?.labelZh || entry.label,
      kind: entry.kind, enabled: legacyAutomatic ? false : previous?.enabled ?? false, createdAt: previous?.createdAt || now, updatedAt: now,
      meta: { ...(isJsonRecord(previous?.meta) ? previous.meta : {}), antigravityKind: entry.identity,
        antigravityChecks: checks, antigravityVersion: status.version,
        supportsToolCalls: false, supportsPdfInput: false, supportsImageInput: entry.kind === "text" && passed("vision"),
        ...(entry.kind === "image" ? { archetypeId: "antigravity-image", supportsReferenceImages: passed("edit") } : {}) },
    };
  });
}

export function antigravityImageMappings(status: AntigravityConnectionStatus): Mapping[] {
  const now = new Date(status.checkedAt).toISOString();
  return (["text_to_image", "image_edit"] as const).map((taskKind) => ({
    id: `antigravity-${taskKind}`, vendorKey: ANTIGRAVITY_VENDOR_KEY, modelKey: ANTIGRAVITY_IMAGE_MODEL_KEY,
    taskKind, name: `Antigravity · ${taskKind}`, createdAt: now, updatedAt: now,
    enabled: (status.checks ?? []).some((check) => check.modelId === "auto" && check.version === status.version
      && check.state === "passed" && check.capability === (taskKind === "image_edit" ? "edit" : "image")),
    create: { method: "PROCESS", path: "antigravity:image", process: { bin: "agy", parser: "antigravity-cli-image", args: [taskKind] },
      body: { prompt: "{{request.prompt}}", ...(taskKind === "image_edit" ? { reference_images: "{{request.params.reference_images}}" } : {}) },
      response_mapping: { task_id: "task_id", status: "status", image_url: "image_urls" } },
    query: { method: "PROCESS", path: "antigravity:query", process: { bin: "agy", parser: "antigravity-cli-image", args: ["query_result"] },
      response_mapping: { task_id: "task_id", status: "status", image_url: "image_urls", error: "error" } },
    statusMapping: { succeeded: ["succeeded"], failed: ["failed", "cancelled"], running: ["running"], queued: ["queued"] },
  }));
}

export async function syncAntigravityCatalog(status: AntigravityConnectionStatus): Promise<void> {
  if (!status.models.length) return;
  const { readCatalog, mutateCatalog } = await import("./catalogStore");
  const previous = readCatalog();
  const models = projectAntigravityModels(status, previous.models);
  mutateCatalog((tx) => {
    for (const model of models) tx.upsertModel(model);
    for (const mapping of antigravityImageMappings(status)) tx.upsertMapping(mapping);
  });
}

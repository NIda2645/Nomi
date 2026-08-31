import { ANTIGRAVITY_IMAGE_MODEL_KEY, ANTIGRAVITY_VENDOR_KEY, type AntigravityConnectionStatus } from "../shared/antigravity";
import { isJsonRecord } from "../jsonUtils";
import { isDeepStrictEqual } from "node:util";
import type { HttpOperation, Mapping, Model } from "./types";

export const ANTIGRAVITY_IMAGE_TASK_KINDS = ["text_to_image", "image_edit"] as const;
export type AntigravityImageTaskKind = typeof ANTIGRAVITY_IMAGE_TASK_KINDS[number];
export type AntigravityProcessStage = "create" | "query";
const ANTIGRAVITY_PROCESS_STAGES: AntigravityProcessStage[] = ["create", "query"];
type AntigravityProcess = NonNullable<Mapping["create"]["process"]>;

export function antigravityImageCreateProcess(taskKind: AntigravityImageTaskKind): AntigravityProcess {
  return { bin: "agy", parser: "antigravity-cli-image", args: [taskKind] };
}

export function antigravityImageQueryProcess(): AntigravityProcess {
  return { bin: "agy", parser: "antigravity-cli-image", args: ["query_result"] };
}

export function antigravityImageCreateOperation(taskKind: AntigravityImageTaskKind): HttpOperation {
  return { method: "PROCESS", path: "antigravity:image", process: antigravityImageCreateProcess(taskKind),
    body: { prompt: "{{request.prompt}}", ...(taskKind === "image_edit" ? { reference_images: "{{request.params.reference_images}}" } : {}) },
    response_mapping: { task_id: "task_id", status: "status", image_url: "image_urls" } };
}

export function antigravityImageQueryOperation(): HttpOperation {
  return { method: "PROCESS", path: "antigravity:query", process: antigravityImageQueryProcess(),
    response_mapping: { task_id: "task_id", status: "status", image_url: "image_urls", error: "error" } };
}

export function usesAntigravityImageParser(mapping: Pick<Mapping, "create" | "query">): boolean {
  return mapping.create.process?.parser === "antigravity-cli-image"
    || mapping.query?.process?.parser === "antigravity-cli-image";
}

/** One canonical identity/command validator, reused at catalog write and runtime dispatch. */
export function assertCanonicalAntigravityProcessIdentity(input: {
  vendorKey: string;
  modelKey?: string;
  taskKind: string;
  stage: AntigravityProcessStage;
  process: unknown;
}): asserts input is typeof input & { taskKind: AntigravityImageTaskKind; process: AntigravityProcess } {
  const taskKind = input.taskKind as AntigravityImageTaskKind;
  if (input.vendorKey !== ANTIGRAVITY_VENDOR_KEY || input.modelKey !== ANTIGRAVITY_IMAGE_MODEL_KEY
    || !ANTIGRAVITY_IMAGE_TASK_KINDS.includes(taskKind) || !ANTIGRAVITY_PROCESS_STAGES.includes(input.stage)) {
    throw new Error("ANTIGRAVITY_INVALID_CONFIG");
  }
  const expected = input.stage === "create" ? antigravityImageCreateProcess(taskKind) : antigravityImageQueryProcess();
  if (!isDeepStrictEqual(input.process, expected)) throw new Error("ANTIGRAVITY_INVALID_CONFIG");
}

export function assertCanonicalAntigravityOperation(input: {
  vendorKey: string;
  modelKey?: string;
  taskKind: string;
  stage: AntigravityProcessStage;
  operation: unknown;
}): void {
  const taskKind = input.taskKind as AntigravityImageTaskKind;
  if (input.vendorKey !== ANTIGRAVITY_VENDOR_KEY || input.modelKey !== ANTIGRAVITY_IMAGE_MODEL_KEY
    || !ANTIGRAVITY_IMAGE_TASK_KINDS.includes(taskKind) || !ANTIGRAVITY_PROCESS_STAGES.includes(input.stage)) {
    throw new Error("ANTIGRAVITY_INVALID_CONFIG");
  }
  const expected = input.stage === "create"
    ? antigravityImageCreateOperation(taskKind)
    : antigravityImageQueryOperation();
  if (!isDeepStrictEqual(input.operation, expected)) throw new Error("ANTIGRAVITY_INVALID_CONFIG");
}

export function assertCanonicalAntigravityImageMapping(mapping: Mapping): asserts mapping is Mapping & {
  taskKind: AntigravityImageTaskKind;
} {
  assertCanonicalAntigravityOperation({
    vendorKey: mapping.vendorKey,
    modelKey: mapping.modelKey,
    taskKind: mapping.taskKind,
    stage: "create",
    operation: mapping.create,
  });
  assertCanonicalAntigravityOperation({
    vendorKey: mapping.vendorKey,
    modelKey: mapping.modelKey,
    taskKind: mapping.taskKind,
    stage: "query",
    operation: mapping.query,
  });
}

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
  return ANTIGRAVITY_IMAGE_TASK_KINDS.map((taskKind) => ({
    id: `antigravity-${taskKind}`, vendorKey: ANTIGRAVITY_VENDOR_KEY, modelKey: ANTIGRAVITY_IMAGE_MODEL_KEY,
    taskKind, name: `Antigravity · ${taskKind}`, createdAt: now, updatedAt: now,
    enabled: (status.checks ?? []).some((check) => check.modelId === "auto" && check.version === status.version
      && check.state === "passed" && check.capability === (taskKind === "image_edit" ? "edit" : "image")),
    create: antigravityImageCreateOperation(taskKind),
    query: antigravityImageQueryOperation(),
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

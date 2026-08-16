import { ARCHETYPE_MODE_MANIFEST } from "./archetypeModes.generated";
import { archetypeIdForModel } from "./archetypeIdentity";
import { isJsonRecord, nowIso, trim } from "../jsonUtils";
import type { TaskRequest } from "../runtime";
import type { Mapping, Model, ProfileKind } from "./types";

export type ResolvedCustomCallExecution = {
  script: string;
  source: "mode" | "model";
  taskKind: ProfileKind;
  modeId?: string;
};

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function validModeStorageKey(value: string): boolean {
  return Boolean(value) && value !== "__proto__" && value !== "prototype" && value !== "constructor";
}

/**
 * customCall 的增量合并规则：undefined 保留全部，null 删除全部；对象里 script / modes 都是局部 patch。
 * 这样编辑一个模式不会误删通用 fallback 或其他模式，重拉模型（完全不带 customCall）也不会清用户数据。
 */
export function normalizeCustomCall(
  raw: unknown,
  existing: Model["customCall"] | undefined,
  updatedAt = nowIso(),
): Model["customCall"] | undefined {
  if (raw === null) return undefined;
  if (raw === undefined || !isJsonRecord(raw)) return existing;

  let script = existing?.script;
  if (hasOwn(raw, "script")) script = trim(raw.script) || undefined;

  let modes: NonNullable<Model["customCall"]>["modes"] = existing?.modes
    ? Object.fromEntries(Object.entries(existing.modes))
    : {};
  if (hasOwn(raw, "modes")) {
    if (raw.modes === null) {
      modes = {};
    } else if (isJsonRecord(raw.modes)) {
      for (const [rawModeId, entry] of Object.entries(raw.modes)) {
        const modeId = rawModeId.trim();
        if (!validModeStorageKey(modeId)) continue;
        const modeScript = isJsonRecord(entry) ? trim(entry.script) : "";
        if (!modeScript) delete modes[modeId];
        else modes[modeId] = { script: modeScript, updatedAt };
      }
    }
  }

  if (!script && Object.keys(modes).length === 0) return undefined;
  return {
    ...(script ? { script } : {}),
    ...(Object.keys(modes).length > 0 ? { modes } : {}),
    updatedAt,
  };
}

function requestArchetypeSelection(request: TaskRequest): { archetypeId: string; modeId: string } {
  const raw = request.extras?.archetype;
  if (!isJsonRecord(raw)) return { archetypeId: "", modeId: "" };
  return { archetypeId: trim(raw.id), modeId: trim(raw.modeId) };
}

type CapabilityModeManifest = {
  archetypeId: string;
  defaultModeId: string;
  modes: Record<string, string>;
};

function explicitArchetypeId(meta: unknown): string {
  if (!isJsonRecord(meta)) return "";
  const direct = trim(meta.archetypeId);
  if (direct) return direct;
  return isJsonRecord(meta.archetype) ? trim(meta.archetype.id) : "";
}

/**
 * 用户能力契约是 catalog 运行时数据，不能进入构建期生成清单。这里只投影脚本派发需要的
 * 最窄信息；完整 slots/params 校验仍由 renderer 的契约解析器负责。无效投影保持惰性，
 * 后续会继续尝试内置档案身份，而不是让坏 meta 阻塞整个模型。
 */
function customCapabilityModeManifest(model: Model): CapabilityModeManifest | null {
  if (!isJsonRecord(model.meta) || !isJsonRecord(model.meta.customCapabilityContract)) return null;
  const contract = model.meta.customCapabilityContract;
  if (contract.version !== 1 || !Array.isArray(contract.modes)) return null;
  const defaultModeId = trim(contract.defaultModeId);
  const rootTaskKind = trim(contract.transportTaskKind);
  const identifier = trim(model.modelKey) || trim(model.modelAlias);
  if (!defaultModeId || !rootTaskKind || !identifier || contract.modes.length === 0 || contract.modes.length > 16) return null;

  const modes: Record<string, string> = {};
  for (const rawMode of contract.modes) {
    if (!isJsonRecord(rawMode)) return null;
    const modeId = trim(rawMode.id);
    const taskKind = trim(rawMode.transportTaskKind) || rootTaskKind;
    if (!validModeStorageKey(modeId) || !taskKind || hasOwn(modes, modeId)) return null;
    modes[modeId] = taskKind;
  }
  if (!hasOwn(modes, defaultModeId)) return null;
  return {
    archetypeId: `custom-capability:${encodeURIComponent(identifier)}`,
    defaultModeId,
    modes,
  };
}

function builtInModeManifest(model: Model): CapabilityModeManifest | null {
  const explicitId = explicitArchetypeId(model.meta);
  const inferredId = archetypeIdForModel(model.modelKey, model.modelAlias);
  const archetypeId = explicitId && ARCHETYPE_MODE_MANIFEST[explicitId] ? explicitId : inferredId;
  if (!archetypeId) return null;
  const manifest = ARCHETYPE_MODE_MANIFEST[archetypeId];
  return manifest ? { archetypeId, ...manifest } : null;
}

function capabilityModeManifest(model: Model): CapabilityModeManifest | null {
  return customCapabilityModeManifest(model) || builtInModeManifest(model);
}

/**
 * 只从模型档案 / 显式能力契约确认 modeId。供应商名、modelKey 关键词和“有没有参考图”都不能发明模式。
 * mapping 只提供已由 selectTaskMapping 选中的 transport taskKind；模式身份仍由 archetype 验证。
 */
function validatedModeId(model: Model, request: TaskRequest, taskKind: ProfileKind): string | undefined {
  const manifest = capabilityModeManifest(model);
  if (!manifest) return undefined;

  const selected = requestArchetypeSelection(request);
  if (selected.archetypeId && selected.archetypeId !== manifest.archetypeId) return undefined;
  const requestedModeId = selected.modeId || (!selected.archetypeId ? manifest.defaultModeId : "");
  if (!requestedModeId) return undefined;
  return manifest.modes[requestedModeId] === taskKind ? requestedModeId : undefined;
}

export function resolveCustomCallExecution(
  model: Model,
  request: TaskRequest,
  mapping: Mapping | null,
): ResolvedCustomCallExecution | null {
  const customCall = model.customCall;
  if (!customCall) return null;
  const taskKind = mapping?.taskKind || request.kind;
  const modeId = validatedModeId(model, request, taskKind);
  const modeScript = modeId ? trim(customCall.modes?.[modeId]?.script) : "";
  if (modeScript) return { script: modeScript, source: "mode", taskKind, modeId };
  const modelScript = trim(customCall.script);
  return modelScript
    ? { script: modelScript, source: "model", taskKind, ...(modeId ? { modeId } : {}) }
    : null;
}

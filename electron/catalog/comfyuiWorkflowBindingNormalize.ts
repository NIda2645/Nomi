import type {
  ComfyGraph,
  WorkflowBinding,
  WorkflowParamBinding,
  WorkflowParamType,
} from "./comfyuiWorkflowImport";

const PARAM_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function inferParamType(value: string | number | boolean): WorkflowParamType {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "text";
}

function normalizeParamKey(raw: unknown, fallback: string): string {
  const clean = (value: unknown) => String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const makeIdentifier = (value: unknown) => {
    const cleaned = clean(value);
    if (!cleaned) return "";
    return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
  };
  const inComfyNamespace = (value: string) => value.startsWith("comfy_") ? value : `comfy_${value}`;
  const preferred = makeIdentifier(raw);
  if (PARAM_KEY_RE.test(preferred)) return inComfyNamespace(preferred);
  const safeFallback = makeIdentifier(fallback);
  return PARAM_KEY_RE.test(safeFallback) ? inComfyNamespace(safeFallback) : "comfy_param";
}

function normalizeParamType(value: unknown, fallbackValue: string | number | boolean): WorkflowParamType {
  return value === "number" || value === "text" || value === "boolean" ? value : inferParamType(fallbackValue);
}

export function inputKeyOf(nodeId: string, inputKey: string): string {
  return `${nodeId} ${inputKey}`;
}

export function roleBoundInputKeys(binding: WorkflowBinding): Set<string> {
  const keys = new Set<string>();
  const roles: Array<[string | undefined, string | undefined]> = [
    [binding.promptNodeId, binding.promptInputKey],
    [binding.firstFrameNodeId, binding.firstFrameInputKey],
    [binding.lastFrameNodeId, binding.lastFrameInputKey],
    [binding.sourceVideoNodeId, binding.sourceVideoInputKey],
  ];
  for (const [nodeId, inputKey] of roles) {
    if (nodeId && inputKey) keys.add(inputKeyOf(nodeId, inputKey));
  }
  return keys;
}

/** 把 IPC 或旧 catalog 中的 binding 收敛成唯一、可持久化的现代格式。 */
export function normalizeWorkflowBinding(binding: unknown, graph?: ComfyGraph): WorkflowBinding {
  const source = isRecord(binding) ? binding : {};
  const normalized: WorkflowBinding = {};
  const stringFields = [
    "promptNodeId", "promptInputKey",
    "firstFrameNodeId", "firstFrameInputKey",
    "lastFrameNodeId", "lastFrameInputKey",
    "sourceVideoNodeId", "sourceVideoInputKey",
    "outputNodeId",
  ] as const;
  for (const field of stringFields) {
    const value = nonEmptyString(source[field]);
    if (value) normalized[field] = value;
  }
  if (source.outputKind === "image" || source.outputKind === "video" || source.outputKind === "model3d") {
    normalized.outputKind = source.outputKind;
  }

  const roleFields = [
    ["promptNodeId", "promptInputKey"],
    ["firstFrameNodeId", "firstFrameInputKey"],
    ["lastFrameNodeId", "lastFrameInputKey"],
    ["sourceVideoNodeId", "sourceVideoInputKey"],
  ] as const;
  const seenRoleTargets = new Set<string>();
  for (const [nodeField, inputField] of roleFields) {
    const nodeId = normalized[nodeField];
    const inputKey = normalized[inputField];
    const graphValue = nodeId && inputKey ? graph?.[nodeId]?.inputs?.[inputKey] : undefined;
    const invalidTarget = Boolean(graph) && !isScalar(graphValue);
    const targetKey = nodeId && inputKey ? inputKeyOf(nodeId, inputKey) : "";
    if (!targetKey || invalidTarget || seenRoleTargets.has(targetKey)) {
      delete normalized[nodeField];
      delete normalized[inputField];
      continue;
    }
    seenRoleTargets.add(targetKey);
  }

  const hasParamsField = Object.prototype.hasOwnProperty.call(source, "params");
  const rawParams: unknown[] = hasParamsField
    ? Array.isArray(source.params) ? source.params : []
    : Array.isArray(source.numeric) ? source.numeric : [];
  const params: WorkflowParamBinding[] = [];
  const seenTargets = new Set<string>();
  const seenKeys = new Set<string>();
  const roleTargets = roleBoundInputKeys(normalized);

  for (const raw of rawParams) {
    if (!isRecord(raw)) continue;
    const nodeId = nonEmptyString(raw.nodeId);
    const inputKey = nonEmptyString(raw.inputKey);
    if (!nodeId || !inputKey) continue;

    const targetKey = inputKeyOf(nodeId, inputKey);
    if (seenTargets.has(targetKey) || roleTargets.has(targetKey)) continue;
    const graphHasTarget = graph
      ? Boolean(graph[nodeId]?.inputs && Object.prototype.hasOwnProperty.call(graph[nodeId].inputs, inputKey))
      : false;
    const graphValue = graphHasTarget ? graph?.[nodeId]?.inputs?.[inputKey] : undefined;
    if (graph && (!graphHasTarget || !isScalar(graphValue))) continue;

    const defaultValue = isScalar(raw.default) ? raw.default : isScalar(graphValue) ? graphValue : undefined;
    if (typeof defaultValue === "undefined") continue;

    const baseKey = normalizeParamKey(raw.paramKey, `comfy_${inputKey}`);
    let paramKey = baseKey;
    let suffix = 2;
    while (seenKeys.has(paramKey)) paramKey = `${baseKey}_${suffix++}`;

    seenTargets.add(targetKey);
    seenKeys.add(paramKey);
    params.push({
      nodeId,
      inputKey,
      paramKey,
      label: nonEmptyString(raw.label) ?? inputKey,
      type: hasParamsField ? normalizeParamType(raw.type, defaultValue) : "number",
      default: defaultValue,
    });
  }

  normalized.params = params;
  return normalized;
}

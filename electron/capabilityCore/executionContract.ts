import crypto from "node:crypto";

import type { ResolvedModule } from "./moduleRegistry";
import type { ParameterField } from "./moduleManifest";

export const EXECUTION_CONTRACT_SCHEMA_VERSION = 1 as const;

export type PlanAssetReference = {
  assetId: string;
  contentHash: string;
  version: number;
  kind?: "image" | "video" | "audio";
  role?: "character" | "first_frame" | "last_frame" | "reference" | "audio";
};

export type PlanCandidate = {
  candidateId: string;
  revision: number;
  moduleId: string;
  providerId: string;
  modelId: string;
  variantId?: string;
  /** Stable source-archetype mode id (for example `firstlast` or `omni`).
   * The transport `mode` remains the catalog task kind; keeping both prevents
   * several modes that share one task kind from being silently conflated. */
  modeId?: string;
  /** Provider wire model derived from the selected variant/mode. This is an
   * internal, validated projection; callers must not invent it. */
  transportModelId?: string;
  mode: string;
  prompt: string;
  parameters: Record<string, unknown>;
  references: PlanAssetReference[];
  sealedContractHash?: string;
};

/**
 * 参数值层被拒的**机器可读那一面**（人话那一面是 `Error.message`）。
 *
 * 为什么要它：这条错误的第一读者是模型，不是人。MCP 2026-07-28 把「input validation errors
 * (e.g., date in wrong format, value out of range)」归进 tool execution errors，并要求客户端
 * *"provide tool execution errors to language models to enable self-correction"*——
 * 能自纠的前提是错误里说得出**合法键**与**合法取值**。旧实现两样都没有：未知键直接丢，
 * 值不合法只回一句「不符合当前模型的声明」。
 */
export type ParameterRejectionCode =
  | "unknown_parameter"
  | "parameter_type_mismatch"
  | "parameter_not_in_enum"
  | "parameter_out_of_range"
  | "missing_required_parameter"
  | "unknown_variant";

export type ParameterRejection = {
  code: ParameterRejectionCode;
  /** `parameters.<key>` 或 `variantId`——模型下一次该改哪一处。 */
  path: string;
  /** 这个模型此刻接受的全部参数键（字典序，稳定）。 */
  allowedKeys?: string[];
  /** 与写错那个键最接近的合法键；没有足够接近的就不给（不许猜一个凑数）。 */
  closestKey?: string;
  expectedType?: ParameterField["type"];
  allowedValues?: Array<string | number | boolean>;
  min?: number;
  max?: number;
  /** 该模型声明过的变体 id；空数组 = 这个模型没有变体，不是「随便填」。 */
  allowedVariantIds?: string[];
};

export type ExecutionContractV1 = {
  schemaVersion: typeof EXECUTION_CONTRACT_SCHEMA_VERSION;
  candidateId: string;
  candidateRevision: number;
  moduleId: string;
  moduleVersion: string;
  providerId: string;
  modelId: string;
  variantId?: string;
  modeId?: string;
  transportModelId?: string;
  mode: string;
  prompt: string;
  parameters: Record<string, unknown>;
  references: PlanAssetReference[];
  contractHash: string;
  warnings: string[];
};

export class ContractCompilationError extends Error {
  readonly code = "contract_invalid" as const;
  /** Present whenever the rejection is about a value the caller sent (see `ParameterRejection`). */
  readonly rejection?: ParameterRejection;

  constructor(message: string, rejection?: ParameterRejection) {
    super(message);
    this.name = "ContractCompilationError";
    if (rejection) this.rejection = rejection;
  }
}

export class NewDraftRequiredError extends Error {
  readonly code = "new_draft_required" as const;

  constructor() {
    super("new_draft_required: the sealed generation must remain unchanged; edit a new draft");
    this.name = "NewDraftRequiredError";
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ContractCompilationError("Contract values must contain finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  throw new ContractCompilationError("Contract values must be JSON serializable");
}

function hashContract(value: Omit<ExecutionContractV1, "contractHash" | "warnings">): string {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function parameterMatches(type: string, value: unknown): boolean {
  switch (type) {
    case "string":
    case "enum": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "object": return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    case "array": return Array.isArray(value);
    default: return false;
  }
}

/** Levenshtein distance, capped at the shorter word — only used to suggest a near-miss key. */
function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const candidateCost = Math.min(
        previous[j]! + 1,
        previous[j - 1]! + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = previous[j]!;
      previous[j] = candidateCost;
    }
  }
  return previous[right.length]!;
}

/**
 * 「你是不是想写这个」——只在**真的接近**时才给（阈值 = 键长的 1/3，至少 1，最多 3）。
 * 没有足够接近的就返回 undefined：给一个不相干的键会把模型带去第二个错误答案。
 */
function closestParameterKey(written: string, allowedKeys: readonly string[]): string | undefined {
  const budget = Math.min(3, Math.max(1, Math.floor(written.length / 3)));
  let best: { key: string; distance: number } | undefined;
  for (const key of allowedKeys) {
    const distance = editDistance(written.toLowerCase(), key.toLowerCase());
    if (distance <= budget && (!best || distance < best.distance)) best = { key, distance };
  }
  return best?.key;
}

const displayValue = (value: unknown): string => (typeof value === "string" ? value : JSON.stringify(value));

/**
 * `candidate.parameters` 里那一小撮**不是供应商参数**的键：它们是 Nomi 自己的选型意图，
 * 由 `videoRecommendationInput`（`mcpGenerationVideoResolve.ts`）读走用来推荐模式/模型，
 * 从来不上 wire。
 *
 * 为什么必须写成一份**有名字的表**：旧实现靠「未知键 ⇒ 丢掉」顺手把它们处理掉了——
 * 于是「我们自己的意图键」和「模型写错的键」走同一条无声的路，谁也分不出来。
 * 现在它们是显式的一族，模型写错的键才是 `unknown_parameter`。
 * 改这张表就是改模型面的契约：加键前先问它会不会被误当成供应商参数（`check:vocabularies` 登记）。
 */
export const GENERATION_PLANNING_HINT_KEYS = Object.freeze([
  "cameraIntent",
  "preferredFamily",
  "preserveCharacter",
  "preserveTransition",
  "quality",
  "useReferenceAudio",
] as const);
const PLANNING_HINT_KEY_SET: ReadonlySet<string> = new Set(GENERATION_PLANNING_HINT_KEYS);

/**
 * 参数值层的**唯一**准入边界（两个模型面、三个调用点共用这一处）。
 *
 * 旧实现对未知键只做 `droppedFields.push(...)` 然后继续——而 `droppedFields` 全仓没有生产读者，
 * 于是「模型点名的参数」和「真正发给供应商的参数」可以不一样，**没有任何地方会红**：
 * 外部宿主猜错一个键名，计划照样成功，用户拿到的是按默认值跑出来的片子。
 * 现在五种填错方式一律当场拒，并在 `ParameterRejection` 里带上模型下一次写对所需的全部事实。
 */
function compileParameters(candidate: PlanCandidate, module: ResolvedModule): { parameters: Record<string, unknown>; warnings: string[] } {
  const parameters: Record<string, unknown> = {};
  const warnings: string[] = [];
  const allowedKeys = Object.keys(module.parameterSchema).sort();
  const model = `${module.providerId}/${module.modelId}`;
  for (const [key, value] of Object.entries(candidate.parameters)) {
    const field = module.parameterSchema[key];
    // 选型意图键：Nomi 的推荐器读它，供应商请求里没有它。不进合同，也不算「填错」。
    if (!field && PLANNING_HINT_KEY_SET.has(key)) continue;
    if (!field && allowedKeys.length === 0) {
      // 这个模型在目录里**一个参数都没声明**。那不等于「这个键是错的」，只等于「我们不知道」——
      // 证不出错就不许拒（R17：能判的判，判不了的明说）。但也绝不能像旧实现那样悄悄丢掉：
      // 调用方点名的值原样留在合同里，并在 warnings 里说清它没被校验过。
      parameters[key] = value;
      warnings.push(`${model} 没有声明参数表，参数 ${key} 原样带过、未经校验`);
      continue;
    }
    if (!field) {
      const closestKey = closestParameterKey(key, allowedKeys);
      throw new ContractCompilationError(
        `${model} 不接受参数 ${key}。`
        + (closestKey ? `最接近的合法键是 ${closestKey}。` : "")
        + `该模型此刻接受的参数键：${allowedKeys.length ? allowedKeys.join("、") : "（无）"}。`,
        { code: "unknown_parameter", path: `parameters.${key}`, allowedKeys, ...(closestKey ? { closestKey } : {}) },
      );
    }
    if (!parameterMatches(field.type, value)) {
      throw new ContractCompilationError(
        `参数 parameters.${key} 的类型不对：${model} 要 ${field.type}，收到的是 ${typeof value}。`,
        { code: "parameter_type_mismatch", path: `parameters.${key}`, expectedType: field.type, allowedKeys },
      );
    }
    if (field.enum && !field.enum.some((option) => Object.is(option, value))) {
      throw new ContractCompilationError(
        `参数 parameters.${key} 的取值 ${displayValue(value)} 不在 ${model} 的合法取值里。`
        + `合法取值：${field.enum.map(displayValue).join("、")}。`,
        { code: "parameter_not_in_enum", path: `parameters.${key}`, allowedValues: [...field.enum], allowedKeys },
      );
    }
    if (typeof value === "number"
      && ((field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max))) {
      throw new ContractCompilationError(
        `参数 parameters.${key} 的取值 ${value} 超出 ${model} 声明的范围`
        + `（${field.min ?? "不限"} ～ ${field.max ?? "不限"}）。`,
        {
          code: "parameter_out_of_range",
          path: `parameters.${key}`,
          ...(field.min !== undefined ? { min: field.min } : {}),
          ...(field.max !== undefined ? { max: field.max } : {}),
          allowedKeys,
        },
      );
    }
    parameters[key] = value;
  }
  for (const [key, field] of Object.entries(module.parameterSchema)) {
    if (field.required && !(key in parameters)) {
      throw new ContractCompilationError(
        `缺少必填参数 parameters.${key}（${model}）。该模型接受的参数键：${allowedKeys.join("、")}。`,
        { code: "missing_required_parameter", path: `parameters.${key}`, allowedKeys },
      );
    }
  }
  return { parameters, warnings };
}

/**
 * 这个模型此刻接受哪些参数键——**准入契约**的只读投影。
 * 模型面的「单模型详情」与这里的校验读的是同一个对象，两面因此不可能漂移。
 */
export function admittedParameterFields(
  registry: { resolve(input: { moduleId: string; providerId: string; modelId: string; mode: string }): ResolvedModule },
  selector: { moduleId: string; providerId: string; modelId: string; mode: string },
  override?: Record<string, ParameterField>,
): Record<string, ParameterField> {
  return override ?? registry.resolve(selector).parameterSchema;
}

export type ExecutionContractCompileOptions = {
  /** Optional source-backed parameter projection (for example a selected video variant). */
  parameterSchema?: Record<string, ParameterField>;
  /**
   * 该模型声明过的变体 id。给了就**逐个核**——不给等于「这条路还拿不到变体清单」，
   * 而不是「随便填都行」；拿得到清单的调用点必须传，见 `mcpGenerationTools` 的 preview/gate_request。
   */
  allowedVariantIds?: readonly string[];
};

export function compileExecutionContract(
  candidate: PlanCandidate,
  registry: { resolve(input: { moduleId: string; providerId: string; modelId: string; mode: string }): ResolvedModule },
  options: ExecutionContractCompileOptions = {},
): ExecutionContractV1 {
  if (!Number.isInteger(candidate.revision) || candidate.revision < 1) throw new ContractCompilationError("Candidate revision must be a positive integer");
  if (!candidate.prompt.trim()) throw new ContractCompilationError("Prompt is required");
  if (candidate.variantId !== undefined && !candidate.variantId.trim()) throw new ContractCompilationError("Variant id must not be empty");
  if (candidate.variantId !== undefined && options.allowedVariantIds !== undefined
    && !options.allowedVariantIds.includes(candidate.variantId.trim())) {
    const allowedVariantIds = [...options.allowedVariantIds];
    throw new ContractCompilationError(
      `变体 ${candidate.variantId.trim()} 不属于 ${candidate.providerId}/${candidate.modelId}。`
      + `该模型的变体：${allowedVariantIds.length ? allowedVariantIds.join("、") : "（这个模型没有变体，请不要传 variantId）"}。`,
      { code: "unknown_variant", path: "variantId", allowedVariantIds },
    );
  }
  if (candidate.modeId !== undefined && !candidate.modeId.trim()) throw new ContractCompilationError("Mode id must not be empty");
  if (candidate.transportModelId !== undefined && !candidate.transportModelId.trim()) throw new ContractCompilationError("Transport model id must not be empty");
  if (candidate.sealedContractHash) throw new NewDraftRequiredError();
  const module = registry.resolve({ moduleId: candidate.moduleId, providerId: candidate.providerId, modelId: candidate.modelId, mode: candidate.mode });
  if (candidate.references.length > (module.assetInputSchema.references?.max ?? Number.MAX_SAFE_INTEGER)) {
    throw new ContractCompilationError("参考素材数量超过当前模式支持的上限");
  }
  const effectiveModule = options.parameterSchema ? { ...module, parameterSchema: options.parameterSchema } : module;
  const { parameters, warnings } = compileParameters(candidate, effectiveModule);
  const semantic = {
    schemaVersion: EXECUTION_CONTRACT_SCHEMA_VERSION,
    candidateId: candidate.candidateId,
    candidateRevision: candidate.revision,
    moduleId: module.moduleId,
    moduleVersion: module.version,
    providerId: module.providerId,
    modelId: module.modelId,
    ...(candidate.variantId ? { variantId: candidate.variantId.trim() } : {}),
    ...(candidate.modeId ? { modeId: candidate.modeId.trim() } : {}),
    ...(candidate.transportModelId ? { transportModelId: candidate.transportModelId.trim() } : {}),
    mode: module.mode,
    prompt: candidate.prompt,
    parameters,
    references: candidate.references.map((reference) => ({ ...reference })),
  } satisfies Omit<ExecutionContractV1, "contractHash" | "warnings">;
  return { ...semantic, contractHash: hashContract(semantic), warnings };
}

export function applyPlanCandidatePatch(candidate: PlanCandidate, patch: Partial<Omit<PlanCandidate, "candidateId" | "revision">>): PlanCandidate {
  if (candidate.sealedContractHash) throw new NewDraftRequiredError();
  const next = {
    ...structuredClone(candidate),
    ...structuredClone(patch),
    revision: candidate.revision + 1,
    parameters: patch.parameters ? structuredClone(patch.parameters) : structuredClone(candidate.parameters),
    references: patch.references ? structuredClone(patch.references) : structuredClone(candidate.references),
  };
  // `transportModelId` is a derived wire projection, never a user-editable
  // field. A provider/model/mode/variant edit invalidates the old projection;
  // the semantic normalizer will derive a fresh value before sealing.
  const identityChanged = patch.providerId !== undefined
    || patch.modelId !== undefined
    || patch.variantId !== undefined
    || patch.mode !== undefined
    || patch.modeId !== undefined;
  if (identityChanged) delete next.transportModelId;
  else if (candidate.transportModelId) next.transportModelId = candidate.transportModelId;
  else delete next.transportModelId;
  return next;
}

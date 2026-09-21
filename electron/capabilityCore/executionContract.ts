import crypto from "node:crypto";

import type { ResolvedModule } from "./moduleRegistry";
import type { ParameterField } from "./moduleManifest";
import { isGenerationPlanningParameter } from "./generationPlanningParameters";
import { hasMentions, numberPromptReferences, projectPromptForSend } from "../shared/storyboard/promptMentions";

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

export type DroppedField = {
  path: string;
  /**
   * `planning_input` = Nomi 自己消费的意图键（`generationPlanningParameters.ts` 那张登记表），
   * 它本来就不上线缆，记下来是为了诚实，不是「不支持」。真正不认识的键不再落这里——它们报错。
   */
  reason: "unsupported_parameter" | "invalid_parameter" | "planning_input";
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
  droppedFields: DroppedField[];
};

export class ContractCompilationError extends Error {
  readonly code = "contract_invalid" as const;

  constructor(message: string) {
    super(message);
    this.name = "ContractCompilationError";
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

function hashContract(value: Omit<ExecutionContractV1, "contractHash" | "warnings" | "droppedFields">): string {
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
    // 线缆模板证明得了「这个键发得出去」，证明不了取值域——形状由供应商裁决，我们不替它编。
    case "any": return true;
    default: return false;
  }
}

function compileParameters(candidate: PlanCandidate, module: ResolvedModule): { parameters: Record<string, unknown>; warnings: string[]; droppedFields: DroppedField[] } {
  const parameters: Record<string, unknown> = {};
  const warnings: string[] = [];
  const droppedFields: DroppedField[] = [];
  for (const [key, value] of Object.entries(candidate.parameters)) {
    const field = module.parameterSchema[key];
    if (!field) {
      // Nomi 自己读的意图键：登记后丢，不上线缆（表与读者由 generationPlanningParameters.test 钉住）。
      if (isGenerationPlanningParameter(key)) {
        droppedFields.push({ path: `parameters.${key}`, reason: "planning_input" });
        continue;
      }
      // 其余不认识的键**报错并列出合法键**。静默丢弃是「你批准的是 A、我们发出去的是 B」的制造机：
      // 用户在付款卡上把清晰度改成 2K，这里一声不响地丢掉，供应商按自己的默认出 1k，节点上仍印 2K。
      droppedFields.push({ path: `parameters.${key}`, reason: "unsupported_parameter" });
      const legal = Object.keys(module.parameterSchema).sort();
      throw new ContractCompilationError(
        `参数 parameters.${key} 不在 ${module.providerId}/${module.modelId}（${module.mode}）声明的参数里。`
        + `该模型这一模式接受：${legal.length ? legal.join("、") : "（这条 mapping 没有声明任何参数）"}`,
      );
    }
    if (!parameterMatches(field.type, value) || (field.enum && !field.enum.some((option) => Object.is(option, value)))) {
      droppedFields.push({ path: `parameters.${key}`, reason: "invalid_parameter" });
      throw new ContractCompilationError(`参数 parameters.${key} 不符合当前模型的声明`);
    }
    parameters[key] = value;
  }
  for (const [key, field] of Object.entries(module.parameterSchema)) {
    if (field.required && !(key in parameters)) throw new ContractCompilationError(`缺少必填参数 parameters.${key}`);
  }
  return { parameters, warnings, droppedFields };
}

export type ExecutionContractCompileOptions = {
  /** Optional source-backed parameter projection (for example a selected video variant). */
  parameterSchema?: Record<string, ParameterField>;
  /**
   * 候选的每一条参考在**本项目素材库里的源 URL**，与 `candidate.references` 同序。
   *
   * 它只为一件事存在：prompt 里的 `@[asset:<url>]` 内联标记要在发出去之前投影成 `@image1/@video1`。
   * 手动画布那条路一直这么做（`catalogTaskActions.ts` 调 `projectPromptForSend`），Run 路径从来没做，
   * 于是 @ 过参考图的镜头交给 Agent／外部 MCP 重拍时，供应商收到的是一串
   * `@[asset:nomi-local%3A%2F%2F…png]` —— 花了钱拿回错东西。
   *
   * 缺省 = 候选没有内联标记时什么都不做（绝大多数镜头，逐字节不变）。带标记却没给这份映射时**报错**，
   * 不是「投影不了就原样发」——原样发正是那个 bug。
   */
  referenceSourceUrls?: readonly (string | undefined)[];
};

/**
 * 发给供应商之前的最终 prompt。投影规则与编号规则都住在共享层
 * （`electron/shared/storyboard/promptMentions.ts`），两条生成路径吃的是同一份。
 */
function projectContractPrompt(candidate: PlanCandidate, sourceUrls: readonly (string | undefined)[] | undefined): string {
  if (!hasMentions(candidate.prompt)) return candidate.prompt;
  if (!sourceUrls) {
    throw new ContractCompilationError(
      "提示词里有 @ 内联引用，但这条路没有提供参考素材的源地址，投影不出 @image1 —— 原样发出去等于把内部标记塞给供应商",
    );
  }
  const ordered = candidate.references.map((reference, index) => ({ url: sourceUrls[index], kind: reference.kind }));
  const missing = ordered.findIndex((entry) => typeof entry.url !== "string" || !entry.url);
  if (missing >= 0) {
    throw new ContractCompilationError(`参考素材 ${candidate.references[missing].assetId} 解析不出源地址，提示词里的 @ 引用无法投影`);
  }
  const projected = projectPromptForSend(
    candidate.prompt,
    numberPromptReferences(ordered as ReadonlyArray<{ url: string; kind?: "image" | "video" | "audio" }>),
  );
  if (!projected.trim()) throw new ContractCompilationError("Prompt is required");
  return projected;
}

export function compileExecutionContract(
  candidate: PlanCandidate,
  registry: { resolve(input: { moduleId: string; providerId: string; modelId: string; mode: string }): ResolvedModule },
  options: ExecutionContractCompileOptions = {},
): ExecutionContractV1 {
  if (!Number.isInteger(candidate.revision) || candidate.revision < 1) throw new ContractCompilationError("Candidate revision must be a positive integer");
  if (!candidate.prompt.trim()) throw new ContractCompilationError("Prompt is required");
  const prompt = projectContractPrompt(candidate, options.referenceSourceUrls);
  if (candidate.variantId !== undefined && !candidate.variantId.trim()) throw new ContractCompilationError("Variant id must not be empty");
  if (candidate.modeId !== undefined && !candidate.modeId.trim()) throw new ContractCompilationError("Mode id must not be empty");
  if (candidate.transportModelId !== undefined && !candidate.transportModelId.trim()) throw new ContractCompilationError("Transport model id must not be empty");
  if (candidate.sealedContractHash) throw new NewDraftRequiredError();
  const module = registry.resolve({ moduleId: candidate.moduleId, providerId: candidate.providerId, modelId: candidate.modelId, mode: candidate.mode });
  if (candidate.references.length > (module.assetInputSchema.references?.max ?? Number.MAX_SAFE_INTEGER)) {
    throw new ContractCompilationError("参考素材数量超过当前模式支持的上限");
  }
  const effectiveModule = options.parameterSchema ? { ...module, parameterSchema: options.parameterSchema } : module;
  const { parameters, warnings, droppedFields } = compileParameters(candidate, effectiveModule);
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
    prompt,
    parameters,
    references: candidate.references.map((reference) => ({ ...reference })),
  } satisfies Omit<ExecutionContractV1, "contractHash" | "warnings" | "droppedFields">;
  return { ...semantic, contractHash: hashContract(semantic), warnings, droppedFields };
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

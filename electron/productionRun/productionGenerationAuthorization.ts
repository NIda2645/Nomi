import { spendReferenceKey } from "../shared/contracts/pendingSpendConfirm";
import { budgetExceeds, sumBudgetAmounts } from "./budgetLedger";
import crypto from "node:crypto";

import type { ExecutionContractV1 } from "../capabilityCore/executionContract";

export const PRODUCTION_GENERATION_AUTHORIZATION_VERSION = 1 as const;

export type ProductionGenerationTargetEvidence =
  | Readonly<{
      kind: "canvas-node";
      nodeId: string;
      nodeRevision: number;
      currentResultId?: string;
      currentResultContentHash?: string;
    }>
  | Readonly<{
      kind: "generation-operation";
      operationId: string;
      candidateRevision: number;
    }>;

export type ProductionGenerationAuthorizationJobV1 = Readonly<{
  jobId: string;
  shotId: string;
  attempt: number;
  target: ProductionGenerationTargetEvidence;
  contractHash: string;
  providerId: string;
  modelId: string;
  mode: string;
  parameters: Readonly<Record<string, unknown>>;
  references: readonly ExecutionContractV1["references"][number][];
  referenceUrls?: Readonly<Record<string, string>>;
  providerWirePayloadHash: string;
  providerIdempotencyKey: string;
  /**
   * 这一镜人决定覆盖的最大负债。`maximum: null` = **目录算不出价**，不是 0 元。
   *
   * 为什么是可空而不是「算不出就不发信封」（2026-09-21 用户拍板）：内置 204 个生成模型一条 pricing
   * 都没有，「算不出」是干净装机上 100% 的默认状态。把它写成 0 会被读成「这次免费」（三种可能里
   * 唯一会骗人的那一种），所以它必须有自己的表达位；而让它挡住生成，等于因为我们没建价格标尺就
   * 不让用户干活。null 让**编译器**在每一处求和/比较的地方拦住「顺手当 0」（R17）。
   */
  price: Readonly<{ currency: string; maximum: number | null }>;
}>;

export type ProductionGenerationAuthorizationEnvelopeV1 = Readonly<{
  schemaVersion: typeof PRODUCTION_GENERATION_AUTHORIZATION_VERSION;
  immutableProjectUuid: string;
  projectGeneration: number;
  projectId: string;
  projectRevision: number;
  runId: string;
  planVersion: number;
  gateId: string;
  costScope: string;
  expiresAt: string;
  jobs: readonly ProductionGenerationAuthorizationJobV1[];
  budget: Readonly<{
    currency: string;
    /** Maximum new liability covered by this human decision — **known prices only**. */
    maximum: number;
    /** Absolute Run ledger ceiling after this authorization is approved — known prices only. */
    ledgerCeiling: number;
    /**
     * 这份信封里**价格未知**的 job 数（那根独立的轴）。
     *
     * 它不是金额、不参与任何金额比较，也永远不折进 `maximum`。金额那两个数说的是
     * 「已知的部分最多花这么多」，这个数说的是「另外还有 N 笔，花多少事后才知道」——
     * 两句话都是真的，合成一个数就至少有一句是假的。
     *
     * 它由 `jobs[]` **派生**（`createProductionGenerationAuthorizationEnvelope` 现算），所以信封上
     * 永远不会出现和 job 表对不上的计数；调用方也可以自己算一份传进来，对不上就抛——那说明有人
     * 在别处把未知折成了金额。开闸前封存的旧信封没有这个字段，派生出来恒 0（当时未知根本发不出信封）。
     */
    unknownJobCount: number;
  }>;
}>;

export class ProductionGenerationAuthorizationError extends Error {
  readonly code = "generation_authorization_invalid" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProductionGenerationAuthorizationError";
  }
}

export function stableAuthorizationJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ProductionGenerationAuthorizationError("Authorization values must contain finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableAuthorizationJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableAuthorizationJson(child)}`)
      .join(",")}}`;
  }
  throw new ProductionGenerationAuthorizationError("Authorization values must be JSON serializable");
}

export function productionGenerationPayloadHash(payload: unknown): string {
  return crypto.createHash("sha256").update(stableAuthorizationJson(payload)).digest("hex");
}

function requiredText(value: string, label: string): string {
  const text = value.trim();
  if (!text) throw new ProductionGenerationAuthorizationError(`${label} is required`);
  return text;
}

function nonNegativeMoney(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new ProductionGenerationAuthorizationError(`${label} must be non-negative`);
  return value;
}

/** 已知金额 → 校验；`null`（目录算不出）→ 原样留着，**绝不落成 0**。 */
function nonNegativeMoneyOrUnknown(value: number | null, label: string): number | null {
  return value === null ? null : nonNegativeMoney(value, label);
}

/** 只把已知价加起来。未知不是 0，它在 `unknownJobCount` 那根轴上被数一次。 */
export function sumKnownJobCeilings(jobs: ReadonlyArray<{ price: { maximum: number | null } }>): number {
  return sumBudgetAmounts(jobs.filter((job) => job.price.maximum !== null).map((job) => job.price.maximum as number));
}

/** 价格未知的 job 数。 */
export function countUnknownJobPrices(jobs: ReadonlyArray<{ price: { maximum: number | null } }>): number {
  return jobs.reduce((count, job) => (job.price.maximum === null ? count + 1 : count), 0);
}

export function productionGenerationJobId(
  runId: string,
  contractHash: string,
  attempt = 1,
  shotId?: string,
): string {
  const shotSegment = shotId ? `-${requiredText(shotId, "Shot id")}` : "";
  const normalizedRunId = requiredText(runId, "Run id");
  const normalizedContractHash = requiredText(contractHash, "Contract hash");
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new ProductionGenerationAuthorizationError("Generation attempt must be a positive integer");
  }
  return `generation-${normalizedRunId}${shotSegment}-${normalizedContractHash.slice(0, 16)}${attempt > 1 ? `-attempt-${attempt}` : ""}`;
}

export function productionGenerationProviderIdempotencyKey(
  runId: string,
  contractHash: string,
  attempt = 1,
  shotId?: string,
): string {
  const jobId = productionGenerationJobId(runId, contractHash, attempt, shotId);
  const bindingShotId = shotId ? requiredText(shotId, "Shot id") : jobId;
  return `generation:${requiredText(runId, "Run id")}:${bindingShotId}:${requiredText(contractHash, "Contract hash")}:attempt-${attempt}`;
}

export type ProductionGenerationAuthorizationEnvelopeInput = Omit<ProductionGenerationAuthorizationEnvelopeV1, "budget"> & Readonly<{
  budget: Readonly<{ currency: string; maximum: number; ledgerCeiling: number; unknownJobCount?: number }>;
}>;

export function createProductionGenerationAuthorizationEnvelope(input: ProductionGenerationAuthorizationEnvelopeInput): ProductionGenerationAuthorizationEnvelopeV1 {
  if (input.schemaVersion !== PRODUCTION_GENERATION_AUTHORIZATION_VERSION) {
    throw new ProductionGenerationAuthorizationError("Unsupported generation authorization version");
  }
  if (!Number.isSafeInteger(input.projectGeneration) || input.projectGeneration < 1) {
    throw new ProductionGenerationAuthorizationError("Project generation must be a positive integer");
  }
  if (!Number.isSafeInteger(input.projectRevision) || input.projectRevision < 0) {
    throw new ProductionGenerationAuthorizationError("Project revision must be a non-negative integer");
  }
  if (!Number.isSafeInteger(input.planVersion) || input.planVersion < 1) {
    throw new ProductionGenerationAuthorizationError("Plan version must be a positive integer");
  }
  if (input.jobs.length === 0) throw new ProductionGenerationAuthorizationError("Authorization requires at least one job");
  const currency = requiredText(input.budget.currency, "Budget currency");
  const ids = new Set<string>();
  const jobs = input.jobs.map((job) => {
    const jobId = requiredText(job.jobId, "Job id");
    if (ids.has(jobId)) throw new ProductionGenerationAuthorizationError(`Duplicate authorization job: ${jobId}`);
    ids.add(jobId);
    if (!Number.isSafeInteger(job.attempt) || job.attempt < 1) {
      throw new ProductionGenerationAuthorizationError("Generation attempt must be a positive integer");
    }
    if (!job.target || typeof job.target !== "object") {
      throw new ProductionGenerationAuthorizationError("Generation target evidence is invalid");
    }
    let target: ProductionGenerationTargetEvidence;
    if (job.target.kind === "canvas-node") {
      if (!Number.isSafeInteger(job.target.nodeRevision) || job.target.nodeRevision < 0) {
        throw new ProductionGenerationAuthorizationError("Node revision must be a non-negative integer");
      }
      target = Object.freeze({
        kind: "canvas-node",
        nodeId: requiredText(job.target.nodeId, "Node id"),
        nodeRevision: job.target.nodeRevision,
        ...(job.target.currentResultId
          ? { currentResultId: requiredText(job.target.currentResultId, "Current result id") }
          : {}),
        ...(job.target.currentResultContentHash
          ? { currentResultContentHash: requiredText(job.target.currentResultContentHash, "Current result content hash") }
          : {}),
      });
    } else if (job.target.kind === "generation-operation") {
      if (!Number.isSafeInteger(job.target.candidateRevision) || job.target.candidateRevision < 1) {
        throw new ProductionGenerationAuthorizationError("Candidate revision must be a positive integer");
      }
      target = Object.freeze({
        kind: "generation-operation",
        operationId: requiredText(job.target.operationId, "Operation id"),
        candidateRevision: job.target.candidateRevision,
      });
    } else {
      throw new ProductionGenerationAuthorizationError("Generation target evidence is invalid");
    }
    if (job.price.currency.trim() !== currency) throw new ProductionGenerationAuthorizationError("Job price currency must match the batch budget");
    if (job.referenceUrls) {
      const keys = new Set(job.references.map(spendReferenceKey));
      if (Object.keys(job.referenceUrls).length !== keys.size || Object.entries(job.referenceUrls).some(([key, value]) => {
        if (!keys.has(key) || typeof value !== "string") return true;
        try { return !["http:", "https:"].includes(new URL(value).protocol); } catch { return true; }
      })) throw new ProductionGenerationAuthorizationError("Reference URL snapshot does not match the authorized assets");
    }
    return Object.freeze({
      jobId,
      shotId: requiredText(job.shotId, "Shot id"),
      attempt: job.attempt,
      target,
      contractHash: requiredText(job.contractHash, "Contract hash"),
      providerId: requiredText(job.providerId, "Provider id"),
      modelId: requiredText(job.modelId, "Model id"),
      mode: requiredText(job.mode, "Generation mode"),
      parameters: Object.freeze(structuredClone(job.parameters)),
      references: Object.freeze(structuredClone(job.references)),
      ...(job.referenceUrls ? { referenceUrls: Object.freeze(structuredClone(job.referenceUrls)) } : {}),
      providerWirePayloadHash: requiredText(job.providerWirePayloadHash, "Provider wire payload hash"),
      providerIdempotencyKey: requiredText(job.providerIdempotencyKey, "Provider idempotency key"),
      price: Object.freeze({ currency, maximum: nonNegativeMoneyOrUnknown(job.price.maximum, "Job price ceiling") }),
    });
  });
  const maximum = nonNegativeMoney(input.budget.maximum, "Budget ceiling");
  const ledgerCeiling = nonNegativeMoney(input.budget.ledgerCeiling, "Run ledger ceiling");
  const jobMaximum = sumKnownJobCeilings(jobs);
  const unknownJobCount = countUnknownJobPrices(jobs);
  if (input.budget.unknownJobCount !== undefined && input.budget.unknownJobCount !== unknownJobCount) {
    // 信封上的未知计数不是调用方随手填的注解，它是这批 job 的事实。对不上 = 有人在别处把未知
    // 折成了金额（或反过来），那正是这条轴要拦住的事。
    throw new ProductionGenerationAuthorizationError("Unknown-price job count must match the ordered jobs");
  }
  if (budgetExceeds(maximum, jobMaximum)) throw new ProductionGenerationAuthorizationError("Budget ceiling must not exceed the ordered job ceilings");
  if (budgetExceeds(maximum, ledgerCeiling)) throw new ProductionGenerationAuthorizationError("Run ledger ceiling must cover the approved job ceiling");
  const expiresAt = requiredText(input.expiresAt, "Authorization expiry");
  if (!Number.isFinite(Date.parse(expiresAt))) throw new ProductionGenerationAuthorizationError("Authorization expiry is invalid");
  return Object.freeze({
    schemaVersion: PRODUCTION_GENERATION_AUTHORIZATION_VERSION,
    immutableProjectUuid: requiredText(input.immutableProjectUuid, "Immutable project uuid"),
    projectGeneration: input.projectGeneration,
    projectId: requiredText(input.projectId, "Project id"),
    projectRevision: input.projectRevision,
    runId: requiredText(input.runId, "Run id"),
    planVersion: input.planVersion,
    gateId: requiredText(input.gateId, "Gate id"),
    costScope: requiredText(input.costScope, "Cost scope"),
    expiresAt,
    jobs: Object.freeze(jobs),
    budget: Object.freeze({ currency, maximum, ledgerCeiling, unknownJobCount }),
  });
}

export function productionGenerationAuthorizationDigest(envelope: ProductionGenerationAuthorizationEnvelopeV1): string {
  return productionGenerationPayloadHash(createProductionGenerationAuthorizationEnvelope(envelope));
}

export function assertProductionGenerationPayloadHash(payload: unknown, expectedHash: string): void {
  const actual = productionGenerationPayloadHash(payload);
  if (actual !== expectedHash) throw new ProductionGenerationAuthorizationError("Provider wire payload no longer matches the approved authorization");
}

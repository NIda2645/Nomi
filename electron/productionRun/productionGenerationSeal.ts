import { stableAuthorizationJson } from "./productionGenerationAuthorization";
import type { ProductionGenerationPlan, ProductionGenerationShot } from "./productionRunTypes";
import type { ShotPrice } from "./shotPricing";

export class SealBudgetExceededError extends Error {
  readonly code = "seal_budget_exceeded" as const;

  constructor(
    readonly maxAffordableShots: number,
    readonly knownSubtotal: number,
    readonly maxSpend: number,
  ) {
    super(`seal_budget_exceeded: hard spend ceiling ${maxSpend} covers only the first ${maxAffordableShots} shot(s)`);
    this.name = "SealBudgetExceededError";
  }
}

export function generationSealShotPrices(raw: unknown): Map<string, ShotPrice> | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error("Generation seal shotPrices must be an array");
  const prices = new Map<string, ShotPrice>();
  for (const [index, value] of raw.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid seal shot price at ${index}`);
    const entry = value as { shotId?: unknown; price?: unknown };
    const shotId = typeof entry.shotId === "string" ? entry.shotId.trim() : "";
    if (!shotId) throw new Error(`Invalid seal shot price id at ${index}`);
    const price = entry.price as ShotPrice | undefined;
    if (!price || typeof price !== "object" || typeof (price as { known?: unknown }).known !== "boolean") {
      throw new Error(`Invalid seal shot price value at ${index}`);
    }
    if (price.known && !(Number.isFinite(price.amount) && price.amount >= 0)) {
      throw new Error(`Invalid seal shot price amount at ${index}`);
    }
    prices.set(shotId, price.known ? { known: true, amount: price.amount } : { known: false });
  }
  return prices;
}

export type GenerationSealCostCertainty = ProductionGenerationPlan["costCertainty"];

/** A shot is included in the sealed contract unless it was explicitly unchecked (试拍/分批). */
export function isShotIncluded(shot: Pick<ProductionGenerationShot, "included">): boolean {
  return shot.included !== false;
}

/**
 * P4 S1 seal helper: validate + freeze the shots[] payload. Returns undefined for a single-shot seal
 * (no shots[] payload → today's byte-identical path). For a multi-shot seal, every INCLUDED shot must
 * carry a matching sealed sub-contract; excluded shots must not; shot ids must be unique and non-empty.
 */
export function sealGenerationShots(plan: ProductionGenerationPlan, raw: unknown): ProductionGenerationShot[] | undefined {
  if (raw === undefined) {
    if (plan.shots?.length) throw new Error("Multi-shot seal must include the complete current shot list");
    return undefined;
  }
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("Multi-shot generation seal requires a non-empty shots list");
  if (plan.shots && raw.length !== plan.shots.length) throw new Error("Generation seal shot set does not match the current plan");
  const seen = new Set<string>();
  // 封存前这一镜已有的画布绑定。seal 冻的是**合同与候选**；`nodeId` / `canvasDetached` 是画布落地
  // owner 写的「shot ↔ 画布节点」单一真相（productionRunTypes.ts 该字段的注释），不归 seal 管。
  const priorByShotId = new Map((plan.shots ?? []).map((shot) => [shot.shotId, shot] as const));
  const sealed = raw.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid generation shot ${index}`);
    const shot = value as ProductionGenerationShot;
    const shotId = typeof shot.shotId === "string" ? shot.shotId.trim() : "";
    if (!shotId || seen.has(shotId)) throw new Error(`Invalid generation shot id at ${index}`);
    seen.add(shotId);
    const included = isShotIncluded(shot);
    if (included) {
      if (!shot.contract || typeof shot.contract.contractHash !== "string" || !shot.contract.contractHash.trim()) {
        throw new Error(`Included generation shot ${shotId} needs a sealed sub-contract`);
      }
      if (shot.candidate?.sealedContractHash !== shot.contract.contractHash) {
        throw new Error(`Generation shot ${shotId} sub-contract does not match its sealed candidate`);
      }
    } else if (shot.contract) {
      throw new Error(`Excluded generation shot ${shotId} must not carry a sealed sub-contract`);
    }
    // 调用方（capabilityCore 的 sealMultiShotFor）**逐字段重建**每一镜，只带 shotId/role/included/
    // candidate/contract——照单全收就等于把已经落地的 nodeId 抹掉。抹掉的代价不是「下次补上」：
    //   ① seal 当场就按 shot.nodeId 铸 job（productionGenerationAuthorizationState.authorizationUnits），
    //      抹掉 = 这批 job 永远没有 nodeId → semanticGenerationReadiness 判「生成镜头缺少画布节点」，
    //      整个 Run 停在 needs_attention；
    //   ② 确认即落那次重落地算出的绑定与草稿那次**逐字节相同**，故 bind 命令的 commandId
    //      （canvas-landing:{runId}:bind:{shotId}={nodeId}…）也相同，被仓储按幂等重放吞掉 → 补不回来。
    // 所以这里必须把绑定带过封存线。用户自己删占位留下的 canvasDetached 同理（撤销事实优先）。
    const prior = priorByShotId.get(shotId);
    if (!prior) {
      if (plan.shots) throw new Error(`Unknown generation shot: ${shotId}`);
      throw new Error("Generation seal cannot introduce shots outside the draft plan");
    }
    const { sealedContractHash: _hash, ...candidate } = shot.candidate;
    const { sealedContractHash: _priorHash, ...priorCandidate } = prior.candidate;
    if (plan.shots?.[index].shotId !== shotId || isShotIncluded(prior) !== included
      || prior.role !== shot.role || stableAuthorizationJson(candidate) !== stableAuthorizationJson(priorCandidate)) {
      throw new Error(`Generation seal does not match current shot: ${shotId}`);
    }
    // The draft owner retains node binding, metadata, title and attempt lineage. Seal only freezes execution.
    return { ...prior, candidate: shot.candidate, ...(shot.contract ? { contract: shot.contract } : {}) };
  });
  return sealed;
}

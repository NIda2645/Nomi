// 生成计划的**候选补丁**与**撤未点头的授权**（`generation.patch` / `generation.revise` /
// `generation.trial_narrow` 三条命令共用的那一段写法）。
//
// 为什么单独一层：这三条命令改的是同一份候选、撤的是同一道门，差别只在「进来之前允不允许它还封着」
// 和「改了什么」。各写各的代价不是重复，而是**三份会漂**——`revise` 少 clone 一次 parameters，
// 就会出现「卡上改了时长、封的还是旧值」这种只在钱上看得见的错。
//
// 抽出来的第二个理由是体积：reducer 是这个域的调度中心，每条命令都往里挤会把它撑成一个谁都不敢改的
// 巨壳（R9/R12）。命令的**判据**留在 reducer（那是它的活），命令的**手法**住这里。
import type {
  ProductionGate,
  ProductionGenerationPlan,
  ProductionGenerationShot,
  ProductionJob,
  ProductionRun,
  RunCommand,
} from "./productionRunTypes";
import { approvedAuthorizationGatesForShot, spendAuthorizationGates, waitingAuthorizationGates } from "../shared/productionSpendAuthority";
import type { ProductionCommandEffect } from "./productionRunReducer";

/** Update one shot inside a plan by id; throws if the plan has no such shot. */
export function replaceShot(
  plan: ProductionGenerationPlan,
  shotId: string,
  update: (shot: ProductionGenerationShot) => ProductionGenerationShot,
): ProductionGenerationShot[] {
  const shots = plan.shots ?? [];
  let found = false;
  const next = shots.map((shot) => {
    if (shot.shotId !== shotId) return shot;
    found = true;
    return update(shot);
  });
  if (!found) throw new Error(`Generation shot not found: ${shotId}`);
  return next;
}

function record(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = payload[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${key}`);
  return value as Record<string, unknown>;
}

/**
 * 把一次候选补丁落到计划上（`generation.patch` 与 `generation.revise` 共用的**同一段**写法）。
 *
 * 为什么抽出来：两条命令改的是同一份候选，差别只在「进来之前允不允许它还封着」。
 * 各写一份的代价不是重复，而是**两份会漂**——`revise` 少 clone 一次 parameters，
 * 就会出现「卡上改了时长、封的还是旧值」这种只在钱上看得见的错。
 */
/**
 * 撤掉一份**还没被人点头**的付费授权，把计划退回可编辑的 draft。
 *
 * `generation.trial_narrow`（试拍首镜）与 `generation.revise`（卡上改参数）改的都是
 * 「供应商真正会收到的那份载荷」，因此都必须走同一条路：撤授权 → 回 draft →
 * 重新 prepare/seal/gate 生成**新的** digest。差别只在改了什么，不在怎么撤。
 *
 * 不变量：**收据 = 实际执行**。旧 digest 上的 job 一律丢弃，旧 gate 置 `revoked`；
 * 任何一个 job 越过 `authorization_required` 就说明这份授权已经开始执行，此时改载荷
 * 会让「用户点头的那张单」和「真正跑的那一次」分叉，所以直接拒绝。
 */
export function revokeWaitingGenerationAuthorization(
  current: ProductionRun,
  _plan: ProductionGenerationPlan,
  now: string,
  what: string,
  /** 只撤盖着这一镜的那几份（去掉 / 改这一镜时，别的镜正在点的那一下不许被一起撤掉）。缺省 = 全部在等的。 */
  onlyShotId?: string,
): Readonly<{ gates: ProductionGate[]; jobs: ProductionJob[]; planVersion: number }> {
  // 撤的是**还在等人决定**的那几份授权（每份住在自己那道门上）；已经批过的那几份与它们的 job 一个不动。
  const waiting = waitingAuthorizationGates(current)
    .filter((gate) => onlyShotId === undefined || gate.authorizationEnvelope.jobs.some((job) => job.shotId === onlyShotId));
  if (waiting.length === 0) {
    throw new Error(`${what} is available only before the spend gate is decided`);
  }
  const revokedDigests = new Set(waiting.map((gate) => gate.authorizationDigest));
  const abandonedJobs = current.jobs.filter((job) => job.authorizationDigest !== undefined && revokedDigests.has(job.authorizationDigest));
  if (abandonedJobs.some((job) => job.status !== "authorization_required")) {
    throw new Error(`${what} cannot replace an authorization that has begun execution`);
  }
  const revokedGateIds = new Set(waiting.map((gate) => gate.gateId));
  return {
    gates: current.gates.map((gate) => revokedGateIds.has(gate.gateId)
      ? { ...gate, status: "revoked" as const, decidedAt: now }
      : gate),
    jobs: current.jobs.filter((job) => job.authorizationDigest === undefined || !revokedDigests.has(job.authorizationDigest)),
    planVersion: current.planVersion + 1,
  };
}

/** 计划上所有「封印/授权」字段的清零点。加字段时只有这一处要跟着改。 */
export function unsealedGenerationPlanFields(plan: ProductionGenerationPlan, now: string): ProductionGenerationPlan {
  return {
    ...plan,
    state: "draft",
    candidate: { ...plan.candidate, sealedContractHash: undefined },
    ...(plan.shots ? { shots: plan.shots.map((shot) => ({ ...shot, contract: undefined,
      candidate: { ...shot.candidate, sealedContractHash: undefined }, approvedReceiptId: undefined,
      approvedAt: undefined, approvedAttempt: undefined })) } : {}),
    contract: undefined,
    costCertainty: undefined,
    updatedAt: now,
  };
}

export function applyGenerationCandidatePatch(
  plan: ProductionGenerationPlan,
  command: RunCommand,
  now: string,
): ProductionGenerationPlan {
  const patch = record(command.payload, "patch") as Partial<ProductionGenerationShot["candidate"]>;
  const rawShotId = typeof command.payload.shotId === "string" ? command.payload.shotId.trim() : "";
  const shotId = rawShotId || undefined;
  if (shotId) {
    const hasIncluded = typeof command.payload.included === "boolean";
    const shots = replaceShot(plan, shotId, (shot) => ({
      ...shot,
      candidate: {
        ...shot.candidate,
        ...patch,
        revision: shot.candidate.revision + 1,
        parameters: patch.parameters ? structuredClone(patch.parameters) : structuredClone(shot.candidate.parameters),
        references: patch.references ? structuredClone(patch.references) : structuredClone(shot.candidate.references),
      },
      ...(hasIncluded ? { included: command.payload.included as boolean } : {}),
      updatedAt: now,
    }));
    return { ...plan, shots, updatedAt: now };
  }
  const candidate = {
    ...plan.candidate,
    ...patch,
    revision: plan.candidate.revision + 1,
    parameters: patch.parameters ? structuredClone(patch.parameters) : structuredClone(plan.candidate.parameters),
    references: patch.references ? structuredClone(patch.references) : structuredClone(plan.candidate.references),
  };
  return { ...plan, candidate, updatedAt: now };
}


/**
 * 卡上换了模型之后，把**用户这一下亲手选中的**供应商/模型放进 Run 的白名单。
 *
 * 白名单原本为什么拦得住它：Run 的 policy 是**建草稿那一刻**从候选身份冻下来的
 * （`productionGenerationOperationStore.create`）。冻它是为了「后面再来的命令不能
 * 偷偷换掉 host/provider/model」——那道闸防的是 **agent**，而 agent 改候选走的是
 * `generation.patch`，本函数碰不到那条路。
 *
 * 但付费卡上那个模型下拉是**真人当场按下去的**：`generation.revise` 只有这一个入口
 * （`appIntegrationSpendConfirm` ← IPC `nomi:production-runs:revise-spend` ← 有窗口
 * 代表真人的渲染层）。用一道防 agent 的闸去拦真人自己的选择，用户看到的是一句
 * 「模型未加入白名单」，而他做的只是在卡上换了个模型（#748 已知缺口）。
 *
 * 放行的边界是**同一个任务类别**（`candidate.mode` = 目录任务种类，如 `text-to-image`）：
 * 卡上那个下拉本来就只列同类别的模型，而跨类别（图 → 视频）换掉的是整个花钱量级，
 * 那不叫「改一下」。所以类别一变就不放行——白名单照旧挡下，fail-closed；
 * 凭空多出来的镜同理（`before` 里找不到它，就不是「改」）。
 *
 * 放行的只是**判据里的身份**，不是那笔钱：`maxSpend`、收据、决门、封印一个都没动，
 * 换完模型仍要重新计价、重新出卡、重新由真人按一次（`generation.revise` 已撤旧授权）。
 */
export function policyAdmittingUserRevisedIdentity(
  policy: ProductionRun["policy"],
  before: ProductionGenerationPlan,
  after: ProductionGenerationPlan,
): ProductionRun["policy"] {
  const was = candidateIdentities(before);
  const providers = new Set(policy.allowedProviders);
  const models = new Set(policy.allowedModels);
  let widened = false;
  for (const [key, next] of candidateIdentities(after)) {
    const previous = was.get(key);
    if (!previous || previous.mode !== next.mode) continue;
    if (next.providerId && !providers.has(next.providerId)) { providers.add(next.providerId); widened = true; }
    if (next.modelId && !models.has(next.modelId)) { models.add(next.modelId); widened = true; }
  }
  if (!widened) return policy;
  return { ...policy, allowedProviders: [...providers], allowedModels: [...models] };
}

/** 计划里每一份候选的身份，按「镜」寻址（顶层那份用 `@plan`，它是单镜旧形态的默认镜）。 */
function candidateIdentities(
  plan: ProductionGenerationPlan,
): Map<string, Pick<ProductionGenerationShot["candidate"], "mode" | "providerId" | "modelId">> {
  const entries = new Map<string, Pick<ProductionGenerationShot["candidate"], "mode" | "providerId" | "modelId">>();
  const put = (key: string, candidate: ProductionGenerationShot["candidate"]): void => {
    entries.set(key, { mode: candidate.mode, providerId: candidate.providerId, modelId: candidate.modelId });
  };
  put("@plan", plan.candidate);
  for (const shot of plan.shots ?? []) put(shot.shotId, shot.candidate);
  return entries;
}

/**
 * 「这个 Run 还有没有没结清的负债」——重开一次付费请求之前唯一要回答的问题。
 *
 * 三个子句分别管三件事，原来挤在一个表达式里，覆盖面互相重叠（`cancelled_remote` 在第三句里被放行，
 * 又会被第一句在 reserved > 0 时拦住），读代码判断不出「哪些状态允许重开」：
 *
 *  ① **预留还挂着，而且有作业还没落定**。一次 ready/adopted 的产出证明执行结束了，**不证明账结清了**，
 *     它的预留要继续当累计负债；但只要还有作业没落定，这笔预留就既不能释放也不能重算。
 *  ② **账本自己记着未结清**（供应商已经收了钱、我们还没对上）。
 *  ③ **还有作业停在既不成功也不是「供应商已明确失败」的状态**。`cancelled_remote` 和
 *     `needs_attention + provider_task_failed` 是两种**已经有结论**的收尾，它们不挡重开。
 */
export function hasUnsettledLiability(run: ProductionRun): boolean {
  const unresolvedReservation = run.budget.reserved > 0 && run.jobs.some(job => !["ready", "adopted"].includes(job.status));
  return unresolvedReservation || run.budget.unsettled > 0 || run.jobs.some((job) =>
    !["ready", "adopted", "cancelled_remote"].includes(job.status)
    && !(job.status === "needs_attention" && job.errorCode === "provider_task_failed"));
}

/**
 * 撤掉还在等人决定的那几份授权（一次点击失败留下的、或上一版整份封印留下的），并让只被它们封过的镜回到
 * 可编辑的草稿样子。已经批过的授权与它们的镜一个不动。没有在等的门 = 原样返回。
 */
export function revokeWaitingAndUnseal(current: ProductionRun, now: string, what: string, onlyShotId?: string): ProductionRun {
  const plan = current.generationPlan;
  const waiting = waitingAuthorizationGates(current)
    .filter((gate) => onlyShotId === undefined || gate.authorizationEnvelope.jobs.some((job) => job.shotId === onlyShotId));
  if (!plan || waiting.length === 0) return current;
  const waitingShots = new Set(waiting.flatMap((gate) => gate.authorizationEnvelope.jobs.map((job) => job.shotId)));
  const revoked = revokeWaitingGenerationAuthorization(current, plan, now, what, onlyShotId);
  const next: ProductionRun = { ...current, ...revoked };
  const approvedShots = new Set(spendAuthorizationGates(next).filter((gate) => gate.status === "approved")
    .flatMap((gate) => gate.authorizationEnvelope.jobs.map((job) => job.shotId)));
  // 一份批过的授权、一道在等的门都不剩 = 计划回到草稿：顶层合同、计价那几格一起清（`unsealedGenerationPlanFields` 是清零的唯一一处）。
  if (approvedShots.size === 0 && waitingAuthorizationGates(next).length === 0) {
    return { ...next, generationPlan: unsealedGenerationPlanFields(plan, now), updatedAt: now };
  }
  const unseal = (shotId: string) => waitingShots.has(shotId) && !approvedShots.has(shotId);
  const generationPlan: ProductionGenerationPlan = {
    ...plan,
    // 「sealed」只表示「第一份授权正在等人决定」；撤掉之后还有批过的，就是在跑（还有别的门在等就仍是 sealed）。
    ...(plan.state === "sealed" && approvedShots.size > 0 ? { state: "submitted" as const } : {}),
    ...(plan.shots
      ? { shots: plan.shots.map((shot) => unseal(shot.shotId)
          ? { ...shot, contract: undefined, candidate: { ...shot.candidate, sealedContractHash: undefined },
              approvedReceiptId: undefined, approvedAt: undefined, approvedAttempt: undefined, updatedAt: now }
          : shot) }
      : {}),
    updatedAt: now,
  };
  return { ...next, generationPlan, updatedAt: now };
}

/**
 * 付费卡上改参数（`generation.revise`，2026-09-11）：只改**还没决定**的镜（逐镜决定以后，计划里可能已经有镜在生成）。
 *
 * 为什么不能沿用框架的「改了直接跑」：pi 不改写转录里那条 assistant toolCall，面板收据上写的和实际执行的会分叉——
 * 而用户是照着收据点的头。钱这条轴上「收据 = 实际执行」是领域约束，不是偏好。所以：
 *   · 改的是一镜已经批过的镜（在生成 / 生成过）→ 拒：那是已经发生的事；
 *   · 有一份等人决定的授权盖着这一镜（一次点击没点完）→ 先撤它、只解封它盖着的镜，再改；
 *   · 其余直接改候选（不碰画布，2026-09-11）。
 */
export function applyGenerationRevise(current: ProductionRun, command: RunCommand, now: string): ProductionCommandEffect {
  const currentPlan = current.generationPlan;
  if (!currentPlan) throw new Error("Generation plan not found");
  if (currentPlan.state === "cancelled") throw new Error("A cancelled generation plan cannot be revised");
  const rawShotId = typeof command.payload.shotId === "string" ? command.payload.shotId.trim() : "";
  const target = rawShotId || (currentPlan.shots?.length ? "" : currentPlan.candidate.candidateId);
  if (!target && currentPlan.state !== "draft") throw new Error("A multi-shot revision must name its shot");
  if (target && approvedAuthorizationGatesForShot(current, target).length > 0) {
    throw new Error(`Shot ${target} is already generating or generated; it cannot be revised`);
  }
  const revoked = revokeWaitingAndUnseal(current, now, "Revise", target || undefined);
  const plan = unsealUnapprovedShot(revoked.generationPlan!, target, now);
  const patched = applyGenerationCandidatePatch(plan, command, now);
  return {
    run: {
      ...revoked,
      // 卡上换模型是**真人**按的，不该撞上那道防 agent 的白名单（#748 已知缺口）。放行的只是判据里的身份，不是那笔钱。
      policy: policyAdmittingUserRevisedIdentity(current.policy, currentPlan, patched),
      generationPlan: patched,
      updatedAt: now,
    },
    eventType: "generation.plan.updated",
    message: currentPlan.operationId,
  };
}

/**
 * 改的这一镜还带着一份**没被批准**的封印（那道门被拒了 / 撤了，`included` 那份合同还挂着）：先把它解封，再改。
 * 不解封就会出现「候选改了、封的还是旧合同」——派发核的是合同，用户看的是候选。没有点名镜的草稿改顶层候选，同理。
 */
function unsealUnapprovedShot(plan: ProductionGenerationPlan, shotId: string, now: string): ProductionGenerationPlan {
  if (!shotId) return plan;
  if (!plan.shots?.length) {
    return plan.contract && plan.state !== "submitted" ? unsealedGenerationPlanFields(plan, now) : plan;
  }
  return {
    ...plan,
    shots: plan.shots.map((shot) => shot.shotId === shotId && shot.contract
      ? { ...shot, contract: undefined, candidate: { ...shot.candidate, sealedContractHash: undefined }, updatedAt: now }
      : shot),
  };
}

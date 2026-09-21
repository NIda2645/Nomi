import { withSpendReferencePreviews, resolveSpendReferenceInputs, projectSpendReferenceAssets, type SpendReferenceAssets } from './pendingSpendReferences';
import { generationPlanInputSchema } from '../shared/agentCapabilities/generationPlanSchemas';
import { sameProjectAgentBinding } from '../shared/projectBinding';
import { resolveGenerationShotScope } from "../shared/agentCapabilities/generationShotScope";
// Agent 面板付费确认卡的**编排**（P1 · 2026-09-11）。
//
// ── 它在解决哪个真实摩擦 ──
//
// Agent 在面板里建好一份生成草稿之后，「要不要花这笔钱」这个问题此前在面板上一个字都没有：
// 模型面看不见付费能力（`paidBoundary.ts`：`effect:"paid"` 不投影到内部 profile，所以模型
// 自己发不起一次付费调用），而宿主这一侧也从没长出一个入口。用户只能自己去画布上一个个点。
//
// 这个模块就是那个入口，而且**它就是那道闸本身**：卡上那一下点击是一次真人手势，
// 主进程据此签一张收据，收据再去开 Run 自己的付费门。三件事的顺序不能换：
//
//   requestGenerationGate（封印 + 开门，钱的额度在这里被冻住）
//     → 主进程手势证明 + 铸收据（这一步才把「真人点过了」变成可验证的事实）
//     → authorizeGeneration（用收据决门）→ 一次性消费收据 → start
//
// ── 为什么不是「渲染层自己发 gate.decide」──
//
// 那条路今天存在（`productionRunIpc` 的 `humanGesture` 章），但它只证「来自受信窗口」。
// 付费卡是**钱**的闸，值得走完整的挑战-收据链：收据里冻着 gateId / digest / 报价，
// 任何一处对不上就批不动。这样「收据 = 实际执行」是被机器验的，不是被注释保证的。
//
// ── 「改参数」为什么必须撤授权 ──
//
// 见 `productionRunReducer.ts` 的 `generation.revise`：改了载荷还沿用旧授权，
// 面板收据上写的和真正跑的就分叉了，而用户是照着收据点的头。
import { logWarn } from "../logging/logger";
import type { ApprovalReceiptAuthority } from "./approvalReceipt";
import type { DispatchContext } from "./dispatcher";
import type { GenerationOperationStore, GenerationReviseInput } from "./mcpGenerationTools";
import type { ProjectBinding } from "../shared/projectBinding";
import type { ProjectLeaseV2 } from "./projectLease";
import type { ModelPricing } from "../productionRun/shotPricing";
import type { ProductionActionResult, ProductionRun } from "../productionRun/productionRunTypes";
import { listPendingSpendConfirms, projectPendingSpendConfirm } from "../productionRun/productionPendingSpend";
import { decideGenerationSpend } from "./generationSpendDecision";
import { spendAnsweredByPolicy } from "./policySpendDecision";
import type { PendingSpendConfirm, PendingSpendRead } from "../shared/contracts/pendingSpendConfirm";
import { readResidentSurfaceLifecycle } from "./residentSurfaceLifecycle";
import { settleSpendWaiter } from "./spendDecisionWaiters";

type RunReader = Readonly<{
  read(projectId: string, runId: string): ProductionRun | null;
  list(projectId: string): readonly { runId: string }[];
}>;

export type RendererGestureTarget = Readonly<{ webContentsId: number; frameId: number; origin: string }>;

export type PendingSpendActionDeps = Readonly<{
  referenceAssets?: SpendReferenceAssets;
  isProjectOpen: (projectId: string) => boolean;
  runs: RunReader;
  operations: GenerationOperationStore;
  planning: NonNullable<DispatchContext["generationPlanning"]>;
  requestGenerationGate: NonNullable<DispatchContext["requestGenerationGate"]>;
  authorizeGeneration: NonNullable<DispatchContext["authorizeGeneration"]>;
  receipts: ApprovalReceiptAuthority;
  /** 当前提交面（渲染窗口）的身份。缺席 = 没有窗口可以代表真人，付费一律 fail-closed。 */
  rendererTarget: () => RendererGestureTarget | null;
  /** 当前被提交的项目绑定（`canvasReadSurfaceRuntime.getCommittedProjectSelection`）。 */
  committedBinding: () => ProjectBinding | null;
  leaseFor: (binding: ProjectBinding) => Promise<ProjectLeaseV2>;
  resolvePricing: (providerId: string, modelId: string) => ModelPricing | undefined;
  now?: () => string;
}>;

/**
 * 失败那一句要说的是**事实**，不是一句放之四海的安慰话。
 *
 * 「暂时无法确认这一步的结果」在「根本没发起」的情况下是误导——它暗示可能已经提交、可能已经
 * 扣了钱，于是用户不敢再按，转而去找一个并不存在的任务。所以这一层按账本分两种话：
 * 只要**没有任何一份提交意图落过盘**（`submit_intent_persisted` 是那条线），就是
 * `generation_not_started`（没发起、没花钱，改一下再按）；一旦落过，才是
 * `generation_execution_failed`（结果未知，先去核对，别再付一次）。
 *
 * `started` 由调用方从 Run 的作业状态里读出来——是可验证的事实，不是猜。
 */
/**
 * Nomi 自己的语义码前缀。只有这些才允许出现在 `reason` 里——供应商与凭据文本照旧只进日志
 * （收敛本身没有放松：`message` 这一格仍然只有那两个账本事实）。
 */
const NOMI_FAILURE_CODE = /^[a-z][a-z0-9_]{2,63}$/;
const NOMI_FAILURE_PREFIXES = ['generation_', 'run_', 'storyboard_', 'capability_', 'project_'];

/** 这次失败的**语义码**（哪一步不成），与账本事实分开。认不出来的一律不带出去。 */
export function spendFailureReason(error: unknown): string | undefined {
  const raw = error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : error instanceof Error ? error.message : undefined;
  if (!raw || !NOMI_FAILURE_CODE.test(raw)) return undefined;
  return NOMI_FAILURE_PREFIXES.some((prefix) => raw.startsWith(prefix)) ? raw : undefined;
}

function failed(error: unknown, started = true): ProductionActionResult {
  // Provider text is private diagnostics, never renderer or model copy.
  const safe = error instanceof Error && ['generation_quote_changed', 'run_not_open', 'generation_scope_invalid'].includes(error.message)
    ? error.message
    : started ? 'generation_execution_failed' : 'generation_not_started';
  const reason = spendFailureReason(error);
  // 「私有诊断」此前**谁都拿不到**：原话在这一行被换成兜底码就消失了，主进程日志里一个字都没有。
  // 于是付费卡按下去失败时，能排查的人手上只有一句兜底话（2026-09-21 Pass 3b：一条真机走查红在
  // 这里，查不出为什么，只能靠猜）。原话进日志，不进用户面。
  if (safe === 'generation_execution_failed' || safe === 'generation_not_started') {
    logWarn("capability", "spend-confirm-failed", { code: safe }, error);
  }
  return { ok: false, code: "failed", message: safe, ...(reason && reason !== safe ? { reason } : {}) };
}

/** 这条线之前，一个字节都没有离开过这台机器（`submissionOutbox` 先落 intent 再出站）。 */
const STATUSES_BEFORE_ANY_SUBMISSION = new Set(["planned", "authorization_required", "authorized"]);

/**
 * 装配这一层要的那几件，从能力核已经建好的实例里取。
 *
 * 为什么它住在这里而不是 `appIntegration` 的那段 try：`appIntegration` 是启动编排的家，
 * 每加一条能力就往那段里塞十几行，它就会长成一个谁都不敢碰的巨壳（R9/R12 的 800 行门岗
 * 2026-09-11 就是被这一段顶破的）。**「这条能力要什么」属于这条能力自己**。
 */
/**
 * 进程内那一份编排。能力核没起来（或已经停了）时它是 `null`——三个**写**动作一律 fail-closed：
 * 回 `unavailable`。绝不「先跑起来再说」，那是钱这条轴上最不该有的默认。
 */
let actions: ReturnType<typeof createPendingSpendActions> | null = null;

export function installPendingSpendActions(deps: PendingSpendActionDeps | null): void {
  actions = deps ? createPendingSpendActions(deps) : null;
}

export class PendingSpendSurfaceUnavailableError extends Error {
  readonly code = "spend_confirm_surface_unavailable" as const;

  constructor(reason: string | null) {
    super(reason
      ? `Pending spend confirmations cannot be read: the capability core failed to install (${reason})`
      : "Pending spend confirmations cannot be read: the capability core is not installed");
    this.name = "PendingSpendSurfaceUnavailableError";
  }
}

/**
 * Agent 面板付费确认卡（2026-09-11 P1）。四个动作走同一个编排：读、改参数、丢弃、确认并开跑。
 *
 * 读通道的答案跟着常驻生成面的**相**走（2026-09-14，owner 在 `residentSurfaceLifecycle.ts`）：
 *   · off（按配置关掉 / 还在起 / 已停）→ `{ surface: "off" }`。不是失败，也不是「没有」；
 *   · install-failed → **抛**，原话在错误里，一路传到用户眼前那张会说话的卡上；
 *   · ready → 那几行（空数组才是真的没有）。
 * 2026-09-12 的版本只认一个 `null`，把「按配置没装」也抛成了失败——Canvas Performance 的
 * harness 正是这么起 Nomi 的，于是每条画布 PR 的性能门都红在这一句上。
 */
export function listPendingSpendConfirmations(projectId: string): PendingSpendRead {
  const lifecycle = readResidentSurfaceLifecycle();
  switch (lifecycle.phase) {
    case "disabled":
      return { surface: "off", phase: "disabled", reason: lifecycle.reason };
    case "starting":
    case "stopped":
      return { surface: "off", phase: lifecycle.phase };
    case "install-failed":
      throw new PendingSpendSurfaceUnavailableError(lifecycle.reason);
    case "ready":
      // 相说 ready 而 actions 不在 = `appIntegration` 的装配顺序被改坏了。抛，别静默回空。
      if (!actions) throw new PendingSpendSurfaceUnavailableError("resident surface is ready but the spend-confirm actions were never installed");
      return { surface: "ready", rows: actions.listPendingSpend(projectId) };
  }
}

export async function revisePendingSpendConfirmation(input: { projectId: string; operationId: string; quoteId: string; shotId?: string; patch: Record<string, unknown> }): Promise<ProductionActionResult> {
  if (!actions) return { ok: false, code: "unavailable" };
  return actions.revisePendingSpend(input);
}

export async function discardPendingSpendConfirmation(input: { projectId: string; operationId: string; quoteId: string }): Promise<ProductionActionResult> {
  if (!actions) return { ok: false, code: "unavailable" };
  return actions.discardPendingSpend(input);
}

export async function confirmPendingSpendConfirmation(input: { projectId: string; operationId: string; quoteId: string; shotIds?: readonly string[] }): Promise<ProductionActionResult> {
  if (!actions) return { ok: false, code: "unavailable" };
  return actions.confirmPendingSpend(input);
}

export function pendingSpendDependencies(input: Readonly<{
  isProjectOpen: (projectId: string) => boolean;
  repository: Readonly<{
    read(projectId: string, runId: string): ProductionRun | null;
    list?(projectId: string): readonly { runId: string }[];
  }>;
  operations: GenerationOperationStore;
  planning: NonNullable<DispatchContext["generationPlanning"]>;
  requestGenerationGate: NonNullable<DispatchContext["requestGenerationGate"]>;
  authorizeGeneration: NonNullable<DispatchContext["authorizeGeneration"]>;
  receipts: ApprovalReceiptAuthority;
  rendererTarget: () => RendererGestureTarget | null;
  committedSelection: () => (ProjectBinding & { canonicalRootDigest?: string }) | null;
  leaseFor: (binding: ProjectBinding) => Promise<ProjectLeaseV2>;
  resolvePricing: (providerId: string, modelId: string) => ModelPricing | undefined;
}>): PendingSpendActionDeps {
  return {
    isProjectOpen: input.isProjectOpen,
    runs: {
      read: (projectId, runId) => input.repository.read(projectId, runId),
      list: (projectId) => (typeof input.repository.list === "function" ? input.repository.list(projectId) : []),
    },
    operations: input.operations,
    planning: input.planning,
    requestGenerationGate: input.requestGenerationGate,
    authorizeGeneration: input.authorizeGeneration,
    receipts: input.receipts,
    rendererTarget: input.rendererTarget,
    // 只取绑定那三件，`canonicalRootDigest` 不进来：这一层要回答的是「哪个项目」，
    // 不是「它的根目录长什么样」。
    committedBinding: () => {
      const selection = input.committedSelection();
      return selection
        ? { projectId: selection.projectId, immutableProjectUuid: selection.immutableProjectUuid, projectGeneration: selection.projectGeneration }
        : null;
    },
    leaseFor: input.leaseFor,
    resolvePricing: input.resolvePricing,
  };
}

export function createPendingSpendActions(deps: PendingSpendActionDeps) {
  const referenceAssets = deps.referenceAssets ?? projectSpendReferenceAssets;
  const now = deps.now ?? (() => new Date().toISOString());

  const readRuns = (projectId: string): ProductionRun[] => {
    const summaries = deps.runs.list(projectId);
    const runs: ProductionRun[] = [];
    for (const summary of summaries) {
      const run = deps.runs.read(projectId, summary.runId);
      if (run) runs.push(run);
    }
    return runs;
  };

  /**
   * 面板要显示的那些。空数组 = 面板上一张付费卡都不该出现。
   *
   * `spendAnsweredByPolicy` 是「这一笔此刻正由『全自动』档代答」那份事实（`policySpendDecision.ts`）。
   * 它**只减不增**：任何一笔它说 `false` 的，行为与此前逐字相同。
   */
  const listPendingSpend = (projectId: string): readonly PendingSpendConfirm[] => {
    if (!deps.isProjectOpen(projectId)) return Object.freeze([]);
    return listPendingSpendConfirms(readRuns(projectId), deps.resolvePricing, spendAnsweredByPolicy)
      .map(pending => withSpendReferencePreviews(pending, referenceAssets));
  };

  /**
   * 三个写动作共用的读。用同一个谓词是硬要求：一笔正由档位代答的生成，面板上没有卡，
   * 用户也就没有点过什么——此刻再让「改参数 / 丢弃 / 确认」落到它身上，就是在一笔已经
   * 在飞的授权旁边开第二个决定者。
   */
  const pendingFor = (projectId: string, operationId: string): PendingSpendConfirm | undefined => {
    const run = deps.runs.read(projectId, operationId);
    return run ? projectPendingSpendConfirm(run, deps.resolvePricing, spendAnsweredByPolicy) : undefined;
  };

  const leased = async (projectId: string): Promise<ProjectLeaseV2> => {
    const binding = deps.committedBinding();
    if (!binding || binding.projectId !== projectId) throw new Error("run_not_open");
    return deps.leaseFor(binding);
  };

  /**
   * 卡上改了提示词/参数/模型。撤掉还没被点头的授权、把改动落到候选、回 draft 等重新封印。
   * 价格由下一次投影现算——数只有一个产地。
   */
  /**
   * 这一笔到底有没有离开过这台机器。判据是账本里的作业状态，不是异常的长相：
   * `submissionOutbox` 先把提交意图落盘、再出站，所以只要还有作业停在 intent 之前，
   * 就是「没发起」。一个作业都读不到 = 连 Run 都没有 = 更没发起。
   */
  const anySubmissionStarted = (projectId: string, operationId: string): boolean =>
    (deps.runs.read(projectId, operationId)?.jobs ?? [])
      .some((job) => !STATUSES_BEFORE_ANY_SUBMISSION.has(job.status));

  const revisePendingSpend = async (input: Readonly<{
    projectId: string;
    operationId: string;
    quoteId: string;
    shotId?: string;
    patch: Readonly<Record<string, unknown>>;
  }>): Promise<ProductionActionResult> => {
    if (!deps.isProjectOpen(input.projectId)) return { ok: false, code: "run_not_open" };
    if (!deps.operations.revise) return { ok: false, code: "unavailable" };
    const pending = pendingFor(input.projectId, input.operationId);
    if (!pending) return { ok: false, code: "failed", message: "no pending generation to revise" };
    if (!input.quoteId || input.quoteId !== pending.quoteId) return failed(new Error("generation_quote_changed"));
    const capturedRun = deps.runs.read(input.projectId, input.operationId);
    const plan = capturedRun?.generationPlan;
    const shotId = input.shotId ?? (!plan?.shots?.length ? plan?.candidate.candidateId : undefined);
    if (!shotId || !pending.shots.some(shot => shot.shotId === shotId)) {
      return { ok: false, code: "failed", message: "generation_shot_not_found" };
    }
    // The displayed scope can contain one row of a many-shot plan. Only the
    // persisted structure determines whether this address is a shot or candidate.
    const revision: GenerationReviseInput = {
      ...(plan?.shots?.length ? { shotId } : {}),
      patch: input.patch,
      expectedRevision: capturedRun?.revision,
    };
    try {
      const binding = deps.committedBinding();
      if (!binding || binding.projectId !== input.projectId) throw new Error('run_not_open');
      const assertCurrent = (): void => {
        const currentBinding = deps.committedBinding();
        if (!deps.isProjectOpen(input.projectId) || !currentBinding || !sameProjectAgentBinding(binding, currentBinding)
          || pendingFor(input.projectId, input.operationId)?.quoteId !== pending.quoteId) throw new Error('generation_quote_changed');
      };
      const { referenceInputs, ...remainingPatch } = input.patch;
      const patch: Record<string, unknown> = { ...remainingPatch };
      if (referenceInputs !== undefined && patch.references !== undefined) throw new Error('generation_reference_invalid');
      if (referenceInputs !== undefined || patch.references !== undefined) {
        const shot = pending.shots.find(shot => shot.shotId === shotId);
        if (!shot) throw new Error('generation_reference_scope_required');
        patch.references = await resolveSpendReferenceInputs({ projectId: input.projectId, binding,
          values: referenceInputs ?? (Array.isArray(patch.references) ? patch.references.map(reference => ({ reference })) : patch.references), existing: shot.references ?? [], assets: referenceAssets, assertCurrent });
      }
      assertCurrent();
      generationPlanInputSchema.parse({ operation: 'patch', operationId: input.operationId, patch,
        ...(input.shotId ? { shotId: input.shotId } : {}) });
      const revised = await deps.operations.revise(input.projectId, input.operationId, { ...revision, patch }, now());
      const successor = pendingFor(input.projectId, input.operationId);
      if (!successor || successor.planVersion !== revised.planVersion || successor.candidateRevision !== revised.candidate.revision) throw new Error('generation_quote_changed');
      return { ok: true, code: "revised", quoteId: successor.quoteId };
    } catch (error) {
      // 改参数这一步**只动候选**，永远不提交：这里失败一定是「没发起」。
      return failed(error, false);
    }
  };

  /**
   * × = **撤回这一次请求**，真终态（2026-09-22 裁决 D）。
   *
   * 此前这里调的是 `operations.dismiss`：只置 `cardHidden`、计划仍是 `draft`。那不是终态，
   * 落地投影照旧认它——× 删掉的占位节点会被重建，用户看到的是「点了 ×，画布上多出一个节点」
   * （`agent-spend-card.walk.mjs` 自合并 ③ 起红的就是这条）。现在走 `cancel("declined")`：
   * 投影不出卡、落地不建占位、同一个 operationId 不再被 present 复活。
   * **IPC 名（`discardSpend`）不变**，所以渲染层那一侧一行不用动。
   */
  const discardPendingSpend = async (input: Readonly<{ projectId: string; operationId: string; quoteId: string }>): Promise<ProductionActionResult> => {
    if (!deps.isProjectOpen(input.projectId)) return { ok: false, code: "run_not_open" };
    const pending = pendingFor(input.projectId, input.operationId);
    if (!pending) return { ok: false, code: "failed", message: "no pending generation to discard" };
    if (!input.quoteId || input.quoteId !== pending.quoteId) return failed(new Error("generation_quote_changed"));
    try {
      await deps.operations.cancel(input.projectId, input.operationId, now(), "declined");
      // 有回合在等这一笔（lane 的 `generate` 挂在审批闸上）→ 把「他说不」递过去；没人等 = no-op。
      settleSpendWaiter(input.projectId, input.operationId, { kind: "declined" });
      return { ok: true, code: "discarded" };
    } catch (error) {
      return failed(error, false);
    }
  };

  /**
   * 「生成 ¥X」。**这一下点击就是那次真人手势**，收据在这里签出来。
   *
   * 顺序里没有一步可以省：`requestGenerationGate` 先封印并冻住额度（此刻价格才成为合同的一部分），
   * 收据把手势绑到那个 gateId + digest 上，`authorizeGeneration` 只认对得上的收据，
   * 消费一次之后同一张收据再也批不动第二次。
   */
  const confirmPendingSpend = async (input: Readonly<{ projectId: string; operationId: string; quoteId: string; shotIds?: readonly string[] }>): Promise<ProductionActionResult> => {
    if (!deps.isProjectOpen(input.projectId)) return { ok: false, code: "run_not_open" };
    const binding = deps.committedBinding();
    if (!binding || binding.projectId !== input.projectId) return { ok: false, code: 'run_not_open' };
    const assertBindingCurrent = (): void => {
      const current = deps.committedBinding();
      if (!deps.isProjectOpen(input.projectId) || !current || !sameProjectAgentBinding(binding, current)) throw new Error('run_not_open');
    };
    let pending = pendingFor(input.projectId, input.operationId);
    if (!pending) return { ok: false, code: "failed", message: "no pending generation to confirm" };
    if (!input.quoteId || input.quoteId !== pending.quoteId) return failed(new Error("generation_quote_changed"));
    try {
      const selected = resolveGenerationShotScope(pending.shots.map((shot) => shot.shotId), input.shotIds);
      if (selected.length !== pending.shots.length) {
        const displayed = pending;
        const selectedShots = displayed.shots.filter(shot => selected.includes(shot.shotId));
        await deps.operations.present(input.projectId, input.operationId, now(), selected);
        pending = pendingFor(input.projectId, input.operationId);
        const content = (shots: PendingSpendConfirm['shots']) => JSON.stringify(shots.map(({ nodeId: _nodeId, index: _index, ...shot }) => shot));
        if (!pending || pending.planVersion !== displayed.planVersion + 1
          || pending.currency !== displayed.currency || content(pending.shots) !== content(selectedShots)) {
          throw new Error("generation_quote_changed");
        }
      }
      // 这一段只收窄勾选范围，还没封印，更没提交。
    } catch (error) { return failed(error, false); }
    const acceptedQuote = pending;
    const target = deps.rendererTarget();
    if (!target) return { ok: false, code: "unavailable" };
    try {
      const lease = await leased(input.projectId);
      assertBindingCurrent();
      if (pendingFor(input.projectId, input.operationId)?.quoteId !== acceptedQuote.quoteId) throw new Error("generation_quote_changed");
      // 封印 → 铸收据 → 决门 → 消费 → 开跑：这条链只有一份（`generationSpendDecision.ts`）。
      // 「全自动」档那条免卡放行走的是同一个函数，差别只在那张 attestation 是人点的还是策略代答的。
      await decideGenerationSpend(
        { requestGenerationGate: async (request) => {
          const gate = await deps.requestGenerationGate(request);
          assertBindingCurrent();
          const prepared = gate as { maximumCost?: unknown; currency?: unknown };
          // 现时性校验：门算出来的金额不许**高于**用户刚在卡上看到的那个数。
          //
          // 这里曾经还有一条 `|| acceptedQuote.unknownShotCount > 0`——它把「价格未知」当成拒绝
          // 的理由，而且报成 `generation_quote_changed`（一句假话：报价没变，是从来就没有）。
          // 2026-09-21 用户拍板未知价不许挡生成，这条外层重复拒绝随之删除；未知价的门
          // `maximumCost` 回 null（不是 0），对它做金额比较没有意义，所以只比已知的那一档。
          if (pendingFor(input.projectId, input.operationId)?.quoteId !== acceptedQuote.quoteId
            || prepared.currency !== acceptedQuote.currency
            || (prepared.maximumCost !== null
              && (typeof prepared.maximumCost !== "number" || prepared.maximumCost > acceptedQuote.knownSubtotal))) {
            throw new Error("generation_quote_changed");
          }
          return gate;
        }, authorizeGeneration: async request => {
          assertBindingCurrent();
          return deps.authorizeGeneration(request);
        }, planning: deps.planning, receipts: deps.receipts },
        { operationId: input.operationId, lease, decision: { kind: "human-gesture", target }, actorId: "agent-panel" },
      );
      // **成功之后**才递：链上任何一步失败，卡都还在原处等用户，等的那个回合也就该继续等。
      settleSpendWaiter(input.projectId, input.operationId, { kind: "confirmed" });
      return { ok: true, code: "spend_confirmed" };
    } catch (error) {
      return failed(error, anySubmissionStarted(input.projectId, input.operationId));
    }
  };

  return { listPendingSpend, revisePendingSpend, discardPendingSpend, confirmPendingSpend };
}

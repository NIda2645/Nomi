/**
 * 画布单节点 ↑ 的唯一付费口：「画布生成这一镜」（发动机收敛第一刀 第 1–2 步）。
 *
 * 批准、派发、记账只走制作流程那一个口子：每点一次 ↑ 建一个单镜 Run（F1）→ 这一下点击就是批准（主进程手势收据，
 * 不弹卡，09-25 拍板不变）→ 提交出口（意向日志 → 交 → 受理 / 结果未知 / 明确拒绝）→ 画布那台的传输
 * （`canvasTransportProvider`）。等结果仍由渲染层的等待循环驱动，但每一次「查」都经 Run 的 poll / materialize（F2）；
 * 渲染层不在了（关窗、崩溃、重启、点了停）由主进程观察者接手。
 *
 * 准入（建 Run 之前，什么都没写）：同节点在途（进程内 + 盘上的「没收尾」标记）、3D-BOX 预演闸、绑定制作镜头的认领。
 *
 * 设计卡：docs/plan/2026-10-05-engine-convergence-cut1-step12-design-card.md。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { dedupeSubmission } from "../submissionLedger";
import { logWarn } from "../logging/logger";
import type { ApprovalReceiptAuthority } from "./approvalReceipt";
import { canvasProviderId, canvasSubmitReceipt, canvasLastResult, type CanvasTaskResult } from "./canvasTransportProvider";
import { freezeCanvasExecutionContract, type PlanCandidate } from "./executionContract";
import type { GenerationProvider, GenerationProviderOutput } from "./generationRuntimeAdapter";
import { decideRunOwnedGenerationGate } from "./runOwnedGenerationGateAuthority";
import { localAssetUrl } from "../assets/assetPaths";
import { canvasRunIdFor, markCanvasRunOpen, markCanvasRunSettled, openCanvasRuns } from "../productionRun/canvasShotRunIndex";
import { prepareProductionGenerationAuthorization, type GenerationAuthorizationProjectIdentity } from "../productionRun/prepareProductionGenerationAuthorization";
import type { ProductionGenerationSubmission } from "../productionRun/productionGenerationSubmission";
import type { ProductionRunService } from "../productionRun/productionRunService";
import type { ProductionArtifact, ProductionJob, ProductionRun } from "../productionRun/productionRunTypes";
import { markSingleShotAttention, markSingleShotCompleted, markSingleShotRunning } from "../productionRun/singleShotRunLifecycle";
import type { ShotPrice } from "../shared/contracts/shotPricingRule";
import { productionJobPhase } from "../shared/productionShotPhase";
import { isTerminalTaskStatus } from "../shared/taskStatus";
import type { WorkspaceProjectRecordV2 } from "../workspace/workspaceTypes";

export type CanvasShotGesture = { webContentsId: number; frameId: number; origin: string };

export type CanvasShotRequest = { kind: string; prompt: string; extras?: Record<string, unknown>; [key: string]: unknown };

export type CanvasShotSubmitInput = {
  projectId: string;
  nodeId: string;
  /** 渲染层这一次运行记录号（同一次意图的重试复用它）。 */
  runRecordId: string;
  vendor: string;
  request: CanvasShotRequest;
  gesture: CanvasShotGesture;
  senderId: number;
};

export type CanvasShotDeps = {
  service: Pick<ProductionRunService, "createGenerationDraft" | "command" | "readFull" | "repository">;
  readProject: (projectId: string) => WorkspaceProjectRecordV2 | null;
  resolveProjectRoot: (projectId: string) => string | null;
  receipts: ApprovalReceiptAuthority;
  /** 提交出口认得的全部执行器（目录执行器 + 画布传输）。 */
  providers: () => readonly GenerationProvider[];
  buildSubmission: (input: { projectRoot: string; immutableProjectUuid: string; projectGeneration: number; providers: readonly GenerationProvider[] }) => ProductionGenerationSubmission;
  /** 3D-BOX 预演闸（判据住渲染层 directorPreviewState，这里是唯一问它的地方）。 */
  previewBlock: (projectId: string, nodeId: string) => Promise<"rendering" | "failed" | null>;
  /** 绑定了制作镜头的节点：先经唯一判定口认领（第 3 步随批量进 Run 一起删）。 */
  claimProductionShot: (projectId: string, extras: Record<string, unknown> | undefined) => void;
  quote: (input: { vendorKey: string; modelKey: string; parameters: Record<string, unknown> }) => ShotPrice;
  /** 交给主进程观察者（渲染层不在时）。 */
  observe: (submission: ProductionGenerationSubmission, projectId: string, runId: string) => void;
  now?: () => string;
};

const LEASE_MS = 2 * 60 * 1000;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function coded(message: string, code: string, reason: string): Error {
  return Object.assign(new Error(message), { code, reason });
}

/** 同节点还有一笔没收尾：在路上的说「还在生成」，可能已扣钱、结果不明的说「先去核对」。 */
function blockingReason(run: ProductionRun | null): "in_flight" | "needs_reconcile" | null {
  if (!run) return null;
  for (const job of run.jobs) {
    if (job.status === "submission_unknown" || job.status === "reconciling") return "needs_reconcile";
    if (job.status === "submit_intent_persisted" || productionJobPhase(job.status) === "generating") return "in_flight";
  }
  return null;
}

function latestJob(run: ProductionRun): ProductionJob | undefined {
  return [...run.jobs].sort((left, right) => right.attempt - left.attempt)[0];
}

function readyArtifact(run: ProductionRun, job: ProductionJob): ProductionArtifact | undefined {
  return run.artifacts.find((artifact) => artifact.jobId === job.jobId && ["ready", "adopted"].includes(artifact.status));
}

/** 从 Run 账本复原「出片了」那一份结果（重开项目、观察者已经收完时用；与画布那台落地的是同一个本地文件）。 */
function resultFromArtifact(run: ProductionRun, job: ProductionJob, artifact: ProductionArtifact, kind: string): CanvasTaskResult {
  const assetType = artifact.kind === "video" || artifact.kind === "audio" || artifact.kind === "model3d" ? artifact.kind : "image";
  return {
    id: job.providerTaskId ?? job.jobId,
    kind,
    status: "succeeded",
    assets: [{
      type: assetType,
      url: localAssetUrl(run.projectId, artifact.projectRelativePath ?? ""),
      ...(artifact.width && artifact.height ? { width: artifact.width, height: artifact.height } : {}),
    }],
    raw: {},
  };
}

function failedResult(job: ProductionJob, kind: string): CanvasTaskResult {
  return { id: job.providerTaskId ?? job.jobId, kind, status: "failed", assets: [], raw: {}, error: job.errorMessage || job.errorCode || "generation failed" };
}

/**
 * 画布那台交回来的产物已经由它自己落进项目（`localizeTaskAsset`，nomi-local://）：这里只把那份文件记进 Run，
 * 不再下载一次。不是本地地址的交给通用物化（与目录执行器同一条）。
 */
export function canvasLocalArtifactReceipt(input: { projectId: string; projectRoot: string; providerTaskId: string; output: GenerationProviderOutput }): Pick<ProductionArtifact, "artifactId" | "kind" | "contentHash" | "projectRelativePath"> | null {
  const prefix = `nomi-local://asset/${encodeURIComponent(input.projectId)}/`;
  if (!input.output.url.startsWith(prefix)) return null;
  let relative: string;
  try {
    relative = input.output.url.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
  const root = path.resolve(input.projectRoot);
  const absolute = path.resolve(root, relative);
  if (!relative || !absolute.startsWith(`${root}${path.sep}`) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;
  relative = path.relative(root, absolute).split(path.sep).join("/");
  const contentHash = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
  return { artifactId: `canvas-artifact-${input.providerTaskId}`.slice(0, 160), kind: input.output.kind, contentHash, projectRelativePath: relative };
}

export function createCanvasShotRuns(deps: CanvasShotDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const ledger = new Map();
  const nodesInFlight = new Set<string>();
  /** 渲染层正在驱动的 Run：它在等，主进程就不另起观察；它走了（窗口没了 / 点了停 / 久不来）就交给观察者。 */
  const leases = new Map<string, { projectId: string; senderId: number; touchedAt: number }>();

  const repository = () => deps.service.repository;

  function identity(projectId: string): { lease: GenerationAuthorizationProjectIdentity; record: WorkspaceProjectRecordV2; projectRoot: string } {
    const record = deps.readProject(projectId);
    const projectRoot = deps.resolveProjectRoot(projectId);
    if (!record?.immutableProjectUuid || !record.projectGeneration || !Number.isInteger(record.revision) || !projectRoot) {
      throw coded(`Project is unavailable: ${projectId}`, "project_unavailable", "project_unavailable");
    }
    return {
      lease: { projectId, immutableProjectUuid: record.immutableProjectUuid, projectGeneration: record.projectGeneration, revocationEpoch: 0 },
      record,
      projectRoot,
    };
  }

  function submissionFor(projectId: string): ProductionGenerationSubmission {
    const { lease, projectRoot } = identity(projectId);
    return deps.buildSubmission({ projectRoot, immutableProjectUuid: lease.immutableProjectUuid, projectGeneration: lease.projectGeneration, providers: deps.providers() });
  }

  /** 同一节点：进程内有一笔正在交 → 拒；盘上有没收尾的 Run → 拒（收尾了的标记顺手删掉）。 */
  function assertNodeIdle(projectId: string, projectRoot: string, nodeId: string): void {
    if (nodesInFlight.has(`${projectId}\u0000${nodeId}`)) throw coded(`node_generation_in_flight: ${nodeId}`, "node_generation_in_flight", "in_flight");
    for (const open of openCanvasRuns(projectRoot, nodeId)) {
      const reason = blockingReason(repository().read(projectId, open.runId));
      if (!reason) { markCanvasRunSettled(projectRoot, open.runId); continue; }
      if (reason === "needs_reconcile") throw coded(`production_shot_claimed: ${reason}`, "production_shot_claimed", reason);
      throw coded(`node_generation_in_flight: ${nodeId}`, "node_generation_in_flight", "in_flight");
    }
  }

  /** 收尾：Run 里记成完成（有产物）或需要处理，删「没收尾」标记，放掉租约。 */
  function settle(projectId: string, projectRoot: string, runId: string, job?: ProductionJob, artifactId?: string): void {
    try {
      if (artifactId) markSingleShotCompleted(repository(), projectId, runId, { ...(job ? { jobId: job.jobId } : {}), artifactId });
      else markSingleShotAttention(repository(), projectId, runId, job?.jobId);
    } catch (error) {
      logWarn("production-run", "canvas-shot-settle-failed", { runId }, error);
    }
    const after = repository().read(projectId, runId);
    if (!blockingReason(after)) markCanvasRunSettled(projectRoot, runId);
    leases.delete(runId);
  }

  async function createAndStart(input: CanvasShotSubmitInput, runId: string): Promise<CanvasTaskResult> {
    const { projectId, nodeId, vendor, request } = input;
    const { lease, record, projectRoot } = identity(projectId);
    assertNodeIdle(projectId, projectRoot, nodeId);
    const nodeKey = `${projectId}\u0000${nodeId}`;
    nodesInFlight.add(nodeKey);
    try {
      const block = await deps.previewBlock(projectId, nodeId);
      if (block) throw coded(`director_preview_blocked: ${block}`, "director_preview_blocked", block);
      deps.claimProductionShot(projectId, request.extras);
      const providerId = canvasProviderId(vendor);
      const modelKey = text(request.extras?.modelKey) || text(request.extras?.modelAlias) || "unknown";
      const draftCandidate: PlanCandidate = {
        candidateId: `${runId}-shot`, revision: 1, moduleId: "generation.canvas", providerId, modelId: modelKey,
        mode: request.kind, prompt: request.prompt, parameters: { vendor, request }, references: [],
      };
      const contract = freezeCanvasExecutionContract(draftCandidate);
      const candidate = { ...draftCandidate, sealedContractHash: contract.contractHash };
      markCanvasRunOpen(projectRoot, runId, nodeId);
      leases.set(runId, { projectId, senderId: input.senderId, touchedAt: Date.now() });
      let run = deps.service.createGenerationDraft({
        operationId: runId, projectId, origin: { host: "canvas" }, candidate, cardHidden: true,
        policy: { trustedHosts: ["canvas"], allowedProviders: [providerId], allowedModels: [modelKey], maxSpend: null, maxAttemptsPerJob: 1 },
      });
      const price = deps.quote({ vendorKey: vendor, modelKey, parameters: request.extras ?? {} });
      const authorization = prepareProductionGenerationAuthorization({
        lease, projectRevision: record.revision, run,
        operation: { operationId: runId, projectId, candidate, planVersion: run.planVersion },
        contract, providers: deps.providers(), resolveShotPrice: () => price, now: now(),
      });
      run = (await deps.service.command(projectId, runId, {
        commandId: `generation.seal:${runId}:v${run.planVersion}:${contract.contractHash}`,
        expectedRevision: run.revision, type: "generation.seal", payload: { contract, authorization }, issuedAt: now(),
      })).run;
      // 这一下点击就是批准：主进程按发起这次 IPC 的那个窗口铸手势收据（不弹卡，09-25 拍板），批的就是信封里冻住的这一份。
      const decision = await decideRunOwnedGenerationGate({
        owner: deps.service,
        receipts: deps.receipts,
        lease,
        operationId: runId,
        authorization,
        commandPrefix: "canvas-shot",
        display: { model: modelKey },
        confirm: async ({ challengeToken }) => {
          const attestation = deps.receipts.createMainProcessGestureAttestation(challengeToken, { ...input.gesture, decision: "accept" });
          return { confirmed: true, receiptToken: deps.receipts.mintReceipt(challengeToken, attestation).token };
        },
      });
      if (!decision.approved) throw new Error("Canvas generation approval was not recorded");
      const submission = submissionFor(projectId);
      let started;
      try {
        started = await submission.start({ projectId, operationId: runId });
      } catch (error) {
        const after = repository().read(projectId, runId);
        const job = after ? latestJob(after) : undefined;
        // 明确拒绝 / 确定没发出去：已在 Run 里记成确定的失败，这一镜收尾；结果未知：标记留着，这个节点在核对前不许再点。
        if (after && !blockingReason(after)) settle(projectId, projectRoot, runId, job);
        throw error;
      }
      markSingleShotRunning(repository(), projectId, runId);
      const receipt = canvasSubmitReceipt(started.providerTaskId)
        ?? { id: started.providerTaskId, kind: request.kind, status: "queued", assets: [], raw: {} };
      // 交的那一刻就有结论（同步出图 / 缓存命中）：渲染层不会再来查，这里当场收进 Run。
      if (isTerminalTaskStatus(receipt.status)) return await pollRun(projectId, runId, request.kind);
      return receipt;
    } catch (error) {
      leases.delete(runId);
      throw error;
    } finally {
      nodesInFlight.delete(nodeKey);
    }
  }

  /** 已经有这个 Run（同一次意图的重试）：照 Run 账本回话，绝不再交一次。 */
  function replay(run: ProductionRun, kind: string): CanvasTaskResult | Promise<CanvasTaskResult> {
    const job = latestJob(run);
    if (!job) throw coded(`node_generation_in_flight: ${run.runId}`, "node_generation_in_flight", "in_flight");
    if (job.status === "submission_unknown" || job.status === "reconciling") throw coded("production_shot_claimed: needs_reconcile", "production_shot_claimed", "needs_reconcile");
    const artifact = readyArtifact(run, job);
    if (artifact) return resultFromArtifact(run, job, artifact, kind);
    if (job.status === "needs_attention") return failedResult(job, kind);
    if (job.providerTaskId) return { id: job.providerTaskId, kind, status: "queued", assets: [], raw: {} };
    throw coded(`node_generation_in_flight: ${run.runId}`, "node_generation_in_flight", "in_flight");
  }

  async function pollRun(projectId: string, runId: string, kindHint?: string): Promise<CanvasTaskResult> {
    const { projectRoot } = identity(projectId);
    let run = repository().read(projectId, runId);
    if (!run) throw new Error(`Canvas generation run not found: ${runId}`);
    const contractRequest = (run.generationPlan?.contract?.parameters as { request?: CanvasShotRequest } | undefined)?.request;
    const kind = kindHint ?? contractRequest?.kind ?? "text_to_image";
    let job = latestJob(run);
    if (!job) throw new Error(`Canvas generation run has no job: ${runId}`);
    const existing = readyArtifact(run, job);
    if (existing) { settle(projectId, projectRoot, runId, job, existing.artifactId); return resultFromArtifact(run, job, existing, kind); }
    if (job.status === "needs_attention") { settle(projectId, projectRoot, runId, job); return failedResult(job, kind); }
    const submission = submissionFor(projectId);
    const polled = await submission.poll({ projectId, operationId: runId });
    const last = job.providerTaskId ? canvasLastResult(job.providerTaskId) : undefined;
    if (polled.nextAction === "poll") return last ?? { id: polled.providerTaskId, kind, status: "running", assets: [], raw: {} };
    if (polled.nextAction === "attention") {
      run = repository().read(projectId, runId) ?? run;
      job = latestJob(run) ?? job;
      settle(projectId, projectRoot, runId, job);
      return last && last.status === "failed" ? last : failedResult(job, kind);
    }
    try {
      const materialized = await submission.materialize({ projectId, operationId: runId });
      settle(projectId, projectRoot, runId, job, materialized.artifactId);
    } catch (error) {
      // 取回失败已在 Run 里停成「需要处理」（可免费重新取回）；把画布那台已经拿到的结果照常交给节点。
      logWarn("production-run", "canvas-shot-materialize-failed", { runId }, error);
      const after = repository().read(projectId, runId);
      if (after && !blockingReason(after)) settle(projectId, projectRoot, runId, latestJob(after));
    }
    run = repository().read(projectId, runId) ?? run;
    job = latestJob(run) ?? job;
    const artifact = readyArtifact(run, job);
    return last ?? (artifact ? resultFromArtifact(run, job, artifact, kind) : failedResult(job, kind));
  }

  return {
    /** 渲染层「交」：同一次意图（同一个运行记录号）在 5 分钟内重放同一个结果，绝不交第二次。 */
    submit(input: CanvasShotSubmitInput): Promise<CanvasTaskResult> {
      const runId = canvasRunIdFor(input.runRecordId);
      return dedupeSubmission(ledger, `${input.projectId}\u0000${runId}`, async () => {
        const existing = repository().read(input.projectId, runId);
        if (existing) return replay(existing, input.request.kind);
        return createAndStart(input, runId);
      });
    },
    /** 渲染层「查」：每一次都经 Run（poll → 出片就 materialize）；没有这个 Run 回 null（旧项目的旧运行记录，照旧路查）。 */
    async poll(input: { projectId: string; runRecordId: string; senderId: number }): Promise<CanvasTaskResult | null> {
      const runId = canvasRunIdFor(input.runRecordId);
      if (!repository().read(input.projectId, runId)) return null;
      leases.set(runId, { projectId: input.projectId, senderId: input.senderId, touchedAt: Date.now() });
      return pollRun(input.projectId, runId);
    },
    /** 渲染层不再等这一笔（点了停）：还在路上的交给观察者收完，钱花了的结果照样进项目。 */
    release(input: { projectId: string; runRecordId: string }): void {
      const runId = canvasRunIdFor(input.runRecordId);
      leases.delete(runId);
      handOff(input.projectId, runId);
    },
    /** 发起的窗口没了：它在等的每一笔都交给观察者。 */
    releaseSender(senderId: number): void {
      for (const [runId, lease] of [...leases.entries()]) {
        if (lease.senderId !== senderId) continue;
        leases.delete(runId);
        handOff(lease.projectId, runId);
      }
    },
    /** 打开项目：只看还挂着「没收尾」标记的画布 Run；没人在等的交给观察者，收尾了的删标记。 */
    recoverOrphans(projectId: string): void {
      const projectRoot = deps.resolveProjectRoot(projectId);
      if (!projectRoot) return;
      for (const open of openCanvasRuns(projectRoot)) {
        const lease = leases.get(open.runId);
        if (lease && Date.now() - lease.touchedAt < LEASE_MS) continue;
        handOff(projectId, open.runId);
      }
    },
  };

  function handOff(projectId: string, runId: string): void {
    try {
      const projectRoot = deps.resolveProjectRoot(projectId);
      const run = repository().read(projectId, runId);
      if (!projectRoot) return;
      if (!run || !blockingReason(run)) { markCanvasRunSettled(projectRoot, runId); return; }
      const job = latestJob(run);
      if (!job?.providerTaskId || productionJobPhase(job.status) !== "generating") return;
      deps.observe(submissionFor(projectId), projectId, runId);
    } catch (error) {
      logWarn("production-run", "canvas-shot-handoff-failed", { runId }, error);
    }
  }
}

export type CanvasShotRuns = ReturnType<typeof createCanvasShotRuns>;

// ── 能力核装配（appIntegration 只调这几个口子，守 800 行门岗）────────────────────────────────

let active: CanvasShotRuns | null = null;

/** 能力核起停时装上 / 卸下（stop 传 null）。 */
export function installCanvasShotRuns(runs: CanvasShotRuns | null): void {
  active = runs;
}

function activeRuns(): CanvasShotRuns {
  if (!active) throw coded("capability core is starting", "core_starting", "core_starting");
  return active;
}

/** 渲染层「交」（受信 IPC 进来，发起的窗口就是这一下点击）。 */
export function submitCanvasShot(input: CanvasShotSubmitInput): Promise<CanvasTaskResult> {
  return activeRuns().submit(input);
}

/** 渲染层「查」；没有这个 Run 回 null（旧运行记录走旧路）。 */
export function pollCanvasShot(input: { projectId: string; runRecordId: string; senderId: number }): Promise<CanvasTaskResult | null> {
  return activeRuns().poll(input);
}

export function releaseCanvasShot(input: { projectId: string; runRecordId: string }): void {
  active?.release(input);
}

export function releaseCanvasShotSender(senderId: number): void {
  active?.releaseSender(senderId);
}

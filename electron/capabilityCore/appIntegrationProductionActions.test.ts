import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// 「继续剩余 / 重做这一镜」这两个用户动作在主进程的那一半：
// - 继续走哪条路只看 Run 在停下那一刻记下的原因——不是预算停下的，一律直接接着拍，绝不弹续额度确认
//   （以前渲染层按画布上猜出的「预算」传 budget，没有价格时也弹出额度全是 0 的续拍卡）；
// - 急停后在跑的那一镜还没收尾（pausing）也能接着拍；
// - 重做一镜时，停下的原因若随重做解除（因失败而停），批次接着走——否则这一镜永远不开拍；
// - 每一种没做成都回自己的语义码，没有笼统的「操作没成功」，主进程原话不回给界面。
// 走真仓库 + 真 Run 服务（run.control 与任务卡、MCP 同一个口）+ 真收据机构。

import { compileExecutionContract, type PlanCandidate } from "./executionContract";
import { GenerationProviderCapabilityError, type GenerationProvider } from "./generationRuntimeAdapter";
import { createModuleRegistry } from "./moduleRegistry";
import { createProductionActionHooks, productionShotActionFailureOf, type ProductionDriverReadiness } from "./appIntegrationProductionActions";
import { createApprovalReceiptAuthority, HumanApprovalRequiredError, ReceiptExpiredError, ReceiptScopeError } from "./approvalReceipt";
import { sealAndApproveProductionGeneration } from "../productionRun/productionGenerationAuthorizationTestUtils";
import { applyRunControl, ProductionRunControlRefusedError } from "../productionRun/productionRunControl";
import { createProductionRunRepository, ProductionRunParseError, ProductionRunRevisionConflictError } from "../productionRun/productionRunRepository";
import { ProductionRunLockBusyError } from "../productionRun/productionRunLock";
import { IllegalProductionTransitionError } from "../productionRun/productionRunState";
import { GenerationReworkRefusedError } from "../productionRun/prepareProductionGenerationAuthorization";
import { createProductionRunService } from "../productionRun/productionRunService";
import type { ProductionGenerationShot, ProductionRunStopReason, ProductionShotActionFailure } from "../productionRun/productionRunTypes";
import type { WorkspaceProjectRecordV2 } from "../workspace/workspaceTypes";

const PROJECT = "project-1";
const RUN = "op-actions";
const roots: string[] = [];
const now = () => "2026-09-29T00:00:00.000Z";

const registry = createModuleRegistry([{
  moduleId: "generation.single-shot", version: "1.0.0", inputKinds: ["text", "image"], outputKinds: ["video"],
  modes: ["image-to-video"], parameterSchema: {}, assetInputSchema: { references: { kind: "image", max: 4 } },
  providers: [{ providerId: "apimart", models: [{ modelId: "video-model", modes: ["image-to-video"], parameterSchema: {},
    capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true, materialize: true } }] }],
}]);

function shotEntry(shotId: string): ProductionGenerationShot {
  const candidate: PlanCandidate = { candidateId: `cand-${shotId}`, revision: 1, moduleId: "generation.single-shot", providerId: "apimart", modelId: "video-model", mode: "image-to-video", prompt: shotId, parameters: {}, references: [] };
  const contract = compileExecutionContract(candidate, registry);
  return { shotId, candidate: { ...candidate, sealedContractHash: contract.contractHash }, contract, approvedReceiptId: "receipt-plan", updatedAt: now() };
}

const provider: GenerationProvider = {
  providerId: "apimart",
  capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true, materialize: true },
  buildRequest: (input) => input,
  submit: async () => ({ providerTaskId: "unused" }),
};

type SetupOptions = {
  /** 装上真收据机构 + 一个会点「确认」的人（重做与续额度都要走单镜确认）。 */
  withReceipts?: boolean;
  providers?: readonly GenerationProvider[];
  readiness?: ProductionDriverReadiness;
  project?: WorkspaceProjectRecordV2 | null;
};

/** 两镜整批已确认、已提交、已开跑（running），还没有一镜交给供应商。 */
function setup({ withReceipts = false, providers = [provider], readiness = "ready", project }: SetupOptions = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-production-actions-"));
  roots.push(root);
  const repository = createProductionRunRepository({ projectDirResolver: (projectId) => (projectId === PROJECT ? root : null), now });
  const shots = [shotEntry("shot-1"), shotEntry("shot-2")];
  repository.createGenerationDraft({ operationId: RUN, projectId: PROJECT, origin: { host: "semantic-mcp" }, candidate: shots[0].candidate, shots,
    policy: { trustedHosts: ["semantic-mcp"], allowedProviders: ["apimart"], allowedModels: ["video-model"], maxSpend: null, maxAttemptsPerJob: 3 } });
  sealAndApproveProductionGeneration({
    repository, projectId: PROJECT, operationId: RUN, immutableProjectUuid: "project-uuid-1", projectGeneration: 1, projectRevision: 0,
    candidate: shots[0].candidate, contract: shots[0].contract!, providers: [provider],
    multiShot: { shots, planHash: "plan-hash-actions" }, resolveShotPrice: () => ({ known: false }), receiptId: "receipt-plan", now: now(),
  });
  let run = repository.read(PROJECT, RUN)!;
  run = repository.execute(PROJECT, RUN, { commandId: "submit", expectedRevision: run.revision, type: "generation.submit", payload: {}, issuedAt: now() }).run;
  repository.execute(PROJECT, RUN, { commandId: "start", expectedRevision: run.revision, type: "run.status", payload: { status: "running" }, issuedAt: now() });
  const receipts = createApprovalReceiptAuthority({
    filePath: path.join(root, "approval-receipts.json"),
    macKey: "approval-receipt-key",
    storeMacKey: "approval-receipt-store-key",
    keyId: "approval-receipt-v1",
    now,
  });
  const confirmGenerationInNomi = vi.fn(async ({ challengeToken }: { challengeToken: string }) => {
    const attestation = receipts.createMainProcessGestureAttestation(challengeToken, { webContentsId: 1, frameId: 2, origin: "app://nomi", decision: "accept" });
    return { confirmed: true, receiptToken: receipts.mintReceipt(challengeToken, attestation).token };
  });
  const service = createProductionRunService({
    repository,
    projectRootResolver: () => root,
    requestRenderer: async () => { throw new Error("no renderer in this test"); },
    approvalReceiptAuthority: receipts,
    projectRevisionResolver: () => 0,
  });
  const kickScheduler = vi.fn();
  const hooks = createProductionActionHooks({
    generationService: service,
    isProjectOpen: () => true,
    readProviderBootstrap: () => ({ providers, readinessByProvider: {} }),
    readProject: () => (project === undefined
      ? { id: PROJECT, immutableProjectUuid: "project-uuid-1", projectGeneration: 1, revision: 0 } as unknown as WorkspaceProjectRecordV2
      : project),
    resolveShotPrice: () => ({ known: false }),
    driverReadiness: () => readiness,
    kickScheduler,
    ...(withReceipts ? { receiptAuthority: receipts, confirmGenerationInNomi } : {}),
    projectRevisionResolver: () => 0,
  });
  return { repository, service, hooks, kickScheduler, confirmGenerationInNomi };
}

function stop(repository: ReturnType<typeof createProductionRunRepository>, status: "needs_attention" | "pausing" | "cancelled", reason: ProductionRunStopReason) {
  const run = repository.read(PROJECT, RUN)!;
  return repository.execute(PROJECT, RUN, { commandId: `stop-${status}-${reason}`, expectedRevision: run.revision, type: "run.status", payload: { status, reason }, issuedAt: now() }).run;
}

/** 两镜都交给过供应商并已收尾：第 1 镜失败，第 2 镜出片。 */
function settleShots(repository: ReturnType<typeof createProductionRunRepository>) {
  let run = repository.read(PROJECT, RUN)!;
  for (const [shotId, final] of [["shot-1", "needs_attention"], ["shot-2", "ready"]] as const) {
    const job = run.jobs.find((candidate) => candidate.metadata?.shotId === shotId)!;
    const path = final === "needs_attention"
      ? ["submit_intent_persisted", "submitting", "needs_attention"] as const
      : ["submit_intent_persisted", "submitting", "provider_accepted", "polling", "downloading", "validating_technical", "validating_content", "ready"] as const;
    for (const status of path) {
      run = repository.execute(PROJECT, RUN, { commandId: `${shotId}-${status}`, expectedRevision: run.revision, type: "job.status", payload: { jobId: job.jobId, status, ...(status === "needs_attention" ? { patch: { errorCode: "provider_task_failed" } } : {}) }, issuedAt: now() }).run;
    }
  }
  return run;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("「继续剩余」：接着拍，续额度只在真因预算停下时才走", () => {
  it("用户急停后（paused）：直接接着拍，Run 回到 running，不走续额度确认", async () => {
    const { repository, hooks, confirmGenerationInNomi } = setup({ withReceipts: true });
    const running = repository.read(PROJECT, RUN)!;
    applyRunControl(repository, PROJECT, RUN, running, { commandId: "user-pause", expectedRevision: running.revision, type: "run.control", payload: { action: "pause" }, issuedAt: now() });
    expect(repository.read(PROJECT, RUN)).toMatchObject({ status: "paused", stop: { reason: "user_paused" } });

    await expect(hooks.resumeProductionBatch({ projectId: PROJECT, runId: RUN })).resolves.toEqual({ ok: true, code: "resumed" });
    const resumed = repository.read(PROJECT, RUN)!;
    expect(resumed.status).toBe("running");
    expect(resumed.stop, "离开停着的状态，停下的原因就清掉").toBeUndefined();
    expect(confirmGenerationInNomi, "不是预算停下的，不弹续额度确认").not.toHaveBeenCalled();
  });

  it("急停后在跑的那一镜还没收尾（pausing）：也能接着拍，不再报「not resumable」", async () => {
    const { repository, hooks } = setup();
    // 第 1 镜已经交给供应商、还在跑：急停只能先停在 pausing，等它收尾。
    let run = repository.read(PROJECT, RUN)!;
    const job1 = run.jobs.find((job) => job.metadata?.shotId === "shot-1")!;
    for (const status of ["submit_intent_persisted", "submitting", "provider_accepted", "polling"] as const) {
      run = repository.execute(PROJECT, RUN, { commandId: `job1-${status}`, expectedRevision: run.revision, type: "job.status", payload: { jobId: job1.jobId, status }, issuedAt: now() }).run;
    }
    expect(stop(repository, "pausing", "user_paused").status, "还有一镜在供应商那边：停在 pausing").toBe("pausing");
    await expect(hooks.resumeProductionBatch({ projectId: PROJECT, runId: RUN })).resolves.toEqual({ ok: true, code: "resumed" });
    expect(repository.read(PROJECT, RUN)?.status).toBe("running");
  });

  it.each([["failed" as const], ["restart_recovery" as const]])("因 %s 停下：直接接着拍，不走续额度确认", async (reason) => {
    const { repository, hooks } = setup();
    stop(repository, "needs_attention", reason);
    await expect(hooks.resumeProductionBatch({ projectId: PROJECT, runId: RUN })).resolves.toEqual({ ok: true, code: "resumed" });
    expect(repository.read(PROJECT, RUN)?.status).toBe("running");
  });

  it("真因预算停下（只有知道价格时才可能）：才走续额度确认那条路", async () => {
    const { repository, hooks } = setup();
    stop(repository, "needs_attention", "budget");
    // 这台装配没有确认口：走进续额度那条路就只能回 confirmation_unavailable——证明它走了那条路，而不是直接接着拍。
    await expect(hooks.resumeProductionBatch({ projectId: PROJECT, runId: RUN })).resolves.toEqual({ ok: false, code: "failed", failure: "confirmation_unavailable" });
    expect(repository.read(PROJECT, RUN)?.status, "没确认续额度就不接着拍").toBe("needs_attention");
  });

  it("供应商接不上：不把 Run 改成 running（那是假继续），如实说缺的是供应商", async () => {
    const { repository, hooks } = setup({ readiness: "provider_missing" });
    // 手上没有交给供应商的活：急停的同一次写入就落到 paused。
    expect(stop(repository, "pausing", "user_paused").status).toBe("paused");
    await expect(hooks.resumeProductionBatch({ projectId: PROJECT, runId: RUN })).resolves.toEqual({ ok: false, code: "failed", failure: "provider_unavailable" });
    expect(repository.read(PROJECT, RUN)?.status).toBe("paused");
  });

  it("没停着的批次：not_stopped 与 已结束的批次：run_finished，都不带主进程原话", async () => {
    const running = setup();
    await expect(running.hooks.resumeProductionBatch({ projectId: PROJECT, runId: RUN })).resolves.toEqual({ ok: true, code: "resumed" });
    expect(running.kickScheduler, "已经在跑：踢一下调度器让它接着派").toHaveBeenCalledWith(PROJECT, RUN);

    const cancelled = setup();
    stop(cancelled.repository, "cancelled", "user_cancelled");
    const result = await cancelled.hooks.resumeProductionBatch({ projectId: PROJECT, runId: RUN });
    expect(result).toEqual({ ok: false, code: "failed", failure: "run_finished" });
  });

  it("记录不在了 / 读不出来：run_missing 与 run_unreadable 分开说", async () => {
    const { hooks, repository } = setup();
    await expect(hooks.resumeProductionBatch({ projectId: PROJECT, runId: "op-gone" })).resolves.toEqual({ ok: false, code: "failed", failure: "run_missing" });
    vi.spyOn(repository, "read").mockImplementationOnce(() => { throw new ProductionRunParseError("events.jsonl", 3); });
    await expect(hooks.resumeProductionBatch({ projectId: PROJECT, runId: RUN })).resolves.toEqual({ ok: false, code: "failed", failure: "run_unreadable" });
  });
});

describe("「重做这一镜」", () => {
  it("因失败停下的批次：确认后批次接着走（停下随重做解除），调度器被踢——这一镜才会真的开拍", async () => {
    const { repository, hooks, kickScheduler, confirmGenerationInNomi } = setup({ withReceipts: true });
    settleShots(repository);
    stop(repository, "needs_attention", "failed");

    await expect(hooks.reworkProductionShot({ projectId: PROJECT, runId: RUN, shotId: "shot-1" })).resolves.toEqual({ ok: true, code: "reworked" });
    expect(confirmGenerationInNomi, "重做要人确认这一镜的花费").toHaveBeenCalledTimes(1);
    const run = repository.read(PROJECT, RUN)!;
    expect(run.status, "停下的原因（失败）随重做解除").toBe("running");
    expect(run.jobs.filter((job) => job.metadata?.shotId === "shot-1").map((job) => job.status)).toEqual(["needs_attention", "authorized"]);
    expect(kickScheduler).toHaveBeenCalledWith(PROJECT, RUN);
  });

  it("用户自己暂停的批次：重做一镜不替他改主意，批次仍停着", async () => {
    const { repository, hooks } = setup({ withReceipts: true });
    settleShots(repository);
    expect(stop(repository, "pausing", "user_paused").status).toBe("paused");

    await expect(hooks.reworkProductionShot({ projectId: PROJECT, runId: RUN, shotId: "shot-1" })).resolves.toEqual({ ok: true, code: "reworked" });
    expect(repository.read(PROJECT, RUN)).toMatchObject({ status: "paused", stop: { reason: "user_paused" } });
  });

  it("还有镜头在排队（已授权没提交）：queued_shots_pending，不弹确认", async () => {
    const { repository, hooks, confirmGenerationInNomi } = setup({ withReceipts: true });
    let run = repository.read(PROJECT, RUN)!;
    const job1 = run.jobs.find((job) => job.metadata?.shotId === "shot-1")!;
    for (const status of ["submit_intent_persisted", "submitting", "needs_attention"] as const) {
      run = repository.execute(PROJECT, RUN, { commandId: `job1-${status}`, expectedRevision: run.revision, type: "job.status", payload: { jobId: job1.jobId, status, ...(status === "needs_attention" ? { patch: { errorCode: "provider_task_failed" } } : {}) }, issuedAt: now() }).run;
    }
    await expect(hooks.reworkProductionShot({ projectId: PROJECT, runId: RUN, shotId: "shot-1" })).resolves.toEqual({ ok: false, code: "failed", failure: "queued_shots_pending" });
    expect(confirmGenerationInNomi, "被拒就不弹确认").not.toHaveBeenCalled();
  });

  it("这一镜上一次还在排队（没交给供应商）：previous_attempt_unsettled，不再被说成「还没生成过」", async () => {
    const { hooks } = setup({ withReceipts: true });
    await expect(hooks.reworkProductionShot({ projectId: PROJECT, runId: RUN, shotId: "shot-2" })).resolves.toEqual({ ok: false, code: "failed", failure: "previous_attempt_unsettled" });
  });

  it.each<[string, SetupOptions, { shotId?: string }, ProductionShotActionFailure]>([
    ["没带镜头编号", { withReceipts: true }, {}, "request_invalid"],
    ["这个窗口弹不出付费确认", { withReceipts: false }, { shotId: "shot-1" }, "confirmation_unavailable"],
    ["项目身份读不到", { withReceipts: true, project: null }, { shotId: "shot-1" }, "project_unavailable"],
    ["这一镜的模型接不上供应商", { withReceipts: true, providers: [] }, { shotId: "shot-1" }, "provider_unavailable"],
  ])("%s → 自己的码（%s）", async (_label, options, input, failure) => {
    const { repository, hooks } = setup(options);
    settleShots(repository);
    stop(repository, "needs_attention", "failed");
    await expect(hooks.reworkProductionShot({ projectId: PROJECT, runId: RUN, ...input })).resolves.toEqual({ ok: false, code: "failed", failure });
  });
});

describe("失败归类：只认源头的类型与系统错误码，认不出的只剩 Nomi 自己的 bug", () => {
  it.each<[string, unknown, ProductionShotActionFailure]>([
    ["返工被拒（上限）", new GenerationReworkRefusedError("attempt_limit", "limit"), "attempt_limit"],
    ["版本冲突", new ProductionRunRevisionConflictError(3, 4), "run_changed"],
    ["写锁被占", new ProductionRunLockBusyError(), "run_changed"],
    ["状态机不允许", new IllegalProductionTransitionError("run", "completed", "running"), "run_changed"],
    ["控制被拒", new ProductionRunControlRefusedError("无法继续：制作当前状态是 completed，不允许这个操作"), "run_changed"],
    ["确认时项目有变动", new ReceiptScopeError("Approval receipt project revision does not match the current project"), "approval_stale"],
    ["确认过期", new ReceiptExpiredError(), "approval_expired"],
    ["没有人证", new HumanApprovalRequiredError(), "confirmation_unavailable"],
    ["供应商没注册", new GenerationProviderCapabilityError("apimart", ["registered_provider"]), "provider_unavailable"],
    ["记录解析失败", new ProductionRunParseError("events.jsonl", 3), "run_unreadable"],
    ["磁盘满", Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" }), "ledger_write_failed"],
    ["没有写权限", Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" }), "ledger_write_failed"],
    ["不变量断言（bug）", new Error("Generation reauthorization does not belong to the leased Run"), "internal_error"],
  ])("%s → %s", (_label, error, failure) => {
    expect(productionShotActionFailureOf(error)).toBe(failure);
  });

  it("英文原话里带着「revision conflict」也不算：只认类型", () => {
    expect(productionShotActionFailureOf(new Error("Production run revision conflict: expected 1, actual 2"))).toBe("internal_error");
  });
});

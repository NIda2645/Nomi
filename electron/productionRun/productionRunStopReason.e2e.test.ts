import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// 「为什么停」是停的那一刻的事实（2026-09-29）：停它的那一方在 run.status 命令里说原因，reducer 落成 run.stop，
// 画布与续拍入口只读它。以前界面从 needs_attention 反推，一律说「预算已用完 · 提额续拍」——而那天根本没有价格。
// 这里走真仓库 + 真调度器 + 真提交门面（内存供应商），看每一种停法记下的是不是真实原因。

const logs = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));
vi.mock("../logging/logger", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logInfo: logs.info,
  logWarn: logs.warn,
}));

import { compileExecutionContract, type PlanCandidate } from "../capabilityCore/executionContract";
import type { GenerationProvider } from "../capabilityCore/generationRuntimeAdapter";
import { createModuleRegistry } from "../capabilityCore/moduleRegistry";
import { deriveProductionShotState } from "../shared/productionShotPhase";
import { runStopReason } from "../shared/productionRunStop";
import { createMultiShotBatchScheduler } from "./multiShotBatchScheduler";
import { createProductionGenerationSubmission } from "./productionGenerationSubmission";
import { sealAndApproveProductionGeneration } from "./productionGenerationAuthorizationTestUtils";
import { applyRunControl } from "./productionRunControl";
import { createProductionRunRepository } from "./productionRunRepository";
import { productionRunPaths } from "./productionRunPaths";
import { createProductionRunService } from "./productionRunService";
import type { ProductionGenerationShot, ProductionRun, RunEvent } from "./productionRunTypes";
import { createProductionShotDispatchGuard } from "./productionShotDispatchGuard";

const PROJECT = "project-1";
const RUN = "op-stop";
const roots: string[] = [];
const now = () => "2026-09-29T00:00:00.000Z";

type Repository = ReturnType<typeof createProductionRunRepository>;

const registry = createModuleRegistry([{
  moduleId: "generation.single-shot", version: "1.0.0", inputKinds: ["text", "image"], outputKinds: ["image", "video"],
  modes: ["text-to-image", "image-to-video"], parameterSchema: {}, assetInputSchema: { references: { kind: "image", max: 4 } },
  providers: [{ providerId: "apimart", models: [
    { modelId: "image-model", modes: ["text-to-image"], parameterSchema: {}, capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true, materialize: true } },
    { modelId: "video-model", modes: ["image-to-video"], parameterSchema: {}, capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true, materialize: true } },
  ] }],
}]);

function shotEntry(shotId: string, role: "anchor" | "shot"): ProductionGenerationShot {
  const modelId = role === "anchor" ? "image-model" : "video-model";
  const mode = role === "anchor" ? "text-to-image" : "image-to-video";
  const candidate: PlanCandidate = { candidateId: `cand-${shotId}`, revision: 1, moduleId: "generation.single-shot", providerId: "apimart", modelId, mode, prompt: shotId, parameters: {}, references: [] };
  const contract = compileExecutionContract(candidate, registry);
  return { shotId, ...(role === "anchor" ? { role } : {}), candidate: { ...candidate, sealedContractHash: contract.contractHash }, contract, approvedReceiptId: "receipt-plan", updatedAt: now() };
}

/** 内存供应商：`failing` 里的镜交上去之后供应商判失败，其余照常出片；`duringSubmit` 在请求「正在供应商那边」时触发。 */
function provider(submits: string[], { failing = new Set<string>(), duringSubmit }: { failing?: Set<string>; duringSubmit?: () => void } = {}): GenerationProvider {
  const verdictByTask = new Map<string, "failed" | "succeeded">();
  return {
    providerId: "apimart",
    capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true, materialize: true },
    buildRequest: (input) => input,
    submit: async (_request, idempotencyKey) => {
      submits.push(idempotencyKey);
      duringSubmit?.();
      const taskId = `task-${submits.length}`;
      verdictByTask.set(taskId, [...failing].some((shotId) => idempotencyKey.includes(shotId)) ? "failed" : "succeeded");
      return { providerTaskId: taskId };
    },
    query: async (providerTaskId) => ({ status: verdictByTask.get(providerTaskId) ?? "succeeded", raw: { id: providerTaskId } }),
    materialize: async ({ providerTaskId }) => ({ outputs: [{ kind: "video", url: `nomi-local://asset/${PROJECT}/${providerTaskId}.mp4` }] }),
  };
}

function setup(shots: ProductionGenerationShot[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-stop-reason-"));
  roots.push(root);
  const repository = createProductionRunRepository({ projectDirResolver: (projectId) => (projectId === PROJECT ? root : null), now });
  repository.createGenerationDraft({ operationId: RUN, projectId: PROJECT, origin: { host: "semantic-mcp" }, candidate: shots[0].candidate, shots,
    policy: { trustedHosts: ["semantic-mcp"], allowedProviders: ["apimart"], allowedModels: ["image-model", "video-model"], maxSpend: null, maxAttemptsPerJob: 3 } });
  sealAndApproveProductionGeneration({
    repository, projectId: PROJECT, operationId: RUN, immutableProjectUuid: "project-uuid-1", projectGeneration: 1, projectRevision: 0,
    candidate: shots[0].candidate, contract: shots[0].contract!, providers: [provider([])],
    multiShot: { shots, scope: shots.filter((shot) => shot.included !== false).map((shot) => shot.shotId), planHash: "plan-hash-stop" }, resolveShotPrice: () => ({ known: false }), receiptId: "receipt-plan", now: now(),
  });
  const run = repository.read(PROJECT, RUN)!;
  repository.execute(PROJECT, RUN, { commandId: "submit", expectedRevision: run.revision, type: "generation.submit", payload: {}, issuedAt: now() });
  return { root, repository };
}

async function drive(root: string, repository: Repository, vendor: GenerationProvider) {
  const submission = createProductionGenerationSubmission({
    repository, beforeDispatch: createProductionShotDispatchGuard({ readRun: (projectId, runId) => repository.read(projectId, runId) ?? undefined }),
    projectRoot: root, immutableProjectUuid: "project-uuid-1", projectGeneration: 1, intentMacKey: "test-intent-key", provider: vendor,
    materializeOutput: async ({ providerTaskId }) => ({ artifactId: `artifact-${providerTaskId}`, kind: "video", contentHash: `hash-${providerTaskId}`, projectRelativePath: `.nomi/out/${providerTaskId}.mp4` }),
    now,
  });
  return await createMultiShotBatchScheduler({ repository, submission, projectId: PROJECT, runId: RUN, perShotPrice: () => ({ known: false }), now, sleep: async () => {} }).runToQuiescence();
}

const shotState = (run: ProductionRun, shotId: string) => deriveProductionShotState(run, shotId);

/** 上一版的写法：Run 停着、身上没有 stop。这一版的写入口不允许无原因停下，所以直接把这样一条事件接在日志尾巴上。 */
function appendLegacyStatus(root: string, repository: Repository, status: ProductionRun["status"]): void {
  const current = repository.read(PROJECT, RUN)!;
  const eventsPath = productionRunPaths(root, RUN).events;
  const last = JSON.parse(fs.readFileSync(eventsPath, "utf8").trim().split("\n").at(-1)!) as RunEvent;
  const { stop: _dropped, ...withoutStop } = current;
  const run: ProductionRun = { ...withoutStop, status, revision: current.revision + 1, snapshotCursor: last.cursor + 1 };
  const event: RunEvent = { ...last, eventId: `evt-legacy-${status}`, cursor: last.cursor + 1, runRevision: run.revision, commandId: `legacy-${status}`, type: "run.status.changed", message: status, payload: { run, commandType: "run.status" } };
  fs.appendFileSync(eventsPath, `${JSON.stringify(event)}\n`, "utf8");
}

afterEach(() => {
  vi.clearAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("a run records why it stopped, at the moment it stops", () => {
  it("参考卡在供应商那边失败：批次停下、记「有镜头失败」，没开拍的视频镜说真实原因（以前 Run 一直 running、镜一直排队）", async () => {
    const { root, repository } = setup([shotEntry("anchor-1", "anchor"), shotEntry("shot-1", "shot"), shotEntry("shot-2", "shot")]);
    const submits: string[] = [];
    await drive(root, repository, provider(submits, { failing: new Set(["anchor-1"]) }));

    const run = repository.read(PROJECT, RUN)!;
    expect(submits, "只交了参考卡；视频镜被形象检查点挡着").toHaveLength(1);
    expect(run.status).toBe("needs_attention");
    expect(run.stop?.reason).toBe("failed");
    for (const shotId of ["shot-1", "shot-2"]) {
      expect(shotState(run, shotId)).toMatchObject({ phase: "stopped", stoppedReason: "failed" });
    }
  });

  it("视频镜在供应商那边失败、其余都完了：停下并记「有镜头失败」，不是预算", async () => {
    const { root, repository } = setup([shotEntry("shot-1", "shot"), shotEntry("shot-2", "shot")]);
    await drive(root, repository, provider([], { failing: new Set(["shot-2"]) }));
    const run = repository.read(PROJECT, RUN)!;
    expect(run).toMatchObject({ status: "needs_attention", stop: { reason: "failed" } });
    expect(runStopReason(run)).toBe("failed");
  });

  it("急停：在跑的那一镜收尾后落到 paused，原因是用户暂停；派发闸的拒绝只记成 skipped、不记成 batch-dispatch-failed", async () => {
    const { root, repository } = setup([shotEntry("shot-1", "shot"), shotEntry("shot-2", "shot"), shotEntry("shot-3", "shot")]);
    const submits: string[] = [];
    const press = () => {
      const run = repository.read(PROJECT, RUN)!;
      applyRunControl(repository, PROJECT, RUN, run, { commandId: "user-pause", expectedRevision: run.revision, type: "run.control", payload: { action: "pause" }, issuedAt: now() });
    };
    await drive(root, repository, provider(submits, { duringSubmit: () => { if (submits.length === 1) press(); } }));

    const run = repository.read(PROJECT, RUN)!;
    expect(submits).toHaveLength(1);
    expect(run).toMatchObject({ status: "paused", stop: { reason: "user_paused" } });
    expect(shotState(run, "shot-3")).toMatchObject({ phase: "stopped", stoppedReason: "user_paused" });
    const warned = logs.warn.mock.calls.map((call) => call[1]);
    expect(warned, "被闸拒掉的镜不是一次失败").not.toContain("batch-dispatch-failed");
    const skipped = logs.info.mock.calls.filter((call) => call[1] === "batch-dispatch-skipped").map((call) => call[2]);
    expect(skipped).toEqual([{ shotId: "shot-2", reason: "run_stopped" }, { shotId: "shot-3", reason: "run_stopped" }]);
  });

  it("停下却不说原因：拒绝写入（以前只好让界面去猜）", () => {
    const { repository } = setup([shotEntry("shot-1", "shot"), shotEntry("shot-2", "shot")]);
    let run = repository.read(PROJECT, RUN)!;
    run = repository.execute(PROJECT, RUN, { commandId: "start", expectedRevision: run.revision, type: "run.status", payload: { status: "running" }, issuedAt: now() }).run;
    expect(() => repository.execute(PROJECT, RUN, { commandId: "silent-stop", expectedRevision: run.revision, type: "run.status", payload: { status: "needs_attention" }, issuedAt: now() }))
      .toThrow(/needs a stop reason/);
    const stopped = repository.execute(PROJECT, RUN, { commandId: "said-stop", expectedRevision: run.revision, type: "run.status", payload: { status: "needs_attention", reason: "restart_recovery" }, issuedAt: now() }).run;
    expect(stopped.stop).toEqual({ reason: "restart_recovery", at: now() });
    const resumed = repository.execute(PROJECT, RUN, { commandId: "resume", expectedRevision: stopped.revision, type: "run.status", payload: { status: "running" }, issuedAt: now() }).run;
    expect(resumed.stop, "离开停着的状态就清掉").toBeUndefined();
    expect(runStopReason(resumed)).toBeNull();
  });

  it("急停后最后一件交给供应商的活收尾：不管是谁写的这一笔（这里直接写 job.status，不经任何驱动），同一次写入就落到 paused", () => {
    const { repository } = setup([shotEntry("shot-1", "shot"), shotEntry("shot-2", "shot")]);
    let run = repository.read(PROJECT, RUN)!;
    run = repository.execute(PROJECT, RUN, { commandId: "start", expectedRevision: run.revision, type: "run.status", payload: { status: "running" }, issuedAt: now() }).run;
    const job = run.jobs.find((candidate) => candidate.metadata?.shotId === "shot-1")!;
    const write = (status: ProductionRun["jobs"][number]["status"]) => repository.execute(PROJECT, RUN, { commandId: `job-${status}`, expectedRevision: repository.read(PROJECT, RUN)!.revision, type: "job.status", payload: { jobId: job.jobId, status }, issuedAt: now() });
    for (const status of ["submit_intent_persisted", "submitting", "provider_accepted", "polling"] as const) write(status);

    run = repository.read(PROJECT, RUN)!;
    const paused = applyRunControl(repository, PROJECT, RUN, run, { commandId: "user-pause", expectedRevision: run.revision, type: "run.control", payload: { action: "pause" }, issuedAt: now() });
    expect(paused.run.status, "第 1 镜还在供应商那边：先停在 pausing").toBe("pausing");

    for (const status of ["downloading", "validating_technical", "validating_content"] as const) {
      expect(write(status).run.status, "还在收尾：仍是 pausing").toBe("pausing");
    }
    const settled = write("ready");
    expect(settled.run).toMatchObject({ status: "paused", stop: { reason: "user_paused" } });
    expect(settled.events.map((event) => event.type), "收尾那一步作为自己的状态事件，和这一笔一起落盘").toEqual(["job.ready", "run.status.changed"]);
  });

  it("急停时手上没有交给供应商的活：同一次写入直接落到 paused", () => {
    const { repository } = setup([shotEntry("shot-1", "shot"), shotEntry("shot-2", "shot")]);
    let run = repository.read(PROJECT, RUN)!;
    run = repository.execute(PROJECT, RUN, { commandId: "start", expectedRevision: run.revision, type: "run.status", payload: { status: "running" }, issuedAt: now() }).run;
    const paused = applyRunControl(repository, PROJECT, RUN, run, { commandId: "user-pause", expectedRevision: run.revision, type: "run.control", payload: { action: "pause" }, issuedAt: now() });
    expect(paused.run).toMatchObject({ status: "paused", stop: { reason: "user_paused" } });
    expect(paused.events.map((event) => event.message)).toEqual(["pausing", "paused"]);
  });

  it("上一版留下的、停在 pausing（没记原因）而手上已经没活的 Run：重开项目时补上那一步落到 paused，原因照旧没记（读作 unknown，不是预算）", async () => {
    const { root, repository } = setup([shotEntry("shot-1", "shot"), shotEntry("shot-2", "shot")]);
    const run = repository.read(PROJECT, RUN)!;
    repository.execute(PROJECT, RUN, { commandId: "start", expectedRevision: run.revision, type: "run.status", payload: { status: "running" }, issuedAt: now() });
    appendLegacyStatus(root, repository, "pausing");
    const legacy = repository.read(PROJECT, RUN)!;
    expect(legacy.status).toBe("pausing");
    expect(runStopReason(legacy)).toBe("unknown");

    const service = createProductionRunService({ repository, projectRootResolver: () => root, requestRenderer: async () => { throw new Error("no renderer in this test"); } });
    await service.resumeUnfinishedRuns(PROJECT);

    const settled = repository.read(PROJECT, RUN)!;
    expect(settled.status).toBe("paused");
    expect(settled.stop, "不替旧数据编一个原因").toBeUndefined();
    expect(shotState(settled, "shot-2")).toMatchObject({ phase: "stopped", stoppedReason: "unknown" });
  });
});

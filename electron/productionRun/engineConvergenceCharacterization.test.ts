import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { compileExecutionContract, type PlanCandidate } from "../capabilityCore/executionContract";
import { createModuleRegistry } from "../capabilityCore/moduleRegistry";
import type { GenerationProvider } from "../capabilityCore/generationRuntimeAdapter";
import { decideShotClaim } from "../shared/decideShotClaim";
import { claimCanvasProductionShot } from "./canvasShotClaim";
import { createMultiShotBatchScheduler } from "./multiShotBatchScheduler";
import { prepareProductionGenerationReauthorization } from "./prepareProductionGenerationAuthorization";
import { sealAndApproveProductionGeneration } from "./productionGenerationAuthorizationTestUtils";
import { createProductionGenerationSubmission } from "./productionGenerationSubmission";
import { applyRunControl } from "./productionRunControl";
import { createProductionRunRepository } from "./productionRunRepository";
import type { ProductionRunService } from "./productionRunService";
import { registerProductionRunService, resetRegisteredProductionRunService } from "./productionRunServiceRegistry";
import type { ProductionGenerationShot } from "./productionRunTypes";
import { createProductionShotDispatchGuard } from "./productionShotDispatchGuard";

// 发动机收敛现状核查（docs/plan/2026-10-05-engine-convergence-cut1.md §3）的特征测试。
// 只钉现状，不改生产代码。走的是真实的仓库 / reducer / 调度器 / 提交出口 / 派发闸，
// 画布那一侧走真实的主进程认领入口 `claimCanvasProductionShot`（runtime.runTask 里调的就是它）。
// 供应商是进程内的计数器：这里只数「供应商收到几次提交」，不需要真网络。

const NOW_BASE = Date.parse("2026-10-05T00:00:00.000Z");
const ELEVEN_MINUTES = 11 * 60 * 1000;
const roots: string[] = [];
let clock = NOW_BASE;
const now = () => new Date(clock).toISOString();

const CAPS = { submitIdempotency: true, query: true, reconcile: true, cancel: true, materialize: true } as const;
const registry = createModuleRegistry([{
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["text", "image"],
  outputKinds: ["image", "video"],
  modes: ["image-to-video"],
  parameterSchema: {},
  assetInputSchema: { references: { kind: "image", max: 4 } },
  providers: [{ providerId: "apimart", models: [{ modelId: "video-model", modes: ["image-to-video"], parameterSchema: {}, capabilities: CAPS }] }],
}]);

function countingProvider(submits: string[]): GenerationProvider {
  return {
    providerId: "apimart",
    capabilities: CAPS,
    buildRequest: (input) => input,
    submit: async (_request, idempotencyKey) => { submits.push(idempotencyKey); return { providerTaskId: `task-${submits.length}`, raw: {} }; },
    query: async (providerTaskId) => ({ status: "succeeded", raw: { id: providerTaskId, status: "succeeded" } }),
    materialize: async ({ providerTaskId }) => ({ outputs: [{ kind: "video", url: `nomi-local://asset/project-1/${providerTaskId}.mp4` }] }),
  };
}

function shotEntry(shotId: string): ProductionGenerationShot {
  const cand: PlanCandidate = { candidateId: `cand-${shotId}`, revision: 1, moduleId: "generation.single-shot", providerId: "apimart", modelId: "video-model", mode: "image-to-video", prompt: shotId, parameters: {}, references: [] };
  const contract = compileExecutionContract(cand, registry);
  return { shotId, candidate: { ...cand, sealedContractHash: contract.contractHash }, contract, approvedReceiptId: "receipt-plan", updatedAt: now() };
}

function setup(shotIds: string[]) {
  const shots = shotIds.map(shotEntry);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-converge-"));
  roots.push(root);
  const repository = createProductionRunRepository({ projectDirResolver: (p) => (p === "project-1" ? root : null), now });
  repository.createGenerationDraft({ operationId: "op-batch", projectId: "project-1", origin: { host: "semantic-mcp" }, candidate: shots[0].candidate, shots, policy: { trustedHosts: ["semantic-mcp"], allowedProviders: ["apimart"], allowedModels: ["video-model"], maxSpend: null, maxAttemptsPerJob: 3 } });
  sealAndApproveProductionGeneration({
    repository, projectId: "project-1", operationId: "op-batch", immutableProjectUuid: "project-uuid-1", projectGeneration: 1, projectRevision: 0,
    candidate: shots[0].candidate, contract: shots[0].contract!,
    providers: [{ providerId: "apimart", capabilities: CAPS, buildRequest: (input) => input, submit: async () => ({ providerTaskId: "unused" }) }],
    multiShot: { shots, scope: shots.map((shot) => shot.shotId), planHash: "plan-hash-converge" },
    resolveShotPrice: () => ({ known: true, amount: 6 }), receiptId: "receipt-plan", now: now(),
  });
  repository.execute("project-1", "op-batch", { commandId: "submit", expectedRevision: 2, type: "generation.submit", payload: {}, issuedAt: now() });
  // 画布那一侧的真实认领入口只要仓库：注册一个只带仓库的服务。
  registerProductionRunService({ repository } as unknown as ProductionRunService);
  return { root, repository };
}

function scheduler(root: string, repository: ReturnType<typeof createProductionRunRepository>, submits: string[], options: { maxShotsPerRun?: number } = {}) {
  const submission = createProductionGenerationSubmission({
    repository,
    beforeDispatch: createProductionShotDispatchGuard({ readRun: (projectId, runId) => repository.read(projectId, runId) ?? undefined }),
    projectRoot: root, immutableProjectUuid: "project-uuid-1", projectGeneration: 1, intentMacKey: "test-intent-key",
    provider: countingProvider(submits),
    materializeOutput: async ({ providerTaskId }) => ({ artifactId: `artifact-${providerTaskId}`, kind: "video", contentHash: `hash-${providerTaskId}`, projectRelativePath: `.nomi/out/${providerTaskId}.mp4` }),
    now,
  });
  return createMultiShotBatchScheduler({ repository, submission, projectId: "project-1", runId: "op-batch", now, options });
}

/** 画布按 ↑：主进程先经 `claimCanvasProductionShot` 认领（runtime.ts 里的那一行），认领不到就抛；认领到了就算发出一笔。 */
function canvasGenerates(shotId: string, canvasSubmits: string[]): void {
  claimCanvasProductionShot("project-1", { productionRunId: "op-batch", productionShotId: shotId });
  canvasSubmits.push(`canvas:${shotId}`);
}

function productionSubmitsFor(repository: ReturnType<typeof createProductionRunRepository>, shotId: string): number {
  const run = repository.read("project-1", "op-batch")!;
  return run.jobs.filter((job) => job.metadata?.shotId === shotId && Boolean(job.providerTaskId)).length;
}

afterEach(() => {
  resetRegisteredProductionRunService();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  clock = NOW_BASE;
});

describe("engine convergence — characterization of the canvas ↔ production claim boundary", () => {
  it("现状（绿）：同意过期停下 → 画布第一次接手 shot-2 → 用户点「继续」：制作不再派 shot-2", async () => {
    const { root, repository } = setup(["shot-1", "shot-2"]);
    const submits: string[] = [];
    const canvas: string[] = [];
    await scheduler(root, repository, submits, { maxShotsPerRun: 1 }).runToQuiescence();
    clock += ELEVEN_MINUTES;
    await scheduler(root, repository, submits).runToQuiescence();
    const stopped = repository.read("project-1", "op-batch")!;
    expect(stopped).toMatchObject({ status: "needs_attention", stop: { reason: "consent_expired" } });

    canvasGenerates("shot-2", canvas);
    const claimed = repository.read("project-1", "op-batch")!;
    applyRunControl(repository, "project-1", "op-batch", claimed, { commandId: "resume-1", expectedRevision: claimed.revision, type: "run.control", payload: { action: "resume" }, issuedAt: now(), humanGesture: true });
    await scheduler(root, repository, submits).runToQuiescence();

    expect(canvas).toEqual(["canvas:shot-2"]);
    expect(productionSubmitsFor(repository, "shot-2")).toBe(0);
  });

  // 已知缺口（双扣路径 6，2026-10-05 核查新发现）：画布认领的命令号是 `shot.claim:<run>:<shot>`，
  // 不带 attempt。同一镜第二次被画布接手时，仓库按命令号幂等重放、原样返回第一次的结果——
  // 这一次的认领没有落盘，返工出来的 attempt 2 仍是 authorized；用户点「继续」后制作照样派它。
  // 与 #966 直接原因 ③（纠正型绑定命令号与当初一字不差、被幂等重放吞掉）同一类。
  // 期望行为写在断言里；`it.fails` 让它今天是绿的，修好那天变红，逼着把 `.fails` 摘掉。
  it.fails("缺口：返工后同一镜第二次被画布接手，认领被命令号重放吞掉 → 「继续」后制作再派一次（双扣）", async () => {
    const { root, repository } = setup(["shot-1", "shot-2"]);
    const submits: string[] = [];
    const canvas: string[] = [];
    await scheduler(root, repository, submits, { maxShotsPerRun: 1 }).runToQuiescence();
    clock += ELEVEN_MINUTES;
    await scheduler(root, repository, submits).runToQuiescence();

    // 第一次：画布接手 shot-2（attempt 1 的待发 job 被标 detached / canvas_claimed）。
    canvasGenerates("shot-2", canvas);

    // 用户又让制作返工 shot-2：批了，但 Run 还停着（还没点「继续」），attempt 2 的 job 是 authorized。
    const before = repository.read("project-1", "op-batch")!;
    const rework = prepareProductionGenerationReauthorization({ lease: { projectId: "project-1", immutableProjectUuid: "project-uuid-1", projectGeneration: 1, revocationEpoch: 0 }, projectRevision: 0, run: before, shotId: "shot-2", providers: [countingProvider(submits)], resolveShotPrice: () => ({ known: true, amount: 6 }), now: now() });
    const requested = repository.execute("project-1", "op-batch", { commandId: "rework", expectedRevision: before.revision, type: "generation.reauthorize", payload: { shotId: "shot-2", authorization: rework }, issuedAt: now() }).run;
    repository.execute("project-1", "op-batch", { commandId: "approve-rework", expectedRevision: requested.revision, type: "gate.decide", payload: { gateId: rework.envelope.gateId, status: "approved", receiptId: "receipt-rework", authorizationDigest: rework.authorizationDigest }, issuedAt: now() });

    // 第二次：画布又生成 shot-2。判定口说「归画布」（Run 停着），认领命令被重放吞掉，画布照发。
    expect(decideShotClaim(repository.read("project-1", "op-batch"), "shot-2", "canvas")).toMatchObject({ granted: true, holder: "canvas" });
    canvasGenerates("shot-2", canvas);

    // 用户点「继续」。
    const latest = repository.read("project-1", "op-batch")!;
    applyRunControl(repository, "project-1", "op-batch", latest, { commandId: "resume-2", expectedRevision: latest.revision, type: "run.control", payload: { action: "resume" }, issuedAt: now(), humanGesture: true });
    await scheduler(root, repository, submits).runToQuiescence();

    expect(canvas).toEqual(["canvas:shot-2", "canvas:shot-2"]);
    // 期望：画布第二次接手之后，制作一笔都不再派 shot-2。今天这里是 1。
    expect(productionSubmitsFor(repository, "shot-2")).toBe(0);
  });
});

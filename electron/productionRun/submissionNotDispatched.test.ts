/**
 * 阳性对照：**一个字节都没写出去**的提交，不许被记成「供应商可能已经收下」。
 *
 * 现场（2026-09-18，CI run 35322059157 的夹具连接账本）：服务端按 keep-alive 超时
 * （Node 默认 5s）干净关掉两条空闲连接（`close … hadError=false`），客户端随后从池里
 * 取到其中一条去发第三镜，`fetch()` 抛 `TypeError: fetch failed`，cause 是
 * `SocketError UND_ERR_SOCKET: other side closed`，而**那段时间服务端一个请求都没收到**。
 *
 * 本测试把那一刻逐字复刻成确定性的一次失败（用 CI 上观测到的同一个错误对象形状），
 * 钉住三件事——修之前三件全红：
 *   ① 这一镜落在**确定**的失败态 `needs_attention`（`provider_not_reached`），不是
 *      `submission_unknown`（那一档的意思是「可能已扣费、只能人工对账、绝不自动重提」）；
 *   ② 这一笔的预算预留被 **provider-safe 地释放**（钱一分没花），不是挂成 `unsettled`；
 *   ③ 一镜失败**不带走整批**：兄弟镜照常派发、照常轮询、照常落地，Run 如实落到
 *      `needs_attention` 而不是停在 `running` 装死。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { compileExecutionContract, type PlanCandidate } from "../capabilityCore/executionContract";
import { createModuleRegistry } from "../capabilityCore/moduleRegistry";
import type { GenerationProvider } from "../capabilityCore/generationRuntimeAdapter";
import { createProductionGenerationSubmission } from "./productionGenerationSubmission";
import { sealAndApproveProductionGeneration } from "./productionGenerationAuthorizationTestUtils";
import { createProductionRunRepository } from "./productionRunRepository";
import { createMultiShotBatchScheduler } from "./multiShotBatchScheduler";
import type { ProductionGenerationShot } from "./productionRunTypes";

const roots: string[] = [];
const now = () => new Date(Date.parse("2026-09-18T00:00:00.000Z")).toISOString();

const registry = createModuleRegistry([{
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["text", "image"],
  outputKinds: ["image", "video"],
  modes: ["image-to-video"],
  parameterSchema: {},
  assetInputSchema: { references: { kind: "image", max: 4 } },
  providers: [{
    providerId: "apimart",
    models: [{ modelId: "video-model", modes: ["image-to-video"], parameterSchema: {}, capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true, materialize: true } }],
  }],
}]);

/**
 * CI 上观测到的那个错误对象，逐字段复刻：外壳是 undici 的 `TypeError: fetch failed`，
 * cause 是 `SocketError`，两边字节计数都是 0 —— 这就是「从池里取到一条对面已关的连接、
 * 还没写出一个字节就断了」的形状。
 */
function staleKeepAliveSocketFailure(): Error {
  const cause = Object.assign(new Error("other side closed"), {
    name: "SocketError",
    code: "UND_ERR_SOCKET",
    socket: { bytesWritten: 0, bytesRead: 0 },
  });
  return Object.assign(new TypeError("fetch failed"), { cause });
}

function candidate(id: string, prompt: string): PlanCandidate {
  return { candidateId: id, revision: 1, moduleId: "generation.single-shot", providerId: "apimart", modelId: "video-model", mode: "image-to-video", prompt, parameters: {}, references: [] };
}

function shotEntry(shotId: string, prompt: string): ProductionGenerationShot {
  const cand = candidate(`cand-${shotId}`, prompt);
  const contract = compileExecutionContract(cand, registry);
  return { shotId, candidate: { ...cand, sealedContractHash: contract.contractHash }, contract, approvedReceiptId: "receipt-plan", updatedAt: now() };
}

/** 回环供应商的行为由 `failFor` 决定：它对某一镜的第 n 次提交抛「没写出去」那个错。 */
function provider(submits: string[], failFor: (idempotencyKey: string, attemptIndex: number) => boolean): GenerationProvider {
  const attempts = new Map<string, number>();
  return {
    providerId: "apimart",
    capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true, materialize: true },
    buildRequest: (input) => input,
    submit: async (_request, idempotencyKey) => {
      const index = (attempts.get(idempotencyKey) ?? 0) + 1;
      attempts.set(idempotencyKey, index);
      submits.push(idempotencyKey);
      if (failFor(idempotencyKey, index)) throw staleKeepAliveSocketFailure();
      return { providerTaskId: `task-${submits.length}`, raw: { ok: true } };
    },
    query: async (providerTaskId) => ({ status: "succeeded", raw: { id: providerTaskId, status: "succeeded" } }),
    materialize: async ({ providerTaskId }) => ({ outputs: [{ kind: "video", url: `nomi-local://asset/project-1/${providerTaskId}.png` }] }),
  };
}

function setup(shots: ProductionGenerationShot[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-not-dispatched-"));
  roots.push(root);
  const repository = createProductionRunRepository({ projectDirResolver: (id) => (id === "project-1" ? root : null), now });
  repository.createGenerationDraft({
    operationId: "op-batch", projectId: "project-1", origin: { host: "semantic-mcp" }, candidate: shots[0].candidate,
    policy: { trustedHosts: ["semantic-mcp"], allowedProviders: ["apimart"], allowedModels: ["video-model"], maxSpend: null, maxAttemptsPerJob: 2 },
  });
  sealAndApproveProductionGeneration({
    repository, projectId: "project-1", operationId: "op-batch",
    immutableProjectUuid: "project-uuid-1", projectGeneration: 1, projectRevision: 0,
    candidate: shots[0].candidate, contract: shots[0].contract!,
    providers: [{
      providerId: "apimart",
      capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true, materialize: true },
      buildRequest: (input) => input,
      submit: async () => ({ providerTaskId: "unused" }),
    }],
    multiShot: { shots, planHash: "plan-hash-not-dispatched" },
    resolveShotPrice: () => ({ known: true, amount: 6 }),
    receiptId: "receipt-plan",
    now: now(),
  });
  repository.execute("project-1", "op-batch", { commandId: "submit", expectedRevision: 2, type: "generation.submit", payload: {}, issuedAt: now() });
  return { root, repository };
}

function scheduler(root: string, repository: ReturnType<typeof createProductionRunRepository>, generationProvider: GenerationProvider) {
  const submission = createProductionGenerationSubmission({
    repository, projectRoot: root, immutableProjectUuid: "project-uuid-1", projectGeneration: 1, projectRevision: 0,
    intentMacKey: "test-intent-key", provider: generationProvider,
    materializeOutput: async ({ providerTaskId }) => ({ artifactId: `artifact-${providerTaskId}`, kind: "video", contentHash: `hash-${providerTaskId}`, projectRelativePath: `.nomi/out/${providerTaskId}.png` }),
    now,
  });
  return createMultiShotBatchScheduler({
    repository, submission, projectId: "project-1", runId: "op-batch",
    perShotPrice: () => ({ known: true, amount: 6 }), now,
  });
}

afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe("提交请求根本没写出去时（keep-alive 连接对面已关）", () => {
  it("这一镜进确定的 needs_attention、预留被安全释放、整批不被带走", async () => {
    const shots = [shotEntry("shot-1", "a"), shotEntry("shot-2", "b"), shotEntry("shot-3", "c"), shotEntry("shot-4", "d")];
    const { root, repository } = setup(shots);
    const submits: string[] = [];
    // 只有第三镜、且只在它**每一次**提交时失败：这样即使将来加了「重发一次」，
    // 本条断言的对象（最终仍然失败的那一镜）不会变。
    const failing = provider(submits, (key) => key.includes("shot-3"));

    const outcome = await scheduler(root, repository, failing).runToQuiescence();
    expect(outcome).toBeTruthy(); // ③ 驱动必须正常收口，不是抛出去把整批带走

    const run = repository.read("project-1", "op-batch")!;
    const jobFor = (shotId: string) => run.jobs.find((job) => job.metadata?.shotId === shotId)!;

    // ① 确定态，不是「供应商可能已经收下」
    expect(jobFor("shot-3").status).toBe("needs_attention");
    expect(jobFor("shot-3").errorCode).toBe("provider_not_reached");
    expect(run.jobs.filter((job) => job.status === "submission_unknown")).toHaveLength(0);

    // ② 钱一分没花 ⇒ 预留 provider-safe 释放，不挂成 unsettled
    const ledger = repository.readBudgetLedger("project-1", "op-batch");
    const reservation = Object.entries(ledger.reservations).find(([id]) => id.includes("shot-3"))?.[1];
    expect(reservation?.status).toBe("released");
    expect(run.budget.unsettled).toBe(0);

    // ③ 兄弟镜照常跑完（没被这一镜带走），Run 如实落到 needs_attention 而不是停在 running
    for (const shotId of ["shot-1", "shot-2", "shot-4"]) {
      expect(["ready", "adopted"]).toContain(jobFor(shotId).status);
    }
    expect(run.status).toBe("needs_attention");
  });

  it("只是一次抖动时：同一个幂等键重发一次就过，整批照常跑完（这就是走查里那条红的解）", async () => {
    // 与上一条的唯一区别：这一镜只在**第一次**失败。真实现场就是这一种——
    // 池子里那条死连接被用掉之后，第二次就是一条新连接。
    const shots = [shotEntry("shot-1", "a"), shotEntry("shot-2", "b"), shotEntry("shot-3", "c"), shotEntry("shot-4", "d")];
    const { root, repository } = setup(shots);
    const submits: string[] = [];
    const flaky = provider(submits, (key, index) => key.includes("shot-3") && index === 1);

    await scheduler(root, repository, flaky).runToQuiescence();

    const run = repository.read("project-1", "op-batch")!;
    for (const shotId of ["shot-1", "shot-2", "shot-3", "shot-4"]) {
      expect(["ready", "adopted"]).toContain(run.jobs.find((job) => job.metadata?.shotId === shotId)!.status);
    }
    expect(run.jobs.filter((job) => job.status === "submission_unknown")).toHaveLength(0);
    expect(run.status).not.toBe("needs_attention");
    // 第三镜发了两次，而且是**同一个幂等键**——重发不是第二次下单。
    const shot3 = submits.filter((key) => key.includes("shot-3"));
    expect(shot3).toHaveLength(2);
    expect(new Set(shot3).size).toBe(1);
    // 别的镜各一次，没有被连累重发。
    for (const shotId of ["shot-1", "shot-2", "shot-4"]) {
      expect(submits.filter((key) => key.includes(shotId))).toHaveLength(1);
    }
  });
});

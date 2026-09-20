import { describe, expect, it } from "vitest";

import { compileExecutionContract, type PlanCandidate } from "../capabilityCore/executionContract";
import type { GenerationProvider } from "../capabilityCore/generationRuntimeAdapter";
import { createModuleRegistry } from "../capabilityCore/moduleRegistry";
import { prepareProductionGenerationAuthorization } from "./prepareProductionGenerationAuthorization";
import { applyProductionCommand } from "./productionRunReducer";
import type { ProductionGenerationShot, ProductionRun } from "./productionRunTypes";

// `generation.revise` = 「用户在付费确认卡上改了参数」。
//
// 守的是一条不变量：**收据 = 实际执行**。改了供应商真正会收到的那份载荷，就不许沿用旧授权——
// 否则面板收据上写的和真正跑的会分叉，而用户是照着收据点的头。所以它必须逐字做到
// `trial_narrow` 那五件事：门在等 → 没有 job 越线 → 撤门 → 丢旧 digest 的 job → 清封印回 draft。

const NOW = "2026-09-11T00:00:00.000Z";

const registry = createModuleRegistry([{
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["text"],
  outputKinds: ["image"],
  modes: ["text-to-image"],
  parameterSchema: { aspectRatio: { type: "string" } },
  assetInputSchema: { references: { kind: "image", max: 4 } },
  providers: [{
    providerId: "fixture-provider",
    models: [{
      modelId: "fixture-model",
      modes: ["text-to-image"],
      parameterSchema: {},
      capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
    }],
  }],
}]);

function candidate(candidateId: string, prompt: string): PlanCandidate {
  return {
    candidateId,
    revision: 1,
    moduleId: "generation.single-shot",
    providerId: "fixture-provider",
    modelId: "fixture-model",
    mode: "text-to-image",
    prompt,
    parameters: { aspectRatio: "16:9" },
    references: [],
  };
}

function provider(): GenerationProvider {
  return {
    providerId: "fixture-provider",
    capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
    buildRequest: (input) => input,
    submit: async () => ({ providerTaskId: "unused" }),
  };
}

function draftRun(shots: ProductionGenerationShot[], top: PlanCandidate): ProductionRun {
  return {
    schemaVersion: 1, runId: "op-r", projectId: "project-1", revision: 5,
    status: "draft", stageId: "generate", playbook: { name: "generation.single-shot", version: "1.0.0" },
    origin: { host: "nomi" },
    policy: { trustedHosts: [], allowedProviders: [], allowedModels: [], maxSpend: null, maxAttemptsPerJob: 2, minimizeUploads: true },
    budget: { currency: "CNY", authorized: 0, reserved: 0, actual: 0, unsettled: 0 },
    planVersion: 1, snapshotCursor: 5, stages: [], gates: [], jobs: [], artifacts: [],
    generationPlan: { operationId: "op-r", state: "draft", candidate: top, shots, updatedAt: NOW },
    createdAt: NOW, updatedAt: NOW,
  };
}


function prepare(run: ProductionRun, priceAmount = 3) {
  const plan = run.generationPlan!;
  const shots = plan.shots!.map(shot => {
    if (shot.included === false) return shot;
    const contract = compileExecutionContract(shot.candidate, registry);
    return { ...shot, candidate: { ...shot.candidate, sealedContractHash: contract.contractHash }, contract };
  });
  const contract = compileExecutionContract(plan.candidate, registry);
  const authorization = prepareProductionGenerationAuthorization({
    run,
    lease: { projectId: run.projectId, immutableProjectUuid: "uuid", projectGeneration: 1, revocationEpoch: 0 },
    projectRevision: 0, operation: { operationId: run.runId, projectId: run.projectId, candidate: plan.candidate, planVersion: run.planVersion },
    contract, multiShot: { shots, planHash: "same-content" }, providers: [provider()],
    resolveShotPrice: () => ({ known: true, amount: priceAmount }), maximumSpend: run.policy.maxSpend, now: NOW,
  });
  return { contract, shots, planHash: "same-content", authorization };
}
function apply(run: ProductionRun, type: "generation.seal" | "generation.present", payload: Record<string, unknown>) {
  return applyProductionCommand(run, { commandId: `test-${run.planVersion}-${type}`, expectedRevision: run.revision, type, payload, issuedAt: NOW }, NOW).run;
}
function initial() {
  const a = candidate("cand-a", "shot a");
  const b = candidate("cand-b", "shot b");
  const run = draftRun([
    { shotId: "shot-a", candidate: a, included: true, nodeId: "node-a", updatedAt: NOW },
    { shotId: "shot-b", candidate: b, included: false, nodeId: "node-b", updatedAt: NOW },
  ], a);
  return { ...run, policy: { ...run.policy, maxSpend: 10 } };
}
function settledFirst() {
  const run = initial(); const sealed = apply(run, "generation.seal", prepare(run));
  return { ...sealed, budget: { ...sealed.budget, actual: 3, authorized: 3 },
    jobs: sealed.jobs.map(job => ({ ...job, status: "ready" as const })),
    generationPlan: { ...sealed.generationPlan!, state: "submitted" as const } };
}

describe("successive generation batches", () => {
  it("uses the selected shot as the representative candidate without changing other drafts", () => {
    const run = initial();
    const next = apply(run, "generation.present", { shotIds: ["shot-b"] });
    expect(next.generationPlan!.candidate).toEqual(run.generationPlan!.shots![1].candidate);
    expect(next.generationPlan!.shots!.map(shot => shot.candidate)).toEqual(run.generationPlan!.shots!.map(shot => shot.candidate));
    expect(next.jobs).toEqual(run.jobs);
    expect(next.gates).toEqual(run.gates);
  });
  it("retains the configured hard cap when the first batch costs less", () => {
    const run = initial();
    expect(apply(run, "generation.seal", prepare(run)).policy.maxSpend).toBe(10);
  });
  it("authorizes the next batch cumulatively without losing settled jobs or node identity", () => {
    const first = settledFirst();
    const draft = apply(first, "generation.present", { shotIds: ["shot-b"] });
    const payload = prepare(draft);
    expect(payload.authorization.envelope.budget).toMatchObject({ maximum: 3, ledgerCeiling: 6 });
    const next = apply(draft, "generation.seal", payload);
    expect(next.jobs[0]).toEqual(first.jobs[0]);
    expect(next.jobs[1]).toMatchObject({ attempt: 1, nodeId: "node-b" });
    expect(next.generationPlan!.shots!.map(shot => shot.nodeId)).toEqual(["node-a", "node-b"]);
  });
  it("keeps an exact-cap decimal charge whole in the cumulative authorization envelope", () => {
    const first = settledFirst();
    const withDecimalLiability = {
      ...first,
      budget: { ...first.budget, actual: 10, authorized: 10 },
      policy: { ...first.policy, maxSpend: 10.1 },
    };
    const draft = apply(withDecimalLiability, "generation.present", { shotIds: ["shot-b"] });
    const payload = prepare(draft, 0.1);

    expect(payload.authorization.envelope.budget).toEqual({
      currency: "CNY",
      maximum: 0.1,
      ledgerCeiling: 10.1,
    });
    expect(payload.authorization.envelope.jobs[0].price.maximum).toBe(0.1);
    expect(() => apply(draft, "generation.seal", {
      ...payload,
      shotPrices: [{ shotId: "shot-b", price: { known: true, amount: 0.1 } }],
    })).not.toThrow();
  });
  it("new execution of the same shot receives a new attempt, even with a revised contract", () => {
    const first = settledFirst();
    let draft = apply(first, "generation.present", { shotIds: ["shot-a"] });
    draft = { ...draft, generationPlan: { ...draft.generationPlan!, shots: draft.generationPlan!.shots!.map(shot => shot.shotId === "shot-a" ? { ...shot, candidate: { ...shot.candidate, prompt: "changed", revision: 2 } } : shot) } };
    const payload = prepare(draft);
    expect(payload.authorization.envelope.jobs[0].attempt).toBe(2);
    const next = apply(draft, "generation.seal", payload);
    expect(next.jobs[1].attempt).toBe(2);
    expect(next.generationPlan!.shots![0].attemptCount).toBe(2);
  });
  it.each(["missing", "unknown", "reorder", "candidate", "scope"])("rejects %s seal drift atomically", kind => {
    const run = initial(); const before = JSON.stringify(run); const payload = prepare(run);
    if (kind === "missing") payload.shots.pop();
    if (kind === "unknown") payload.shots[1] = { ...payload.shots[1], shotId: "foreign" };
    if (kind === "reorder") payload.shots.reverse();
    if (kind === "candidate") {
      payload.shots[0] = { ...payload.shots[0], candidate: { ...payload.shots[0].candidate, prompt: "not shown" } };
    }
    if (kind === "scope") payload.shots[1] = { ...payload.shots[1], included: true, contract: payload.shots[0].contract, candidate: payload.shots[0].candidate };
    // Test the common seal boundary independently of envelope validation.
    expect(() => apply(run, "generation.seal", { ...payload, authorization: undefined })).toThrow();
    expect(JSON.stringify(run)).toBe(before);
  });
});

it("carries unbilled successful reservations into the next authorization without relaxing the hard cap", () => {
  const first = settledFirst();
  const unbilled = { ...first, budget: { ...first.budget, actual: 0, reserved: 3 }, policy: { ...first.policy, maxSpend: 5 } };
  const draft = apply(unbilled, "generation.present", { shotIds: ["shot-b"] });
  const payload = prepare(draft);
  expect(payload.authorization.envelope.budget).toMatchObject({ maximum: 2, ledgerCeiling: 5 });
  expect(draft.budget).toEqual(unbilled.budget);
  expect(() => apply(draft, "generation.seal", { ...payload, shotPrices: [{ shotId: "shot-b", price: { known: true, amount: 3 } }] })).toThrow(/hard spend ceiling/);
});

it("does not reopen a cancelled batch with unresolved reservations", () => {
  const first = settledFirst();
  const cancelled = { ...first, status: "cancelled" as const, budget: { ...first.budget, actual: 0, reserved: 3 },
    generationPlan: { ...first.generationPlan!, state: "cancelled" as const }, jobs: first.jobs.map(job => ({ ...job, status: "cancelled_remote" as const })) };
  expect(() => apply(cancelled, "generation.present", { shotIds: ["shot-b"] })).toThrow(/reconciliation_required/);
  const settled = { ...cancelled, budget: { ...cancelled.budget, reserved: 0 } };
  expect(apply(settled, "generation.present", { shotIds: ["shot-b"] })).toMatchObject({ status: "draft", generationPlan: { state: "draft" } });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compileExecutionContract, type PlanCandidate } from "../capabilityCore/executionContract";
import { createModuleRegistry } from "../capabilityCore/moduleRegistry";
import { applyProductionCommand } from "./productionRunReducer";
import { createProductionGenerationSubmission } from "./productionGenerationSubmission";
import { createProductionRunRepository } from "./productionRunRepository";
import type { ProductionGenerationShot, ProductionRun } from "./productionRunTypes";

// P4 S1: multi-shot generationPlan schema + shot addressing.
// TDD: these lock the contract that S1 must satisfy — shot-grained keys never collide, legacy
// single-shot snapshots replay unchanged, per-shot new attempts don't touch sibling shots, and
// attempt monotonicity is scoped to one shot's lineage.

const roots: string[] = [];

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

/** A single-shot draft, sealed + approved, exactly like today's chain. */
function setupSingleShot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-multishot-single-"));
  roots.push(root);
  const repository = createProductionRunRepository({
    projectDirResolver: (projectId) => (projectId === "project-1" ? root : null),
    now: () => "2026-08-24T00:00:00.000Z",
    randomId: (() => { let n = 0; return () => `id-${++n}`; })(),
  });
  const planCandidate = candidate("candidate-1", "A paper boat on a quiet lake");
  const contract = compileExecutionContract(planCandidate, registry);
  repository.createGenerationDraft({
    operationId: "op-1",
    projectId: "project-1",
    origin: { host: "semantic-mcp" },
    candidate: planCandidate,
    policy: {
      trustedHosts: ["semantic-mcp"],
      allowedProviders: ["fixture-provider"],
      allowedModels: ["fixture-model"],
      maxSpend: 0,
      maxAttemptsPerJob: 2,
    },
  });
  repository.execute("project-1", "op-1", {
    commandId: "generation.seal:op-1",
    expectedRevision: 0,
    type: "generation.seal",
    payload: { contract },
    issuedAt: "2026-08-24T00:00:00.000Z",
  });
  repository.execute("project-1", "op-1", {
    commandId: "generation.approve:op-1:receipt-fixture",
    expectedRevision: 1,
    type: "generation.approve",
    payload: { receiptId: "receipt-fixture", contractHash: contract.contractHash },
    issuedAt: "2026-08-24T00:00:00.000Z",
  });
  return { root, repository, contract };
}

function submission(root: string, repository: ReturnType<typeof createProductionRunRepository>, submit: ReturnType<typeof vi.fn>, now = "2026-08-24T00:00:00.000Z") {
  return createProductionGenerationSubmission({
    repository,
    projectRoot: root,
    immutableProjectUuid: "project-uuid-1",
    projectGeneration: 1,
    intentMacKey: "test-intent-key",
    provider: {
      providerId: "fixture-provider",
      capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
      buildRequest: (input) => input,
      submit,
    },
    now: () => now,
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("P4 S1 multi-shot generation plan schema", () => {
  it("keeps the legacy single-shot snapshot (no shots[]) readable and submittable unchanged", async () => {
    const { root, repository, contract } = setupSingleShot();
    // The legacy snapshot has no shots[]. Reading it must expose the top-level plan as before.
    const beforeSubmit = repository.read("project-1", "op-1");
    expect(beforeSubmit?.generationPlan).toMatchObject({ state: "sealed", contract: { contractHash: contract.contractHash } });
    expect(beforeSubmit?.generationPlan?.shots).toBeUndefined();

    const submit = vi.fn(async () => ({ providerTaskId: "provider-task-1", raw: { accepted: true } }));
    const runner = submission(root, repository, submit);
    // A start() with no shotId must address the default (legacy) shot and behave exactly as today.
    await expect(runner.start({ projectId: "project-1", operationId: "op-1" })).resolves.toMatchObject({
      operationId: "op-1",
      providerTaskId: "provider-task-1",
      nextAction: "observe",
    });
    expect(submit).toHaveBeenCalledTimes(1);
    const run = repository.read("project-1", "op-1");
    expect(run?.jobs).toHaveLength(1);
    expect(run?.jobs[0]).toMatchObject({ status: "provider_accepted", providerTaskId: "provider-task-1" });
    // Default-shot jobId keeps the legacy prefix so old callers/tests still match.
    expect(run?.jobs[0]?.jobId).toMatch(/^generation-op-1-/);
  });

  it("gives two shots with identical parameters distinct jobId / providerIdempotencyKey / commandId", async () => {
    // Build a two-shot sealed plan where both shots share the SAME contract hash (identical params).
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-multishot-collide-"));
    roots.push(root);
    const repository = createProductionRunRepository({
      projectDirResolver: (projectId) => (projectId === "project-1" ? root : null),
      now: () => "2026-08-24T00:00:00.000Z",
      randomId: (() => { let n = 0; return () => `id-${++n}`; })(),
    });
    // The realistic collision: the SAME candidate (same id/revision/params/prompt) applied to two
    // shots → identical contract hashes. The old identity keyed only on contractHash would collapse
    // both shots onto one jobId / one provider task. shotId in the derivation must keep them distinct.
    const shotACandidate = candidate("candidate-shared", "Identical shot");
    const shotBCandidate = candidate("candidate-shared", "Identical shot");
    const shotAContract = compileExecutionContract(shotACandidate, registry);
    const shotBContract = compileExecutionContract(shotBCandidate, registry);
    expect(shotAContract.contractHash).toBe(shotBContract.contractHash);

    repository.createGenerationDraft({
      operationId: "op-multi",
      projectId: "project-1",
      origin: { host: "semantic-mcp" },
      candidate: shotACandidate,
      policy: {
        trustedHosts: ["semantic-mcp"],
        allowedProviders: ["fixture-provider"],
        allowedModels: ["fixture-model"],
        maxSpend: 0,
        maxAttemptsPerJob: 2,
      },
    });
    // Seal a two-shot plan. The reducer variant must accept per-shot sealed contracts.
    const shots: ProductionGenerationShot[] = [
      { shotId: "shot-a", candidate: { ...shotACandidate, sealedContractHash: shotAContract.contractHash }, contract: shotAContract, updatedAt: "2026-08-24T00:00:00.000Z" },
      { shotId: "shot-b", candidate: { ...shotBCandidate, sealedContractHash: shotBContract.contractHash }, contract: shotBContract, updatedAt: "2026-08-24T00:00:00.000Z" },
    ];
    repository.execute("project-1", "op-multi", {
      commandId: "generation.seal:op-multi",
      expectedRevision: 0,
      type: "generation.seal",
      payload: { contract: shotAContract, shots, planHash: "plan-hash-multi" },
      issuedAt: "2026-08-24T00:00:00.000Z",
    });
    repository.execute("project-1", "op-multi", {
      commandId: "generation.approve:op-multi:receipt-multi",
      expectedRevision: 1,
      type: "generation.approve",
      payload: { receiptId: "receipt-multi", contractHash: "plan-hash-multi" },
      issuedAt: "2026-08-24T00:00:00.000Z",
    });

    const submit = vi.fn(async () => ({ providerTaskId: `task-${submit.mock.calls.length}` }));
    const runner = submission(root, repository, submit);
    await runner.start({ projectId: "project-1", operationId: "op-multi", shotId: "shot-a" });
    await runner.start({ projectId: "project-1", operationId: "op-multi", shotId: "shot-b" });

    const run = repository.read("project-1", "op-multi")!;
    const jobs = run.jobs;
    expect(jobs).toHaveLength(2);
    const [jobA, jobB] = jobs;
    // #5 identity: two shots with identical parameters must not collide on any derived key.
    expect(jobA.jobId).not.toBe(jobB.jobId);
    expect(jobA.providerIdempotencyKey).toBeDefined();
    expect(jobA.providerIdempotencyKey).not.toBe(jobB.providerIdempotencyKey);
    expect(jobA.executionBinding?.shotId).not.toBe(jobB.executionBinding?.shotId);
    expect(submit).toHaveBeenCalledTimes(2);

    // #4 commandId: the second shot's job.add / budget.authorize must not be swallowed by dedupe.
    // Both provider submissions landed distinct provider tasks → both jobs reached provider_accepted.
    expect(jobA).toMatchObject({ status: "provider_accepted" });
    expect(jobB).toMatchObject({ status: "provider_accepted" });
    expect(jobA.providerTaskId).not.toBe(jobB.providerTaskId);
  });
});

describe("P4 S1 reducer shot addressing", () => {
  const now = "2026-08-24T00:00:00.000Z";

  function sealedTwoShotRun(): ProductionRun {
    const shotACandidate = candidate("cand-a", "shot a");
    const shotBCandidate = candidate("cand-b", "shot b differs");
    const shotAContract = compileExecutionContract(shotACandidate, registry);
    const shotBContract = compileExecutionContract(shotBCandidate, registry);
    return {
      schemaVersion: 1, runId: "op-x", projectId: "project-1", revision: 5,
      status: "draft", stageId: "generate", playbook: { name: "generation.single-shot", version: "1.0.0" },
      origin: { host: "semantic-mcp" },
      policy: { mode: "balanced", trustedHosts: [], allowedProviders: [], allowedModels: [], maxSpend: null, maxAttemptsPerJob: 2, minimizeUploads: true },
      budget: { currency: "CNY", authorized: 0, reserved: 0, actual: 0, unsettled: 0 },
      planVersion: 1, snapshotCursor: 5, stages: [], gates: [], jobs: [], artifacts: [],
      generationPlan: {
        operationId: "op-x",
        state: "sealed",
        candidate: { ...shotACandidate, sealedContractHash: shotAContract.contractHash },
        contract: shotAContract,
        planHash: "plan-hash-x",
        approvedReceiptId: "receipt-x",
        shots: [
          { shotId: "shot-a", candidate: { ...shotACandidate, sealedContractHash: shotAContract.contractHash }, contract: shotAContract, approvedReceiptId: "receipt-x", attemptCount: 1, updatedAt: now },
          { shotId: "shot-b", candidate: { ...shotBCandidate, sealedContractHash: shotBContract.contractHash }, contract: shotBContract, approvedReceiptId: "receipt-x", attemptCount: 1, updatedAt: now },
        ],
        updatedAt: now,
      },
      createdAt: now, updatedAt: now,
    };
  }

  it("a per-shot new attempt keeps the plan-level receipt and the sibling shot untouched", () => {
    const run = sealedTwoShotRun();
    const shotAContract = run.generationPlan!.shots![0].contract!;
    const job = {
      jobId: "generation-op-x-shot-a-a-attempt-2", stageId: "generate", status: "authorized" as const, attempt: 2,
      provider: "fixture-provider", model: "fixture-model", idempotencyKey: "generation:op-x:shot-a:some:attempt-2",
      taskKind: "text-to-image", createdAt: now, updatedAt: now,
    };
    const effect = applyProductionCommand(run, {
      commandId: "new-attempt-shot-a", expectedRevision: 5, type: "generation.new_attempt",
      payload: { job, shotId: "shot-a" }, issuedAt: now,
    }, now);

    // Plan-level receipt approval is preserved (not cleared by a per-shot attempt).
    expect(effect.run.generationPlan?.approvedReceiptId).toBe("receipt-x");
    // Only shot-a's per-shot approval is reset; shot-b keeps its receipt.
    const shotA = effect.run.generationPlan?.shots?.find((s) => s.shotId === "shot-a");
    const shotB = effect.run.generationPlan?.shots?.find((s) => s.shotId === "shot-b");
    expect(shotA?.approvedReceiptId).toBeUndefined();
    expect(shotA?.attemptCount).toBe(2);
    expect(shotB?.approvedReceiptId).toBe("receipt-x");
    expect(shotB?.attemptCount).toBe(1);
    expect(effect.run.jobs.map((j) => j.jobId)).toContain(job.jobId);
    void shotAContract;
  });

  it("scopes attempt monotonicity to the shot lineage: shot A attempt 2 does not block shot B attempt 2", () => {
    // shot A already has an attempt-2 job for the same provider/model/stage.
    const run = sealedTwoShotRun();
    const withShotAAttempt2: ProductionRun = {
      ...run,
      jobs: [
        { jobId: "generation-op-x-shot-a-a-attempt-2", stageId: "generate", status: "provider_accepted", attempt: 2, provider: "fixture-provider", model: "fixture-model", idempotencyKey: "k-a-2", createdAt: now, updatedAt: now },
      ],
    };
    const shotBJob = {
      jobId: "generation-op-x-shot-b-b-attempt-2", stageId: "generate", status: "authorized" as const, attempt: 2,
      provider: "fixture-provider", model: "fixture-model", idempotencyKey: "generation:op-x:shot-b:x:attempt-2",
      taskKind: "text-to-image", createdAt: now, updatedAt: now,
    };
    // Same provider/model/stage AND same attempt number as shot A's job — but a DIFFERENT shot.
    // The global comparison would reject this; the shot-scoped check must allow it.
    expect(() => applyProductionCommand(withShotAAttempt2, {
      commandId: "new-attempt-shot-b", expectedRevision: 5, type: "generation.new_attempt",
      payload: { job: shotBJob, shotId: "shot-b" }, issuedAt: now,
    }, now)).not.toThrow();
  });

  it("still rejects a stale attempt within the SAME shot lineage", () => {
    const run = sealedTwoShotRun();
    const withShotAAttempt2: ProductionRun = {
      ...run,
      jobs: [
        { jobId: "generation-op-x-shot-a-a-attempt-2", stageId: "generate", status: "provider_accepted", attempt: 2, provider: "fixture-provider", model: "fixture-model", idempotencyKey: "k-a-2", metadata: { shotId: "shot-a" }, createdAt: now, updatedAt: now },
      ],
    };
    // A second attempt-2 job for the SAME shot must still be rejected (monotonicity within lineage).
    const dupShotAJob = {
      jobId: "generation-op-x-shot-a-a-attempt-2-dup", stageId: "generate", status: "authorized" as const, attempt: 2,
      provider: "fixture-provider", model: "fixture-model", idempotencyKey: "generation:op-x:shot-a:y:attempt-2",
      metadata: { shotId: "shot-a" }, taskKind: "text-to-image", createdAt: now, updatedAt: now,
    };
    expect(() => applyProductionCommand(withShotAAttempt2, {
      commandId: "new-attempt-shot-a-dup", expectedRevision: 5, type: "generation.new_attempt",
      payload: { job: dupShotAJob, shotId: "shot-a" }, issuedAt: now,
    }, now)).toThrow(/attempt/);
  });

  it("patches one shot's candidate + included flag without touching sibling shots (draft)", () => {
    const shotACandidate = candidate("cand-a", "shot a");
    const shotBCandidate = candidate("cand-b", "shot b");
    const draft: ProductionRun = {
      schemaVersion: 1, runId: "op-patch", projectId: "project-1", revision: 3,
      status: "draft", stageId: "generate", playbook: { name: "generation.single-shot", version: "1.0.0" },
      origin: { host: "semantic-mcp" },
      policy: { mode: "balanced", trustedHosts: [], allowedProviders: [], allowedModels: [], maxSpend: null, maxAttemptsPerJob: 2, minimizeUploads: true },
      budget: { currency: "CNY", authorized: 0, reserved: 0, actual: 0, unsettled: 0 },
      planVersion: 1, snapshotCursor: 3, stages: [], gates: [], jobs: [], artifacts: [],
      generationPlan: {
        operationId: "op-patch", state: "draft", candidate: shotACandidate,
        shots: [
          { shotId: "shot-a", candidate: shotACandidate, updatedAt: now },
          { shotId: "shot-b", candidate: shotBCandidate, updatedAt: now },
        ],
        updatedAt: now,
      },
      createdAt: now, updatedAt: now,
    };
    const effect = applyProductionCommand(draft, {
      commandId: "patch-shot-a", expectedRevision: 3, type: "generation.patch",
      payload: { shotId: "shot-a", patch: { prompt: "shot a revised" }, included: false }, issuedAt: now,
    }, now);
    const shotA = effect.run.generationPlan?.shots?.find((s) => s.shotId === "shot-a");
    const shotB = effect.run.generationPlan?.shots?.find((s) => s.shotId === "shot-b");
    expect(shotA?.candidate.prompt).toBe("shot a revised");
    expect(shotA?.candidate.revision).toBe(2);
    expect(shotA?.included).toBe(false);
    // Sibling shot untouched.
    expect(shotB?.candidate.prompt).toBe("shot b");
    expect(shotB?.candidate.revision).toBe(1);
    expect(shotB?.included).toBeUndefined();
  });

  it("seals only the included shots into per-shot contracts", () => {
    // A draft plan with three shots, one of them excluded (included: false).
    const shotACandidate = candidate("cand-a", "shot a");
    const shotBCandidate = candidate("cand-b", "shot b");
    const shotCCandidate = candidate("cand-c", "shot c");
    const draft: ProductionRun = {
      schemaVersion: 1, runId: "op-inc", projectId: "project-1", revision: 2,
      status: "draft", stageId: "generate", playbook: { name: "generation.single-shot", version: "1.0.0" },
      origin: { host: "semantic-mcp" },
      policy: { mode: "balanced", trustedHosts: [], allowedProviders: [], allowedModels: [], maxSpend: null, maxAttemptsPerJob: 2, minimizeUploads: true },
      budget: { currency: "CNY", authorized: 0, reserved: 0, actual: 0, unsettled: 0 },
      planVersion: 1, snapshotCursor: 2, stages: [], gates: [], jobs: [], artifacts: [],
      generationPlan: {
        operationId: "op-inc", state: "draft", candidate: shotACandidate,
        shots: [
          { shotId: "shot-a", candidate: shotACandidate, included: true, updatedAt: now },
          { shotId: "shot-b", candidate: shotBCandidate, included: false, updatedAt: now },
          { shotId: "shot-c", candidate: shotCCandidate, updatedAt: now },
        ],
        updatedAt: now,
      },
      createdAt: now, updatedAt: now,
    };
    const shotAContract = compileExecutionContract({ ...shotACandidate }, registry);
    const shotCContract = compileExecutionContract({ ...shotCCandidate }, registry);
    const sealShots: ProductionGenerationShot[] = [
      { shotId: "shot-a", candidate: { ...shotACandidate, sealedContractHash: shotAContract.contractHash }, contract: shotAContract, included: true, updatedAt: now },
      { shotId: "shot-b", candidate: shotBCandidate, included: false, updatedAt: now },
      { shotId: "shot-c", candidate: { ...shotCCandidate, sealedContractHash: shotCContract.contractHash }, contract: shotCContract, updatedAt: now },
    ];
    const effect = applyProductionCommand(draft, {
      commandId: "seal-inc", expectedRevision: 2, type: "generation.seal",
      payload: { contract: shotAContract, shots: sealShots, planHash: "plan-hash-inc" }, issuedAt: now,
    }, now);

    const sealed = effect.run.generationPlan!;
    expect(sealed.state).toBe("sealed");
    const included = (sealed.shots ?? []).filter((shot) => shot.included !== false);
    // Only included shots carry a sealed contract; excluded shots do not.
    expect(included.map((shot) => shot.shotId).sort()).toEqual(["shot-a", "shot-c"]);
    expect(sealed.shots?.find((s) => s.shotId === "shot-b")?.contract).toBeUndefined();
    expect(sealed.shots?.find((s) => s.shotId === "shot-a")?.contract?.contractHash).toBe(shotAContract.contractHash);
  });

  it("P4 S4 trial_narrow: shrinks a sealed multi-shot plan to only the first included video shot", () => {
    // A sealed 2-video-shot plan (shot-a, shot-b) + a plan-level receipt. Trial-first narrows to shot-a.
    const run = sealedTwoShotRun();
    const effect = applyProductionCommand(run, {
      commandId: "trial", expectedRevision: 5, type: "generation.trial_narrow",
      payload: { planHash: "plan-hash-trial" }, issuedAt: now,
    }, now);

    const narrowed = effect.run.generationPlan!;
    expect(narrowed.state).toBe("sealed");
    expect(narrowed.planHash).toBe("plan-hash-trial");
    // Only shot-a stays included; shot-b is excluded.
    expect(narrowed.shots?.find((s) => s.shotId === "shot-a")?.included).toBe(true);
    expect(narrowed.shots?.find((s) => s.shotId === "shot-b")?.included).toBe(false);
    // The plan-level receipt is cleared — a trial re-gate must re-confirm the smaller scope.
    expect(narrowed.approvedReceiptId).toBeUndefined();
    expect(narrowed.shots?.find((s) => s.shotId === "shot-a")?.approvedReceiptId).toBeUndefined();
  });

  it("P4 S4 trial_narrow: keeps anchors included (the trial still needs the identity image)", () => {
    const anchorCandidate = candidate("cand-anchor", "hero look");
    const shotACandidate = candidate("cand-a", "shot a");
    const anchorContract = compileExecutionContract(anchorCandidate, registry);
    const shotAContract = compileExecutionContract(shotACandidate, registry);
    const run: ProductionRun = {
      schemaVersion: 1, runId: "op-anchor", projectId: "project-1", revision: 4,
      status: "draft", stageId: "generate", playbook: { name: "generation.single-shot", version: "1.0.0" },
      origin: { host: "semantic-mcp" },
      policy: { mode: "balanced", trustedHosts: [], allowedProviders: [], allowedModels: [], maxSpend: null, maxAttemptsPerJob: 2, minimizeUploads: true },
      budget: { currency: "CNY", authorized: 0, reserved: 0, actual: 0, unsettled: 0 },
      planVersion: 1, snapshotCursor: 4, stages: [], gates: [], jobs: [], artifacts: [],
      generationPlan: {
        operationId: "op-anchor", state: "sealed", candidate: { ...anchorCandidate, sealedContractHash: anchorContract.contractHash }, contract: anchorContract,
        planHash: "plan-hash-anchor", approvedReceiptId: "receipt-x",
        shots: [
          { shotId: "anchor-1", role: "anchor", candidate: { ...anchorCandidate, sealedContractHash: anchorContract.contractHash }, contract: anchorContract, approvedReceiptId: "receipt-x", updatedAt: now },
          { shotId: "shot-a", candidate: { ...shotACandidate, sealedContractHash: shotAContract.contractHash }, contract: shotAContract, approvedReceiptId: "receipt-x", updatedAt: now },
          { shotId: "shot-b", candidate: { ...candidate("cand-b", "shot b"), sealedContractHash: "h-b" }, contract: { ...shotAContract, contractHash: "h-b" }, approvedReceiptId: "receipt-x", updatedAt: now },
        ],
        updatedAt: now,
      },
      createdAt: now, updatedAt: now,
    };
    const effect = applyProductionCommand(run, {
      commandId: "trial-anchor", expectedRevision: 4, type: "generation.trial_narrow",
      payload: { planHash: "plan-hash-trial-anchor" }, issuedAt: now,
    }, now);
    const narrowed = effect.run.generationPlan!;
    expect(narrowed.shots?.find((s) => s.shotId === "anchor-1")?.included).not.toBe(false); // anchor kept
    expect(narrowed.shots?.find((s) => s.shotId === "shot-a")?.included).toBe(true); // first video kept
    expect(narrowed.shots?.find((s) => s.shotId === "shot-b")?.included).toBe(false); // rest excluded
  });
});

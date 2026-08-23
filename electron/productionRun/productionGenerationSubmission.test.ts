import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compileExecutionContract, type PlanCandidate } from "../capabilityCore/executionContract";
import { createModuleRegistry } from "../capabilityCore/moduleRegistry";
import {
  SubmissionReceiptUnknownError,
  SubmissionReconciliationRequiredError,
  createProductionGenerationSubmission,
} from "./productionGenerationSubmission";
import { createProductionRunRepository } from "./productionRunRepository";

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

function candidate(): PlanCandidate {
  return {
    candidateId: "candidate-1",
    revision: 1,
    moduleId: "generation.single-shot",
    providerId: "fixture-provider",
    modelId: "fixture-model",
    mode: "text-to-image",
    prompt: "A paper boat on a quiet lake",
    parameters: { aspectRatio: "16:9" },
    references: [],
  };
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-generation-submit-"));
  roots.push(root);
  const repository = createProductionRunRepository({
    projectDirResolver: (projectId) => projectId === "project-1" ? root : null,
    now: () => "2026-08-23T00:00:00.000Z",
    randomId: (() => { let n = 0; return () => `id-${++n}`; })(),
  });
  const planCandidate = candidate();
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
      maxAttemptsPerJob: 1,
    },
  });
  repository.execute("project-1", "op-1", {
    commandId: "generation.seal:op-1",
    expectedRevision: 0,
    type: "generation.seal",
    payload: { contract },
    issuedAt: "2026-08-23T00:00:00.000Z",
  });
  repository.execute("project-1", "op-1", {
    commandId: "generation.approve:op-1:receipt-fixture",
    expectedRevision: 1,
    type: "generation.approve",
    payload: { receiptId: "receipt-fixture", contractHash: contract.contractHash },
    issuedAt: "2026-08-23T00:00:00.000Z",
  });
  return { root, repository, contract };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("Run-owned semantic generation submission", () => {
  it("seals the envelope, submits once, persists provider acceptance, and survives restart", async () => {
    const { root, repository, contract } = setup();
    const submit = vi.fn(async () => ({ providerTaskId: "provider-task-1", raw: { accepted: true } }));
    const first = createProductionGenerationSubmission({
      repository,
      projectRoot: root,
      immutableProjectUuid: "project-uuid-1",
      projectGeneration: 1,
      intentMacKey: "test-intent-key",
      provider: {
        providerId: "fixture-provider",
        capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
        buildRequest: (input) => ({ model: input.modelId, prompt: input.prompt, parameters: input.parameters }),
        submit,
      },
      now: () => "2026-08-23T00:00:00.000Z",
    });

    await expect(first.start({ projectId: "project-1", operationId: "op-1" })).resolves.toMatchObject({
      operationId: "op-1",
      providerTaskId: "provider-task-1",
      nextAction: "observe",
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(repository.read("project-1", "op-1")).toMatchObject({
      generationPlan: { state: "submitted", contract: { contractHash: contract.contractHash } },
      jobs: [{ status: "provider_accepted", providerTaskId: "provider-task-1" }],
    });

    const restartedSubmit = vi.fn(async () => ({ providerTaskId: "provider-task-2" }));
    const restarted = createProductionGenerationSubmission({
      repository,
      projectRoot: root,
      immutableProjectUuid: "project-uuid-1",
      projectGeneration: 1,
      intentMacKey: "test-intent-key",
      provider: {
        providerId: "fixture-provider",
        capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
        buildRequest: (input) => input,
        submit: restartedSubmit,
      },
      now: () => "2026-08-23T00:01:00.000Z",
    });
    await expect(restarted.start({ projectId: "project-1", operationId: "op-1" })).resolves.toMatchObject({
      providerTaskId: "provider-task-1",
      nextAction: "observe",
    });
    expect(restartedSubmit).not.toHaveBeenCalled();
  });

  it("turns a lost provider receipt into reconcile-only state and never retries", async () => {
    const { root, repository } = setup();
    const submit = vi.fn(async () => ({ providerTaskId: "provider-task-1" }));
    const first = createProductionGenerationSubmission({
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
      afterProviderAcceptance: () => { throw new Error("crash after provider accepted"); },
      now: () => "2026-08-23T00:00:00.000Z",
    });

    await expect(first.start({ projectId: "project-1", operationId: "op-1" })).rejects.toBeInstanceOf(SubmissionReceiptUnknownError);
    expect(repository.read("project-1", "op-1")).toMatchObject({ jobs: [{ status: "submission_unknown" }] });

    const restartedSubmit = vi.fn(async () => ({ providerTaskId: "provider-task-2" }));
    const restarted = createProductionGenerationSubmission({
      repository,
      projectRoot: root,
      immutableProjectUuid: "project-uuid-1",
      projectGeneration: 1,
      intentMacKey: "test-intent-key",
      registry,
      provider: {
        providerId: "fixture-provider",
        capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
        buildRequest: (input) => input,
        submit: restartedSubmit,
      },
      now: () => "2026-08-23T00:01:00.000Z",
    });
    await expect(restarted.start({ projectId: "project-1", operationId: "op-1" })).rejects.toBeInstanceOf(SubmissionReconciliationRequiredError);
    expect(restartedSubmit).not.toHaveBeenCalled();
    await expect(restarted.resume({ projectId: "project-1", operationId: "op-1" })).resolves.toMatchObject({ action: "reconcile" });
  });

  it("can resume after a crash before dispatch only with an explicit not-submitted disposition", async () => {
    const { root, repository } = setup();
    const beforeDispatch = vi.fn(() => { throw new Error("crash before dispatch"); });
    const firstSubmit = vi.fn(async () => ({ providerTaskId: "provider-task-1" }));
    const first = createProductionGenerationSubmission({
      repository,
      projectRoot: root,
      immutableProjectUuid: "project-uuid-1",
      projectGeneration: 1,
      intentMacKey: "test-intent-key",
      provider: {
        providerId: "fixture-provider",
        capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
        buildRequest: (input) => input,
        submit: firstSubmit,
      },
      beforeDispatch,
      now: () => "2026-08-23T00:00:00.000Z",
    });
    await expect(first.start({ projectId: "project-1", operationId: "op-1" })).rejects.toThrow("crash before dispatch");
    expect(firstSubmit).not.toHaveBeenCalled();
    expect(repository.read("project-1", "op-1")).toMatchObject({ jobs: [{ status: "submit_intent_persisted" }] });

    const secondSubmit = vi.fn(async () => ({ providerTaskId: "provider-task-1" }));
    const resumed = createProductionGenerationSubmission({
      repository,
      projectRoot: root,
      immutableProjectUuid: "project-uuid-1",
      projectGeneration: 1,
      intentMacKey: "test-intent-key",
      provider: {
        providerId: "fixture-provider",
        capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
        buildRequest: (input) => input,
        submit: secondSubmit,
      },
      now: () => "2026-08-23T00:01:00.000Z",
    });
    await expect(resumed.resume({ projectId: "project-1", operationId: "op-1", definitelyNotSubmitted: true })).resolves.toMatchObject({ action: "dispatch", providerTaskId: "provider-task-1" });
    expect(secondSubmit).toHaveBeenCalledTimes(1);
  });

  it("blocks a provider without native recovery capabilities before creating a job or intent", async () => {
    const { root, repository, contract } = setup();
    const submit = vi.fn(async () => ({ providerTaskId: "should-not-run" }));
    const runner = createProductionGenerationSubmission({
      repository,
      projectRoot: root,
      immutableProjectUuid: "project-uuid-1",
      projectGeneration: 1,
      intentMacKey: "test-intent-key",
      provider: {
        providerId: "fixture-provider",
        capabilities: { submitIdempotency: false, query: true, reconcile: true, cancel: true },
        buildRequest: (input) => input,
        submit,
      },
      now: () => "2026-08-23T00:00:00.000Z",
    });
    await expect(runner.start({ projectId: "project-1", operationId: "op-1" })).rejects.toMatchObject({ code: "provider_capability_missing" });
    expect(submit).not.toHaveBeenCalled();
    expect(repository.read("project-1", "op-1")).toMatchObject({ generationPlan: { contract: { contractHash: contract.contractHash } }, jobs: [] });
  });
});

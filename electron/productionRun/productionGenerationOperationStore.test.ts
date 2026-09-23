import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { compileExecutionContract } from "../capabilityCore/executionContract";
import { createModuleRegistry } from "../capabilityCore/moduleRegistry";
import { createProductionRunRepository } from "./productionRunRepository";
import { createProductionGenerationOperationStore } from "./productionGenerationOperationStore";
import { createProductionRunService } from "./productionRunService";

const roots: string[] = [];
const registry = createModuleRegistry([{
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["text"],
  outputKinds: ["image"],
  modes: ["text-to-image"],
  parameterSchema: {},
  assetInputSchema: { references: { kind: "image", max: 4 } },
  providers: [{
    providerId: "fixture-provider",
    models: [{ modelId: "fixture-model", modes: ["text-to-image"], parameterSchema: {}, capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true } }],
  }],
}]);

function candidate() {
  return {
    candidateId: "candidate-1", revision: 1, moduleId: "generation.single-shot", providerId: "fixture-provider", modelId: "fixture-model", mode: "text-to-image", prompt: "A paper boat", parameters: {}, references: [],
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("ProductionRun-owned generation operation store", () => {
  /**
   * 花钱轴的一条静默故障：`generation.present`（用户在卡上改勾选）会把**顶层候选**重写成
   * 「第一个被勾上的那一镜」，而顶层改草稿的幂等键当时是 `generation.patch:<op>:<顶层候选 revision>`。
   * 于是「改一版 → 改勾选 → 再改一版」会撞上第一次的键，被命令存储当成重放吃掉：
   * 用户按了、界面没反应、报价卡还印着旧参数。**一个纯粹的勾选动作，不该改变任何一条键的身份。**
   */
  it("改勾选之后再改草稿，不会被当成第一次的重放吃掉（幂等键不随勾选漂移）", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-generation-present-key-"));
    roots.push(root);
    const repository = createProductionRunRepository({ projectDirResolver: () => root, now: () => "2026-09-21T00:00:00.000Z" });
    const service = createProductionRunService({ repository, projectRootResolver: () => root, sleep: async () => {} });
    const operations = createProductionGenerationOperationStore(service);
    const shot = (id: string) => ({ shotId: id, candidate: { ...candidate(), candidateId: id }, updatedAt: "2026-09-21T00:00:00.000Z" });
    await operations.create({
      operationId: "op-present", projectId: "project-1", candidate: { ...candidate(), candidateId: "shot-a" },
      shots: [shot("shot-a"), shot("shot-b")], now: "2026-09-21T00:00:00.000Z",
    });

    const first = await operations.patch("project-1", "op-present", { prompt: "第一版" }, "2026-09-21T00:00:01.000Z");
    expect(first.candidate.prompt).toBe("第一版");

    // 用户在卡上只改了勾选：取消第一镜、只留第二镜。没有改任何创作内容。
    await operations.present("project-1", "op-present", "2026-09-21T00:00:02.000Z", ["shot-b"]);

    const second = await operations.patch("project-1", "op-present", { prompt: "第二版" }, "2026-09-21T00:00:03.000Z");
    expect(second.candidate.prompt, "改勾选之后的这一版必须真的落下去，而不是被当成上一条命令的重放").toBe("第二版");
  });


  it("persists create, edit, seal and restart reads through the Run event log", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-generation-run-store-"));
    roots.push(root);
    const repository = createProductionRunRepository({ projectDirResolver: () => root, now: () => "2026-08-23T00:00:00.000Z" });
    const service = createProductionRunService({ repository, projectRootResolver: () => root, sleep: async () => {} });
    const operations = createProductionGenerationOperationStore(service);
    const created = await operations.create({ operationId: "op-1", projectId: "project-1", candidate: candidate(), now: "2026-08-23T00:00:00.000Z" });
    expect(created).toMatchObject({ operationId: "op-1", state: "draft", candidate: { revision: 1 } });

    const edited = await operations.patch("project-1", "op-1", { mode: "text-to-image", prompt: "A red paper boat" }, "2026-08-23T00:00:01.000Z");
    expect(edited).toMatchObject({ candidate: { revision: 2, prompt: "A red paper boat" } });
    const contract = compileExecutionContract(edited.candidate, registry);
    const sealed = await operations.seal("project-1", "op-1", contract, "2026-08-23T00:00:02.000Z");
    expect(sealed).toMatchObject({ state: "sealed", contract: { contractHash: contract.contractHash } });
    // Approval is owned by the Run authority, not by a second operation-store
    // history. Exercise the same durable command that the signed gate uses.
    const approving = service.readFull("project-1", "op-1");
    const approved = await service.command("project-1", "op-1", {
      commandId: "generation.approve:op-1:receipt-1",
      expectedRevision: approving.revision,
      type: "generation.approve",
      payload: { receiptId: "receipt-1", contractHash: contract.contractHash },
      issuedAt: "2026-08-23T00:00:02.500Z",
    });
    expect(approved.run.generationPlan).toMatchObject({ state: "sealed", approvedReceiptId: "receipt-1" });

    const restartedService = createProductionRunService({
      repository: createProductionRunRepository({ projectDirResolver: () => root, now: () => "2026-08-23T00:00:03.000Z" }),
      projectRootResolver: () => root,
      sleep: async () => {},
    });
    expect(createProductionGenerationOperationStore(restartedService).read("project-1", "op-1")).toMatchObject({ state: "sealed", approvedReceiptId: "receipt-1", contract: { contractHash: contract.contractHash } });
  });

  it("persists the authenticated transport origin instead of replacing it with a semantic default", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-generation-origin-"));
    roots.push(root);
    const repository = createProductionRunRepository({ projectDirResolver: () => root, now: () => "2026-08-23T00:00:00.000Z" });
    const service = createProductionRunService({ repository, projectRootResolver: () => root, sleep: async () => {} });
    const operations = createProductionGenerationOperationStore(service);

    await operations.create({
      operationId: "op-origin",
      projectId: "project-1",
      origin: { host: "codex", actorId: "client-1" },
      candidate: candidate(),
      now: "2026-08-23T00:00:00.000Z",
    });

    expect(service.readFull("project-1", "op-origin")).toMatchObject({
      origin: { host: "codex", actorId: "client-1" },
      policy: { trustedHosts: ["codex"], allowedProviders: ["fixture-provider"], allowedModels: ["fixture-model"] },
    });
  });

  it("inherits live automation budget and retry policy for semantic drafts", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-generation-policy-"));
    roots.push(root);
    const repository = createProductionRunRepository({ projectDirResolver: () => root, now: () => "2026-08-23T00:00:00.000Z" });
    const service = createProductionRunService({
      repository,
      projectRootResolver: () => root,
      sleep: async () => {},
      policyResolver: () => ({
        maxSpend: 100,
        maxAttemptsPerJob: 2,
        trustedHosts: ["nomi"],
        allowedProviders: ["fixture-provider"],
        allowedModels: ["fixture-model"],
        minimizeUploads: false,
      }),
    });
    const operations = createProductionGenerationOperationStore(service);

    await operations.create({ operationId: "op-policy", projectId: "project-1", origin: { host: "codex" }, candidate: candidate(), now: "2026-08-23T00:00:00.000Z" });

    expect(service.readFull("project-1", "op-policy").policy).toMatchObject({
      maxSpend: 100,
      maxAttemptsPerJob: 2,
      minimizeUploads: false,
      // The semantic operation still narrows the configured allowlist to the
      // authenticated candidate and transport origin.
      trustedHosts: ["codex"],
      allowedProviders: ["fixture-provider"],
      allowedModels: ["fixture-model"],
    });
  });
});


it('rejects writes whose captured source document no longer matches the Run', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-storyboard-target-')); roots.push(root);
  const repository = createProductionRunRepository({ projectDirResolver: () => root });
  const service = createProductionRunService({ repository, projectRootResolver: () => root, sleep: async () => {} });
  const operations = createProductionGenerationOperationStore(service);
  const target = { projectId: 'project-1', sourceDocumentId: 'doc-a', sourceDocumentRevision: 3, sourceDocumentContentHash: 'hash-a',
    targetKind: 'storyboard' as const, requestId: 'request-a', plans: [{ id: 'op-a', title: 'Plan' }] };
  await operations.create({ operationId: 'op-a', projectId: 'project-1', candidate: candidate(), now: '2026-09-19T00:00:00Z',
    origin: { host: 'nomi', sourceDocument: { documentId: 'doc-a', revision: 3, contentHash: 'hash-a' } } });
  await operations.patch('project-1', 'op-a', { prompt: 'first saved edit' }, '2026-09-19T00:00:01Z', undefined, target);
  for (const mismatch of [{ sourceDocumentId: 'doc-b' }, { sourceDocumentRevision: 4 }, { sourceDocumentContentHash: 'hash-b' }]) {
    await expect(operations.patch('project-1', 'op-a', { prompt: 'wrong source' }, '2026-09-19T00:00:03Z', undefined, { ...target, ...mismatch })).rejects.toThrow('storyboard_target_stale');
  }
  // Two edits in a row from the same request are ordinary, not a conflict: the plan the user sees
  // is the project record's, and its own owner arbitrates concurrent writes.
  const second = await operations.patch('project-1', 'op-a', { prompt: 'second saved edit' }, '2026-09-19T00:00:04Z', undefined, target);
  expect(second).toMatchObject({ runRevision: 2, candidate: { prompt: 'second saved edit' } });
});

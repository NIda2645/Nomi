import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { CatalogGenerationProviderError } from "../capabilityCore/apimartGenerationProvider";
import { compileExecutionContract, type PlanCandidate } from "../capabilityCore/executionContract";
import { createModuleRegistry } from "../capabilityCore/moduleRegistry";
import type { GenerationProvider } from "../capabilityCore/generationRuntimeAdapter";
import { sealAndApproveProductionGeneration } from "./productionGenerationAuthorizationTestUtils";
import { createProductionGenerationSubmission } from "./productionGenerationSubmission";
import { createProductionRunRepository } from "./productionRunRepository";
import { SubmissionReceiptUnknownError, SubmissionReconciliationRequiredError } from "./submissionOutbox";

// 特征测试（发动机收敛第一刀 第 1–2 步动手前钉住，设计卡岔路 F3）：
// 制作那台今天把「供应商当场明确拒绝」（HTTP 4xx / 信封错误码——真实执行器抛的就是这一类错）
// 和「写出去之后断了」记成同一档：submission_unknown，这一镜之后再发就被拦（要人去核对）。
// 画布那台对同一件事是「失败、可以再点 ↑」（canvasSingleSubmitCharacterization.test.ts）。
// 两台合进一个口子之前，这一格必须拍板；拍板后按结论改这里的断言，不许悄悄变。

const CAPS = { submitIdempotency: false, query: true, reconcile: false, cancel: false, materialize: true } as const;
const registry = createModuleRegistry([{
  moduleId: "generation.single-shot", version: "1.0.0", inputKinds: ["text"], outputKinds: ["image"], modes: ["text-to-image"],
  parameterSchema: {}, assetInputSchema: { references: { kind: "image", max: 4 } },
  providers: [{ providerId: "apimart", models: [{ modelId: "img", modes: ["text-to-image"], parameterSchema: {}, capabilities: CAPS }] }],
}]);
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function rejectingProvider(submits: string[]): GenerationProvider {
  return {
    providerId: "apimart", capabilities: CAPS, buildRequest: (input) => input,
    submit: async (_request, key) => {
      submits.push(key);
      throw new CatalogGenerationProviderError("apimart create rejected the request: prompt violates content policy");
    },
  };
}

describe("制作那台：供应商当场明确拒绝", () => {
  it("今天记成「结果未知」，这一镜不能再发（F3）", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-provider-rejection-"));
    roots.push(root);
    const now = () => "2026-10-05T00:00:00.000Z";
    const repository = createProductionRunRepository({ projectDirResolver: (id) => (id === "p" ? root : null), now });
    const cand: PlanCandidate = { candidateId: "c-1", revision: 1, moduleId: "generation.single-shot", providerId: "apimart", modelId: "img", mode: "text-to-image", prompt: "a red cube", parameters: {}, references: [] };
    const contract = compileExecutionContract(cand, registry);
    const candidate = { ...cand, sealedContractHash: contract.contractHash };
    repository.createGenerationDraft({ operationId: "op-1", projectId: "p", origin: { host: "semantic-mcp" }, candidate, policy: { trustedHosts: ["semantic-mcp"], allowedProviders: ["apimart"], allowedModels: ["img"], maxSpend: null, maxAttemptsPerJob: 3 } });
    const submits: string[] = [];
    const provider = rejectingProvider(submits);
    sealAndApproveProductionGeneration({ repository, projectId: "p", operationId: "op-1", immutableProjectUuid: "u", projectGeneration: 1, projectRevision: 0, candidate, contract, providers: [provider], now: now() });
    const submission = createProductionGenerationSubmission({
      repository, projectRoot: root, immutableProjectUuid: "u", projectGeneration: 1, intentMacKey: "k", provider, beforeDispatch: () => undefined, now,
    });

    await expect(submission.start({ projectId: "p", operationId: "op-1" })).rejects.toBeInstanceOf(SubmissionReceiptUnknownError);
    expect(repository.read("p", "op-1")?.jobs[0]?.status).toBe("submission_unknown");

    await expect(submission.start({ projectId: "p", operationId: "op-1" })).rejects.toBeInstanceOf(SubmissionReconciliationRequiredError);
    expect(submits).toHaveLength(1);
  });
});

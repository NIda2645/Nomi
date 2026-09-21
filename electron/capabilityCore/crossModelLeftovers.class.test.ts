// 类级回归：**上个模型留下的参数**与**调用方这一次点名的参数**是两件事，待遇不同。
//
//   · 点名的 → 当场拒（模型才有得自纠）；
//   · 残留的 → 清掉 + 如实上报，**绝不拒**（升级前落盘的草稿必须还读得起来）。
//
// 2026-09-22 验收查到两个缺口，这条测试各钉一个：
//   ① 「不上报 clearedParameters」这个变异**杀不掉**——因为清理根本没落盘：
//      `normalizedPatch` 里没有 `parameters`，算了一遍、报了一遍，存的还是旧参数。
//   ② 存量草稿的残留在 preview 时会被当场拒，旧数据一打开就报错。
import { describe, expect, it } from "vitest";

import { createModuleRegistry } from "./moduleRegistry";
import { createGenerationPlanningHandler, createInMemoryGenerationOperationStore } from "./mcpGenerationTools";
import { PROJECT_LEASE_ALGORITHM, PROJECT_LEASE_AUDIENCE, PROJECT_LEASE_VERSION, type ProjectLeaseV2 } from "./projectLease";

const registry = createModuleRegistry([{
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["text"],
  outputKinds: ["image"],
  modes: ["text-to-image"],
  parameterSchema: {},
  assetInputSchema: { references: { kind: "image", max: 4 } },
  providers: [{
    providerId: "vendor-a",
    models: [
      // 两个模型，参数表**故意不同**：`grain` 只有 old 有，`sharpen` 只有 new 有。
      { modelId: "model-old", modes: ["text-to-image"], parameterSchema: { aspect_ratio: { type: "enum", enum: ["1:1"] }, grain: { type: "number" } }, capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true } },
      { modelId: "model-new", modes: ["text-to-image"], parameterSchema: { aspect_ratio: { type: "enum", enum: ["1:1"] }, sharpen: { type: "number" } }, capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true } },
    ],
  }],
}]);

const lease: ProjectLeaseV2 = {
  version: PROJECT_LEASE_VERSION, algorithm: PROJECT_LEASE_ALGORITHM, audience: PROJECT_LEASE_AUDIENCE,
  projectId: "project-1", immutableProjectUuid: "project-uuid-1", projectGeneration: 1,
  canonicalRootDigest: "digest", manifestDigest: "manifest",
  scopeSet: ["generation:create", "generation:preview", "generation:gate"],
  issuedAt: "2026-09-22T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z",
  nonce: "nonce", keyId: "key", mac: "mac", sessionId: "session", principal: "mcp:test", connectionNonce: "conn",
};

function candidate(parameters: Record<string, unknown>) {
  return {
    candidateId: "candidate-1", revision: 1, moduleId: "generation.single-shot",
    providerId: "vendor-a", modelId: "model-old", mode: "text-to-image",
    prompt: "a paper boat", parameters, references: [],
  };
}

async function draft(parameters: Record<string, unknown>) {
  const operations = createInMemoryGenerationOperationStore();
  const handler = createGenerationPlanningHandler({ registry, operations, now: () => "2026-09-22T00:00:00.000Z" });
  const created = await handler({ capability: "create", params: { candidate: candidate(parameters) }, lease }) as { operation: { operationId: string } };
  return { handler, operationId: created.operation.operationId, operations };
}

describe("cross-model parameter leftovers", () => {
  it("clears the previous model's parameters on a model switch, reports them, and persists the cleanup", async () => {
    const { handler, operationId } = await draft({ aspect_ratio: "1:1", grain: 4 });
    const patched = await handler({
      capability: "plan",
      params: { operationId, patch: { modelId: "model-new" } },
      lease,
    }) as { operation: { candidate: { parameters: Record<string, unknown> } }; changeset?: { clearedParameters?: string[] } };

    // ① 上报（这一半原本就有）
    expect(patched.changeset?.clearedParameters).toEqual(["grain"]);
    // ② **落盘**（这一半原本缺失，正是「不上报」那个变异杀不掉的原因）
    expect(patched.operation.candidate.parameters).toEqual({ aspect_ratio: "1:1" });
    expect(patched.operation.candidate.parameters).not.toHaveProperty("grain");
  });

  it("keeps a legacy draft readable: preview cleans stored leftovers instead of refusing", async () => {
    // 升级前落盘的草稿：参数里带着这个模型不认的键，而这一次调用没有任何人点名它。
    const { handler, operationId, operations } = await draft({ aspect_ratio: "1:1", legacy_knob: 9 });
    const current = await operations.read("project-1", operationId);
    expect(current?.candidate.parameters).toHaveProperty("legacy_knob");

    const preview = await handler({ capability: "preview", params: { operationId }, lease }) as {
      contract: { parameters: Record<string, unknown> }; clearedParameters?: string[];
    };
    // 不拒：旧数据读得起来。
    expect(preview.clearedParameters).toEqual(["legacy_knob"]);
    // 而且清掉的东西不会上 wire。
    expect(preview.contract.parameters).toEqual({ aspect_ratio: "1:1" });
  });

  it("still refuses a parameter the caller names in this very call", async () => {
    const { handler, operationId } = await draft({ aspect_ratio: "1:1" });
    await expect(handler({
      capability: "plan",
      params: { operationId, patch: { parameters: { aspect_ratio: "1:1", not_a_real_key: 1 } } },
      lease,
    })).rejects.toThrow(/not_a_real_key/);
  });
});

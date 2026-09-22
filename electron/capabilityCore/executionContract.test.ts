import { describe, expect, it } from "vitest";

import { createModuleRegistry } from "./moduleRegistry";
import {
  ContractCompilationError,
  applyPlanCandidatePatch,
  compileExecutionContract,
  type PlanCandidate,
} from "./executionContract";
import type { ModuleManifest } from "./moduleManifest";

const manifest: ModuleManifest = {
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["text", "image"],
  outputKinds: ["image", "video"],
  modes: ["text-to-image", "image-to-image", "text-to-video"],
  parameterSchema: {
    aspectRatio: { type: "string", required: true },
    seed: { type: "integer" },
    duration: { type: "number" },
  },
  assetInputSchema: { references: { kind: "image", max: 8 } },
  providers: [
    {
      providerId: "provider.image",
      models: [{
        modelId: "model.image.v1",
        modes: ["text-to-image", "image-to-image"],
        parameterSchema: { seed: { type: "integer" } },
        capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
      }],
    },
    {
      providerId: "provider.video",
      models: [{
        modelId: "model.video.v1",
        modes: ["text-to-video"],
        parameterSchema: { duration: { type: "number", required: true } },
        capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
      }],
    },
  ],
};

const registry = createModuleRegistry([manifest]);

function candidate(overrides: Partial<PlanCandidate> = {}): PlanCandidate {
  return {
    candidateId: "candidate-1",
    revision: 1,
    moduleId: "generation.single-shot",
    providerId: "provider.image",
    modelId: "model.image.v1",
    mode: "image-to-image",
    prompt: "a red fox in snow",
    parameters: { aspectRatio: "16:9", seed: 4 },
    references: [
      { assetId: "asset-a", contentHash: "a".repeat(64), version: 1 },
      { assetId: "asset-b", contentHash: "b".repeat(64), version: 1 },
    ],
    ...overrides,
  };
}

describe("ExecutionContract compiler", () => {
  it("is deterministic and preserves user reference order", () => {
    const first = compileExecutionContract(candidate(), registry);
    const second = compileExecutionContract(structuredClone(candidate()), registry);
    expect(first.contractHash).toBe(second.contractHash);
    expect(first.references.map((reference) => reference.assetId)).toEqual(["asset-a", "asset-b"]);
  });

  it("changes the contract when the user changes provider, mode, parameters, or references", () => {
    const original = compileExecutionContract(candidate(), registry);
    const changed = compileExecutionContract(candidate({
      providerId: "provider.video",
      modelId: "model.video.v1",
      mode: "text-to-video",
      parameters: { aspectRatio: "9:16", duration: 5 },
      references: [{ assetId: "asset-c", contentHash: "c".repeat(64), version: 2 }],
    }), registry);
    expect(changed.contractHash).not.toBe(original.contractHash);
    expect(changed.references.map((reference) => reference.assetId)).toEqual(["asset-c"]);
  });

  it("refuses an undeclared parameter and names the legal ones instead of dropping it", () => {
    // 静默丢弃 = 「你批准的是 A、我们发出去的是 B」：用户在付款卡上把清晰度改成 2K，合同悄悄丢掉，
    // 供应商按自己的默认出 1k，节点上仍印 2K。报错并列出合法键才是可执行的答复。
    // 2026-09-21 行为反转（main #837）：旧实现把未知键记进 `droppedFields` 就放行，而那个字段
    // 全仓没有生产读者——模型点名的参数与真正发出去的参数可以不一样，且没有任何地方会红。
    expect(() => compileExecutionContract(candidate({ parameters: { aspectRatio: "16:9", unknownKnob: 10 } }), registry))
      .toThrow(ContractCompilationError);
    try {
      compileExecutionContract(candidate({ parameters: { aspectRatio: "16:9", unknownKnob: 10 } }), registry);
      throw new Error("未知键必须被拒");
    } catch (error) {
      // 机器可读那一面指到**具体哪一处**（模型照它改下一轮）；人话那一面列出合法键。
      expect((error as ContractCompilationError).rejection?.code).toBe("unknown_parameter");
      expect((error as ContractCompilationError).rejection?.path).toBe("parameters.unknownKnob");
      expect((error as ContractCompilationError).rejection?.allowedKeys).toContain("seed");
      expect(String((error as Error).message)).toContain("unknownKnob");
      expect(String((error as Error).message)).toContain("aspectRatio");
      expect(String((error as Error).message)).toContain("seed");
    }
  });

  it("keeps a wire-declared parameter whose value domain only the provider knows", () => {
    // 线缆模板引用了 `resolution` → 它发得出去 → 合同必须原样带着它（type: "any" 那一档）。
    const wireRegistry = createModuleRegistry([{
      ...manifest,
      parameterSchema: { ...manifest.parameterSchema, resolution: { type: "any" } },
    }]);
    const contract = compileExecutionContract(
      candidate({ parameters: { aspectRatio: "16:9", resolution: "2K" } }),
      wireRegistry,
    );
    expect(contract.parameters.resolution).toBe("2K");
  });

  it("lets Nomi's own planning intents through without putting them on the wire", () => {
    // 意图键是 Nomi 的推荐器读的，供应商请求里没有它：不算「填错」（不许报 unknown_parameter），
    // 也不进合同参数。登记账本 `droppedFields` 随 #837 一起删了——它全仓没有生产读者。
    const contract = compileExecutionContract(
      candidate({ parameters: { aspectRatio: "16:9", preserveCharacter: true } }),
      registry,
    );
    expect(contract.parameters).not.toHaveProperty("preserveCharacter");
  });

  it("still type-checks a planning intent — a garbage value is not silently swallowed", () => {
    expect(() => compileExecutionContract(
      candidate({ parameters: { aspectRatio: "16:9", preserveCharacter: "yes please" } }),
      registry,
    )).toThrow(/parameters\.preserveCharacter/);
  });

  it("projects @ mentions into @imageN before the prompt can reach a provider", () => {
    // A5：@ 过参考图的镜头交给 Agent／外部 MCP 重拍时，供应商此前收到的是字面
    // `@[asset:nomi-local%3A%2F%2F…]` —— 花了钱拿回错东西。投影规则与手动画布那条路同一份纯函数。
    const first = "nomi-local://p/assets/a.png";
    const second = "nomi-local://p/assets/b.png";
    const contract = compileExecutionContract(candidate({
      prompt: `@[asset:${encodeURIComponent(second)}] 牵着 @[asset:${encodeURIComponent(first)}] 走`,
      references: [
        { assetId: "asset-a", contentHash: "a".repeat(64), version: 1, kind: "image" },
        { assetId: "asset-b", contentHash: "b".repeat(64), version: 1, kind: "image" },
      ],
    }), registry, { referenceSourceUrls: [first, second] });
    // 编号跟的是**实际发送的参考数组顺序**，不是句子里出现的顺序。
    expect(contract.prompt).toBe("@image2 牵着 @image1 走");
  });

  it("numbers each media kind on its own axis, exactly like the manual canvas path", () => {
    const image = "nomi-local://p/assets/a.png";
    const video = "nomi-local://p/assets/c.mp4";
    const contract = compileExecutionContract(candidate({
      prompt: `照着 @[asset:${encodeURIComponent(image)}] 的人，动作学 @[asset:${encodeURIComponent(video)}]`,
      references: [
        { assetId: "asset-a", contentHash: "a".repeat(64), version: 1, kind: "image" },
        { assetId: "asset-c", contentHash: "c".repeat(64), version: 1, kind: "video" },
      ],
    }), registry, { referenceSourceUrls: [image, video] });
    expect(contract.prompt).toBe("照着 @image1 的人，动作学 @video1");
  });

  it("refuses to send an unprojected mention instead of leaking the internal marker", () => {
    const url = "nomi-local://p/assets/a.png";
    expect(() => compileExecutionContract(candidate({
      prompt: `画面里 @[asset:${encodeURIComponent(url)}] 走过来`,
    }), registry)).toThrow(/@ 内联引用/);
    expect(() => compileExecutionContract(candidate({
      prompt: `画面里 @[asset:${encodeURIComponent(url)}] 走过来`,
    }), registry, { referenceSourceUrls: [undefined, undefined] })).toThrow(/解析不出源地址/);
  });

  it("leaves a plain prompt byte-identical (no mention, no projection)", () => {
    const contract = compileExecutionContract(candidate({ prompt: "a red fox in snow" }), registry, { referenceSourceUrls: undefined });
    expect(contract.prompt).toBe("a red fox in snow");
  });

  it("fails before provider work when a required parameter is missing", () => {
    expect(() => compileExecutionContract(candidate({
      providerId: "provider.video",
      modelId: "model.video.v1",
      mode: "text-to-video",
      parameters: { aspectRatio: "16:9" },
    }), registry)).toThrow(ContractCompilationError);
  });

  it("keeps discrete numeric choices discrete instead of accepting arbitrary numbers", () => {
    const constrainedRegistry = createModuleRegistry([{
      ...manifest,
      providers: [{
        providerId: "provider.video",
        models: [{
          modelId: "model.video.v1",
          modes: ["text-to-video"],
          parameterSchema: { duration: { type: "number", enum: [6, 10], required: true } },
          capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
        }],
      }],
    }]);
    expect(compileExecutionContract(candidate({
      providerId: "provider.video",
      modelId: "model.video.v1",
      mode: "text-to-video",
      parameters: { aspectRatio: "16:9", duration: 6 },
    }), constrainedRegistry).parameters.duration).toBe(6);
    expect(() => compileExecutionContract(candidate({
      providerId: "provider.video",
      modelId: "model.video.v1",
      mode: "text-to-video",
      parameters: { aspectRatio: "16:9", duration: 7 },
    }), constrainedRegistry)).toThrow(ContractCompilationError);
  });

  it("allows edits before sealing and requires a new draft after sealing", () => {
    const draft = applyPlanCandidatePatch(candidate(), { parameters: { aspectRatio: "1:1", seed: 8 } });
    expect(draft.revision).toBe(2);
    expect(draft.parameters).toEqual({ aspectRatio: "1:1", seed: 8 });
    expect(() => applyPlanCandidatePatch({ ...candidate(), sealedContractHash: "a".repeat(64) }, { prompt: "new" })).toThrow(/new_draft_required/);
  });

  it("preserves reference kind and role in the sealed contract", () => {
    const contract = compileExecutionContract(candidate({
      references: [{ assetId: "asset-character", contentHash: "c".repeat(64), version: 1, kind: "image", role: "character" }],
    }), registry);

    expect(contract.references[0]).toMatchObject({ kind: "image", role: "character" });
  });

  it("changes the contract when only a reference role changes", () => {
    const original = candidate({
      references: [{ assetId: "asset-a", contentHash: "a".repeat(64), version: 1, kind: "image", role: "character" }],
    });
    const changed = applyPlanCandidatePatch(original, {
      references: [{ ...original.references[0]!, role: "first_frame" }],
    });

    expect(changed.revision).toBe(original.revision + 1);
    expect(compileExecutionContract(changed, registry).contractHash)
      .not.toBe(compileExecutionContract(original, registry).contractHash);
  });
});

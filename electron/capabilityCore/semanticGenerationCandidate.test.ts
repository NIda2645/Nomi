import { describe, expect, it } from "vitest";

import type { PlanCandidate } from "./executionContract";
import { createModuleRegistry } from "./moduleRegistry";
import {
  inferGenerationTaskKind,
  isLongFormGenerationRequest,
  requestedVideoDurationSeconds,
  semanticCandidateFromParams,
} from "./semanticGenerationCandidate";

const registry = createModuleRegistry([{
  moduleId: "generation.single-shot",
  version: "test",
  inputKinds: ["text", "image", "video"],
  outputKinds: ["image", "video"],
  modes: ["text_to_image", "image_edit", "text_to_video", "image_to_video"],
  parameterSchema: {},
  assetInputSchema: { references: { kind: "asset", max: 8 } },
  providers: [{
    providerId: "fixture",
    models: [{
      modelId: "image-model",
      modes: ["text_to_image", "image_edit"],
      parameterSchema: {},
      capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
    }, {
      modelId: "video-model",
      modes: ["text_to_video", "image_to_video"],
      parameterSchema: {},
      capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
    }],
  }],
}]);

function parse(value: unknown): PlanCandidate {
  const raw = value as Record<string, unknown>;
  if (typeof raw.candidateId !== "string" || typeof raw.prompt !== "string") throw new Error("invalid fixture candidate");
  return raw as unknown as PlanCandidate;
}

describe("semantic generation candidate", () => {
  it("recognizes minute-scale video goals without confusing a five-second clip parameter", () => {
    expect(requestedVideoDurationSeconds({ prompt: "帮我做一个5分钟品牌视频", parameters: { duration: 5 } })).toBe(300);
    expect(isLongFormGenerationRequest({ prompt: "帮我做一个5分钟品牌视频", parameters: { duration: 5 } })).toBe(true);
    expect(isLongFormGenerationRequest({ prompt: "生成一段5秒视频", parameters: { duration: 5 } })).toBe(false);
    expect(isLongFormGenerationRequest({ prompt: "生成一张小猫头像" })).toBe(false);
  });

  it("infers image, edit, and video intent from user language", () => {
    expect(inferGenerationTaskKind({ prompt: "生成一个小猫头像" })).toBe("text_to_image");
    expect(inferGenerationTaskKind({ prompt: "把这张图改成水彩风", references: [{}] })).toBe("image_edit");
    expect(inferGenerationTaskKind({ prompt: "生成一段品牌视频" })).toBe("text_to_video");
    expect(inferGenerationTaskKind({ prompt: "让这张图动起来做成视频", references: [{}] })).toBe("image_to_video");
  });

  it("uses the live registry when no saved default exists", () => {
    const candidate = semanticCandidateFromParams({
      operationId: "op-fallback",
      params: { prompt: "生成一个头像" },
      candidateFrom: parse,
      allowRegistryFallback: true,
      registry,
    });
    expect(candidate).toMatchObject({
      candidateId: "cand-op-fallback",
      providerId: "fixture",
      modelId: "image-model",
      mode: "text_to_image",
    });
  });

  // ── 2026-09-18 回归：参考素材的身份归宿主，不归模型（`docs/fixes/2026-09-18-verb-host-input-conformance`）──
  it("参考素材只给 assetId 时，身份由注入的解析器补齐", () => {
    const candidate = semanticCandidateFromParams({
      operationId: "op-ref",
      params: { prompt: "把这张图改成水彩风", references: [{ assetId: "asset-1", role: "character" }] },
      candidateFrom: parse,
      allowRegistryFallback: true,
      registry,
      resolveAssetReferenceIdentity: (assetId) => (assetId === "asset-1" ? { contentHash: "a".repeat(64), version: 1 } : undefined),
    });
    expect(candidate.references).toEqual([{ assetId: "asset-1", role: "character", contentHash: "a".repeat(64), version: 1 }]);
  });

  it("已经钉住身份的参考逐字节不变，解析器不会被再叫一次", () => {
    let calls = 0;
    const pinned = { assetId: "asset-2", contentHash: "b".repeat(64), version: 3, kind: "image" as const };
    const candidate = semanticCandidateFromParams({
      operationId: "op-pinned",
      params: { prompt: "把这张图改成水彩风", references: [pinned] },
      candidateFrom: parse,
      allowRegistryFallback: true,
      registry,
      resolveAssetReferenceIdentity: () => { calls += 1; return { contentHash: "c".repeat(64), version: 9 }; },
    });
    expect(candidate.references).toEqual([pinned]);
    expect(calls).toBe(0);
  });

  it("素材不在本项目时报人话，而不是一个模型看不懂的 Required", () => {
    const attempt = () => semanticCandidateFromParams({
      operationId: "op-missing",
      params: { prompt: "把这张图改成水彩风", references: [{ assetId: "asset-ghost" }] },
      candidateFrom: parse,
      allowRegistryFallback: true,
      registry,
      resolveAssetReferenceIdentity: () => undefined,
    });
    expect(attempt).toThrow(/asset-ghost/);
    expect(attempt).toThrow(/look_at_media/);
    // 阳性对照：同一条路在解析得到时是通的，所以上面的红不是「这条路恒抛」。
    expect(() => semanticCandidateFromParams({
      operationId: "op-present",
      params: { prompt: "把这张图改成水彩风", references: [{ assetId: "asset-ghost" }] },
      candidateFrom: parse,
      allowRegistryFallback: true,
      registry,
      resolveAssetReferenceIdentity: () => ({ contentHash: "d".repeat(64), version: 1 }),
    })).not.toThrow();
  });

  // 2026-09-18 金路径真机红：Agent 照 list_models 给了 modelKey，宿主却答「没有配置可用的图片模型」——
  // 因为只有「用户保存过的默认模型」能带出 providerId/moduleId，显式点名的模型从不去目录里查它属于谁。
  it("resolves provider and module for an explicitly named model even when no default is saved", () => {
    const candidate = semanticCandidateFromParams({
      operationId: "op-explicit",
      params: { prompt: "清晨的旧书店门口", taskKind: "text_to_image", modelId: "image-model", modeId: "t2i" },
      candidateFrom: parse,
      registry,
    });
    expect(candidate).toMatchObject({ providerId: "fixture", moduleId: "generation.single-shot", modelId: "image-model", mode: "text_to_image", modeId: "t2i" });
  });

  it("still refuses an explicitly named model the registry does not know (no invented provider)", () => {
    expect(() => semanticCandidateFromParams({
      operationId: "op-unknown",
      params: { prompt: "x", taskKind: "text_to_image", modelId: "ghost-model" },
      candidateFrom: parse,
      registry,
    })).toThrow(/没有配置可用的图片模型/);
  });

  it("lets explicit fields override saved defaults without exposing internal IDs", () => {
    const candidate = semanticCandidateFromParams({
      operationId: "op-explicit",
      params: {
        prompt: "做一个短视频",
        taskKind: "text_to_video",
        parameters: { duration: 4 },
        providerId: "fixture",
        modelId: "video-model",
      },
      candidateFrom: parse,
      defaultModelForTaskKind: () => ({ moduleId: "generation.single-shot", providerId: "other", modelId: "other-model", mode: "text_to_video" }),
      registry,
    });
    expect(candidate).toMatchObject({ providerId: "fixture", modelId: "video-model", mode: "text_to_video", parameters: { duration: 4 } });
    expect(candidate).not.toHaveProperty("transportModelId");
  });

  it("does not carry a saved model's mode or variant into an explicitly selected model", () => {
    const candidate = semanticCandidateFromParams({
      operationId: "op-explicit-mode",
      params: {
        prompt: "做一个短视频",
        taskKind: "text_to_video",
        providerId: "fixture",
        modelId: "video-model",
      },
      candidateFrom: parse,
      defaultModelForTaskKind: () => ({
        moduleId: "generation.single-shot",
        providerId: "other",
        modelId: "other-model",
        mode: "text_to_video",
        modeId: "other-mode",
        variantId: "other-variant",
      }),
      registry,
    });

    expect(candidate).toMatchObject({ providerId: "fixture", modelId: "video-model", mode: "text_to_video" });
    expect(candidate).not.toHaveProperty("modeId");
    expect(candidate).not.toHaveProperty("variantId");
  });

  // 根因合同 2026-09-18-draft-shots-drops-candidate：模型点了名的模型，对**没保存过默认**的用户
  // 也必须算数。此前 moduleId 只能从保存的默认里来，所以「点名 + 没存默认」= 当场拒绝，
  // 而模型面上根本没有 moduleId 这个字段可填——点名因此永远差一格。
  it("honours an explicitly named provider+model for a user who never saved a default", () => {
    const candidate = semanticCandidateFromParams({
      operationId: "op-named",
      params: { prompt: "生成一张六棱柱的图", taskKind: "text_to_image", providerId: "fixture", modelId: "image-model" },
      candidateFrom: parse,
      registry,
    });
    expect(candidate).toMatchObject({
      moduleId: "generation.single-shot", providerId: "fixture", modelId: "image-model", mode: "text_to_image",
    });
  });

  it("still refuses when nothing names a model — the module lookup is not a way in", () => {
    // 阳性对照：上一条的绿不是因为判据恒真。没点名 + 没默认 = 照旧拒绝，不许按目录行序挑一个花钱。
    expect(() => semanticCandidateFromParams({
      operationId: "op-unnamed", params: { prompt: "生成一张图" }, candidateFrom: parse, registry,
    })).toThrow(/没有配置可用的图片模型/);
    // 点了名但目录里没有这个身份，也照旧拒绝（不为不存在的模型编一个 module）。
    expect(() => semanticCandidateFromParams({
      operationId: "op-unknown",
      params: { prompt: "生成一张图", providerId: "fixture", modelId: "not-in-catalog" },
      candidateFrom: parse, registry,
    })).toThrow(/没有配置可用的图片模型/);
  });
});

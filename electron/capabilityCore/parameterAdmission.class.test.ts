// 类级回归：参数值层的准入是**结构化拒绝**，不是静默丢弃。
//
// 报告的那一例只是「外部宿主猜了一个参数名」；这里钉的是那一类——未知键 / 错类型 /
// 不在枚举 / 越界 / 错变体，五种填错方式都必须：① 当场拒，② 错误里带得出**合法键清单或最接近的键**
// 与**合法取值**，模型下一次调用才写得对（MCP 2026-07-28：input validation error 归 tool execution
// error，客户端 SHOULD 交给模型自纠）。
//
// 为什么类级测试住这里而不是逐调用点：三个调用点（单镜 preview / gate_request、多镜 draft）
// 都汇到 `compileParameters` 这一个共享边界，invariant 的主人是它。
import { describe, expect, it } from "vitest";

import { createModuleRegistry } from "./moduleRegistry";
import {
  ContractCompilationError,
  GENERATION_PLANNING_HINT_KEYS,
  compileExecutionContract,
  type PlanCandidate,
} from "./executionContract";
import { videoRecommendationInput } from "./mcpGenerationVideoResolve";
import type { ModuleManifest } from "./moduleManifest";

const manifest: ModuleManifest = {
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["text"],
  outputKinds: ["video"],
  modes: ["text-to-video"],
  parameterSchema: {},
  assetInputSchema: { references: { kind: "asset", max: 4 } },
  providers: [{
    providerId: "provider.video",
    models: [{
      modelId: "model.video.v1",
      modes: ["text-to-video"],
      parameterSchema: {
        resolution: { type: "enum", enum: ["480p", "720p", "1080p"] },
        generate_audio: { type: "boolean" },
        duration: { type: "integer", min: 3, max: 12 },
      },
      capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
    }],
  }],
};

const registry = createModuleRegistry([manifest]);

function candidate(parameters: Record<string, unknown>, overrides: Partial<PlanCandidate> = {}): PlanCandidate {
  return {
    candidateId: "candidate-1",
    revision: 1,
    moduleId: "generation.single-shot",
    providerId: "provider.video",
    modelId: "model.video.v1",
    mode: "text-to-video",
    prompt: "a red fox in snow",
    parameters,
    references: [],
    ...overrides,
  };
}

function rejectionOf(
  parameters: Record<string, unknown>,
  overrides: Partial<PlanCandidate> = {},
  options: Parameters<typeof compileExecutionContract>[2] = {},
) {
  try {
    compileExecutionContract(candidate(parameters, overrides), registry, options);
  } catch (error) {
    if (error instanceof ContractCompilationError) return error;
    throw error;
  }
  throw new Error("expected the contract compiler to reject this candidate");
}

describe("parameter admission (shared boundary)", () => {
  it("rejects an unknown parameter key and names the legal keys", () => {
    const error = rejectionOf({ resolutionn: "720p" });
    expect(error.rejection?.code).toBe("unknown_parameter");
    expect(error.rejection?.path).toBe("parameters.resolutionn");
    expect(error.rejection?.allowedKeys).toEqual(["duration", "generate_audio", "resolution"]);
    // 「最接近的键」是让模型一次就改对的那条信息，不是装饰。
    expect(error.rejection?.closestKey).toBe("resolution");
    expect(error.message).toContain("resolution");
  });

  it("names the legal keys even when nothing is close enough to suggest", () => {
    const error = rejectionOf({ trajectory: [1, 2, 3] });
    expect(error.rejection?.code).toBe("unknown_parameter");
    expect(error.rejection?.closestKey).toBeUndefined();
    expect(error.rejection?.allowedKeys).toContain("resolution");
  });

  it("rejects a wrong type and says which type the model must send", () => {
    const error = rejectionOf({ generate_audio: "false" });
    expect(error.rejection?.code).toBe("parameter_type_mismatch");
    expect(error.rejection?.expectedType).toBe("boolean");
  });

  it("rejects a value outside the declared enum and lists the legal values", () => {
    const error = rejectionOf({ resolution: "4k" });
    expect(error.rejection?.code).toBe("parameter_not_in_enum");
    expect(error.rejection?.allowedValues).toEqual(["480p", "720p", "1080p"]);
    expect(error.message).toContain("1080p");
  });

  it("rejects a numeric value outside the declared range and gives the range", () => {
    const error = rejectionOf({ duration: 30 });
    expect(error.rejection?.code).toBe("parameter_out_of_range");
    expect(error.rejection?.min).toBe(3);
    expect(error.rejection?.max).toBe(12);
  });

  it("rejects an unknown variant and lists the variants this model has", () => {
    const error = rejectionOf({ resolution: "720p" }, { variantId: "mini" }, { allowedVariantIds: ["fast", "pro"] });
    expect(error.rejection?.code).toBe("unknown_variant");
    expect(error.rejection?.path).toBe("variantId");
    expect(error.rejection?.allowedVariantIds).toEqual(["fast", "pro"]);
    expect(error.message).toContain("pro");
  });

  it("says plainly that a model without variants must not be sent one", () => {
    // 合法清单为空 ≠「随便填都行」。清单拿不到时（调用点没传）才放行，那是另一回事。
    const error = rejectionOf({ resolution: "720p" }, { variantId: "mini" }, { allowedVariantIds: [] });
    expect(error.rejection?.allowedVariantIds).toEqual([]);
    expect(compileExecutionContract(candidate({ resolution: "720p" }, { variantId: "mini" }), registry).variantId)
      .toBe("mini");
  });

  it("accepts every declared parameter at its declared bounds", () => {
    const contract = compileExecutionContract(
      candidate({ resolution: "480p", generate_audio: false, duration: 3 }),
      registry,
    );
    expect(contract.parameters).toEqual({ resolution: "480p", generate_audio: false, duration: 3 });
  });

  it("no longer carries a dropped-field ledger that nothing reads", () => {
    const contract = compileExecutionContract(candidate({ resolution: "720p" }), registry);
    expect(contract).not.toHaveProperty("droppedFields");
  });

  // ── 两个**合法**的非供应商参数群。它们过去和「模型写错的键」走同一条无声的路，分不出来。 ──

  it("passes Nomi's own planning hints through without calling them mistakes", () => {
    // 这几个键由 `videoRecommendationInput` 读走用于选型，从不上 wire；它们不进合同，也不是填错。
    const contract = compileExecutionContract(
      candidate({ resolution: "720p", preserveCharacter: true, cameraIntent: "orbit" }),
      registry,
    );
    expect(contract.parameters).toEqual({ resolution: "720p" });
  });

  it("every declared planning hint is one the recommendation reader actually consumes", () => {
    // 活的判据：逐个键真喂进去，看 videoRecommendationInput 读不读得到它。
    // （把常量再导出一遍然后和自己比，那种断言恒真——它挡不住「这里加了键、那边没加」。）
    const sample: Record<string, unknown> = {
      cameraIntent: "orbit", preferredFamily: "seedance", preserveCharacter: true,
      preserveTransition: true, quality: "final", useReferenceAudio: true,
    };
    for (const key of GENERATION_PLANNING_HINT_KEYS) {
      const withHint = videoRecommendationInput(candidate({ [key]: sample[key] }));
      const without = videoRecommendationInput(candidate({}));
      expect(JSON.stringify(withHint), `planning hint ${key} is declared but nothing reads it`)
        .not.toBe(JSON.stringify(without));
    }
  });

  it("carries a value through unvalidated — never drops it — when the model declares no parameters at all", () => {
    // 「目录里一个参数都没声明」不等于「这个键是错的」。证不出错就不许拒；但也绝不能像旧实现
    // 那样悄悄丢掉——调用方点名的值必须留在合同里，并在 warnings 里说清它没被校验过。
    const bare = createModuleRegistry([{
      ...manifest,
      providers: [{
        providerId: "provider.video",
        models: [{ ...manifest.providers[0]!.models[0]!, parameterSchema: {} }],
      }],
    }]);
    const contract = compileExecutionContract(candidate({ anything_at_all: "1080p" }), bare);
    expect(contract.parameters).toEqual({ anything_at_all: "1080p" });
    expect(contract.warnings.join(" ")).toContain("anything_at_all");
  });
});

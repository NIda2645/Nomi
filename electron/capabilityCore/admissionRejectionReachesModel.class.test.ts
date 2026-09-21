// 类级回归：准入层的拒绝**必须真的到达模型眼前**，两种语言都到。
//
// 2026-09-22 验收查到的缺口：`ParameterRejection` 全仓零消费者——`buildToolErrorOutcome` 只读
// `error.details`，不读 `.rejection`；`contract_invalid` / `unknown_model_identity` 两个码
// 既不在 `ERROR_HINT` 也不在 `POLICY_CODES`，于是 `errorCode: null`、`recoveryActions: []`，
// 而模型唯一读得到的只有一句**硬编码中文**散文（R15）。
//
// 这条测试钉的就是那条通路：从真实的准入拒绝 → 真实的 `buildToolErrorOutcome` →
// 模型实际看到的 text / outcome。判据分两半，与设计分工一致：
//   · 人话（zh/en 两版）来自码表；
//   · 事实（合法键 / 最接近的键 / 合法取值 / 范围 / 合法变体）来自 details，语言中立。
import { describe, expect, it } from "vitest";

import { buildToolErrorOutcome } from "./mcpToolErrorResults";
import { CanvasGraphError } from "./canvasGraph";
import { createModuleRegistry } from "./moduleRegistry";
import { ContractCompilationError, compileExecutionContract, type PlanCandidate } from "./executionContract";
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
    providerId: "apimart",
    models: [{
      modelId: "seedance-2",
      modes: ["text-to-video"],
      parameterSchema: {
        resolution: { type: "enum", enum: ["480p", "720p", "1080p"] },
        duration: { type: "integer", min: 3, max: 12 },
      },
      capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
    }],
  }],
};
const registry = createModuleRegistry([manifest]);

function reject(parameters: Record<string, unknown>, overrides: Partial<PlanCandidate> = {}, options = {}) {
  try {
    compileExecutionContract({
      candidateId: "c", revision: 1, moduleId: "generation.single-shot",
      providerId: "apimart", modelId: "seedance-2", mode: "text-to-video",
      prompt: "a red fox", parameters, references: [], ...overrides,
    }, registry, options);
  } catch (error) {
    if (error instanceof ContractCompilationError) return error;
    throw error;
  }
  throw new Error("expected a rejection");
}

describe("admission rejections reach the model", () => {
  it("carries a real errorCode, recovery actions and language-neutral facts", () => {
    const outcome = buildToolErrorOutcome("nomi_operation_preview", reject({ resolutionn: "720p" })).outcome;
    // 修复前这三样分别是 null / [] / undefined。
    expect(outcome.errorCode).toBe("unknown_parameter");
    expect(outcome.recoveryActions).not.toEqual([]);
    expect(outcome.details).toMatchObject({
      at: "parameters.resolutionn",
      allowedKeys: "duration,resolution",
      closestKey: "resolution",
    });
  });

  it("says it in English when the caller is on the en locale (R15)", () => {
    const zh = buildToolErrorOutcome("nomi_operation_preview", reject({ resolutionn: "720p" }), "zh-CN").text;
    const en = buildToolErrorOutcome("nomi_operation_preview", reject({ resolutionn: "720p" }), "en").text;
    expect(zh).not.toBe(en);
    expect(en).toContain("does not accept the parameter key");
    // 事实那一半两种语言逐字相同——它是键名，不是文案。
    for (const text of [zh, en]) expect(text).toContain("closestKey=resolution");
  });

  it("puts the legal values in front of the model for an enum violation", () => {
    const { text, outcome } = buildToolErrorOutcome("nomi_operation_preview", reject({ resolution: "4k" }), "en");
    expect(outcome.errorCode).toBe("parameter_not_in_enum");
    expect(text).toContain("allowedValues=480p,720p,1080p");
  });

  it("puts the declared range in front of the model for an out-of-range value", () => {
    const { text, outcome } = buildToolErrorOutcome("nomi_operation_preview", reject({ duration: 99 }), "en");
    expect(outcome.errorCode).toBe("parameter_out_of_range");
    expect(text).toContain("min=3");
    expect(text).toContain("max=12");
  });

  it("lists the variants a model actually has when the caller invents one", () => {
    const error = reject({ resolution: "720p" }, { variantId: "ultra" }, { allowedVariantIds: ["standard", "fast", "mini"] });
    const { text, outcome } = buildToolErrorOutcome("nomi_operation_preview", error, "en");
    expect(outcome.errorCode).toBe("unknown_variant");
    expect(text).toContain("allowedVariantIds=standard,fast,mini");
  });

  it("tells the model where to look when a canvas node names a model the catalog lacks", () => {
    const error = new CanvasGraphError("unknown_model_identity", "目录里没有模型 gpt-image-9。", {
      modelKey: "gpt-image-9", nodeKind: "image", expectedModelKind: "image", closest: "apimart/gpt-image-2",
    });
    const { text, outcome } = buildToolErrorOutcome("nomi_canvas_edit", error, "en");
    expect(outcome.errorCode).toBe("unknown_model_identity");
    expect(text).toContain('nomi_read{target:"models"}');
    expect(text).toContain("closest=apimart/gpt-image-2");
  });
});

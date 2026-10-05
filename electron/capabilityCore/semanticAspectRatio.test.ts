// 「Agent 说的比例」落到所选模式的真实键（`docs/plan/2026-10-05-agent-aspect-ratio-semantic.md`）。
//
// 用的是**真档案**（`MODEL_ARCHETYPES`），不是手写的参数表：这一族缺陷的根就在「各家键名不一样」，
// 夹具自己编一个键名就测不到它。四种键名各一家：Z-Image `size`、Nano Banana 2 kie `aspect_ratio` /
// apimart `size`、Agnes 2.1 `ratio`（旁边还有一个叫 `size` 的清晰度控件）、RunningHub 可灵 `aspectRatio`。
import { describe, expect, it } from "vitest";

import { ContractCompilationError, compileExecutionContract, type PlanCandidate } from "./executionContract";
import { normalizeAuthoredCandidate } from "./mcpGenerationVideoResolve";
import { createModuleRegistry } from "./moduleRegistry";
import { resolvePlanPatch } from "./generationPlanPatch";

const capabilities = { submitIdempotency: true, query: true, reconcile: true, cancel: true };
const registry = createModuleRegistry([{
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["text", "image"],
  outputKinds: ["image", "video"],
  modes: ["text_to_image", "image_edit", "text_to_video", "image_to_video"],
  parameterSchema: {},
  assetInputSchema: { references: { kind: "image", max: 14 } },
  providers: [
    { providerId: "apimart", models: [
      { modelId: "z-image-turbo", modes: ["text_to_image"], parameterSchema: {}, capabilities },
      { modelId: "gemini-3.1-flash-image-preview", modes: ["text_to_image"], parameterSchema: {}, capabilities },
    ] },
    { providerId: "kie", models: [{ modelId: "nano-banana-2", modes: ["text_to_image"], parameterSchema: {}, capabilities }] },
    { providerId: "agnes", models: [
      { modelId: "agnes-image-2.1-flash", modes: ["text_to_image"], parameterSchema: {}, capabilities },
      { modelId: "agnes-image-2.0-flash", modes: ["text_to_image"], parameterSchema: {}, capabilities },
    ] },
    { providerId: "runninghub", models: [
      { modelId: "kling-v3.0-pro", modes: ["text_to_video", "image_to_video"], parameterSchema: {}, capabilities },
      { modelId: "seedance-2.0-global", modes: ["text_to_video"], parameterSchema: {}, capabilities },
    ] },
    { providerId: "runway", models: [{ modelId: "wan/3-0-video", modes: ["text_to_video"], parameterSchema: {}, capabilities }] },
    // 没有档案、参数表只在目录里的那种模型（自接 / 中转站）：翻译读的是 registry 那一份。
    { providerId: "relay", models: [
      { modelId: "custom-image", modes: ["text_to_image"], parameterSchema: { aspect_ratio: { type: "enum", enum: ["16:9", "1:1"] }, seed: { type: "number" } }, capabilities },
    ] },
  ],
}]);

const candidate = (providerId: string, modelId: string, mode: string, parameters: Record<string, unknown>): PlanCandidate => ({
  candidateId: "cand-1", revision: 1, moduleId: "generation.single-shot",
  providerId, modelId, mode, prompt: "海边日出", parameters, references: [],
});

const translate = (providerId: string, modelId: string, mode: string, parameters: Record<string, unknown>) =>
  normalizeAuthoredCandidate(candidate(providerId, modelId, mode, parameters), registry, undefined).parameters;

function rejection(run: () => unknown): ContractCompilationError {
  try { run(); } catch (error) {
    expect(error).toBeInstanceOf(ContractCompilationError);
    return error as ContractCompilationError;
  }
  throw new Error("expected a refusal");
}

describe("语义比例 → 所选模式的真实键", () => {
  it("Z-Image（apimart）落 size：用户说 16:9，候选里就是 size=16:9，不再是出厂 1:1", () => {
    expect(translate("apimart", "z-image-turbo", "text_to_image", { aspectRatio: "16:9" })).toEqual({ size: "16:9" });
  });

  it("Nano Banana 2 落它自己那家的键：kie 叫 aspect_ratio，apimart 叫 size（同一档案、按供应商分层）", () => {
    expect(translate("kie", "nano-banana-2", "text_to_image", { aspectRatio: "1:1" })).toEqual({ aspect_ratio: "1:1" });
    expect(translate("apimart", "gemini-3.1-flash-image-preview", "text_to_image", { aspectRatio: "1:1" })).toEqual({ size: "1:1" });
  });

  it("Agnes 2.1 落 ratio——判据看选项不看键名：旁边那个叫 size 的是清晰度，原样不动", () => {
    expect(translate("agnes", "agnes-image-2.1-flash", "text_to_image", { aspectRatio: "16:9", size: "2K" }))
      .toEqual({ ratio: "16:9", size: "2K" });
  });

  it("真实键本来就叫 aspectRatio 的（RunningHub 可灵）：照样过选项校验，落同名键", () => {
    expect(translate("runninghub", "kling-v3.0-pro", "text_to_video", { aspectRatio: "9:16", duration: "5" }))
      .toEqual({ aspectRatio: "9:16", duration: "5" });
    expect(rejection(() => translate("runninghub", "kling-v3.0-pro", "text_to_video", { aspectRatio: "4:3" })).code)
      .toBe("parameter_not_in_enum");
  });

  it("没有档案的模型读 registry 的参数表", () => {
    expect(translate("relay", "custom-image", "text_to_image", { aspectRatio: "16:9", seed: 3 })).toEqual({ aspect_ratio: "16:9", seed: 3 });
  });

  it("写法宽容：全角冒号、带空格、具名桶都认，落的是选项自己的值", () => {
    expect(translate("apimart", "z-image-turbo", "text_to_image", { aspectRatio: "16：9" })).toEqual({ size: "16:9" });
    expect(translate("apimart", "z-image-turbo", "text_to_image", { aspectRatio: " 9 : 16 " })).toEqual({ size: "9:16" });
    expect(translate("apimart", "z-image-turbo", "text_to_image", { aspectRatio: "landscape_16_9" })).toEqual({ size: "16:9" });
  });

  it("auto 照实送该控件自己的自动档（auto / adaptive）", () => {
    expect(translate("kie", "nano-banana-2", "text_to_image", { aspectRatio: "auto" })).toEqual({ aspect_ratio: "auto" });
    expect(translate("runninghub", "seedance-2.0-global", "text_to_video", { aspectRatio: "auto" })).toEqual({ ratio: "adaptive" });
  });

  it("没写比例：同一个对象原样返回（不碰别的参数）", () => {
    const input = candidate("apimart", "z-image-turbo", "text_to_image", { resolution: "2K" });
    expect(normalizeAuthoredCandidate(input, registry, undefined)).toBe(input);
  });
});

describe("翻不了就当场拒，带合法值，绝不回落默认", () => {
  it("Z-Image 要 21:9：parameter_not_in_enum，allowedValues 是它真有的那几档", () => {
    const error = rejection(() => translate("apimart", "z-image-turbo", "text_to_image", { aspectRatio: "21:9" }));
    expect(error.code).toBe("parameter_not_in_enum");
    expect(error.rejection?.allowedValues).toEqual(["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"]);
    expect(error.details?.allowedValues).toBe("1:1,4:3,3:4,16:9,9:16,3:2,2:3");
    expect(error.message).toMatch(/21:9/);
    expect(error.message).toMatch(/size/);
  });

  it("没有自动档的模型要 auto 也拒（Z-Image）", () => {
    expect(rejection(() => translate("apimart", "z-image-turbo", "text_to_image", { aspectRatio: "auto" })).code).toBe("parameter_not_in_enum");
  });

  it("不是比例的写法（「竖屏」）拒，并列出合法值", () => {
    const error = rejection(() => translate("apimart", "z-image-turbo", "text_to_image", { aspectRatio: "竖屏" }));
    expect(error.rejection?.allowedValues).toContain("9:16");
  });

  it("没有比例选择的模式拒：像素尺寸档（Agnes 2.0）、比例跟着输入图走的图生视频（可灵 image 模式）", () => {
    expect(rejection(() => translate("agnes", "agnes-image-2.0-flash", "text_to_image", { aspectRatio: "16:9" })).code).toBe("unknown_parameter");
    expect(rejection(() => translate("runninghub", "kling-v3.0-pro", "image_to_video", { aspectRatio: "16:9" })).code).toBe("unknown_parameter");
  });

  it("像素 W:H 档（Runway 的 Wan 3.0：1280:720 混着 auto_720p）不算比例控件——一个 16:9 对应好几档分辨率，不替用户挑", () => {
    const error = rejection(() => translate("runway", "wan/3-0-video", "text_to_video", { aspectRatio: "16:9" }));
    expect(error.code).toBe("unknown_parameter");
    expect(error.message).toMatch(/aspect_ratio/);
  });

  it("同一件事写两处且不一样：aspectRatio 与 parameters 里的真实键 → 拒；一样 → 放行", () => {
    expect(() => translate("apimart", "z-image-turbo", "text_to_image", { aspectRatio: "16:9", size: "1:1" })).toThrow(/two different ratios/);
    expect(translate("apimart", "z-image-turbo", "text_to_image", { aspectRatio: "16:9", size: "16:9" })).toEqual({ size: "16:9" });
  });

  it("类型不对拒", () => {
    expect(rejection(() => translate("apimart", "z-image-turbo", "text_to_image", { aspectRatio: 1.78 })).code).toBe("parameter_type_mismatch");
  });

  it("陷阱拆掉了：漏翻到编译口的 aspectRatio 是未知参数（以前是意图键，continue 掉、不上线缆、不报错）", () => {
    const error = rejection(() => compileExecutionContract(
      candidate("relay", "custom-image", "text_to_image", { aspectRatio: "16:9" }), registry,
    ));
    expect(error.code).toBe("unknown_parameter");
    expect(error.rejection?.closestKey).toBe("aspect_ratio");
  });
});

describe("改草稿那一扇门：落盘的是翻译之后的参数", () => {
  it("改比例 → normalizedPatch.parameters 是真实键（只落 userPatch 原样，下一次读盘会把 aspectRatio 当残留清掉）", () => {
    const base = candidate("apimart", "z-image-turbo", "text_to_image", { size: "1:1" });
    const { normalizedPatch } = resolvePlanPatch({ baseCandidate: base, userPatch: { parameters: { aspectRatio: "9:16" } }, registry });
    expect(normalizedPatch.parameters).toEqual({ size: "9:16" });
  });

  it("改草稿时翻不了照样拒", () => {
    const base = candidate("apimart", "z-image-turbo", "text_to_image", {});
    expect(() => resolvePlanPatch({ baseCandidate: base, userPatch: { parameters: { aspectRatio: "21:9" } }, registry }))
      .toThrow(ContractCompilationError);
  });
});

import { describe, it, expect } from "vitest";

// 交付3 · 端到端：MCP nomi_generate 的 aspect_ratio 一路走到**真实渲染出的 wire body**，压过 apimart
// seedream 的 "1:1" 默认；不传时 body 与旧默认逐字节相同。链路（复刻 core.generateOnProject 的 extras 装配）：
//   caller args → buildGenerateParams → 铺进 request.extras → applyHeadlessParamDefaults(caller-wins) →
//   taskTemplateParams → buildHttpRequest(真 apimart seedream create op) → body.size。
// 全程纯逻辑、零 electron、零额度。
import { buildGenerateParams } from "./mcpGenerateParams";
import { applyHeadlessParamDefaults, taskTemplateParams } from "../catalog/taskParams";
import { buildHttpRequest, buildTemplateContext } from "../ai/requestPipeline";
import { applyParamMap } from "../catalog/paramTranslate";
import { APIMART_IMAGE_MODELS } from "../catalog/apimartImages";
import { APIMART_VIDEO_MODELS } from "../catalog/apimartVideos";
import { VOLCENGINE_IMAGE_MODELS } from "../catalog/volcengineImages";
import { MODELSCOPE_IMAGE_MODELS } from "../catalog/modelscopeImages";
import type { HttpOperation } from "../catalog/types";

const SEEDREAM = APIMART_IMAGE_MODELS.find((m) => m.modelKey === "doubao-seedream-4.5")!;

/** 一个模型的 text_to_image create op + 归一化身份（渲染 body 只需这几样）。 */
type ImageT2IProfile = { modelKey: string; archetypeId: string; vendorKey: string; baseUrl: string; op: HttpOperation };

function t2iProfile(model: { modelKey: string; archetypeId: string; mappings: Array<{ taskKind: string; create: HttpOperation }> }, vendorKey: string, baseUrl: string): ImageT2IProfile {
  return { modelKey: model.modelKey, archetypeId: model.archetypeId, vendorKey, baseUrl, op: model.mappings.find((m) => m.taskKind === "text_to_image")!.create };
}

// 比例语义 size 的档案（apimart seedream：size 默认 "1:1"）；调用方 aspect_ratio 该穿透进 body.size。
const APIMART_SEEDREAM = t2iProfile(SEEDREAM, "apimart", "https://api.apimart.ai");
// 像素语义 size 的档案：火山 seedream（默认 "2048x2048"）、modelscope（默认 "1024x1024"）——调用方 aspect_ratio 不许污染 size。
const VOLCENGINE_SEEDREAM = t2iProfile(VOLCENGINE_IMAGE_MODELS.find((m) => m.archetypeId === "volcengine-seedream")!, "volcengine", "https://ark.cn-beijing.volces.com");
const MODELSCOPE_IMAGE = t2iProfile(MODELSCOPE_IMAGE_MODELS.find((m) => m.archetypeId === "modelscope-image")!, "modelscope", "https://api-inference.modelscope.cn");

// core.generateOnProject 装配 extras 的等价：{...params, modelKey, projectId, nodeId, ...}。此处只关心 params
// 那部分（画幅经它下沉）；其余固定字段不影响 size 的争夺。modelKey 用具体档案的键。
function extrasFromCaller(callerArgs: Record<string, unknown>, modelKey = SEEDREAM.modelKey): Record<string, unknown> {
  const params = buildGenerateParams(callerArgs);
  return { ...params, modelKey };
}

/** 一个模型某个 taskKind 的 create op + 归一化身份（视频档案复用同一渲染路径）。 */
type ModeProfile = { modelKey: string; archetypeId: string; vendorKey: string; baseUrl: string; taskKind: string; op: HttpOperation };

/** 复刻 runtime：applyHeadlessParamDefaults（补档案默认，caller-wins + size 别名闸）→ 渲染出真实 wire body。 */
function renderBody(profile: ModeProfile, extras: Record<string, unknown>): Record<string, unknown> {
  const merged = applyHeadlessParamDefaults(extras, profile.archetypeId, profile.taskKind, profile.vendorKey, profile.op.defaultParams);
  const request = { kind: profile.taskKind, prompt: "深夜面馆的橘猫", extras: merged } as never;
  const context = buildTemplateContext({
    request: request as unknown as Record<string, unknown>,
    params: applyParamMap(profile.op.paramMap, taskTemplateParams(request)),
    model: { modelKey: profile.modelKey },
    modelKey: profile.modelKey,
    apiKey: "SECRET",
  });
  const built = buildHttpRequest({ baseUrl: profile.baseUrl, authType: "bearer", apiKey: "SECRET", context, operation: profile.op });
  return built.body as Record<string, unknown>;
}

/** text_to_image 渲染入口（既有测试沿用，保持调用点不变）。 */
function renderT2IBody(profile: ImageT2IProfile, extras: Record<string, unknown>): Record<string, unknown> {
  return renderBody({ ...profile, taskKind: "text_to_image" }, extras);
}

/** 既有测试沿用的 apimart seedream 渲染入口（保持调用点不变）。 */
function renderSeedreamBody(extras: Record<string, unknown>): Record<string, unknown> {
  return renderT2IBody(APIMART_SEEDREAM, extras);
}

// Seedance 2.5 · apimart 文生视频：body 只读 `size`（SEEDANCE_T2V_BODY），size 控件默认 "adaptive"。
// 档案 size 选项集里有 16:9 等真比例档 → size 是**比例语义**（由 ARCHETYPE_SIZE_RATIO_SEMANTIC derive），
// 故调用方 aspect_ratio 该落进 size；不传时保持默认 "adaptive"。
const SEEDANCE_25 = APIMART_VIDEO_MODELS.find((m) => m.archetypeId === "seedance-2.5-apimart")!;
const SEEDANCE_25_T2V: ModeProfile = {
  modelKey: SEEDANCE_25.modelKey,
  archetypeId: SEEDANCE_25.archetypeId,
  vendorKey: "apimart",
  baseUrl: "https://api.apimart.ai",
  taskKind: "text_to_video",
  op: SEEDANCE_25.mappings.find((m) => m.taskKind === "text_to_video")!.create,
};

describe("交付3 · aspect_ratio 端到端覆盖 apimart seedream 的 1:1 默认", () => {
  it("默认（不传画幅）：body.size = 档案默认 1:1（回归基线）", () => {
    const body = renderSeedreamBody(extrasFromCaller({}));
    expect(body.size).toBe("1:1");
  });

  it("caller aspect_ratio=16:9 → body.size = 16:9（压过 1:1 默认，caller-wins 生效）", () => {
    const body = renderSeedreamBody(extrasFromCaller({ aspect_ratio: "16:9" }));
    expect(body.size).toBe("16:9");
  });

  it("caller aspect_ratio=9:16 → body.size = 9:16（另一个值同样穿透）", () => {
    const body = renderSeedreamBody(extrasFromCaller({ aspect_ratio: "9:16" }));
    expect(body.size).toBe("9:16");
  });

  it("不传画幅时整个 body 与旧默认逐字节相同（新参数不改变缺省行为）", () => {
    // 旧行为基线：extras 只有 modelKey，没有任何 params。
    const legacy = renderSeedreamBody({ modelKey: "doubao-seedream-4.5" });
    const withEmptyParams = renderSeedreamBody(extrasFromCaller({})); // buildGenerateParams({}) = {} → 无新增键
    expect(JSON.stringify(withEmptyParams)).toBe(JSON.stringify(legacy));
    // 且 legacy 就是档案默认那套（size 1:1 / resolution 2K / model enum）。
    expect(legacy).toMatchObject({ size: "1:1", resolution: "2K" });
  });

  it("resolution 同样穿透（body.resolution 取 caller 值，压过默认 2K）", () => {
    const body = renderSeedreamBody(extrasFromCaller({ resolution: "4K" }));
    expect(body.resolution).toBe("4K");
  });
});

describe("Fix A · 像素语义 size 档案：调用方比例不许污染 body.size（size 别名闸）", () => {
  it("火山 seedream + caller aspect_ratio=16:9 → body.size 仍是像素默认 2048x2048（不被 16:9 覆写）", () => {
    const body = renderT2IBody(VOLCENGINE_SEEDREAM, extrasFromCaller({ aspect_ratio: "16:9" }, VOLCENGINE_SEEDREAM.modelKey));
    expect(body.size).toBe("2048x2048");
  });

  it("modelscope image + caller aspect_ratio=16:9 → body.size 仍是像素默认 1024x1024（另一像素档案同样不被污染）", () => {
    const body = renderT2IBody(MODELSCOPE_IMAGE, extrasFromCaller({ aspect_ratio: "16:9" }, MODELSCOPE_IMAGE.modelKey));
    expect(body.size).toBe("1024x1024");
  });

  it("火山 seedream 不传画幅：body 与旧默认逐字节相同（闸不改变缺省行为）", () => {
    const legacy = renderT2IBody(VOLCENGINE_SEEDREAM, { modelKey: VOLCENGINE_SEEDREAM.modelKey });
    const withEmptyParams = renderT2IBody(VOLCENGINE_SEEDREAM, extrasFromCaller({}, VOLCENGINE_SEEDREAM.modelKey));
    expect(JSON.stringify(withEmptyParams)).toBe(JSON.stringify(legacy));
    expect(legacy).toMatchObject({ size: "2048x2048" });
  });

  it("像素档案里 UI 路自己填的真实像素 size 不受闸影响（只剥比例形的 caller size）", () => {
    // extras.size 是像素形（非 /^\d+:\d+$/），闸不该动它——UI 路填的具体像素照常发出。
    const body = renderT2IBody(VOLCENGINE_SEEDREAM, { modelKey: VOLCENGINE_SEEDREAM.modelKey, size: "2304x1728" });
    expect(body.size).toBe("2304x1728");
  });
});

describe("Fix 1 · 比例族默认（adaptive）的 size 键仍是比例语义：调用方比例该落进 size", () => {
  it("seedance-2.5-apimart t2v + caller aspect_ratio=16:9 → body.size = 16:9（不被 adaptive 默认吞）", () => {
    const body = renderBody(SEEDANCE_25_T2V, extrasFromCaller({ aspect_ratio: "16:9" }, SEEDANCE_25.modelKey));
    expect(body.size).toBe("16:9");
  });

  it("seedance-2.5-apimart t2v 不传画幅 → body.size 保持档案默认 adaptive", () => {
    const body = renderBody(SEEDANCE_25_T2V, extrasFromCaller({}, SEEDANCE_25.modelKey));
    expect(body.size).toBe("adaptive");
  });

  it("seedance-2.5-apimart t2v 不传画幅：body 与旧默认逐字节相同（derive 不改变缺省行为）", () => {
    const legacy = renderBody(SEEDANCE_25_T2V, { modelKey: SEEDANCE_25.modelKey });
    const withEmptyParams = renderBody(SEEDANCE_25_T2V, extrasFromCaller({}, SEEDANCE_25.modelKey));
    expect(JSON.stringify(withEmptyParams)).toBe(JSON.stringify(legacy));
    expect(legacy).toMatchObject({ size: "adaptive" });
  });
});

describe("buildGenerateParams — 画幅/时长归一（纯函数）", () => {
  it("aspect_ratio 铺进 aspect_ratio/size/aspectRatio 三别名（覆盖不同 archetype 读的键）", () => {
    expect(buildGenerateParams({ aspect_ratio: "16:9" })).toEqual({ aspect_ratio: "16:9", size: "16:9", aspectRatio: "16:9" });
  });
  it("resolution/duration 原样铺；duration 数字保留", () => {
    expect(buildGenerateParams({ resolution: "1080p", duration: 8 })).toEqual({ resolution: "1080p", duration: 8 });
  });
  it("空/缺省不凭空造字段（不传时逐字节等同旧默认的前提）", () => {
    expect(buildGenerateParams({})).toEqual({});
    expect(buildGenerateParams({ aspect_ratio: "  ", resolution: "", duration: Number.NaN })).toEqual({});
  });
  it("非字符串比例/非有限时长被忽略（不把脏值塞进 wire）", () => {
    expect(buildGenerateParams({ aspect_ratio: 169 as unknown as string, duration: "8" as unknown as number })).toEqual({});
  });
});

import { describe, it, expect } from "vitest";

// 交付3 · 端到端：MCP nomi_generate 的 aspect_ratio 一路走到**真实渲染出的 wire body**，压过 apimart
// seedream 的 "1:1" 默认；不传时 body 与旧默认逐字节相同。链路（复刻 core.generateOnProject 的 extras 装配）：
//   caller args → buildGenerateParams → 铺进 request.extras → applyHeadlessParamDefaults(caller-wins) →
//   taskTemplateParams → buildHttpRequest(真 apimart seedream create op) → body.size。
// 全程纯逻辑、零 electron、零额度。
import { buildGenerateParams } from "./mcpProtocol";
import { applyHeadlessParamDefaults, taskTemplateParams } from "../catalog/taskParams";
import { buildHttpRequest, buildTemplateContext } from "../ai/requestPipeline";
import { applyParamMap } from "../catalog/paramTranslate";
import { APIMART_IMAGE_MODELS } from "../catalog/apimartImages";

const SEEDREAM = APIMART_IMAGE_MODELS.find((m) => m.modelKey === "doubao-seedream-4.5")!;
const SEEDREAM_T2I = SEEDREAM.mappings.find((m) => m.taskKind === "text_to_image")!.create;
const ARCHETYPE_ID = SEEDREAM.archetypeId; // "seedream"

// core.generateOnProject 装配 extras 的等价：{...params, modelKey, projectId, nodeId, ...}。此处只关心 params
// 那部分（画幅经它下沉）；其余固定字段不影响 size 的争夺。
function extrasFromCaller(callerArgs: Record<string, unknown>): Record<string, unknown> {
  const params = buildGenerateParams(callerArgs);
  return { ...params, modelKey: "doubao-seedream-4.5" };
}

/** 复刻 runtime：applyHeadlessParamDefaults（补 seedream/apimart 的 size:"1:1" 默认，caller-wins）→ 渲染 body。 */
function renderSeedreamBody(extras: Record<string, unknown>): Record<string, unknown> {
  const merged = applyHeadlessParamDefaults(extras, ARCHETYPE_ID, "text_to_image", "apimart", SEEDREAM_T2I.defaultParams);
  const request = { kind: "text_to_image", prompt: "深夜面馆的橘猫", extras: merged } as never;
  const context = buildTemplateContext({
    request: request as unknown as Record<string, unknown>,
    params: applyParamMap(SEEDREAM_T2I.paramMap, taskTemplateParams(request)),
    model: { modelKey: "doubao-seedream-4.5" },
    modelKey: "doubao-seedream-4.5",
    apiKey: "SECRET",
  });
  const built = buildHttpRequest({ baseUrl: "https://api.apimart.ai", authType: "bearer", apiKey: "SECRET", context, operation: SEEDREAM_T2I });
  return built.body as Record<string, unknown>;
}

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

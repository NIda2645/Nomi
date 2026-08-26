import { describe, it, expect } from "vitest";
import { hasImageEditReferences, taskTemplateParams, firstReferenceImage, projectReferencesOntoBodyKeys, unreachableReferenceLabels, imageEditGuardError } from "./taskParams";

// 「接入即验证」的零额度一环：在不真跑、不花额度的前提下，核对"摊平给模板的参数"是否完整、类型对。
// 这些坑都只在真实参数构建里暴露（实测）：① duration 是数字被 firstString 吞成 ""；
// ② omni 参考数组该不该进 params；③ generate_audio 布尔值该原样保留。

describe("taskTemplateParams — 时长类型", () => {
  it("数字时长原样保留（修复点：number 5 不再被吞成空串）", () => {
    expect(taskTemplateParams({ extras: { duration: 5 } }).duration).toBe(5);
  });
  it("字符串时长 trim 后保留；缺省为空串", () => {
    expect(taskTemplateParams({ extras: { duration: " 8 " } }).duration).toBe("8");
    expect(taskTemplateParams({ extras: {} }).duration).toBe("");
  });
  it("durationSeconds / videoDuration 兜底", () => {
    expect(taskTemplateParams({ extras: { durationSeconds: 10 } }).duration).toBe(10);
  });
});

describe("taskTemplateParams — 数字线参数", () => {
  it("speed 字符串归一化为 number（修复中转 TTS 的严格 JSON 类型错误）", () => {
    expect(taskTemplateParams({ extras: { speed: " 1.5 " } }).speed).toBe(1.5);
  });
  it("speed number 原样保留，缺省不凭空造字段", () => {
    expect(taskTemplateParams({ extras: { speed: 0.75 } }).speed).toBe(0.75);
    expect(taskTemplateParams({ extras: {} })).not.toHaveProperty("speed");
  });
  it("非法 speed 不静默改成默认值", () => {
    expect(taskTemplateParams({ extras: { speed: "fast" } }).speed).toBe("fast");
  });
});

describe("taskTemplateParams — 档案参考输入（omni）", () => {
  it("archetypeInput 的 reference_image_urls 透传进 params（数组），generate_audio 布尔原样", () => {
    const params = taskTemplateParams({
      extras: {
        archetypeInput: { reference_image_urls: ["a.png", "b.png"] },
        generate_audio: true,
        resolution: "720p",
      },
    });
    expect(params.reference_image_urls).toEqual(["a.png", "b.png"]);
    expect(params.generate_audio).toBe(true);
    expect(params.resolution).toBe("720p");
  });
  it("无 archetypeInput → 不凭空造参考键", () => {
    const params = taskTemplateParams({ extras: { resolution: "1080p" } });
    expect(params).not.toHaveProperty("reference_image_urls");
  });
});

// 根因回归（2026-07-24 群反馈）：档案投影曾**独占**参考通道（archetypeInput 整包替换标准键）——
// 中转 gpt-image-2 的参考只剩 kie 键 input_urls，multipart 模板读 reference_images、chat 多模态读
// chat_image_parts、i2v 读 image_url，全空 → 改图不带图被拒/首帧到不了 wire。不变量：标准键先建、
// 档案键叠加其上（同名键档案权威）；内置家 body 只引用自家声明键，多出的标准键不进 body。
describe("referenceInputParams/taskTemplateParams — 标准键与档案键并存（中转不丢参考）", () => {
  it("档案模型（kie input_urls 键）+ 标准 referenceImages：两面并存，chat_image_parts/image_url 可派生", () => {
    const params = taskTemplateParams({
      extras: {
        archetypeInput: { input_urls: ["ref.png"], model: "gpt-image-2-image-to-image" },
        referenceImages: ["ref.png"],
      },
    });
    // 档案键照旧（kie/apimart body 读它）
    expect(params.input_urls).toEqual(["ref.png"]);
    // 标准键不再被吞（中转 multipart 模板读 reference_images）
    expect(params.reference_images).toEqual(["ref.png"]);
    // chat 多模态参考件由标准键派生（中转 chat/completions 图生图）
    expect(params.chat_image_parts).toEqual([{ type: "image_url", image_url: { url: "ref.png" } }]);
    // i2v/单图口径由标准面派生
    expect(params.image_url).toBe("ref.png");
  });

  it("档案首帧（标准 firstFrameUrl 并存）→ first_frame_url 与 image_url 都在场；同名键档案权威", () => {
    const params = taskTemplateParams({
      extras: {
        archetypeInput: { first_frame_url: "frame-A.png" },
        firstFrameUrl: "frame-A.png",
      },
    });
    expect(params.first_frame_url).toBe("frame-A.png");
    expect(params.image_url).toBe("frame-A.png");
  });

  it("同名键冲突时档案权威覆盖标准值（构造层投影是单一真相）", () => {
    const params = taskTemplateParams({
      extras: {
        archetypeInput: { first_frame_url: "mode-filtered.png" },
        firstFrameUrl: "raw-standard.png",
      },
    });
    expect(params.first_frame_url).toBe("mode-filtered.png");
  });
});

describe("firstReferenceImage — 单图首选", () => {
  it("按 image_url → imageUrl → firstFrameUrl → lastFrameUrl → referenceImages[0] 顺序取第一个非空", () => {
    expect(firstReferenceImage({ extras: { firstFrameUrl: "f.png" } })).toBe("f.png");
    expect(firstReferenceImage({ extras: { referenceImages: ["r.png"] } })).toBe("r.png");
    expect(firstReferenceImage({ extras: {} })).toBe("");
  });
});

describe("hasImageEditReferences — L3 诚实护栏判定（图生图/图生视频是否真带了参考）", () => {
  it("空 extras → false", () => {
    expect(hasImageEditReferences({ extras: {} })).toBe(false);
    expect(hasImageEditReferences({})).toBe(false);
  });
  it("referenceImages（非档案路）→ true", () => {
    expect(hasImageEditReferences({ extras: { referenceImages: ["https://cdn/a.png"] } })).toBe(true);
  });
  it("archetypeInput 只有 model enum + fixedParams（无任何 URL）→ false（enum 不算参考图）", () => {
    expect(hasImageEditReferences({ extras: { archetypeInput: { model: "gpt-image-2-image-to-image", generation_type: "edit" } } })).toBe(false);
  });
  it("archetypeInput.input_urls → true（gpt-image-2 i2i 口径）", () => {
    expect(hasImageEditReferences({ extras: { archetypeInput: { model: "gpt-image-2-image-to-image", input_urls: ["nomi-local://asset/p/a.png"] } } })).toBe(true);
  });
  it("volcengine content 项（嵌套 {image_url:{url}}）→ true", () => {
    expect(hasImageEditReferences({ extras: { archetypeInput: { volcengine_image_contents: [{ type: "image_url", image_url: { url: "https://cdn/a.png" }, role: "reference_image" }] } } })).toBe(true);
  });
  it("extras.image 裸键（headless/老调用方）→ true", () => {
    expect(hasImageEditReferences({ extras: { image: "https://cdn/first.png" } })).toBe(true);
  });
  it("firstFrameUrl 单图口径 → true", () => {
    expect(hasImageEditReferences({ extras: { firstFrameUrl: "https://cdn/f.png" } })).toBe(true);
  });
});

// W1d：headless/MCP 参考键形态投影（把 referenceImages 投影到 body 真读的 image_urls / first_frame_image…）。
// 现场：docs/audit/2026-08-19-l3-w1-shot-verify/run.json——参考落 reference_images、body 读 image_urls → 全被护栏拒。
describe("projectReferencesOntoBodyKeys — headless 参考键形态投影（W1d 根因修复）", () => {
  // seedream/gemini 改图真实 seed body：读 image_urls（数组）。
  const editBody = { model: "{{model.modelKey}}", size: "{{request.params.size}}", image_urls: "{{request.params.image_urls}}" };
  // seedance i2v 真实 seed body：image_urls 与 image_with_roles 互斥同存。
  const seedanceI2v = { image_urls: "{{request.params.image_urls}}", video_urls: "{{request.params.video_urls}}", audio_urls: "{{request.params.audio_urls}}", image_with_roles: "{{request.params.image_with_roles}}" };
  // kling i2v：单图字符串首帧键。
  const klingI2v = { first_frame_image: "{{request.params.first_frame_image}}" };
  // 纯文生 body（无参考键）。
  const t2iBody = { model: "{{model.modelKey}}", size: "{{request.params.size}}" };

  it("referenceImages 投影到 image_urls（数组键塞整组）→ 护栏放行", () => {
    const extras = { referenceImages: ["nomi-local://asset/p/a.jpg", "nomi-local://asset/p/b.jpg"] };
    const overlay = projectReferencesOntoBodyKeys(extras, editBody);
    expect(overlay).toEqual({ image_urls: ["nomi-local://asset/p/a.jpg", "nomi-local://asset/p/b.jpg"] });
    // 投影后 body 读得到参考 → 第三闸不再判「参考图发不出」。
    const merged = { ...extras, ...overlay };
    expect(unreachableReferenceLabels({ extras: merged }, editBody)).toEqual([]);
    expect(imageEditGuardError("image_edit", { extras: merged }, true, "Seedream 4.5", editBody, [{ taskKind: "image_edit", body: editBody }])).toBeNull();
  });

  it("单图字符串键（first_frame_image）塞首张、不塞数组（严格端点期待 string）", () => {
    const overlay = projectReferencesOntoBodyKeys({ referenceImages: ["nomi-local://a.jpg", "nomi-local://b.jpg"] }, klingI2v);
    expect(overlay).toEqual({ first_frame_image: "nomi-local://a.jpg" });
  });

  it("互斥的对象形态键（image_with_roles）不填——只填 plain image_urls，避免既错形状又互斥", () => {
    const overlay = projectReferencesOntoBodyKeys({ referenceImages: ["nomi-local://a.jpg", "nomi-local://b.jpg"] }, seedanceI2v);
    expect(overlay).toEqual({ image_urls: ["nomi-local://a.jpg", "nomi-local://b.jpg"] });
    expect(overlay).not.toHaveProperty("image_with_roles");
  });

  it("同族多键（image_urls 数组 + first_frame_image 单值）只填一个：优先数组键（扁平列表天然去处）", () => {
    const happyhorse = { first_frame_image: "{{request.params.first_frame_image}}", image_urls: "{{request.params.image_urls}}" };
    const overlay = projectReferencesOntoBodyKeys({ referenceImages: ["nomi-local://a.jpg", "nomi-local://b.jpg"] }, happyhorse);
    expect(overlay).toEqual({ image_urls: ["nomi-local://a.jpg", "nomi-local://b.jpg"] });
  });

  it("image + video 两族各填自己的 plain 复数键（都塞数组）", () => {
    const overlay = projectReferencesOntoBodyKeys({ referenceImages: ["nomi-local://a.jpg"], referenceVideoUrls: ["nomi-local://v.mp4"] }, seedanceI2v);
    expect(overlay).toEqual({ image_urls: ["nomi-local://a.jpg"], video_urls: ["nomi-local://v.mp4"] });
  });

  it("纯文生 body（无参考键）→ 投影 no-op（行为逐字节不变）", () => {
    expect(projectReferencesOntoBodyKeys({ referenceImages: ["nomi-local://a.jpg"] }, t2iBody)).toEqual({});
  });

  it("既有值优先：extras 已填 image_urls（渲染层 archetypeInput 或调用方显式）→ 不覆盖（渲染层路径 no-op）", () => {
    const overlay = projectReferencesOntoBodyKeys({ referenceImages: ["nomi-local://new.jpg"], image_urls: ["https://cdn/preset.jpg"] }, editBody);
    expect(overlay).toEqual({});
  });

  it("无任何携带参考 → 空对象（零开销）", () => {
    expect(projectReferencesOntoBodyKeys({}, editBody)).toEqual({});
    expect(projectReferencesOntoBodyKeys(undefined, editBody)).toEqual({});
  });
});


describe("declared numeric and negative controls", () => {
  it("preserves extras seed and negative_prompt when top-level request fields are absent", () => {
    const params = taskTemplateParams({ extras: { seed: "123", negative_prompt: "blur" } });
    expect(params.seed).toBe(123);
    expect(params.negative_prompt).toBe("blur");
  });
  it("top-level request values win over extras, including seed zero", () => {
    const params = taskTemplateParams({ seed: 0, negativePrompt: "noise", extras: { seed: "123", negative_prompt: "blur" } });
    expect(params.seed).toBe(0);
    expect(params.negative_prompt).toBe("noise");
  });
});

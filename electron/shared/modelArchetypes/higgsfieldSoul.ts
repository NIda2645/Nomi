import type { ModelParameterControl } from "../videoCapabilities/types";
import type { ModelArchetype } from "./types";

// Higgsfield 自研图片档案（Soul 2 / Soul Cinema）。
//
// 参数表来自 2026-09-17 对服务端校验器的一手反推（证据与探针原文：
// docs/evidence/2026-09-17-higgsfield-contract/）。枚举**逐字抄自校验器的报错原文**，
// 不是从文档转述的——例如 aspect_ratio 的七个值是
// "Input should be '9:16', '16:9', '4:3', '3:4', '1:1', '2:3' or '3:2'"。
//
// 两个模型都是**纯文生图**：给 image_url / image_urls / input_images / reference_image_url
// 塞脏值，校验器一个字都不报 ⇒ 这些字段不存在。所以 slots 为空，不是「还没接参考图」，
// 而是这两个模型压根不吃图片输入。

const opt = (values: string[]): ModelParameterControl["options"] => values.map((value) => ({ value, label: value }));

/** 两个模型共用的比例枚举（校验器对二者报同一串）。 */
const ASPECT = ["9:16", "16:9", "4:3", "3:4", "1:1", "2:3", "3:2"];

const SHARED_PARAMS: ModelParameterControl[] = [
  // 默认值取校验器/官方文档一致的 "4:3"。
  { key: "aspect_ratio", label: "比例", type: "select", options: opt(ASPECT), defaultValue: "4:3" },
  { key: "resolution", label: "清晰度", type: "select", options: opt(["720p", "1080p"]), defaultValue: "720p" },
  // 校验器原话 "Input should be 1 or 4" —— 不是 1..4 的范围，是两个字面量。
  { key: "batch_size", label: "出图张数", type: "select", options: [1, 4].map((value) => ({ value, label: String(value) })), defaultValue: 1 },
  { key: "enhance_prompt", label: "自动润色提示词", type: "boolean", options: [], defaultValue: true },
  // 校验器原话 "Input should be greater than or equal to 1" —— 下界是 1，不是 0。
  { key: "seed", label: "种子", type: "number", options: [], min: 1, max: 1000000 },
];

// ⚠️ 故意不暴露 style_id / style_strength（Soul 2 有这两个字段）：style_id 是 UUID，
// 而**拿不到合法 UUID 的清单**（/soul-styles、/styles、/soul/styles、/higgsfield-ai/soul/styles
// 全部 405 = 未映射）。没有清单就给不出选择器，编一份枚举等于骗用户。
// 待向 Higgsfield 索要 styles 端点后再补（见证据文件 §6）。

const SOURCE = (covers: string) => ({
  url: "https://docs.higgsfield.ai/docs/models/soul-2/generate",
  checkedAt: "2026-09-17",
  vendorKey: "higgsfield",
  covers,
});

export const HIGGSFIELD_SOUL_2_ARCHETYPE: ModelArchetype = {
  id: "higgsfield-soul-2",
  family: "higgsfield-soul",
  label: "Soul 2",
  kind: "image",
  defaultModeId: "t2i",
  transportTaskKind: "text_to_image",
  identifierPatterns: ["higgsfield-ai/soul/v2/standard", "higgsfield-soul-2", "soul-2"],
  sources: [
    SOURCE("Soul 2 字段表与枚举由 POST /higgsfield-ai/soul/v2/standard 的 422 校验错误逐字反推（2026-09-17）：prompt 必填；aspect_ratio 七值；resolution 720p/1080p；batch_size 字面量 1 或 4；enhance_prompt 布尔；seed >= 1；style_id UUID 与 style_strength 浮点存在但无法取得合法值清单，故未暴露。无任何图片输入字段。"),
  ],
  modes: [{
    id: "t2i", intent: "text", vendorTerm: "文生图", hint: "Higgsfield 旗舰图片模型，纯文字生成",
    promptRequired: true, transportTaskKind: "text_to_image", slots: [], params: SHARED_PARAMS,
  }],
};

export const HIGGSFIELD_SOUL_CINEMA_ARCHETYPE: ModelArchetype = {
  id: "higgsfield-soul-cinema",
  family: "higgsfield-soul",
  label: "Soul Cinema",
  kind: "image",
  defaultModeId: "t2i",
  transportTaskKind: "text_to_image",
  identifierPatterns: ["higgsfield-ai/soul/cinema", "higgsfield-soul-cinema", "soul-cinema"],
  sources: [
    SOURCE("Soul Cinema 字段表由 POST /higgsfield-ai/soul/cinema 的 422 校验错误反推（2026-09-17）：与 Soul 2 同的 prompt/aspect_ratio/resolution/batch_size/enhance_prompt/seed，但**没有** style_id/style_strength，另有 custom_reference_id(UUID)。该模型不出现在 GET /models 目录里，端点却是活的——目录不是可调用性的权威源。"),
  ],
  modes: [{
    id: "t2i", intent: "text", vendorTerm: "文生图", hint: "电影感成像，纯文字生成",
    promptRequired: true, transportTaskKind: "text_to_image", slots: [], params: SHARED_PARAMS,
  }],
};

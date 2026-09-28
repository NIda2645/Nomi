// Higgsfield 精选模型 —— **只接旗舰自研，转售的一个不接**。
//
// `GET /models` 返回 76 条，其中 74 条是转售壳（Kling 全系、Seedance、Wan、MiniMax、
// Recraft、Ideogram、PixVerse、xAI、Z-Image…）。这些模型 Nomi 已经直连原厂，
// 经 Higgsfield 再转一层没有任何增量能力，只多一层中转和加价 —— 故不接（用户拍板）。
//
// 接的三个都是 Higgsfield 自研、别处买不到的：Soul 2、Soul Cinema、DoP。
// ⚠️ Soul Cinema 与 DoP **不在 `GET /models` 目录里**，但端点是活的（estimate 与 422 校验
// 都正常应答）。所以模型清单不能从那个目录派生——它是一份聚合展示列表，不是可调用性的
// 权威源。这里显式声明，并在各自档案的 sources 里注明这一点。
//
// 没接的三个与理由（不猜参数，见 docs/evidence/2026-09-17-higgsfield-contract §6）：
//   - Soul Standard：被 Soul 2 取代，且贵 30 倍（1.5 credits vs 0.05），接了只会让用户选错。
//   - Marketing Studio Image：`input_schema` 为 null、官方文档页 404，除了 prompt 之外
//     一个字段都反推不出来（它用的是 jsonschema 校验器，报错只说第一个缺的字段）。
//   - Soul ID：产出的是「角色身份」不是一次生成结果，Nomi 现有六种 slot kind 里没有对应
//     形态；要不要新增 archetype 类型是设计问题，得先过 P5 grill。另外 40 credits/$2.50。

import type { HttpOperation, ProfileKind } from "./types";
import {
  HIGGSFIELD_IMAGE_QUERY_OP,
  HIGGSFIELD_PROVIDER_META_MAPPING,
  HIGGSFIELD_STATUS_MAPPING,
  HIGGSFIELD_VIDEO_QUERY_OP,
} from "./higgsfieldVendor";

/**
 * 两个 Soul 模型的请求体逐字相同，只有路径不同 —— 所以 body 只写一份。
 * 未设置的参数由 renderTemplateValue 整键丢弃（见 requestPipeline），
 * 于是 seed / enhance_prompt 没填时根本不进 JSON，走供应商自己的默认值，
 * 我们不复制一份默认值（那会变成第二真相源，且供应商改默认时我们不知道）。
 */
const soulBody = {
  prompt: "{{request.prompt}}",
  aspect_ratio: "{{request.params.aspect_ratio}}",
  resolution: "{{request.params.resolution}}",
  batch_size: "{{request.params.batch_size}}",
  enhance_prompt: "{{request.params.enhance_prompt}}",
  seed: "{{request.params.seed}}",
};

const soulCreate = (path: string): HttpOperation => ({
  method: "POST",
  path,
  body: soulBody,
  response_mapping: { task_id: "request_id", status: "status" },
  provider_meta_mapping: { ...HIGGSFIELD_PROVIDER_META_MAPPING },
});

/** DoP 两个变体的 body 也逐字相同（实测 standard 与 turbo 校验器报同一张字段表）。 */
const dopBody = {
  prompt: "{{request.prompt}}",
  image_url: "{{request.params.image_url}}",
  end_image_url: "{{request.params.end_image_url}}",
  enhance_prompt: "{{request.params.enhance_prompt}}",
  seed: "{{request.params.seed}}",
};

const dopCreate = (path: string): HttpOperation => ({
  method: "POST",
  path,
  body: dopBody,
  response_mapping: { task_id: "request_id", status: "status" },
  provider_meta_mapping: { ...HIGGSFIELD_PROVIDER_META_MAPPING },
});

export const HIGGSFIELD_MODELS = [
  {
    modelKey: "higgsfield-ai/soul/v2/standard",
    labelZh: "Soul 2",
    kind: "image" as const,
    archetypeId: "higgsfield-soul-2",
    mappings: [{
      id: "seed-higgsfield-soul-2-t2i",
      taskKind: "text_to_image" as ProfileKind,
      name: "Soul 2 · 文生图",
      create: soulCreate("/higgsfield-ai/soul/v2/standard"),
      query: HIGGSFIELD_IMAGE_QUERY_OP,
      statusMapping: HIGGSFIELD_STATUS_MAPPING,
    }],
  },
  {
    modelKey: "higgsfield-ai/soul/cinema",
    labelZh: "Soul Cinema",
    kind: "image" as const,
    archetypeId: "higgsfield-soul-cinema",
    mappings: [{
      id: "seed-higgsfield-soul-cinema-t2i",
      taskKind: "text_to_image" as ProfileKind,
      name: "Soul Cinema · 文生图",
      create: soulCreate("/higgsfield-ai/soul/cinema"),
      query: HIGGSFIELD_IMAGE_QUERY_OP,
      statusMapping: HIGGSFIELD_STATUS_MAPPING,
    }],
  },
  {
    modelKey: "higgsfield-ai/dop/standard",
    labelZh: "DoP",
    kind: "video" as const,
    archetypeId: "higgsfield-dop",
    mappings: [{
      id: "seed-higgsfield-dop-standard-i2v",
      taskKind: "image_to_video" as ProfileKind,
      name: "DoP · 图生视频",
      create: dopCreate("/higgsfield-ai/dop/standard"),
      query: HIGGSFIELD_VIDEO_QUERY_OP,
      statusMapping: HIGGSFIELD_STATUS_MAPPING,
    }],
  },
  {
    modelKey: "higgsfield-ai/dop/turbo",
    labelZh: "DoP Turbo",
    kind: "video" as const,
    archetypeId: "higgsfield-dop",
    mappings: [{
      id: "seed-higgsfield-dop-turbo-i2v",
      taskKind: "image_to_video" as ProfileKind,
      name: "DoP Turbo · 图生视频",
      create: dopCreate("/higgsfield-ai/dop/turbo"),
      query: HIGGSFIELD_VIDEO_QUERY_OP,
      statusMapping: HIGGSFIELD_STATUS_MAPPING,
    }],
  },
];

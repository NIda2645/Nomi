import type { ModelParameterControl, ModelArchetype } from "./types";

// Higgsfield DoP（Director of Photography）视频档案 —— 该家的旗舰视频模型。
//
// **这份表推翻了第三方镜像**。官方文档页 404（多次路径都试过），网上能搜到的参数表来自
// mindcloud.co 的镜像，它自己也声明「可能与官方直接 API 不同」。2026-09-17 我们对
// POST /higgsfield-ai/dop/standard 做 422 反推，结果是：
//   - 镜像写的 `duration` / `webhookUrl` **不存在**（塞脏值校验器一个字都不报）；
//   - 镜像没提的 `end_image_url`（尾帧）与 `motions`（运镜）**才是真的**；
//   - `resolution` / `aspect_ratio` / `quality` / `batch_size` 全都不存在。
// 证据与探针原文：docs/evidence/2026-09-17-higgsfield-contract/。
// 这正是 R5 的那条：凭二手资料判断 = 没查。

const PARAMS: ModelParameterControl[] = [
  { key: "enhance_prompt", label: "自动润色提示词", type: "boolean", options: [], defaultValue: true },
  { key: "seed", label: "种子", type: "number", options: [], min: 1, max: 1000000 },
];

// ⚠️ 故意不暴露 motions：校验器只肯说 motions[i] 要 { id, strength } 两个必填子字段，
// **不给 id 的合法值清单**，也没有可用的运镜列表端点。给不出选项就不做控件（不编枚举）。
// 待向 Higgsfield 索要运镜清单后再补（见证据文件 §6）。

const MODES = [
  {
    id: "i2v", intent: "single" as const, vendorTerm: "图生视频", hint: "单图首帧驱动运镜",
    promptRequired: true, transportTaskKind: "image_to_video" as const,
    slots: [{ kind: "image_ref" as const, label: "首帧", min: 1, max: 1, inputKey: "image_url", asArray: false }],
    params: PARAMS,
  },
  {
    id: "firstlast", intent: "firstlast" as const, vendorTerm: "首尾帧", hint: "给定首尾两帧，生成中间的运镜",
    promptRequired: true, transportTaskKind: "image_to_video" as const,
    slots: [
      { kind: "first_frame" as const, label: "首帧", min: 1, max: 1, inputKey: "image_url", asArray: false },
      { kind: "last_frame" as const, label: "尾帧", min: 1, max: 1, inputKey: "end_image_url", asArray: false },
    ],
    params: PARAMS,
  },
];

export const HIGGSFIELD_DOP_ARCHETYPE: ModelArchetype = {
  id: "higgsfield-dop",
  family: "higgsfield-dop",
  label: "DoP",
  kind: "video",
  defaultModeId: "i2v",
  transportTaskKind: "image_to_video",
  identifierPatterns: ["higgsfield-ai/dop/standard", "higgsfield-ai/dop/turbo", "higgsfield-dop-standard", "higgsfield-dop-turbo"],
  sources: [{
  url: "https://api.higgsfield.ai/higgsfield-ai/dop/standard",
  checkedAt: "2026-09-17",
  vendorKey: "higgsfield",
  covers: "DoP 字段表由 422 校验错误一手反推（官方文档页 404，未采信第三方镜像）：prompt(string, 必填)、image_url(URL, 必填)、end_image_url(URL, 可选)、motions(list of {id,strength})、enhance_prompt(bool)、seed(int>=1)。镜像声称的 duration/webhookUrl 经实测不存在。standard 与 turbo 两个变体字段相同、仅路径与价格不同（estimate: 9.000 credits/$0.563 与 6.500/$0.407）。",
}],
  modes: MODES,
};

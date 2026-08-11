import type { ModelParameterControl } from "../modelCatalogMeta";
import type { ModelArchetype } from "./types";

// APIMart doubao-seedance-2.5 能力档案。与 KIE 的 Seedance 2.5 分开：APIMart 用
// image_with_roles 表达首/尾帧，image_urls 始终是参考图，且 size / output_format / watermark /
// seed / return_last_frame 都是 APIMart 自己的请求字段。

const options = (values: string[]): ModelParameterControl["options"] => values.map((value) => ({ value, label: value }));

const PARAMS: ModelParameterControl[] = [
  { key: "size", label: "比例", type: "select", options: options(["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]), defaultValue: "adaptive" },
  { key: "resolution", label: "清晰度", type: "select", options: options(["480p", "720p"]), defaultValue: "720p" },
  { key: "duration", label: "时长(秒)", type: "number", options: [], min: 4, max: 30, defaultValue: 5 },
  { key: "generate_audio", label: "生成音频", type: "boolean", options: [], defaultValue: true },
  { key: "watermark", label: "添加水印", type: "boolean", options: [], defaultValue: false },
  { key: "output_format", label: "输出格式", type: "select", options: options(["mp4", "mov"]), defaultValue: "mp4" },
  { key: "return_last_frame", label: "返回尾帧", type: "boolean", options: [], defaultValue: false },
  { key: "seed", label: "种子", type: "number", options: [], placeholder: "随机" },
];

const MODES: ModelArchetype["modes"] = [
  {
    id: "t2v",
    intent: "text",
    vendorTerm: "文生视频",
    hint: "纯文字生成视频，最长 30 秒",
    promptRequired: true,
    transportTaskKind: "text_to_video",
    slots: [],
    params: PARAMS,
  },
  {
    id: "first",
    intent: "single",
    vendorTerm: "首帧",
    hint: "首帧图驱动生成",
    promptRequired: true,
    transportTaskKind: "image_to_video",
    slots: [{ kind: "first_frame", label: "首帧", min: 1, max: 1 }],
    combineSlotsInto: { key: "image_with_roles" },
    params: PARAMS,
  },
  {
    id: "firstlast",
    intent: "firstlast",
    vendorTerm: "首尾帧",
    hint: "首帧 + 尾帧，自动补间过渡",
    promptRequired: true,
    transportTaskKind: "image_to_video",
    slots: [
      { kind: "first_frame", label: "首帧", min: 1, max: 1 },
      { kind: "last_frame", label: "尾帧", min: 0, max: 1 },
    ],
    combineSlotsInto: { key: "image_with_roles" },
    params: PARAMS,
  },
  {
    id: "omni",
    intent: "character",
    vendorTerm: "全能参考",
    hint: "多模态参考；最多 30 图 / 10 视频 / 10 音频",
    promptRequired: true,
    transportTaskKind: "image_to_video",
    slots: [
      { kind: "image_ref", label: "参考图", min: 0, max: 30, characterIndexed: true, inputKey: "image_urls" },
      { kind: "video_ref", label: "参考视频", min: 0, max: 10, inputKey: "video_urls" },
      { kind: "audio_ref", label: "参考音频", min: 0, max: 10, inputKey: "audio_urls" },
    ],
    params: PARAMS,
  },
];

export const SEEDANCE_2_5_APIMART_ARCHETYPE: ModelArchetype = {
  id: "seedance-2.5-apimart",
  family: "seedance",
  label: "Seedance 2.5",
  kind: "video",
  defaultModeId: "t2v",
  transportTaskKind: "text_to_video",
  identifierPatterns: ["doubao-seedance-2.5", "doubao-seedance-2-5"],
  modes: MODES,
};

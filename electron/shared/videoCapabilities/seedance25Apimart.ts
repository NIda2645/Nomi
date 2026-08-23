import type { ModelArchetype, ModelParameterControl } from "./types";

const opt = (values: string[]): ModelParameterControl["options"] => values.map((value) => ({ value, label: value }));

const SIZE: ModelParameterControl = {
  key: "size",
  label: "比例",
  type: "select",
  options: opt(["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]),
  defaultValue: "adaptive",
};

const BASE_PARAMS: ModelParameterControl[] = [
  { key: "resolution", label: "清晰度", type: "select", options: opt(["480p", "720p"]), defaultValue: "720p" },
  { key: "duration", label: "时长(秒)", type: "number", options: [], min: 4, max: 30, defaultValue: 5 },
  { key: "generate_audio", label: "生成音频", type: "boolean", options: [], defaultValue: true },
  { key: "return_last_frame", label: "返回尾帧", type: "boolean", options: [], defaultValue: false },
  { key: "seed", label: "种子", type: "number", options: [], placeholder: "随机" },
];
const PARAMS: ModelParameterControl[] = [SIZE, ...BASE_PARAMS];

const UNKNOWN_CAMERA_PROMPT = { signal: "camera_motion", via: "prompt" as const, status: "unknown" as const };
const UNKNOWN_MOTION_REFERENCE = {
  signal: "motion_reference",
  via: "reference_slot" as const,
  slotKind: "video_ref" as const,
  status: "unknown" as const,
};

export const SEEDANCE_2_5_APIMART_ARCHETYPE: ModelArchetype = {
  id: "seedance-2.5-apimart",
  family: "seedance",
  label: "Seedance 2.5",
  kind: "video",
  sources: [
    {
      url: "https://docs.apimart.ai/cn/api-reference/videos/doubao-seedance-2-5",
      checkedAt: "2026-08-12",
      vendorKey: "apimart",
      covers: "reference channels, first/last-frame roles, parameter ranges and task constraints; page revalidation pending",
    },
  ],
  defaultModeId: "t2v",
  transportTaskKind: "text_to_video",
  identifierPatterns: ["doubao-seedance-2.5", "doubao-seedance-2-5"],
  modes: [
    {
      id: "t2v",
      intent: "text",
      vendorTerm: "文生视频",
      hint: "纯文字生成视频，最长 30 秒",
      promptRequired: true,
      transportTaskKind: "text_to_video",
      slots: [],
      expressionChannels: [UNKNOWN_CAMERA_PROMPT],
      params: PARAMS,
    },
    {
      id: "first",
      intent: "single",
      vendorTerm: "首帧",
      hint: "单张首帧图驱动生成",
      promptRequired: true,
      transportTaskKind: "image_to_video",
      slots: [{ kind: "first_frame", label: "首帧", min: 1, max: 1 }],
      combineSlotsInto: { key: "image_with_roles" },
      fixedParams: { size: "adaptive" },
      expressionChannels: [UNKNOWN_CAMERA_PROMPT],
      params: BASE_PARAMS,
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
      fixedParams: { size: "adaptive" },
      expressionChannels: [UNKNOWN_CAMERA_PROMPT],
      params: BASE_PARAMS,
    },
    {
      id: "omni",
      intent: "character",
      vendorTerm: "全能参考",
      hint: "多模态参考；最多 30 图 / 10 视频 / 10 音频",
      promptRequired: true,
      transportTaskKind: "image_to_video",
      slots: [
        { kind: "image_ref", label: "角色参考", min: 0, max: 30, characterIndexed: true, inputKey: "image_urls" },
        { kind: "video_ref", label: "参考视频", min: 0, max: 10, inputKey: "video_urls" },
        { kind: "audio_ref", label: "参考音频", min: 0, max: 10, inputKey: "audio_urls" },
      ],
      expressionChannels: [UNKNOWN_CAMERA_PROMPT, UNKNOWN_MOTION_REFERENCE],
      params: PARAMS,
    },
  ],
};

import type { ModelParameterControl } from "./types";
import type { ModelArchetype } from "./types";

// V2.0 preserves persisted IDs; dimensions are recommendations normalized by the service.
const opt = (values: string[]): ModelParameterControl["options"] => values.map((value) => ({ value, label: value }));

const PARAMS: ModelParameterControl[] = [
  { key: "aspect_ratio", label: "比例", type: "select", options: opt(["16:9", "9:16", "1:1", "4:3", "3:4"]), defaultValue: "16:9" },
  { key: "resolution", label: "清晰度", type: "select", options: opt(["480p", "720p", "1080p"]), defaultValue: "720p" },
  { key: "duration", label: "时长(秒)", type: "number", options: [], min: 1, max: 18, defaultValue: 5 },
  { key: "frame_rate", label: "帧率", type: "number", options: [], min: 1, max: 60, defaultValue: 24 },
  { key: "num_inference_steps", label: "采样步数", type: "number", options: [], step: 1 },
  { key: "seed", label: "随机种子", type: "number", options: [], step: 1 },
  { key: "negative_prompt", label: "负向提示", type: "text", options: [], placeholder: "排除的元素…" },
];

export const AGNES_VIDEO_ARCHETYPE: ModelArchetype = {
  id: "agnes-video",
  family: "agnes-video",
  sources: [{ url: "https://agnes-ai.com/zh-Hans/docs/agnes-video-v20", checkedAt: "2026-08-26", vendorKey: "agnes", covers: "Text/image/keyframes; 8n+1 frames <=441; frame_rate 1–60; seed/inference steps; no published keyframe count cap" }],
  label: "Agnes Video V2.0",
  kind: "video",
  defaultModeId: "t2v",
  transportTaskKind: "text_to_video",
  identifierPatterns: ["agnes-video", "agnes-video-v2.0", "agnes-video-v2"],
  modes: [
    { id: "t2v", intent: "text", vendorTerm: "文生视频", hint: "纯文字生成视频", promptRequired: true, transportTaskKind: "text_to_video", slots: [], params: PARAMS },
    {
      id: "i2v", intent: "single", vendorTerm: "图生视频", hint: "参考图作首帧驱动", promptRequired: true,
      transportTaskKind: "image_to_video",
      slots: [{ kind: "image_ref", label: "首帧图", min: 1, max: 1, inputKey: "image", asArray: false }],
      params: PARAMS,
    },
    {
      id: "keyframes", intent: "character", vendorTerm: "关键帧动画", hint: "按图片顺序生成关键帧过渡", promptRequired: true,
      transportTaskKind: "image_to_video",
      slots: [{ kind: "image_ref", label: "关键帧", min: 2, inputKey: "keyframe_images" }], params: PARAMS,
    },
  ],
};

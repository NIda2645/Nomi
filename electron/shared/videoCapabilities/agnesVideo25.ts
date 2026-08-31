import type { ModelArchetype, ModelParameterControl, ArchetypeReferenceSlot } from "./types";

const options = (values: string[]) => values.map((value) => ({ value, label: value }));
const params = (flash: boolean): ModelParameterControl[] => [
  { key: "duration", label: "时长(秒)", type: "select", options: options(["4", "5", "6", "7", "8", "9", "10", "11", "12"]), defaultValue: "5" },
  { key: "size", label: "清晰度", type: "select", options: options(flash ? ["720P"] : ["720P", "960P", "2K"]), defaultValue: "720P" },
  { key: "aspect_ratio", label: "比例", type: "select", options: options(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]), defaultValue: "16:9" },
  { key: "seed", label: "随机种子", type: "number", options: [], step: 1 },
];
const modes = (flash: boolean): ModelArchetype["modes"] => {
  const controls = params(flash);
  const referenceSlots: ArchetypeReferenceSlot[] = [
    { kind: "image_ref", label: "参考图", min: 0, ...(flash ? { max: 5 } : {}), inputKey: "images" },
    { kind: "audio_ref", label: "参考音频", min: 0, inputKey: "audios" },
    ...(!flash ? [{ kind: "video_ref" as const, label: "参考视频", min: 0, inputKey: "videos" }] : []),
  ];
  return [
    { id: "text", intent: "text", vendorTerm: "文生视频", hint: "纯文字生成视频", promptRequired: true, slots: [], params: controls, transportTaskKind: "text_to_video" },
    {
      id: "keyframe", intent: "firstlast", vendorTerm: "首尾帧", hint: "首帧、尾帧至少提供一张", promptRequired: true, transportTaskKind: "image_to_video", params: controls,
      slots: [
        { kind: "first_frame", label: "首帧", min: 0, max: 1, inputKey: "first_frame" },
        { kind: "last_frame", label: "尾帧", min: 0, max: 1, inputKey: "last_frame" },
      ],
    },
    { id: "reference", intent: "character", vendorTerm: "参考生视频", hint: flash ? "图片或音频参考生成视频" : "图片、音频或视频参考生成视频", promptRequired: true, slots: referenceSlots, params: flash ? controls : [...controls,
      { key: "video_start_seconds", label: "参考视频起始秒", type: "number", options: [] },
      { key: "video_require_audio", label: "参考视频必须含音轨", type: "boolean", options: [] },
    ], transportTaskKind: "image_to_video" },
  ];
};

export const AGNES_VIDEO_25_ARCHETYPE: ModelArchetype = {
  id: "agnes-video-2.5", family: "agnes-video-2.5", label: "Agnes Video 2.5", kind: "video",
  sources: [{ url: "https://agnes-ai.com/zh-Hans/docs/agnes-video-25", checkedAt: "2026-08-26", vendorKey: "agnes", covers: "text/keyframe/reference, string seconds 4–12, 720P/960P/2K, image/audio/video references; unpublished reference count caps omitted" }],
  defaultModeId: "text", transportTaskKind: "text_to_video", identifierPatterns: ["agnes-video-2.5"], modes: modes(false),
};
export const AGNES_VIDEO_25_FLASH_ARCHETYPE: ModelArchetype = {
  id: "agnes-video-2.5-flash", family: "agnes-video-2.5", label: "Agnes Video 2.5 Flash", kind: "video",
  sources: [{ url: "https://agnes-ai.com/zh-Hans/docs/agnes-video-25-flash", checkedAt: "2026-08-26", vendorKey: "agnes", covers: "Shared 2.5 modes and seconds; 720P only, at most 5 images, audio allowed, video references unsupported" }],
  defaultModeId: "text", transportTaskKind: "text_to_video", identifierPatterns: ["agnes-video-2.5-flash"], modes: modes(true),
};

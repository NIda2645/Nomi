// Official contracts checked 2026-08-26: agnes-ai.com/zh-Hans/docs/agnes-video-{v20,25,25-flash}.
// V2.0 keeps its existing model/archetype/mapping IDs. 2.5 is a different wire protocol.
import type { HttpOperation, ProfileKind } from "./types";
import type { ParamMap } from "./paramTranslate";
import { AGNES_VIDEO_QUERY_OP, AGNES_VIDEO_25_QUERY_OP } from "./agnesVendor";
import "./agnesVideoContract";

const HEADERS = { Authorization: "Bearer {{user_api_key}}", "Content-Type": "application/json" };
const param = (key: string) => `{{request.params.${key}}}`;
const AGNES_VIDEO_PARAM_MAP: ParamMap = {
  rules: [
    { wire: "width", fromMany: ["aspect_ratio", "resolution"], transform: "agnesVideoWidth" },
    { wire: "height", fromMany: ["aspect_ratio", "resolution"], transform: "agnesVideoHeight" },
    { wire: "num_frames", fromMany: ["duration", "frame_rate"], transform: "agnesVideoNumFrames" },
  ],
};

function video20CreateOp(i2v: boolean): HttpOperation {
  return {
    method: "POST", path: "/v1/videos", headers: HEADERS,
    body: {
      model: "{{model.modelKey}}", prompt: "{{request.prompt}}",
      width: param("width"), height: param("height"), num_frames: param("num_frames"), frame_rate: param("frame_rate"),
      negative_prompt: param("negative_prompt"), seed: param("seed"), num_inference_steps: param("num_inference_steps"),
      ...(i2v ? { image: param("image"), extra_body: { image: param("keyframe_images"), mode: param("mode") } } : {}),
    },
    response_mapping: { task_id: "video_id" }, provider_meta_mapping: { video_id: "video_id" },
    paramMap: AGNES_VIDEO_PARAM_MAP, request_transform: "agnes-video-v2.0",
    defaultParams: { aspect_ratio: "16:9", resolution: "720p", duration: "5", frame_rate: 24 },
  };
}

function video25CreateOp(media: boolean, flash: boolean): HttpOperation {
  return {
    method: "POST", path: "/v1/videos", headers: HEADERS,
    body: {
      model: "{{model.modelKey}}", prompt: "{{request.prompt}}", mode: param("mode"),
      seconds: param("duration"), size: param("size"), aspect_ratio: param("aspect_ratio"), seed: param("seed"), n: 1,
      // Keep all channels in the template so mixed input is rejected, never silently discarded.
      first_frame: param("first_frame"), last_frame: param("last_frame"),
      images: param("images"), audios: param("audios"),
      ...(!flash ? { videos: param("videos"), video_start_seconds: param("video_start_seconds"), video_require_audio: param("video_require_audio") } : {}),
    },
    response_mapping: { task_id: "video_id" }, provider_meta_mapping: { video_id: "video_id" },
    request_transform: "agnes-video-2.5",
    paramMap: { rules: [{ wire: "size", fromMany: ["resolution"], transform: "toUpperCase" }] },
    defaultParams: { duration: "5", size: "720P", aspect_ratio: "16:9", ...(media ? {} : { mode: "text" }) },
  };
}

export type AgnesVideoModel = {
  modelKey: string;
  labelZh: string;
  archetypeId: string;
  query: HttpOperation;
  mappings: { id: string; taskKind: ProfileKind; name: string; create: HttpOperation }[];
};

function video25(modelKey: string, labelZh: string): AgnesVideoModel {
  return {
    modelKey, labelZh, archetypeId: modelKey, query: AGNES_VIDEO_25_QUERY_OP,
    mappings: [
      { id: `seed-${modelKey}-text_to_video`, taskKind: "text_to_video", name: `${labelZh} · 文生视频`, create: video25CreateOp(false, modelKey.endsWith("-flash")) },
      { id: `seed-${modelKey}-image_to_video`, taskKind: "image_to_video", name: `${labelZh} · 参考生视频`, create: video25CreateOp(true, modelKey.endsWith("-flash")) },
    ],
  };
}

export const AGNES_VIDEO_MODELS: AgnesVideoModel[] = [
  {
    modelKey: "agnes-video-v2.0", labelZh: "Agnes Video V2.0", archetypeId: "agnes-video", query: AGNES_VIDEO_QUERY_OP,
    mappings: [
      { id: "seed-agnes-video-v2-text_to_video", taskKind: "text_to_video", name: "Agnes Video V2.0 · 文生视频", create: video20CreateOp(false) },
      { id: "seed-agnes-video-v2-image_to_video", taskKind: "image_to_video", name: "Agnes Video V2.0 · 图生视频", create: video20CreateOp(true) },
    ],
  },
  video25("agnes-video-2.5", "Agnes Video 2.5"),
  video25("agnes-video-2.5-flash", "Agnes Video 2.5 Flash"),
];

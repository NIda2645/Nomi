// Pure Agnes wire guards run before localization/spend and again immediately before HTTP.
// Sources: agnes-ai.com/zh-Hans/docs/agnes-video-{v20,25,25-flash}, checked 2026-08-26.
import { registerRequestTransform, type RequestTransformContext } from "../tasks/requestTransforms";
import { isJsonRecord } from "../jsonUtils";

type Body = Record<string, unknown>;
const present = (value: unknown): boolean => Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== "";
const has = (body: Body, keys: string[]) => keys.some((key) => present(body[key]));

function numeric(value: unknown, key: string, integer = false): number {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") throw new Error(`Agnes Video: ${key} must be numeric.`);
  const result = Number(value);
  if (!Number.isFinite(result) || (integer && !Number.isInteger(result))) throw new Error(`Agnes Video: ${key} must be ${integer ? "an integer" : "numeric"}.`);
  return result;
}

function urls(value: unknown, key: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((url) => typeof url !== "string" || !url.trim())) throw new Error(`Agnes Video: ${key} must be a list of media URLs.`);
  return value as string[];
}

export function normalizeAgnesVideo20(body: unknown): unknown {
  if (!isJsonRecord(body)) return body;
  const normalized = { ...body };
  for (const key of ["width", "height", "num_frames", "frame_rate", "num_inference_steps", "seed"]) {
    if (present(body[key])) normalized[key] = numeric(body[key], key, key !== "frame_rate");
  }
  const fps = normalized.frame_rate as number;
  if (fps < 1 || fps > 60) throw new Error("Agnes Video V2.0: frame_rate must be between 1 and 60.");
  const frames = normalized.num_frames as number;
  if (present(frames) && (frames < 1 || frames > 441 || (frames - 1) % 8 !== 0)) throw new Error("Agnes Video V2.0: num_frames must follow 8n + 1 and be at most 441.");
  const extra = isJsonRecord(body.extra_body) ? body.extra_body : {};
  const images = urls(extra.image, "extra_body.image");
  if (images.length && present(body.image)) throw new Error("Agnes Video V2.0: use either an input image or keyframes, not both.");
  // Official endpoint's live validation (2026-08-26): keyframes needs >=2 images.
  if ((extra.mode === "keyframes" || images.length > 0) && images.length < 2) throw new Error("Agnes Video V2.0: keyframes require at least two input images.");
  if (images.length) normalized.extra_body = { image: images, mode: "keyframes" };
  else delete normalized.extra_body;
  return normalized;
}

export function normalizeAgnesVideo25(body: unknown, context?: RequestTransformContext): unknown {
  if (!isJsonRecord(body)) return body;
  const normalized = { ...body };
  const images = urls(body.images, "images");
  const audios = urls(body.audios, "audios");
  if (body.videos !== undefined && !Array.isArray(body.videos)) throw new Error("Agnes Video 2.5: videos must be a list of reference video objects.");
  const videos = (body.videos as unknown[] | undefined) ?? [];
  const frame = has(body, ["first_frame", "last_frame"]);
  const reference = images.length > 0 || audios.length > 0 || videos.length > 0;
  // Current-mode slot names identify keyframe/reference unambiguously. Infer only when
  // absent, so explicit invalid mode/media combinations are still rejected.
  const mode = body.mode ?? (frame ? "keyframe" : reference ? "reference" : undefined);
  if (typeof mode !== "string" || !["text", "keyframe", "reference"].includes(mode)) throw new Error("Agnes Video 2.5: select text, keyframe or reference mode.");
  if ((mode === "text" && (frame || reference)) || (mode === "keyframe" && reference) || (mode === "reference" && frame)) throw new Error("Agnes Video 2.5: the selected mode cannot mix keyframes and reference media.");
  if (mode === "keyframe" && !frame) throw new Error("Agnes Video 2.5: supply a first frame, last frame, or both.");
  if (mode === "reference" && !reference) throw new Error("Agnes Video 2.5: supply an image, audio or video reference.");
  for (const key of ["first_frame", "last_frame"]) {
    if (present(body[key]) && typeof body[key] !== "string") throw new Error(`Agnes Video 2.5: ${key} must be a media URL.`);
  }
  const seconds = numeric(body.seconds ?? "5", "seconds", true);
  if (seconds < 4 || seconds > 12) throw new Error("Agnes Video 2.5: duration must be 4–12 seconds.");
  const flash = body.model === "agnes-video-2.5-flash";
  // Flash omits video placeholders so capability discovery remains honest. Still
  // reject explicit unsupported inputs rather than silently dropping them.
  const request = context?.request;
  const extras = isJsonRecord(request) && isJsonRecord(request.extras) ? request.extras : {};
  const active = isJsonRecord(extras.archetypeInput) ? extras.archetypeInput : extras;
  if (flash && (present(active.videos) || (!isJsonRecord(extras.archetypeInput) && present(extras.referenceVideoUrls)))) throw new Error("Agnes Video 2.5 Flash: video references are not supported.");
  if (typeof body.size !== "string" || !(flash ? ["720P"] : ["720P", "960P", "2K"]).includes(body.size)) throw new Error(`Agnes Video 2.5: size must be ${flash ? "720P" : "720P, 960P or 2K"}.`);
  if (flash && images.length > 5) throw new Error("Agnes Video 2.5 Flash: use at most five reference images.");
  if (flash && videos.length) throw new Error("Agnes Video 2.5 Flash: video references are not supported.");
  if (present(body.aspect_ratio) && (typeof body.aspect_ratio !== "string" || !["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"].includes(body.aspect_ratio))) throw new Error("Agnes Video 2.5: unsupported aspect_ratio.");
  normalized.mode = mode;
  normalized.seconds = String(seconds);
  if (present(body.seed)) normalized.seed = numeric(body.seed, "seed", true);
  if (videos.length) normalized.videos = videos.map((value) => {
    const video = typeof value === "string" ? { url: value } : value;
    if (!isJsonRecord(video) || typeof video.url !== "string" || !video.url.trim()) throw new Error("Agnes Video 2.5: each video reference requires a URL.");
    const start = video.start_seconds ?? body.video_start_seconds;
    const audio = video.require_audio ?? body.video_require_audio;
    if (audio !== undefined && typeof audio !== "boolean") throw new Error("Agnes Video 2.5: require_audio must be boolean.");
    return {
      url: video.url,
      ...(start !== undefined ? { start_seconds: numeric(start, "start_seconds") } : {}),
      ...(audio !== undefined ? { require_audio: audio } : {}),
    };
  });
  for (const key of ["images", "audios", "videos"]) if (!present(normalized[key])) delete normalized[key];
  delete normalized.video_start_seconds;
  delete normalized.video_require_audio;
  return normalized;
}

registerRequestTransform("agnes-video-v2.0", normalizeAgnesVideo20, (body) => { normalizeAgnesVideo20(body); });
registerRequestTransform("agnes-video-2.5", normalizeAgnesVideo25, (body, context) => { normalizeAgnesVideo25(body, context); });

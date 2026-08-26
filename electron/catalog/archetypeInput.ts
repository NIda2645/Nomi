// 内置档案的**参考输入构建**（评审 M5：input-builder 放 electron/catalog，不喂大 runtime.ts）。
//
// 把 TaskRequest.extras 里的参考字段（camelCase，渲染层投影出来的当前模式键）翻译成**通用 snake
// 参数键**——单图首/尾帧 + 多参考数组（image/video/audio）。这些是供应商无关的中间键；各供应商
// mapping body 再把它们映射到自己真正的 input 键（如 kie 的 `reference_video_urls ` 含尾随空格，
// §2 坑1，只在 kieSeedance body 写一次 = M1 单源）。
//
// **M2 互斥**：camelCase 只投影非空值；显式 snake 槽值原样保留（null 表示该槽空着）。
// 渲染层 catalogTaskActions 已把非当前模式的残留键置 undefined，不会进入 body。
import { firstString, isJsonRecord, type JsonRecord } from "../jsonUtils";

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

/**
 * 从 extras 构建参考相关的 snake 参数：聚合兜底 < 显式槽值 < 档案投影。
 *
 * 认得档案的模型：renderer 已据当前模式把完整 snake input 打好放进 `extras.archetypeInput`
 * （含 per-mode enum + 互斥投影，见 archetypeMeta.buildArchetypeInputParams）——这里**原样采用**，
 * 是单一来源。非档案模型：从 camelCase extras 现场映射（兼容既有 onboarding 模型，不破坏）。
 */
export function referenceInputParams(extras: JsonRecord): JsonRecord {
  const out: JsonRecord = {};
  const firstFrame = firstString(extras.firstFrameUrl);
  const lastFrame = firstString(extras.lastFrameUrl);
  if (firstFrame) out.first_frame_url = firstFrame;
  if (lastFrame) out.last_frame_url = lastFrame;

  const imageUrls = stringArray(extras.referenceImageUrls);
  const videoUrls = stringArray(extras.referenceVideoUrls);
  const audioUrls = stringArray(extras.referenceAudioUrls);
  if (imageUrls.length) out.reference_image_urls = imageUrls;
  if (videoUrls.length) {
    out.reference_video_urls = videoUrls;
    // 单源视频的标准键（与 first_frame_url 同构）：「视频进视频出」的工作流（补帧/视频超分/
    // 视频去背景）只吃一条源视频，模板引用它比引用数组第 0 项直白得多。
    out.source_video_url = videoUrls[0];
  }
  if (audioUrls.length) out.reference_audio_urls = audioUrls;

  out.reference_images = Array.isArray(extras.referenceImages) ? extras.referenceImages : [];
  // 已按声明槽分配的值不能被数组顺序覆盖；显式 null 也不能借用另一槽的素材。
  // image_url 同样在此叠加，覆盖 taskTemplateParams 的单图聚合兜底。
  for (const key of ["image_url", "first_frame_url", "last_frame_url", "source_video_url", "reference_images", "reference_image_urls", "reference_video_urls", "reference_audio_urls"]) {
    const value = extras[key];
    // 导入默认值里的空串不是显式清空；旧 camelCase 调用方仍可填它，只有 null 保留空槽意图。
    if (Object.prototype.hasOwnProperty.call(extras, key) && value !== undefined
      && (typeof value !== "string" || value.trim())) out[key] = value;
  }
  // 档案投影**叠加**在标准键之上（同名键档案权威）——绝不替代整包。旧实现 archetypeInput 独占返回，
  // 标准键（reference_images/chat_image_parts 的原料/first_frame_url）被吞 → 通用中转模板拿不到参考：
  // multipart 改图空图被拒、chat 多模态丢图、i2v 首帧到不了 wire（2026-07-24 群反馈根因）。
  // 内置家零影响：它们的 body 只引用各自声明的键（input_urls/volcengine_* …），多出的标准键不进 body。
  if (isJsonRecord(extras.archetypeInput)) {
    Object.assign(out, extras.archetypeInput);
  }
  return out;
}

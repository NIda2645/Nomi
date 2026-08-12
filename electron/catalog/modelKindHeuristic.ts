// 从模型 id 猜「图片/视频/配音/文本」类型（Issue #8 中转拉取式接入用）。
//
// 为什么需要：从中转 `/v1/models` 拉到的只有模型 id 字符串，不带类型。要把它们分门别类
// 落进 catalog（image/video/audio/text），得先判断每个 id 是哪类。判断是**启发式**（按关键词），
// 必然有猜错的——所以 UI 给用户一个下拉随手改（onboarding 不写死、judgement 可纠正）。
//
// 单一真相源：关键词表只在这里。新增模型族（如某新视频模型）在对应表加一行即可。

export type GuessableModelKind = "image" | "video" | "audio" | "text" | "model3d";

// 3D 模型族（命中即判 model3d）。放**最前**——这批词是全表里最具体的：一个 id 里出现
// 3d / trellis / meshy / tripo，它几乎不可能是别的类。不给它独立桶的话（旧实现），hunyuan3d
// 一类必然落进 text 兜底桶：既污染文本下拉，被选中还会被当聊天模型塞进 /chat/completions。
// 注意：中转目前**没有通用 3D 调用通道**（newapiTransportFor 只有 image/video/audio），所以这里
// 判对 = 分类诚实（不冒充文本模型），不等于接进来就能跑；接入向导会明着标这一点。
// 内置渠道（RunningHub 混元/HiTem/Meshy）的 3D 各有手写 mapping，不走这条启发式。
const MODEL3D_PATTERNS = [
  "3d", "trellis", "meshy", "tripo", "triposr", "rodin", "instantmesh", "mesh",
  "zero123", "shap-e", "point-e", "hunyuan3d", "hitem", "craftsman", "glb",
];

// 视频模型族（命中即判 video）。有些 id 同时含 image 词根但其实是视频（少见，保守起见
// 视频词优先级高于图片，因为视频更"重"、判错代价大）。
const VIDEO_PATTERNS = [
  "video", "kling", "sora", "veo", "runway", "gen-3", "gen3", "luma", "ray",
  "cogvideo", "hailuo", "minimax-hailuo", "seedance", "wan2", "wanx", "mochi",
  "pika", "vidu", "ltx", "hunyuan-video", "jimeng-video", "i2v", "t2v",
  // MiniMax 视频族：hailuo 之外还有 H3（图生视频，用户 2026-08-11 反馈想接但被分进文本桶）。
  "minimax-h3", "hailuo",
];

// 图片模型族（命中即判 image）。
const IMAGE_PATTERNS = [
  "image", "dall-e", "dalle", "gpt-image", "flux", "midjourney", "mj-", "sd-", "sdxl",
  "stable-diffusion", "stable-image", "seedream", "nano-banana", "qwen-image",
  "imagen", "ideogram", "recraft", "kolors", "playground", "z-image", "hidream",
  "jimeng", "irag", "cogview", "t2i",
  // xAI Grok Imagine：裸 id 就叫 grok-imagine（不含 image/video 词根），此前落进文本桶 →
  // 用户报「grok 接不进去、识别不出 image/video 类型」。带后缀的 -image/-video 由通用词根命中。
  "grok-imagine",
];

// 配音/音频模型族（命中即判 audio）。覆盖 TTS / 语音合成 / 语音对话 / 转写 / 音乐生成——
// 这些经中转接进来做配音/音轨的越来越多（豆包 TTS、CosyVoice、gpt-realtime、ElevenLabs…），
// 不再像旧实现那样塞进 text 桶（那样它们会被当文本大脑，判错代价高）。
const AUDIO_PATTERNS = [
  "tts", "text-to-speech", "speech", "voice", "audio", "whisper", "realtime",
  "cosyvoice", "sovits", "gpt-sovits", "fish-speech", "f5-tts", "elevenlabs",
  "vocal", "musicgen", "suno", "udio", "lyria", "mmaudio", "stable-audio",
  "doubao-speech", "seed-tts", "minimax-speech", "qwen-audio", "qwen-tts",
];

function idContains(id: string, patterns: string[]): boolean {
  return patterns.some((p) => id.includes(p));
}

/** 从模型 id 猜类型。默认 text（最安全：文本模型不需要 mapping，判错也只是多一个能聊天的条目）。
 *  判定顺序 model3d → video → audio → image → text：3D 词表最具体（命中即几乎确定）故最先；
 *  再按视频最重、判错代价最大优先；音频独立词表先于 image/text 命中，避免「speech/voice」类被吞进文本。
 *
 *  猜错是**必然**的（关键词判类的本质），所以纠错通道必须一直在：接入第二屏每行标出猜到的类型可就地改，
 *  落库之后在模型抽屉里每行仍可改（改 kind 同时按新类型重建调用通道，见 catalog/modelRetype.ts）。 */
export function guessModelKind(modelId: string): GuessableModelKind {
  const id = String(modelId || "").toLowerCase().trim();
  if (!id) return "text";
  if (idContains(id, MODEL3D_PATTERNS)) return "model3d";
  if (idContains(id, VIDEO_PATTERNS)) return "video";
  if (idContains(id, AUDIO_PATTERNS)) return "audio";
  if (idContains(id, IMAGE_PATTERNS)) return "image";
  return "text";
}

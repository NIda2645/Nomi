// 「画面比例」这件事的**单一真相**：什么值算比例、什么控件算比例控件、一个想要的比例落到哪个键上。
//
// 为什么住 shared：同一个判据有三个读者——画布参数面板（比例那组选项怎么摆、写回哪几个键）、
// 宿主准入层（Agent 说的 16:9 落到所选模式的哪个参数键，`capabilityCore/semanticAspectRatio.ts`），
// 以及将来分镜整片画幅落画布那一层。2026-10-05 之前它住在渲染层（`nodes/aspectRatio.ts` 与
// `parameterOptionPresentation.ts` 各一半），主进程读不到，于是宿主那一侧压根没有「比例」这个概念，
// 模型猜错键名就静默回落到档案默认（`docs/plan/2026-10-05-agent-aspect-ratio-semantic.md`）。
// 这里是搬家，不是第三份：两处旧定义同一提交删掉、改从这里读。

/**
 * 模型面 / 宿主面上「比例」的**语义键**——不是任何一家供应商的参数名。
 * `draft_shots` 的 `shots[].aspectRatio` 投影成宿主候选里的 `parameters.aspectRatio`，
 * 宿主在看得见所选模式参数表的那一处把它翻成真实键（`size` / `aspect_ratio` / `ratio` …）。
 * 名字与 `{w}:{h}` 格式照 Vercel AI SDK `generateImage({ aspectRatio })`。
 */
export const ASPECT_RATIO_SEMANTIC_KEY = "aspectRatio";

/**
 * Named bucket → W:H 标准字符串映射。
 * 覆盖 Seedream edit mode 的 image_size 枚举值（portrait_4_3 等）。
 */
const NAMED_RATIO_TO_WH: Readonly<Record<string, string>> = {
  square:         "1:1",
  square_hd:      "1:1",
  portrait_4_3:   "3:4",
  portrait_3_2:   "2:3",
  portrait_16_9:  "9:16",
  landscape_4_3:  "4:3",
  landscape_3_2:  "3:2",
  landscape_16_9: "16:9",
  landscape_21_9: "21:9",
};

// 「什么算 W:H」的单一真相。解析与规范化必须同进同退——两边各写一份正则，迟早一边认得的值另一边不认（曾如此）。
// 允许可选的说明后缀：ComfyUI 工作流的比例枚举常写成 "16:9 (宽屏)" / "4:3（标准）"。
const ASPECT_RATIO_LABEL_RE = /\s*[（(][^）)]*[）)]$/;
const ASPECT_RATIO_WH_RE = /^(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)(?:\s*[（(][^）)]*[）)])?$/;

/** 「自动」语义的选项（auto / adaptive / 自动 …）。比例组里它是一档，不是比例本身。 */
const AUTO_OPTION_PATTERN = /^(auto|automatic|adaptive|自动|智能)$/i;

/**
 * 把 "W:H" 比例字符串（或 named bucket）解析成数值宽高比（width / height）。
 * 不认识的值（"adaptive" / "auto" / "2K" / 空）→ null。支持中文冒号「：」与说明后缀。
 */
export function parseAspectRatioValue(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = trimmed.match(ASPECT_RATIO_WH_RE);
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!(width > 0) || !(height > 0)) return null;
    return width / height;
  }
  const mapped = NAMED_RATIO_TO_WH[trimmed];
  return mapped ? parseAspectRatioValue(mapped) : null;
}

/**
 * 把任意比例值规范化为 "W:H" 字符串（只剥说明后缀、映射具名桶，冒号字面量不改）。
 * 不认识（"auto" / "2K" / 像素串 "448x1024"）→ null。
 */
export function normalizeAspectRatioToWH(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (ASPECT_RATIO_WH_RE.test(trimmed)) return trimmed.replace(ASPECT_RATIO_LABEL_RE, "").trim();
  return NAMED_RATIO_TO_WH[trimmed] ?? null;
}

/**
 * 两个比例值是不是同一档的比对键：「16:9」「16：9」「16 : 9」「16:9 (宽屏)」「landscape_16_9」都是 `16:9`。
 * 不约分——`32:18` 不是 `16:9` 那一档（像素尺寸串约分后会撞上真比例，替用户挑分辨率）。
 */
function aspectRatioMatchKey(value: unknown): string | null {
  const wh = normalizeAspectRatioToWH(value);
  const match = wh?.match(/^(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)$/);
  return match ? `${Number(match[1])}:${Number(match[2])}` : null;
}

export function isAutoOptionValue(value: unknown): boolean {
  return typeof value === "string" && AUTO_OPTION_PATTERN.test(value.trim());
}

/** 一个选项：渲染层有展示文字（`text`），宿主的参数表只有值。 */
export type AspectRatioOptionLike = Readonly<{ value: unknown; text?: string }>;

/**
 * 一组选项是不是「比例控件」：去掉自动档后至少一项，且每一项（值或展示文字）都是比例。
 * 像素尺寸档（`1280:720` 混着 `auto_720p`）不算——那组选的是分辨率，不是比例。
 */
export function optionsAreAspectRatios(options: readonly AspectRatioOptionLike[]): boolean {
  const explicit = options.filter(({ value, text }) => !isAutoOptionValue(value) && !isAutoOptionValue(text ?? ""));
  return explicit.length > 0 && explicit.every(({ value, text }) =>
    normalizeAspectRatioToWH(value) !== null || normalizeAspectRatioToWH(text ?? "") !== null);
}

/** 一个参数控件（只要键与选项）。 */
export type AspectRatioControlLike = Readonly<{ key: string; options: readonly AspectRatioOptionLike[] }>;

/** 想要的比例落到哪个键、哪个值上；落不了时说清是哪一种落不了。 */
export type AspectRatioChoice =
  | Readonly<{ ok: true; key: string; value: unknown }>
  | Readonly<{ ok: false; reason: "no_ratio_control" }>
  | Readonly<{ ok: false; reason: "ambiguous"; keys: readonly string[] }>
  | Readonly<{ ok: false; reason: "not_offered"; key: string; allowedValues: readonly unknown[] }>;

/**
 * 「用户要 16:9」→「这个模式的哪个控件、哪一档」。纯函数，读者给出这个模式的控件表即可。
 *
 * - 比例控件 = `optionsAreAspectRatios` 成立的那个；一个都没有 → `no_ratio_control`（比例跟着输入图走的模式、
 *   或只按像素档给尺寸的模式）；两个以上 → `ambiguous`（今天全目录 0 例，出现了就拒，不挑一个）。
 * - `auto`（或任何自动词）→ 控件自己的自动档值，原样（`auto` / `adaptive`）；没有自动档 → `not_offered`。
 * - 其余按比对键找那一档，返回**选项自己的值**（`landscape_16_9` 那一档就回 `landscape_16_9`）。
 */
export function resolveAspectRatioChoice(requested: string, controls: readonly AspectRatioControlLike[]): AspectRatioChoice {
  const ratioControls = controls.filter((control) => optionsAreAspectRatios(control.options));
  if (ratioControls.length === 0) return { ok: false, reason: "no_ratio_control" };
  if (ratioControls.length > 1) return { ok: false, reason: "ambiguous", keys: ratioControls.map((control) => control.key) };
  const control = ratioControls[0]!;
  const notOffered = (): AspectRatioChoice => ({
    ok: false, reason: "not_offered", key: control.key, allowedValues: control.options.map((option) => option.value),
  });
  if (isAutoOptionValue(requested)) {
    const auto = control.options.find(({ value, text }) => isAutoOptionValue(value) || isAutoOptionValue(text ?? ""));
    return auto ? { ok: true, key: control.key, value: auto.value } : notOffered();
  }
  const wanted = aspectRatioMatchKey(requested);
  if (wanted === null) return notOffered();
  const match = control.options.find(({ value, text }) =>
    aspectRatioMatchKey(value) === wanted || aspectRatioMatchKey(text ?? "") === wanted);
  return match ? { ok: true, key: control.key, value: match.value } : notOffered();
}

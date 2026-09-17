import type { ModelParameterControl } from "../modelCatalogMeta";
import type { ModelArchetype } from "./types";

// ---------------------------------------------------------------------------
// GPT Image 2.5 图像档案（OpenAI 的 2.5 代，两个并列产品：Flare 与 Sunburst）。
// 契约来自官方文档实查（2026-09-18，非记忆）：
//   kie      docs.kie.ai/market/gpt/gpt-image-2-5-{flare,sunburst}-{text-to-image,image-to-image}.md
//   apimart  docs.apimart.ai/en/api-reference/images/gpt-image-2.5/generation.md
//
// **为什么 Flare / Sunburst 是两个档案，而不是一个档案的两个 variant**——两条硬理由：
//   1. kie 把每一代每一档都拆成**独立 model id**（`gpt-image-2-5-flare-text-to-image` 等 4 个）。
//      变体轴（variants[].modelKey）与模式轴（modes[].modelEnum）**写的是同一个模板通道**
//      `{{request.params.model}}`，一个 model 字符串同时被两条轴争用，笛卡尔积表达不出来。
//   2. 两者是官方并列推荐的**不同产品**（Flare 快、Sunburst 精修），不是同一模型的快/慢档；
//      同 Seedream 5.0 Pro/Lite、Nano Banana 2 主款/Lite 的既有分档做法。
//
// **为什么不是 gpt-image-2 档案加一代**——2.5 多了 `xhigh`/`max` 两个质量档（文档明写发给
// gpt-image-2 会 400，不是静默降级），且 kie 侧比例枚举整套换了（见下）。同一份 options
// 不可能同时对两代（与 nanoBanana2.ts 分档同因）。老档案 `gpt-image-2` 保留不删（两家仍在售），
// 这是**新增一代**不是替换，P1「加新必删旧」不适用。
//
// ⚠️ 两家的枚举**不重合**，故必须分层声明（B 分层 vendorParams），不能取交集也不能只写一份：
//   - kie   `aspect_ratio` 13 档，独有 27:16 / 16:27 / 9:8 / 8:9（文档明写这四档**只支持 1K**）
//   - apimart `size` 16 档，独有 5:4 / 4:5 / 2:1 / 1:2 / 3:1 / 1:3 / 9:21，且字段名叫 `size`
//   两边只有 9 档重合。取交集＝两家用户各自损失一半画幅；只写一份＝另一家必发非法值。
//
// ⚠️ 否定式判断（文档写了、但**我们不声明**）——声明即承诺发得出去，发不出去的不许摆控件：
//   - `quality`（low/medium/high/xhigh/max/auto）**只有 apimart 有**，kie 那 4 个端点根本没有这个字段
//     → 只能进 vendorParams.apimart，绝不能进基础 params，否则 kie 用户调了质量而 body 里没这个键
//       （「按了没反应的控件」，比报错更坏，见 nanoBanana2.ts 的同款教训）。
//   - `n`（apimart 1–4）不声明：一个生成节点产出一张图是全站语义，多图由节点复制表达。
//   - `output_format` / `output_compression` / `moderation` 不声明（apimart 独有且默认即可用：
//     默认 png 正好满足 `background:"transparent"` 需要 png/webp 的约束，暴露出来只会让用户
//     有机会选出 jpeg + 透明底这种非法组合）。
//
// ⚠️ 跨字段约束（文档有、我们发得出去但会被 vendor 拒）：kie 的 27:16 / 16:27 / 9:8 / 8:9
//    **只支持 1K**，选 2K/4K 会被拒。今天靠 vendor 报错透传，未在档案层拦——同 gpt-image-2
//    的「1:1 不可 4K」处置一致（见 gptImage2.ts）。
//
// 字段名差异：改图输入图 kie 叫 `input_urls`、apimart 叫 `image_urls`，**两家都是上限 16**。
// 档案只能声明一个 inputKey → 取 `input_urls`（与 gpt-image-2 档案一致，同族不换名），
// apimart 侧在 catalog body 里做键名转接（`image_urls: {{request.params.input_urls}}`）。
// ---------------------------------------------------------------------------

const opt = (values: string[]): ModelParameterControl["options"] => values.map((value) => ({ value, label: value }));

/** kie 的 `aspect_ratio` 枚举（13 档，默认 auto）。末四档仅支持 1K。 */
const KIE_ASPECT_RATIOS = ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9", "27:16", "16:27", "9:8", "8:9"];

/** apimart 的 `size` 枚举（16 档，默认 auto）。apimart 另支持 `1600x1200` 这类精确像素，不在档案里暴露。 */
const APIMART_SIZES = ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21", "3:1", "1:3"];

/** 两家同域：透明 / 不透明 / 自动。默认 auto（两家都受理）。 */
const BACKGROUNDS = ["auto", "transparent", "opaque"];

/** 基础层 = kie 线缆名（aspect_ratio / resolution / background）。清晰度 UI 用大写档位，
 *  apimart 线缆要小写 → 由 apimartImages 的 paramMap 统一小写，不在这里分叉。 */
const PARAMS: ModelParameterControl[] = [
  { key: "aspect_ratio", label: "比例", type: "select", options: opt(KIE_ASPECT_RATIOS), defaultValue: "auto" },
  { key: "resolution", label: "清晰度", type: "select", options: opt(["1K", "2K", "4K"]), defaultValue: "1K" },
  { key: "background", label: "背景", type: "select", options: opt(BACKGROUNDS), defaultValue: "auto" },
];

/** apimart 专属（B 分层）：比例字段叫 `size` 且多 7 档；另有 kie 没有的 `quality`。
 *  quality 默认刻意取 `medium` 而非文档默认 `auto`——文档明写 `auto` 会**按 max 档预扣款**
 *  再按实际结算（"reserves funds using the max level"）。默认值不该让用户在不知情时压住一笔
 *  最贵档的预扣（钱的闸：用户拍板每次提交看报价确认，默认值不能自己挑最贵那档）。 */
const APIMART_PARAMS: ModelParameterControl[] = [
  { key: "size", label: "比例", type: "select", options: opt(APIMART_SIZES), defaultValue: "auto" },
  { key: "resolution", label: "清晰度", type: "select", options: opt(["1K", "2K", "4K"]), defaultValue: "1K" },
  { key: "background", label: "背景", type: "select", options: opt(BACKGROUNDS), defaultValue: "auto" },
  { key: "quality", label: "质量", type: "select", options: opt(["low", "medium", "high", "xhigh", "max"]), defaultValue: "medium" },
];

const KIE_SOURCE_COVERS = (tier: "flare" | "sunburst") =>
  `POST /api/v1/jobs/createTask，**t2i 与改图是两个 model id**：\`gpt-image-2-5-${tier}-text-to-image\` / ` +
  `\`gpt-image-2-5-${tier}-image-to-image\`；input {prompt ≤20000 字符（必填）, ` +
  `aspect_ratio 13 档 auto(默认)|1:1|3:2|2:3|4:3|3:4|16:9|9:16|21:9|27:16|16:27|9:8|8:9（**后四档只支持 1K**）, ` +
  `resolution 1K|2K|4K, background transparent|opaque|auto, 改图端点另有 input_urls **maxItems 16**（必填）}；` +
  `**无 quality / n / output_format 字段**（故这三项只进 vendorParams.apimart）；结果同 kie 全家桶 data.resultJson.resultUrls.0`;

const APIMART_SOURCE_COVERS =
  "POST /v1/images/generations（扁平 body，t2i 与改图**同一个 model id**，给 image_urls 即进改图模式）；" +
  "model 二选一 `gpt-image-2.5-flare`(快) / `gpt-image-2.5-sunburst`(精修)，两者计价相同、参数逐字相同；" +
  "size 16 档 auto(默认)|1:1|3:2|2:3|4:3|3:4|5:4|4:5|16:9|9:16|2:1|1:2|21:9|9:21|3:1|1:3（另支持 16 倍数的精确像素，档案不暴露）；" +
  "resolution **小写** 1k(默认)|2k|4k；quality low|medium|high|xhigh|max|auto(默认，**按 max 档预扣款**)；" +
  "n 1–4(默认 1)；output_format png(默认)|jpeg|webp；output_compression 0–100；background transparent|opaque|auto；" +
  "moderation auto|low(默认)；image_urls **最多 16 张**（仅公网 HTTP(S) URL，本地图先走 POST /v1/uploads/images）；" +
  "响应 data[0].task_id 异步轮询，结果在 data.result.images[].url[]";

/** Flare 与 Sunburst 的模式形状逐字相同（两家文档都如此），只差 id / label / model 串。 */
function gptImage25Modes(tier: "flare" | "sunburst"): ModelArchetype["modes"] {
  return [
    {
      id: "t2i",
      intent: "text",
      vendorTerm: "文生图",
      hint: "纯文字生成图像",
      promptRequired: true,
      // kie 拆 id → per-mode modelEnum 承担；apimart 单 id → 它的 body 读行 modelKey，不读这个。
      modelEnum: `gpt-image-2-5-${tier}-text-to-image`,
      transportTaskKind: "text_to_image",
      slots: [],
      params: PARAMS,
      vendorParams: { apimart: APIMART_PARAMS },
    },
    {
      id: "i2i",
      intent: "edit",
      vendorTerm: "改图",
      hint: "给图（最多 16 张）+ 提示词改图",
      promptRequired: true,
      modelEnum: `gpt-image-2-5-${tier}-image-to-image`,
      transportTaskKind: "image_edit",
      // 16 张两家一致（kie input_urls maxItems:16 / apimart image_urls "Up to 16"）。
      slots: [{ kind: "image_ref", label: "输入图", min: 1, max: 16, inputKey: "input_urls" }],
      params: PARAMS,
      vendorParams: { apimart: APIMART_PARAMS },
    },
  ];
}

/** GPT Image 2.5 Flare —— 官方定位「更快」：社交内容、商品图、批量生成、快速试稿。 */
export const GPT_IMAGE_25_FLARE_ARCHETYPE: ModelArchetype = {
  id: "gpt-image-2.5-flare",
  family: "gpt-image",
  label: "GPT Image 2.5 Flare",
  kind: "image",
  defaultModeId: "t2i",
  transportTaskKind: "text_to_image",
  // 严格相等匹配：apimart 的单 id + kie 的两个拆分 id 都要在这里，否则老节点解析不到档案。
  identifierPatterns: ["gpt-image-2.5-flare", "gpt-image-2-5-flare-text-to-image", "gpt-image-2-5-flare-image-to-image"],
  sources: [
    { url: "https://docs.kie.ai/market/gpt/gpt-image-2-5-flare-text-to-image.md", checkedAt: "2026-09-18", vendorKey: "kie", covers: KIE_SOURCE_COVERS("flare") },
    { url: "https://docs.apimart.ai/en/api-reference/images/gpt-image-2.5/generation.md", checkedAt: "2026-09-18", vendorKey: "apimart", covers: APIMART_SOURCE_COVERS },
  ],
  modes: gptImage25Modes("flare"),
};

/** GPT Image 2.5 Sunburst —— 官方定位「精修优先」：成品商品图、广告创意、多轮细节编辑。 */
export const GPT_IMAGE_25_SUNBURST_ARCHETYPE: ModelArchetype = {
  id: "gpt-image-2.5-sunburst",
  family: "gpt-image",
  label: "GPT Image 2.5 Sunburst",
  kind: "image",
  defaultModeId: "t2i",
  transportTaskKind: "text_to_image",
  identifierPatterns: ["gpt-image-2.5-sunburst", "gpt-image-2-5-sunburst-text-to-image", "gpt-image-2-5-sunburst-image-to-image"],
  sources: [
    { url: "https://docs.kie.ai/market/gpt/gpt-image-2-5-sunburst-text-to-image.md", checkedAt: "2026-09-18", vendorKey: "kie", covers: KIE_SOURCE_COVERS("sunburst") },
    { url: "https://docs.apimart.ai/en/api-reference/images/gpt-image-2.5/generation.md", checkedAt: "2026-09-18", vendorKey: "apimart", covers: APIMART_SOURCE_COVERS },
  ],
  modes: gptImage25Modes("sunburst"),
};

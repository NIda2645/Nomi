import type { ModelParameterControl } from "../videoCapabilities/types";
import type { ModelArchetype } from "./types";

// ---------------------------------------------------------------------------
// Imagen 4 Fast / Ultra（kie 渠道）图像档案。契约实查自官方文档（2026-09-18，非记忆）：
//   docs.kie.ai/market/google/imagen4-fast.md · docs.kie.ai/market/google/imagen4-ultra.md
//
// **与既有 `imagen-4` 档案（imagen4.ts）的关系**：那份是 **apimart 的 Imagen 4 基础款**，
// 且已在 apimart 侧退役（seedBuiltins 的 RETIRED_APIMART_IMAGE_* 把它 prune 掉了）。
// 本文件的 Fast / Ultra 是 kie 目录里**两个独立计价的 model id**，不是那一款的别名，
// 故不往退役档案上挂（挂上去会得到一个「基础款哪家都买不到、却顶着变体轴」的空壳）。
//
// **为什么 Fast 与 Ultra 各一档而不是一档两 variant**——两家字段真的不同，不是同一契约换串：
//   - `aspect_ratio` 的**默认值不同**：fast 默认 `16:9`，ultra 默认 `1:1`（文档 default 字段逐字不同）；
//   - `seed` 的**类型不同**：fast 是 integer、ultra 是 string(≤500)。
// variant 轴只能做 paramOverrides（收窄取值），承载不了「同名参数在两档里是两种类型」。
//
// ⚠️ 否定式判断（文档写了、我们不声明）：
//   - **无参考图 / 改图能力**：两个端点的 input 里根本没有图片字段，纯文生图 → 只有一个 t2i 模式，
//     绝不给 image_edit（给了就是摆一个永远失败的模式）。
//   - **不暴露 seed**：除了上面的类型分裂，seed 对用户是「复现同一张图」的工程参数，
//     全站没有第二个图像档案暴露它；单独为这一款开一个控件会让参数面在不同模型间跳形状（R2）。
// ---------------------------------------------------------------------------

const opt = (values: string[]): ModelParameterControl["options"] => values.map((value) => ({ value, label: value }));

/** 两档同一枚举（文档逐字相同的 6 个值），只有默认值不同。 */
const ASPECT_RATIOS = ["auto", "1:1", "16:9", "9:16", "3:4", "4:3"];

function imagen4Params(defaultRatio: string): ModelParameterControl[] {
  return [
    { key: "aspect_ratio", label: "比例", type: "select", options: opt(ASPECT_RATIOS), defaultValue: defaultRatio },
    { key: "negative_prompt", label: "负向提示", type: "text", options: [], placeholder: "排除的元素…" },
  ];
}

function imagen4Modes(defaultRatio: string, hint: string): ModelArchetype["modes"] {
  return [
    {
      id: "t2i",
      intent: "text",
      vendorTerm: "文生图",
      hint,
      promptRequired: true,
      transportTaskKind: "text_to_image",
      // 纯文生：文档 input 无任何图片字段。
      slots: [],
      params: imagen4Params(defaultRatio),
    },
  ];
}

/** Imagen 4 Fast —— 快档，默认横幅 16:9。 */
export const IMAGEN_4_FAST_ARCHETYPE: ModelArchetype = {
  id: "imagen-4-fast",
  family: "imagen",
  label: "Imagen 4 Fast",
  kind: "image",
  defaultModeId: "t2i",
  transportTaskKind: "text_to_image",
  identifierPatterns: ["google/imagen4-fast", "imagen4-fast", "imagen-4-fast"],
  sources: [
    {
      url: "https://docs.kie.ai/market/google/imagen4-fast.md",
      checkedAt: "2026-09-18",
      vendorKey: "kie",
      covers:
        "POST /api/v1/jobs/createTask，model=\"google/imagen4-fast\"；input {prompt ≤5000 字符(必填), " +
        "negative_prompt ≤5000, aspect_ratio 枚举 1:1|16:9|9:16|3:4|4:3|auto **默认 16:9**, seed integer}；" +
        "**input 里没有任何图片字段 → 纯文生图，无改图/参考图能力**；结果同 kie 全家桶 data.resultJson.resultUrls.0",
    },
  ],
  modes: imagen4Modes("16:9", "纯文字生成图像，快档"),
};

/** Imagen 4 Ultra —— 高质档，默认方图 1:1（文档 default 与 Fast 不同，别照抄）。 */
export const IMAGEN_4_ULTRA_ARCHETYPE: ModelArchetype = {
  id: "imagen-4-ultra",
  family: "imagen",
  label: "Imagen 4 Ultra",
  kind: "image",
  defaultModeId: "t2i",
  transportTaskKind: "text_to_image",
  identifierPatterns: ["google/imagen4-ultra", "imagen4-ultra", "imagen-4-ultra"],
  sources: [
    {
      url: "https://docs.kie.ai/market/google/imagen4-ultra.md",
      checkedAt: "2026-09-18",
      vendorKey: "kie",
      covers:
        "POST /api/v1/jobs/createTask，model=\"google/imagen4-ultra\"；input {prompt ≤5000 字符(必填), " +
        "negative_prompt ≤5000, aspect_ratio 枚举 1:1|16:9|9:16|3:4|4:3|auto **默认 1:1**（与 Fast 的 16:9 不同）, " +
        "seed **string** ≤500（Fast 是 integer——同族两档同名参数两种类型）}；" +
        "**input 里没有任何图片字段 → 纯文生图**；结果同 kie 全家桶 data.resultJson.resultUrls.0",
    },
  ],
  modes: imagen4Modes("1:1", "纯文字生成图像，高质档"),
};

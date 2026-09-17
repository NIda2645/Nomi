// kie 的 GPT Image 2.5 有一条**跨字段**约束，档案层今天表达不了（比例控件与清晰度控件各自合法，
// 只有某几个组合非法），故落在发请求前的 request_transform 校验闸上（与 apimartModelIds.ts 的
// Omni 参考图张数闸同一机制、同一时机——花钱之前）。
//
// 文档原话（docs.kie.ai/market/gpt/gpt-image-2-5-*-{text,image}-to-image.md，2026-09-18 实查）：
//   "The 27:16, 16:27, 9:8 and 8:9 aspect ratios support 1K only. 2K and 4K are available for
//    other aspect ratios."
//
// 为什么值得建这道闸而不是「发出去让 vendor 报错」：这四档正是用户**特意**去选的极端画幅
// （超宽横幅 / 窄长竖幅），而清晰度默认 1K、想要大图时才会去调——两个控件分别都显示为合法，
// 组合起来失败，用户得到的是一次没有图的失败任务和一句上游英文报错。R17：能在最早一层拦住的
// 别留给下一层。真正的最早一层是 UI 把 2K/4K 置灰，但档案体系今天没有跨字段约束的声明位
// （见 2026-09-18 报告的结构性发现 3）——这道闸是当前能建到的最早一层，不是终点。

import { registerRequestTransform, type RequestTransformContext } from "../tasks/requestTransforms";
import { desktopT } from "../i18n";

/** 只支持 1K 的四个画幅（文档逐字）。 */
export const KIE_GPT_IMAGE_25_ONE_K_ONLY_RATIOS = ["27:16", "16:27", "9:8", "8:9"] as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** kie 的 body 是 { model, input: {...} }——约束落在 input 里的两个键上。 */
export function validateKieGptImage25Body(body: unknown, _context?: RequestTransformContext): void {
  if (!isRecord(body)) return;
  const input = isRecord(body.input) ? body.input : undefined;
  if (!input) return;
  const ratio = typeof input.aspect_ratio === "string" ? input.aspect_ratio : "";
  const resolution = typeof input.resolution === "string" ? input.resolution.toUpperCase() : "";
  if (!ratio || !resolution) return;
  if (!(KIE_GPT_IMAGE_25_ONE_K_ONLY_RATIOS as readonly string[]).includes(ratio)) return;
  if (resolution === "1K") return;
  throw new Error(desktopT("vendor.kieGptImage25.ratioOneKOnly", { ratio }));
}

/** 校验通过即原样放行（这条闸只拒绝，不改写 body）。 */
export function normalizeKieGptImage25Body(body: unknown, context: RequestTransformContext): unknown {
  validateKieGptImage25Body(body, context);
  return body;
}

export const KIE_GPT_IMAGE_25_TRANSFORM = "kie-gpt-image-2-5-contract";

registerRequestTransform(KIE_GPT_IMAGE_25_TRANSFORM, normalizeKieGptImage25Body, validateKieGptImage25Body);

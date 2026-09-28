// 一镜的**信封**——单一真相源（2026-09-18）。
//
// 「信封」= 这一镜给人看、给编排用的字段：它是哪一镜、算不算数、叫什么。
// 与之相对的是 `candidate`：那是**发给供应商的那一份**。信封上的字段一个字都不进 provider 请求，
// 所以换模型、改候选 revision 都不该把它弄丢。
//
// 为什么要有这个文件：2026-09-18 修「Agent 照剧本出分镜」时，模型拟的 `title` 从动词出发，
// 要走到两个终点——画布节点的标签、花钱确认卡上那行「#1 〈标题〉· 模型 · 价格」。它在中途死了**五次**，
// 每一次都是一处手写的逐字段重建：
//   1. `laneVerbTransport.draftShotToPlanShot`（翻译层解构时没列它）
//   2. `mcpGenerationMultiShot.shotEnvelope`（草稿信封没解析它）
//   3. `mcpGenerationMultiShot` 密封条目（included / 非 included 两支各一处）
//   4. `productionGenerationOperationStore` 的门卡投影
//   5. `productionRunRepository` 的持久化投影
// 这五处**编译期全合法、测试全绿**——手写字段列表漏掉一个新字段，TypeScript 什么都不会说。
// 是一处一处试出来的：每补一处，断言就往前挪一格。
//
// 所以这里给的是「整只搬」而不是「列举」：投影镜头时 spread `envelopeOf(shot)`，别再手写列表。
// 加字段时只改本文件的类型 + 键名常量，两者由下面那行编译期断言钉在一起，漏改当场报错。

/** 信封字段名。运行时可枚举——贯通测试靠它做穷尽性检查，不许手抄第二份。 */
export const GENERATION_SHOT_ENVELOPE_KEYS = ["shotId", "role", "included", "title"] as const;

export type GenerationShotEnvelopeKey = (typeof GENERATION_SHOT_ENVELOPE_KEYS)[number];

export type GenerationShotEnvelope = {
  /** 这一镜的稳定身份；进子合同，也是 jobId / 幂等键的来源。 */
  shotId: string;
  /** `anchor` = 定妆/场景参考图（先生成、并拦住后面的视频镜）；`shot`（或缺省）= 视频镜。 */
  role?: "anchor" | "shot";
  /** 试拍/分批的勾选：密封的合同只覆盖 included 的镜。缺省 = 算数。 */
  included?: boolean;
  /** 模型拟的短标题（如「日落前的一分钟」）。画布节点标签与花钱卡那行都读它。 */
  title?: string;
};

/**
 * 编译期把类型与键名常量钉在一起：给类型加了字段却没加进 `GENERATION_SHOT_ENVELOPE_KEYS`（或反过来），
 * 这一行就报错。这是本文件唯一允许手写字段名的地方。
 */
const _envelopeKeysAreExhaustive: Record<GenerationShotEnvelopeKey, true> & Record<keyof GenerationShotEnvelope, true> = {
  shotId: true, role: true, included: true, title: true,
};
void _envelopeKeysAreExhaustive;

/**
 * 把信封整只搬过去（只带真正有值的可选字段，形状与各处手写版逐字节一致）。
 * **任何投影镜头的地方都用它**——手写列表下一次还会漏。
 */
export function generationShotEnvelopeOf(shot: GenerationShotEnvelope): GenerationShotEnvelope {
  return {
    shotId: shot.shotId,
    ...(shot.role ? { role: shot.role } : {}),
    ...(shot.included !== undefined ? { included: shot.included } : {}),
    ...(shot.title ? { title: shot.title } : {}),
  };
}

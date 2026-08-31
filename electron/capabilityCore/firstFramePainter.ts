// 能力核 · 「谁来画这张首帧图」的纯判据（L3-F1b 复验抓出的真根因，2026-08-20）。
//
// 事故：两跳的第 1 跳（出首帧静帧）**用的是视频模型自己**——
//   `runTaskFn({ vendor: input.vendor, request: { kind: 'image_edit', extras: { modelKey: input.modelKey } } })`
// 而 input.modelKey 是 doubao-seedance-2.0，目录里登记为 video 类。
// `findExecutableModel(vendor, modelKey, 'image')` 按 kind 过滤，当然找不到 → 抛错 →
// `runFirstHop` 的 try/catch 吞掉 → 降级一跳。**全程静默**，外面只看得到「两跳没跑」。
//
// 这就是为什么修好键名正则之后两跳**仍然**不触发：判据是通的，第 1 跳问错了模型。
// （单测没抓到，是因为 runTaskFn 是桩——桩不管你要什么 kind 都返回一张图。真机才暴露。）
//
// 纯函数、零 import：给一份模型清单，挑一个「能画图、且能吃图片参考」的。挑不到就明说挑不到，
// 让调用方降级并把理由带给用户，不要假装。

export type PainterCandidate = {
  vendorKey: string
  modelKey: string
  kind: string
  /** 该模型可用性（目录 keyStatus）。只有 'ok' 才可能被选中。 */
  keyStatus?: string
  /** 参考承载力（目录 derive）。首帧图要吃锚参考图，故要求 image=true。 */
  references?: { image?: boolean } | null
}

export type PickedPainter = { vendorKey: string; modelKey: string }

/**
 * 挑一个来画首帧静帧的图片模型。
 *
 * 条件（缺一不可）：kind 是 image、key 可用、**吃得下图片参考**（不吃参考就锚不住身份，
 * 那张首帧图会是个陌生人，比不画更糟）。
 *
 * 排序：**同 vendor 优先**（同一家出的图风格更接近后面那跳的视频模型，且往往共用额度与网络路径），
 * 其次按目录顺序（目录顺序 = 策展顺序，不是随机的）。
 *
 * 挑不到 → 返回 null。调用方据此降级为一跳并**把理由说出来**，不要静默（正是这次的教训）。
 */
export function pickFirstFramePainter(
  candidates: readonly PainterCandidate[],
  preferVendorKey: string,
): PickedPainter | null {
  const usable = candidates.filter(
    (m) =>
      m.kind === 'image'
      && (m.keyStatus === undefined || m.keyStatus === 'ok')
      && Boolean(m.references?.image),
  )
  if (usable.length === 0) return null
  const sameVendor = usable.find((m) => m.vendorKey === preferVendorKey)
  const picked = sameVendor ?? usable[0]
  return { vendorKey: picked.vendorKey, modelKey: picked.modelKey }
}

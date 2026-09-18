/**
 * 底栏胶囊的**让位几何**（2026-09-17 用户拍板方案 D + 让位下限）。
 *
 * ## 为什么要有这一份
 *
 * 2026-09-06 定的收缩规则只写了**让位优先级**（`SHRINK`：模型先缩、供应商次之、短枚举不缩），
 * 没写**让位下限**。优先级没有下限，等于「最高优先级那枚一个人扛下全部亏空」——
 * 2026-09-17 实测到了它的终点：英文下带「模式 + 尺寸」两枚胶囊的行，底栏自然宽比可用宽多
 * 23–46px，而整条 bar 里只有模型那枚能缩，于是被压到 **0 / 2 / 23px**，型号名一个字都不剩，
 * 只剩一颗齿轮图标（违反 §1.5.4「模型是一等决策，不许埋」）。机制没有下一步：压到 0 之后
 * 它还是不够，就开始顶「生成」出右缘。
 *
 * 所以补的是机制的**第二步和第三步**：
 *   ① 每枚声明下限（本文件）；
 *   ② 按优先级让到下限为止；
 *   ③ 都到底了还不够 → 把**最不该占位**的那枚挪进行尾 ⋯（`demotable`）。
 *
 * ## 谁可以进 ⋯（2026-09-17 用户逐字拍板）
 *
 * **可以**：尺寸这类**档案声明的枚举参数**（`1024x1024`）——它是模型的参数细节。
 * **不可以**：模型 / 模式 / 时长。模型是一等决策（§1.5.4）；模式决定这一镜到底在做什么；
 * 时长的 owner 是 `PlanShot.durationSec`，合计时长和时间轴停留都读它。
 * 注意「进 ⋯」不等于「缩」——2026-09-06「短枚举一律不缩」那条仍然成立：
 * 进 ⋯ 的枚举在弹层里是**完整的、可改值的**控件，不是被截断的胶囊。
 *
 * ## 宽度怎么来的：估，不量文字
 *
 * 判据是**这一行自己那条 bar 的实测宽度**（`useComposerBarWidth`，一条 ResizeObserver），
 * 不是视口宽、也不是一个全局断点——同一个容器宽度下，中文行装得下而英文行装不下，
 * 全局断点表达不了这件事（一个常数没法既照顾 `改图` 又照顾 `Text-to-image`）。
 * 需要多宽则从**这一行真正要渲染的那几个标签**估出来：每枚 = 标签宽 + 固定开销，
 * 全角字按两个字符算。估错的代价只是某枚枚举早一点/晚一点进 ⋯，不会裁字、不会溢出；
 * 真正的判据仍然是真机量出来的越界叶子数。
 */

// ── 触发 pill 的固定开销：按 `NomiSelect` 的真实解剖数，不是拍脑袋 ──────────────
/** `pl-2.5 pr-2` = 10 + 8。 */
export const CHIP_PADDING_X = 18
/** 左右各 1px 框线。 */
export const CHIP_BORDER = 2
/** 尾部 `IconChevronDown size={12}`。 */
export const CHIP_CHEVRON = 12
/** 触发内部 `gap-1`。 */
export const CHIP_GAP = 4
/** 模型胶囊头上的 `NomiIdentityIcon size="sm"` = 16px。 */
export const CHIP_IDENTITY_ICON = 16

/** 没有身份图标的胶囊（模式 / 时长 / 画幅 / 枚举参数）：内边距 + 框线 + 箭头 + 一个间距。 */
export const CHIP_CHROME_PLAIN = CHIP_PADDING_X + CHIP_BORDER + CHIP_CHEVRON + CHIP_GAP
/** 带身份图标的胶囊（模型）：再加一枚图标和一个间距。 */
export const CHIP_CHROME_WITH_ICON = CHIP_CHROME_PLAIN + CHIP_IDENTITY_ICON + CHIP_GAP

/**
 * 标签宽度的两个估计值。**两处用途相反，所以各往安全的一边偏**——这不是两份真相，
 * 是同一件事的上界和下界：
 *
 *   · `LABEL_CHAR_PX`（**上界**，偏宽）——算**下限**用。下限是一句关于"读得出"的承诺，
 *     宁可多给几像素；估宽一点的代价只是可降级的枚举早一点进 ⋯。
 *   · `LABEL_CHAR_PX_LOWER`（**下界**，偏窄）——判断"这个标签本来就比下限还短"用。
 *     这一侧必须**低估**：低估的结果是下限不生效、胶囊保持今天的宽度；高估会把一枚短胶囊
 *     **撑胖**，连带把别人挤进 ⋯（2026-09-17 实测：中文「默认模型」被撑宽 6px，
 *     1680 那张本该逐像素不变的截图就是这么变的）。
 *
 * 全角字不需要估：CJK 字形按定义就是 1em 宽，`text-caption` 是 12px，所以它就是 12。
 * （试过把下限写成 CSS `ch` 让浏览器算——不行，见 `composerModelChipMinWidth` ①。）
 */
export const LABEL_CHAR_PX = 6.7
export const LABEL_CHAR_PX_LOWER = 5.6
/** 全角字形 = 1em，而标签是 `text-caption`(12px)。 */
export const LABEL_WIDE_CHAR_PX = 12

/** 行尾 ⋯ 那颗钮：`size-6` = 24px。 */
export const OVERFLOW_DOTS_WIDTH = 24
/** 「生成」按钮：`h-6 px-2.5`(20) + `text-micro`(11px) 下的 8 个字符。 */
export const GENERATE_BUTTON_WIDTH = 20 + Math.round(8 * 6.1)
/** 底栏自己的 `px-2`。 */
export const COMPOSER_BAR_PADDING_X = 16
/** 底栏 `gap-1`。 */
export const COMPOSER_BAR_GAP = 4

/**
 * 每一类胶囊的让位策略——**优先级和下限写在同一处**，这是「一份让位政策一个 owner」的落点。
 *
 * - `shrink`：`flex-shrink` 因子。数字大 = 先缩。0 = 从不缩（短枚举少一个字就没意义）。
 * - `minLabelChars`：**只有会让位的那几枚才有**——标签至少要露几个拉丁字符。
 *   `shrink: 0` 的那几枚从不让位，它们的下限**按定义就是自然宽**，所以这里不写数：
 *   写一个没人读的数迟早会被当成真相（也会诱人拿它跟"字符个数"做无意义的比较）。
 * - `demotable`：装不下时可不可以整枚挪进行尾 ⋯。
 */
export type ComposerChipKind = 'model' | 'provider' | 'mode' | 'aspect' | 'duration' | 'param'

export type ComposerChipYield = {
  shrink: number
  /** 只有 `shrink > 0` 的那几枚需要；其余的下限 = 自然宽。 */
  minLabelChars?: number
  /** 有没有身份图标（决定固定开销取哪一档）。 */
  hasIdentityIcon: boolean
  demotable: boolean
}

export const COMPOSER_CHIP_YIELD: Record<ComposerChipKind, ComposerChipYield> = {
  // 模型名最长、且前几个字母就认得出；8 个字符是用户 2026-09-17 给的下限
  //（「Seedance 2.5」→「Seedanc…」仍读得出是哪一家哪一代，`title` 里有全名）。
  model: { shrink: 8, minLabelChars: 8, hasIdentityIcon: true, demotable: false },
  provider: { shrink: 4, minLabelChars: 6, hasIdentityIcon: false, demotable: false },
  // 模式决定这一镜在做什么（文生图 / 改图），不是参数细节，不进 ⋯ 也不缩。
  mode: { shrink: 0, hasIdentityIcon: false, demotable: false },
  aspect: { shrink: 0, hasIdentityIcon: false, demotable: false },
  duration: { shrink: 0, hasIdentityIcon: false, demotable: false },
  // 档案声明的枚举参数（尺寸…）：唯一可以整枚挪进 ⋯ 的一类。
  param: { shrink: 0, hasIdentityIcon: false, demotable: true },
}

/**
 * 标签的估计宽度。全角（CJK / 全角标点 / 假名）按两个字符算——
 * 「改图」只有 2 个字符却和 4 个拉丁字母一样宽，不这么数，中文行会被判成「很窄，装得下」。
 */
export function estimateLabelWidth(label: string, { conservative = false }: { conservative?: boolean } = {}): number {
  const narrow = conservative ? LABEL_CHAR_PX_LOWER : LABEL_CHAR_PX
  let width = 0
  for (const char of label) {
    const code = char.codePointAt(0) ?? 0
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x3fffd)
    width += wide ? LABEL_WIDE_CHAR_PX : narrow
  }
  return width
}

export type ComposerChipDemand = {
  kind: ComposerChipKind
  label: string
  /**
   * 这一枚**这次**有没有画身份图标。默认按策略表里那一类的常态走；模型胶囊要显式传——
   * 选「默认模型」时它**没有**图标，固定开销少 20px，照 56 算会把下限算得比自然宽还大，
   * 于是把一枚本来不该动的短胶囊撑胖（2026-09-17 实测：中文 1680 的「默认模型」被撑宽 17px，
   * 宽屏那张本该逐像素不变的截图因此变了）。
   */
  hasIcon?: boolean | undefined
}

/** 这一枚这次的固定开销：显式传了就按传的，没传就按策略表那一类的常态。 */
function chromeOf(demand: ComposerChipDemand): number {
  const withIcon = demand.hasIcon ?? COMPOSER_CHIP_YIELD[demand.kind].hasIdentityIcon
  return withIcon ? CHIP_CHROME_WITH_ICON : CHIP_CHROME_PLAIN
}

/**
 * 一枚胶囊**最多能缩到**多宽。
 *
 * 会让位的那几枚 = 至少露 `minLabelChars` 个字符 + 固定开销；从不让位的那几枚 = 自然宽
 *（"下限"对它们不是一个额外的数，就是它们本来的宽度）。一条算式覆盖两种，
 * 省掉一张没人读的数字表。
 */
export function composerChipFloor(demand: ComposerChipDemand): number {
  const policy = COMPOSER_CHIP_YIELD[demand.kind]
  if (!policy.minLabelChars) return composerChipNaturalWidth(demand)
  return Math.round(policy.minLabelChars * LABEL_CHAR_PX + chromeOf(demand))
}

/**
 * 标签按估计值画出来有多宽（含固定开销）。
 * `conservative` = 取下界：只在「要不要让下限生效」这个判断上用（宁可低估，见常量那段）。
 */
export function composerChipNaturalWidth(demand: ComposerChipDemand, options?: { conservative?: boolean }): number {
  return Math.round(estimateLabelWidth(demand.label, options) + chromeOf(demand))
}

/**
 * 模型那枚胶囊写进 `min-width` 的**下限宽度**（px）。
 *
 * 两个坑都在这一个函数里避掉了：
 *
 * ① **不能写 `ch`。** `calc(8ch + 56px)` 看着更"按真实字体算"，但 `ch` 解析的是**这个元素继承到的**
 *    字号，而胶囊壳继承的是行的字号(13px)、真正画标签的是里层 `text-caption`(12px) 的 span。
 *    2026-09-17 实测：下限被算成 ~122px，比标签自然宽还大，于是模型胶囊根本缩不动，
 *    亏空转头去顶「生成」——英文下仍越界 2 个叶子。
 *
 * ② **下限不是"至少这么宽"，是"最多缩到这里"。** `min-width` 两件事都干：标签短的时候它会把胶囊
 *    **撑胖**。所以取 `min(下限, 自然宽)`——标签本来就比下限短，就用它自己那点宽度，一格不多占。
 */
export function composerModelChipMinWidth(label: string, hasIcon: boolean): number {
  const demand: ComposerChipDemand = { kind: 'model', label, hasIcon }
  return Math.min(composerChipFloor(demand), composerChipNaturalWidth(demand, { conservative: true }))
}

/**
 * 这一行**按标签实际内容**需要多宽。
 *
 * 每一枚"需要"多少，取决于它让不让位：
 *   · `shrink: 0` 的（模式 / 时长 / 画幅 / 枚举）——从不缩，需要的就是自然宽；
 *   · `shrink > 0` 的（模型 / 供应商）——最多缩到下限，所以它需要的是**下限与自然宽里的小者**：
 *     标签比下限还短时，它需要的只是自己那点宽度。
 *
 * `dots` / `generate` 按**实际渲染的**来，不按最坏情况——已生成的行用状态标签替代「生成」，
 * 没有开关也没有可降级枚举的行不出 ⋯。按最坏情况算会把中文行判成装不下，白白把尺寸挪进 ⋯。
 */
export function composerBarRequiredWidth(
  chips: readonly ComposerChipDemand[],
  { dots, generate }: { dots: boolean; generate: boolean },
): number {
  // 一条算式：每枚"需要"的 = 自然宽与下限里的**小者**。不让位的那几枚下限就是自然宽，
  // 于是 min 取到自然宽；会让位的那几枚，标签再长也只要下限那么多。
  const chipWidths = chips.map((demand) => Math.min(composerChipNaturalWidth(demand), composerChipFloor(demand)))
  const tail = (dots ? OVERFLOW_DOTS_WIDTH : 0) + (generate ? GENERATE_BUTTON_WIDTH : 0)
  const boxes = chipWidths.length + (dots ? 1 : 0) + (generate ? 1 : 0)
  const gaps = Math.max(0, boxes - 1) * COMPOSER_BAR_GAP
  return Math.round(chipWidths.reduce((sum, width) => sum + width, 0) + tail + gaps + COMPOSER_BAR_PADDING_X)
}

/**
 * 装不下时该把哪几枚挪进 ⋯。
 *
 * 一次只挪一枚、挪完重算——挪走一枚就腾出它的宽度**加上**一个间距，可能已经够了；
 * 一口气全挪走等于把「⋯ 是最后一步」变成「⋯ 是默认」。顺序 = 传进来的顺序的**倒序**：
 * 同为参数时，靠后声明的那枚离「这一镜是什么」更远，先让它走。
 *
 * `available` 为 null（还没量到）→ 一枚都不挪：先按今天的样子渲染，量到了再说，
 * 不拿一个猜出来的宽度去闪一下。
 */
export function composerDemotedChipKeys(
  chips: readonly (ComposerChipDemand & { key?: string | undefined })[],
  available: number | null,
  tail: { dots: boolean; generate: boolean },
): string[] {
  if (available === null || !Number.isFinite(available) || available <= 0) return []
  const demoted: string[] = []
  let kept = [...chips]
  for (;;) {
    const dots = tail.dots || demoted.length > 0
    if (composerBarRequiredWidth(kept, { dots, generate: tail.generate }) <= available) return demoted
    const index = kept.map((chip) => COMPOSER_CHIP_YIELD[chip.kind].demotable).lastIndexOf(true)
    if (index < 0) return demoted // 能让的都让完了：剩下的宁可溢出，也不埋一等决策
    const [gone] = kept.splice(index, 1)
    if (gone?.key) demoted.push(gone.key)
    kept = [...kept]
  }
}

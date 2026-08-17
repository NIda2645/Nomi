// 走查断言层（2026-08-18）。和 _launchApp.mjs 的关系：那个管「窗口起得来」，这个管「断言骗不了人」。
//
// 为什么需要它（全量扫 143 个走查后的结论，见 docs/plan/2026-08-18-walkthrough-harness-hardening.md）：
//   · 0/143 使用 Playwright 的自动重试断言 —— 官方明确把 `expect(await x.isVisible()).toBe(true)`
//     标为反模式，因为它**立即取样**；
//   · 于是链条必然是：一次性 .count() 有竞态 → 拿 waitForTimeout 去糊（全仓 1136 处）
//     → sleep 不够长时 count 读到 0 → **而 0 恰好让「不存在」断言通过**。
//   所以「假绿」不是谁手滑，是这套写法的必然产物。
//
// 官方断言能治竞态那一半。治不了的另一半是：**在一个根本不可能出现坏东西的现场，
// 断言「没看到坏东西」**。这种空洞通过没有任何库能替你挡——只能由本文件的 API 在签名上逼出来，
// 这就是 expectAbsent 强制要 provenBy 的全部理由。
import { expect } from '@playwright/test'

/** 走查里所有等待的统一上限。比 Playwright 默认 5s 宽：Electron 冷启动 + 真模型都慢。 */
export const DEFAULT_TIMEOUT_MS = 15_000

export { expect }

export async function expectVisible(locator, message, timeout = DEFAULT_TIMEOUT_MS) {
  await expect(locator, message).toBeVisible({ timeout })
}

export async function expectHidden(locator, message, timeout = DEFAULT_TIMEOUT_MS) {
  await expect(locator, message).toBeHidden({ timeout })
}

export async function expectCount(locator, count, message, timeout = DEFAULT_TIMEOUT_MS) {
  await expect(locator, message).toHaveCount(count, { timeout })
}

export async function expectText(locator, pattern, message, timeout = DEFAULT_TIMEOUT_MS) {
  await expect(locator, message).toHaveText(pattern, { timeout })
}

const PROOF = Symbol('nomi.walkthrough.probe-proof')

/**
 * 「这个检查确实测得到东西」的**运行时证明**。expectAbsent 只认它。
 *
 * 两种正当用法：
 *  ① 目标本身可证（首选）：先在**它会出现**的现场证明一次，再切到不该出现的现场断言它没了。
 *     例：通用模式下先证「拆镜头卡确实会浮」，再切素材规划模式断言它不浮。
 *  ② 目标已被彻底删除、无从证明（如验证某功能已下线）：那就证**探针本身在这一屏是活的**——
 *     用同屏必然存在的对照物。例：验「智能分组 tab 没了」，先证同一套文本探针找得到「全部素材」。
 *     这不是走过场：它排除的正是「面板压根没渲染出来 / 选择器写错了」这种让断言恒真的情形。
 *
 * 不接受「我觉得应该能测到」。必须真的跑一次、真的看见 ≥1 个。
 */
export async function proveProbe(locator, label, timeout = DEFAULT_TIMEOUT_MS) {
  if (!label || typeof label !== 'string') {
    throw new Error('proveProbe(locator, label)：label 必填，失败信息要说人话，别让人对着 selector 猜')
  }
  await expect(
    locator,
    `基线不成立：「${label}」应当能被探针找到，但一个都没找到。`
      + '\n如果连它都找不到，说明面板没渲染 / 选择器写错了，'
      + '那么后面任何「没看到坏东西」的断言都是恒真的空话。',
  ).not.toHaveCount(0, { timeout })
  return { [PROOF]: true, label }
}

/**
 * 断言某个东西**不存在**。必须带 provenBy —— 一个 proveProbe 拿到的证明。
 *
 * 为什么在签名上硬卡：全仓 33 处「不存在」断言里 94% 没有任何基线（2026-08-18 全量扫）。
 * 而我自己两天内栽了两次，都是「在一个不可能出现坏东西的现场断言没有坏东西」：
 *   · 在**已有分镜方案**的项目里验「专职模式下不浮拆镜头卡」——那种状态下它本来就不显示；
 *   · 在**没有多家同款模型**的目录里验「下拉没有『N 家』折叠行」——本来就不可能有。
 * 两次都报绿，功能却完全没被验证过。文档和提醒挡不住第三次，所以改成写不出来。
 */
export async function expectAbsent(locator, { provenBy, message } = {}, timeout = DEFAULT_TIMEOUT_MS) {
  if (!provenBy || provenBy[PROOF] !== true) {
    throw new Error(
      'expectAbsent 需要 provenBy：先用 proveProbe() 证明这个检查测得到东西。\n'
        + '没有基线的「没看到」= 空洞的通过——它和「探针根本没生效」在观测上完全一样。\n'
        + '  const proof = await proveProbe(card, "通用模式下拆镜头卡会浮")\n'
        + '  // …切到专职模式…\n'
        + '  await expectAbsent(card, { provenBy: proof, message: "专职模式下不该浮" })',
    )
  }
  await expect(
    locator,
    `${message || '期望它不存在'}（基线已证：${provenBy.label}）`,
  ).toHaveCount(0, { timeout })
}

/**
 * 「助手这一轮说完了」的**唯一**判定源：停止键出现（起飞）→ 消失（落地）。
 *
 * 别再用「气泡文本连续几次不变」——pending 态气泡的文本恒为作者名「Nomi」，
 * 模型还没吐第一个字判据就满足了（2026-08-18 我本人栽的，拿 4 个字的作者名当产出做了 4 条断言）。
 * 也别用固定 sleep：真模型耗时从 2 秒到 2 分钟不等。
 */
export async function waitForTurnIdle(win, { startTimeout = 20_000, doneTimeout = 240_000 } = {}) {
  const stop = win.getByRole('button', { name: '停止生成' })
  await expect(stop, '这一轮没起飞：点了发送但停止键始终没出现').toBeVisible({ timeout: startTimeout })
  await expect(stop, '这一轮没落地：停止键迟迟不消失').toBeHidden({ timeout: doneTimeout })
}

/**
 * 只读某个容器内的文本。替代 `document.body.innerText` ——
 * 全页文本会把**脚本自己 seed 的数据**也算进去（我栽过：seed 的用户消息里写着「拆成镜头」，
 * 于是「页面上有没有『拆成镜头』」这条检查必然命中，误报成产品 bug）。
 */
export async function scopedText(locator) {
  return (await locator.innerText()).replace(/\s+/g, ' ').trim()
}

/**
 * 把源码剥成「只剩代码」再做结构扫描。
 *
 * 结构测试扫源码找违禁字符串时，不剥注释会**反噬文档**：全仓 33 个结构测试里 31 个没剥。
 * 我本轮就被自己写的、专门记录该 bug 的注释打红过——不变量管的是代码行为，不是文字。
 */
export function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

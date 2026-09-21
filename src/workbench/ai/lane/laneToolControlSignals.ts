/**
 * 「这条 `isError` 是给**模型**看的控制信号，不是用户的失败」——这份判据的唯一 owner。
 *
 * ── 它在解决哪个真实摩擦 ──
 *
 * 有些工具故意用 `isError` 回给模型，目的是让它**停下来别谎报**：比如 `generate` 之后
 * 宿主把一张付费确认卡摆到了用户面前，模型这一刻既不能说「已经生成了」，也不该接着往下做。
 * 这是抄 GitHub MCP 的做法（`electron/agentLane/laneExtendedTools.ts:115-130`），对模型是对的。
 *
 * 但它一路走到面板上就变成了**红色危险条**：「这次生成要花钱，已经给你一张确认卡，答了它才会开始。」
 * 用户看到的是一条红色警告，而实际发生的事是「Nomi 按规矩问了你一句」——卡就在上面的介入槽里。
 * 把**预期结果**画成危险，2026-09-21 的真实回合里实测出现 3 次。
 *
 * ── 为什么判据暂时住在渲染层 ──
 *
 * 正解是失败信封自己带一条轴（「这条给谁看 / 模型能不能自己改」），那是主进程契约的事
 * （`electron/shared/agentLane` 的 `LaneToolPublicFailure`）。在那条轴到位之前，渲染层用
 * **现有信息**（失败码）做到位，并且只收一个**闭合、极小**的集合——不是「看起来不严重的都放行」。
 * 主进程补上那条轴之后，这份名单整个删掉，判据换成读信封（登记在 report-lane-renderer.md）。
 */

/**
 * 控制信号码。加一个码进来必须同时答得出两件事：
 *   ① 它出现时，用户屏幕上**已经**有一个该看的东西（一张卡、一个面板），不需要再报一次错；
 *   ② 用户此刻**没有**要修的东西——没有参数要改、没有步骤要重来。
 * 两条都成立才叫控制信号；只要用户还得动手，那就是一条真错误，红着才对。
 */
const MODEL_CONTROL_SIGNAL_CODES: ReadonlySet<string> = new Set([
  // 付费确认卡已经在介入槽里了。用户要做的就是答那张卡，而卡自己会说话。
  'user_sees_spend_card',
])

export function isModelControlSignal(code: string | undefined): boolean {
  return Boolean(code && MODEL_CONTROL_SIGNAL_CODES.has(code))
}

// Agent 工具失败码 → 用户读到的那句话（C5，2026-09-18）。
//
// 为什么要这张表：失败正文由主进程的 `renderLaneToolFailure` 拼成**英文散文**给模型读
// （「message + Next: …」），而 `laneViewModel` 过去只摘掉成功信封的尾行，失败正文原样进
// `.tsx`。中文界面上于是出现
// `The current target could not accept this action (surface_port_stale). Next: …`
// ——审计 §5 / B03 截图。老的翻译门 `humanizeToolFailure` 只能去**正则那段英文**，
// 认得出的只有 schema 校验一种，其余一律落回英文。
//
// 现在结构化信封（`details.failure`）一路带到渲染层，这里按 `code` 查词条。
// 码表真相源有两处：传输那一族是 `electron/shared/surfacePortBinding.ts` 的
// `SURFACE_PORT_WIRE_ERROR_CODE_LIST` + `CAPABILITY_TRANSPORT_VERIFICATION_ERROR_CODE_LIST`，
// lane 工具自有的是 `laneToolFailureEnvelope.ts` 的 `LANE_TOOL_OWN_FAILURE_CODE_LIST`；
// 少一条或多一条由 `check:error-surface` 规则④ 报红。
//
// 写法约束（R2 用户视角 + 极简）：每句只说**发生了什么** + **他现在该做什么**。
// 不出现 lane / port / capability / binding 这些我们内部的词——用户那里没有这些指称。
export const zhAgentToolFailure = {
  // ── 传输：端口身份那一族 ──
  surface_port_stale: '刚才那一步针对的位置已经变了，没有执行。回到那个页面再让它做一次。',
  surface_port_suspended: '那个页面现在不接受改动，先把它打开再让它做。',
  surface_port_unavailable: '要改的那个页面没开着，打开它再让它做。',
  surface_owner_mismatch: '另一个窗口正拿着这个项目，关掉那个窗口再试。',
  project_binding_stale: '项目在这一步执行途中换了，什么都没改。回到项目里重新让它做。',
  project_identity_unavailable: '找不到项目文件夹，重新打开一次项目。',
  // ── 传输：这次调用本身 ──
  capability_execution_failed: '这一步没做成。看一眼当前状态，再让它重试。',
  capability_cancelled: '这一步被中断了，没有改动。',
  capability_input_invalid: '它给的参数不对，这一步没有执行。',
  capability_target_stale: '它针对的那个对象已经变了，这一步没有执行。',
  capability_unsupported: '这件事在当前页面做不了。',
  capability_receipt_unresolved: '这一步的结果没对上账，先别按已完成算。',
  capability_invocation_unverified: '这次调用没通过校验，什么都没改。',
  capability_authority_invalid: '这次调用没有权限，什么都没改。',
  capability_policy_stale: '权限设置在执行途中变了，这一步没有执行。',
  capability_output_invalid: '它返回的结果不合规，已经丢掉，没有落到项目里。',
  capability_timeout: '这一步等太久被停掉了，可能没做完。看一眼当前状态再决定要不要重来。',
  // ── lane 工具自有 ──
  tool_arguments_invalid: '它这次的参数不对，这一步没有执行。',
  tool_execution_failed: '这一步没做成。看一眼当前状态，再让它重试。',
  tool_timed_out: '这一步等太久被停掉了。看一眼当前状态再决定要不要重来。',
  wrong_verb: '它用错了方式，这一步没有执行——它会换一种再来。',
  generation_surface_unavailable: '生成面现在用不了，打开画布再让它生成。',
  user_sees_spend_card: '这次生成要花钱，已经给你一张确认卡，答了它才会开始。',
  // ── 兜底 ──
  unknown: '这一步没做成（{{code}}）。看一眼当前状态，再决定要不要让它重试。',
  // ── 结构化细节（不是散文，是把信封里的字段摆出来）──
  fieldExpected: '{{field}}：应该是 {{expected}}，它给的是 {{received}}',
  allowedValues: '可选值：{{values}}',
  useInstead: '应该用「{{verb}}」',
} as const

export const enAgentToolFailure = {
  surface_port_stale: 'What that step targeted has changed, so nothing ran. Go back to that page and ask again.',
  surface_port_suspended: 'That page is not accepting changes right now. Open it, then ask again.',
  surface_port_unavailable: 'The page it needs to change is not open. Open it, then ask again.',
  surface_owner_mismatch: 'Another window is holding this project. Close that window and try again.',
  project_binding_stale: 'The project changed while this step was running, so nothing was changed. Reopen the project and ask again.',
  project_identity_unavailable: 'The project folder could not be found. Reopen the project.',
  capability_execution_failed: 'That step did not go through. Check the current state, then ask it to retry.',
  capability_cancelled: 'That step was interrupted. Nothing was changed.',
  capability_input_invalid: 'It passed the wrong arguments, so the step did not run.',
  capability_target_stale: 'What it targeted has changed, so the step did not run.',
  capability_unsupported: 'That cannot be done on the current page.',
  capability_receipt_unresolved: 'That step’s result could not be reconciled — do not treat it as finished yet.',
  capability_invocation_unverified: 'That call failed verification. Nothing was changed.',
  capability_authority_invalid: 'That call was not authorized. Nothing was changed.',
  capability_policy_stale: 'Permissions changed while it was running, so the step did not run.',
  capability_output_invalid: 'What it returned was malformed and was discarded. Nothing reached the project.',
  capability_timeout: 'That step took too long and was stopped; it may be half-done. Check the current state before retrying.',
  tool_arguments_invalid: 'It passed the wrong arguments, so the step did not run.',
  tool_execution_failed: 'That step did not go through. Check the current state, then ask it to retry.',
  tool_timed_out: 'That step took too long and was stopped. Check the current state before retrying.',
  wrong_verb: 'It used the wrong action, so nothing ran — it will try a different one.',
  generation_surface_unavailable: 'Generation is unavailable right now. Open the canvas, then ask it to generate.',
  user_sees_spend_card: 'That generation costs credits. A confirmation card is waiting for your answer.',
  unknown: 'That step did not go through ({{code}}). Check the current state before deciding whether to retry.',
  fieldExpected: '{{field}}: expected {{expected}}, got {{received}}',
  allowedValues: 'Allowed: {{values}}',
  useInstead: 'Use “{{verb}}” instead',
} satisfies TranslationShape<typeof zhAgentToolFailure>

type TranslationShape<T> = {
  [K in keyof T]: T[K] extends string ? string : TranslationShape<T[K]>
}

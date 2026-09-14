// 一键反馈那张卡的文案（样张 B，用户 09-15 已拍板）。
//
// 写这些句子时守的两条：
//   ① **不解释我们不是坏人，而是直接说清收什么**。用户原话要求「让用户理解我们不是做坏事
//      只是为了真实优化产品」——做到这件事的不是一段承诺，是一行看得见的清单（「查看」）。
//      所以这里没有「我们非常重视您的隐私」这类句子，只有事实。
//   ② **零输入**。唯一的可填位是 notePlaceholder 那一行，它的文案本身就在说「可不填」。
export const zhFeedbackReport = {
  title: '反馈这个问题',
  /** 调用处没给那句人话时的兜底。它不该经常出现——出现了说明某个失败面没接上 summary。 */
  summaryFallback: '这一步没成功',
  attaches: '附带 日志 · 模型目录 · 工具轨迹',
  view: '查看',
  manifestUnavailable: '清单这次没算出来（日志或轨迹暂时读不到）。仍然可以发送。',
  rawHint: '要看完整原文：设置 → 通用 → 导出诊断包。',
  includeContent: '也附带提示词和文稿',
  notePlaceholder: '补一句（可不填）',
  send: '发送',
  sending: '正在发送…',
  sent: '已发送',
  sentWithId: '已发送 {{id}}',
  queued: '已排队，联网后自动重发',
  unconfigured: '这个构建没有配反馈接收端，所以发不出去。',
  failed: '这次没发出去，稍后再试一次。',
  bridgeMissing: '这个窗口没有桌面桥，发不出去（浏览器实验室 / 未打包）',
}

export const enFeedbackReport = {
  title: 'Report this problem',
  summaryFallback: 'This step did not succeed',
  attaches: 'Attaches logs · model catalog · tool trace',
  view: 'View',
  manifestUnavailable: 'The manifest could not be built this time (logs or trace are unreadable right now). You can still send.',
  rawHint: 'For the full raw files: Settings → General → Export a diagnostics bundle.',
  includeContent: 'Also attach prompts and manuscript',
  notePlaceholder: 'Add a line (optional)',
  send: 'Send',
  sending: 'Sending…',
  sent: 'Sent',
  sentWithId: 'Sent {{id}}',
  queued: 'Queued — it will be sent once you are back online',
  unconfigured: 'This build has no feedback endpoint configured, so nothing can be sent.',
  failed: 'That did not go through. Try again in a moment.',
  bridgeMissing: 'This window has no desktop bridge, so nothing can be sent (browser lab / unpackaged)',
}

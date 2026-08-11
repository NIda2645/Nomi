// 工具结果收口（A2 结果重写 + A6 错误契约 · plan 2026-08-11-mcp-conversation-native-p0）。
//
// 这里产出的 text 是「模型转述的原材料」= 用户在 CLI 里真正读到的内容（R15 可见文字）：
// 首行=状态一句话（✓/✗ + 关键事实），次行=参数回显（获批样张①⑧：模型/比例/时长/预算一眼可读，
// Higgsfield chips 的文本版），尾行=下一步动作与深链。双语（zh-CN/en）按 locale 出一份，不混排。
// structuredContent.nomiOutcome 给模型稳定字段（runId/params/nextActions/error），不再让它从文本里抠 ID。
// 纯逻辑、不碰 electron —— 与 mcpProtocol 同边界，可裸 node 单测。

import { ACTIVE_JOB_STATUSES } from '../productionRun/productionRunControl'

export type ResultLocale = 'zh-CN' | 'en'

type Ctx = { locale: ResultLocale }
const L = (ctx: Ctx, zh: string, en: string): string => (ctx.locale === 'en' ? en : zh)

const INTENT_LABEL: Record<string, { zh: string; en: string }> = {
  image: { zh: '一张画面', en: 'an image' },
  video: { zh: '一段视频', en: 'a video clip' },
  audio: { zh: '一段音频', en: 'an audio clip' },
  text: { zh: '一段文本', en: 'a text piece' },
}

/** run 状态 → 人话 + 下一步动作（状态机 productionRunState.ts 的对外翻译，缺省透传原状态）。 */
const RUN_STATUS_HINT: Record<string, { zh: string; en: string; nextZh: string; nextEn: string; action: string }> = {
  draft: { zh: '草稿', en: 'draft', nextZh: '下一步：定创意方向（尚未花费）', nextEn: 'Next: pick a creative direction (nothing spent yet)', action: 'pick_direction' },
  awaiting_direction: { zh: '等你定方向', en: 'awaiting direction', nextZh: '下一步：在对话里选一个创意方向', nextEn: 'Next: choose a creative direction in the conversation', action: 'pick_direction' },
  awaiting_storyboard_review: { zh: '分镜等你审阅', en: 'storyboard awaiting review', nextZh: '下一步：审阅分镜；确认后才会生成制作合同', nextEn: 'Next: review the storyboard; the contract is created after you confirm', action: 'review_storyboard' },
  awaiting_contract: { zh: '等待批准预算', en: 'awaiting budget approval', nextZh: '下一步：批准制作合同后才会开始付费生成', nextEn: 'Next: approve the production contract before any paid generation', action: 'approve_contract' },
  ready: { zh: '已就绪', en: 'ready', nextZh: '合同已批准，生成即将开始', nextEn: 'Contract approved; generation starts shortly', action: 'watch_or_pause' },
  running: { zh: '制作进行中', en: 'running', nextZh: '可随时说「先停一下」暂停', nextEn: 'Say "pause" anytime to pause the run', action: 'watch_or_pause' },
  pausing: { zh: '正在暂停', en: 'pausing', nextZh: '正在安全停下，已提交的镜头会先收尾', nextEn: 'Stopping safely; in-flight shots will settle first', action: 'wait' },
  paused: { zh: '已暂停', en: 'paused', nextZh: '已提交的花费不退但产物保留；未提交的不再花钱。可继续或取消', nextEn: 'Submitted spend is not refundable but its output is kept; nothing new will be charged. Resume or cancel', action: 'resume_or_cancel' },
  awaiting_rough_cut_review: { zh: '粗剪等你审阅', en: 'rough cut awaiting review', nextZh: '下一步：在 Nomi 里过一遍粗剪', nextEn: 'Next: review the rough cut in Nomi', action: 'review_rough_cut' },
  needs_attention: { zh: '需要处理', en: 'needs attention', nextZh: '有任务卡住了，看错误详情选恢复动作', nextEn: 'A job is stuck; check the error details for recovery actions', action: 'recover' },
  completed: { zh: '已完成', en: 'completed', nextZh: '产物已保存到项目，可在 Nomi 里查看', nextEn: 'Artifacts are saved to the project; open them in Nomi', action: 'open_in_nomi' },
  cancelled: { zh: '已取消', en: 'cancelled', nextZh: '未提交的任务不计费', nextEn: 'Unsubmitted jobs are not charged', action: 'none' },
}

/** A6 已知错误码 → 人话原因 + 恢复动作（只登记确证的码，不编造；未知码原样透传）。 */
const ERROR_HINT: Record<string, { zh: string; en: string; recover: Array<{ zh: string; en: string }> }> = {
  asset_not_localized: {
    zh: '参考素材还没落到本地，生成端拿不到它',
    en: 'A referenced asset is not localized yet, so the generator cannot read it',
    recover: [
      { zh: '在 Nomi 里打开该节点让素材完成本地化后重试', en: 'Open the node in Nomi to finish localizing the asset, then retry' },
    ],
  },
  renderer_or_provider_unknown: {
    zh: '找不到能执行这次生成的渲染器或供应商配置',
    en: 'No renderer or provider configuration can execute this generation',
    recover: [
      { zh: '用 nomi_list_models 核对可用模型后换一个', en: 'Check available models with nomi_list_models and switch' },
      { zh: '在 Nomi 设置里补齐该供应商的接入', en: 'Complete the provider setup in Nomi settings' },
    ],
  },
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** 参数回显行（样张⑧）：只回显真实收到的参数，缺的不编。 */
function echoLine(ctx: Ctx, parts: Array<string | null | undefined>): string | null {
  const kept = parts.filter((p): p is string => Boolean(p && p.trim()))
  return kept.length ? kept.join(' · ') : null
}

function truncate(text: string, max = 40): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

export type ToolOutcome = {
  /** CLI 文本（模型转述原材料）。null = 该工具维持 JSON 直出（画布低层工具）。 */
  text: string | null
  /** structuredContent.nomiOutcome：模型可靠读取的稳定字段。null = 不附加。 */
  outcome: Record<string, unknown> | null
}

/** A2 · 生产类工具结果 → 文本 + 稳定结构化字段。 */
export function buildToolOutcome(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  locale: ResultLocale = 'zh-CN',
): ToolOutcome {
  const ctx: Ctx = { locale }
  const value = rec(result)
  const openInNomi = str(value.openInNomi)
  const runId = str(value.runId) || str(args.runId)
  const projectId = str(value.projectId) || str(args.projectId)
  const openLine = openInNomi ? `\n${L(ctx, '在 Nomi 打开', 'Open in Nomi')} ${openInNomi}` : ''

  if (toolName === 'nomi_start_playbook') {
    const brief = rec(args.brief)
    const goal = str(brief.goal)
    const duration = typeof brief.durationSeconds === 'number' ? `${brief.durationSeconds}s` : null
    const echo = echoLine(ctx, [
      str(args.playbook) || null,
      goal ? `${L(ctx, '目标', 'goal')}「${truncate(goal)}」` : null,
      duration,
    ])
    const text = [
      `✓ ${L(ctx, '制作草稿已创建', 'Production draft created')} ${runId} · ${L(ctx, '未花费', 'nothing spent')}`,
      echo ? `  ${echo}` : null,
      L(ctx, '还没批准预算，也没有调用付费生成。下一步：定创意方向。', 'No budget approved and no paid generation yet. Next: settle the creative direction.'),
    ].filter(Boolean).join('\n') + openLine
    return {
      text,
      outcome: {
        kind: 'run_draft', runId, projectId,
        params: { playbook: str(args.playbook), goal, durationSeconds: brief.durationSeconds ?? null },
        nextActions: ['pick_direction'],
        openInNomi: openInNomi || null,
      },
    }
  }

  if (toolName === 'nomi_get_run') {
    const status = str(value.status) || 'unknown'
    const hint = RUN_STATUS_HINT[status]
    const artifacts = Array.isArray(value.artifacts) ? (value.artifacts as Array<Record<string, unknown>>) : []
    const latest = artifacts.at(-1)
    const preview = latest ? rec(latest.preview) : {}
    const budget = rec(value.budget)
    const budgetLine = echoLine(ctx, [
      typeof budget.authorized === 'number' ? `${L(ctx, '预算上限', 'budget cap')} ${budget.authorized}` : null,
      typeof budget.actual === 'number' ? `${L(ctx, '已花费', 'spent')} ${budget.actual}` : null,
    ])
    const text = [
      `[Nomi] ${runId} · ${hint ? L(ctx, hint.zh, hint.en) : status} · ${str(value.stageId) || 'unknown'}`,
      budgetLine ? `  ${budgetLine}` : null,
      preview.url ? `${L(ctx, '最新预览', 'Latest preview')} ${str(preview.url)}（${str(preview.expiresAt) || L(ctx, '限时', 'expiring')}）` : null,
      hint ? L(ctx, hint.nextZh, hint.nextEn) : null,
    ].filter(Boolean).join('\n') + openLine
    return {
      text,
      outcome: {
        kind: 'run_status', runId, projectId, status, stageId: str(value.stageId) || null,
        budget: { authorized: budget.authorized ?? null, actual: budget.actual ?? null },
        latestPreviewUrl: str(preview.url) || null,
        nextActions: hint ? [hint.action] : [],
        openInNomi: openInNomi || null,
      },
    }
  }

  if (toolName === 'nomi_subscribe_run') {
    const events = Array.isArray(value.events) ? (value.events as Array<Record<string, unknown>>) : []
    const lines = events.map((event) => `[Nomi] ${str(event.type) || 'event'} · ${str(event.message)}`)
    const text = `${lines.length ? lines.join('\n') : `[Nomi] ${L(ctx, '暂无新的重要事件', 'no new meaningful events')}`}\nnext cursor ${String(value.nextCursor ?? 0)}`
    return {
      text,
      outcome: {
        kind: 'run_events', runId, projectId,
        eventCount: events.length, nextCursor: value.nextCursor ?? 0,
        nextActions: events.length ? [] : ['wait_or_poll'],
      },
    }
  }

  if (toolName === 'nomi_get_artifact') {
    const preview = rec(value.preview)
    const nomiUri = str(value.nomiUri)
    const text = [
      `[Nomi] ${str(value.kind) || 'artifact'} · ${str(value.status) || 'unknown'} · ${str(value.artifactId)}`,
      nomiUri ? `${L(ctx, '产物', 'Artifact')} ${nomiUri}` : null,
      preview.url ? `${L(ctx, '预览', 'Preview')} ${str(preview.url)}（${str(preview.expiresAt) || L(ctx, '限时', 'expiring')}）` : null,
    ].filter(Boolean).join('\n') + openLine
    return {
      text,
      outcome: {
        kind: 'artifact', runId, projectId,
        artifactId: str(value.artifactId), artifactKind: str(value.kind) || null,
        previewUrl: str(preview.url) || null, nomiUri: nomiUri || null,
        nextActions: ['open_in_nomi'],
        openInNomi: openInNomi || null,
      },
    }
  }

  if (toolName === 'nomi_control_run') {
    const action = str(args.action)
    const status = str(value.status)
    const hint = RUN_STATUS_HINT[status]
    const budget = rec(value.budget)
    // 诚实敞口（D4）：已提交给供应商的任务收不回、钱已花——如实报数量，别让用户以为「停=零损失」。
    const jobsArr = Array.isArray(value.jobs) ? (value.jobs as Array<Record<string, unknown>>) : []
    const inFlight = jobsArr.filter((job) => ACTIVE_JOB_STATUSES.includes(str(job.status))).length
    const done = action === 'pause'
      ? (status === 'pausing' ? L(ctx, '✓ 正在暂停', '✓ Pausing') : L(ctx, '✓ 已暂停', '✓ Paused'))
      : action === 'resume'
        ? L(ctx, '✓ 已继续', '✓ Resumed')
        : action === 'cancel'
          ? L(ctx, '✓ 已取消', '✓ Cancelled')
          : `✓ ${action}`
    const exposure = inFlight > 0 && (action === 'pause' || action === 'cancel')
      ? L(ctx,
          `⚠ ${inFlight} 个已提交的任务无法撤回，会跑完并计费${action === 'pause' ? '；完成后自动落停' : ''}（结果保留，不浪费已花的钱）`,
          `⚠ ${inFlight} submitted job(s) cannot be recalled and will finish and bill${action === 'pause' ? '; the run settles to paused afterwards' : ''} (results are kept)`)
      : null
    const text = [
      `${done} · ${runId}${str(value.stageId) ? ` · ${str(value.stageId)}` : ''}`,
      exposure,
      echoLine(ctx, [
        typeof budget.actual === 'number' ? `${L(ctx, '已花费', 'spent')} ${budget.actual}` : null,
        action === 'pause' ? L(ctx, '未提交的任务不再提交、不计费', 'unsubmitted jobs will not be submitted or charged') : null,
        action === 'cancel' ? L(ctx, '已完成的产物保留在项目里', 'finished artifacts stay in the project') : null,
      ]),
      hint ? L(ctx, hint.nextZh, hint.nextEn) : null,
    ].filter(Boolean).join('\n') + openLine
    return {
      text,
      outcome: {
        kind: 'run_control', runId, projectId, action, status: status || null,
        budget: { actual: budget.actual ?? null },
        inFlightJobs: inFlight,
        nextActions: hint ? [hint.action] : [],
      },
    }
  }

  if (toolName === 'nomi_generate') {
    const intent = str(args.intent)
    const label = INTENT_LABEL[intent]
    const model = [str(args.vendor), str(args.modelKey)].filter(Boolean).join(' · ')
    const refs = Array.isArray(args.references) ? args.references.length : 0
    const echo = echoLine(ctx, [
      model || null,
      intent || null,
      refs ? `${L(ctx, '参考', 'refs')} ${refs}` : null,
      str(args.prompt) ? `「${truncate(str(args.prompt), 30)}」` : null,
    ])
    const text = [
      `✓ ${L(ctx, '已生成', 'Generated')}${label ? L(ctx, label.zh, label.en) : L(ctx, '一个素材', 'an asset')}`,
      echo ? `  ${echo}` : null,
      JSON.stringify(result, null, 2),
    ].filter(Boolean).join('\n')
    return {
      text,
      outcome: {
        kind: 'generation', projectId,
        params: { vendor: str(args.vendor), modelKey: str(args.modelKey), intent, references: refs },
        nextActions: ['open_in_nomi'],
      },
    }
  }

  return { text: null, outcome: null }
}

/** A1 · 长任务的进度起始帧（参数回显版「已受理 · kling · video」）；null = 该工具不发。 */
export function buildProgressStartMessage(
  toolName: string,
  args: Record<string, unknown>,
  locale: ResultLocale = 'zh-CN',
): string | null {
  const ctx: Ctx = { locale }
  if (toolName === 'nomi_generate') {
    const model = [str(args.vendor), str(args.modelKey)].filter(Boolean).join(' · ')
    return [L(ctx, '已受理', 'accepted'), model || null, str(args.intent) || null]
      .filter(Boolean).join(' · ')
  }
  if (toolName === 'nomi_start_playbook') {
    return [L(ctx, '正在创建制作草稿', 'creating production draft'), str(args.playbook) || null]
      .filter(Boolean).join(' · ')
  }
  return null
}

/** A6 · 错误 → 人话原因 + 恢复动作 + 诊断信息（未知错误不编内容，原样透传 message）。 */
export function buildToolErrorOutcome(
  toolName: string,
  error: unknown,
  locale: ResultLocale = 'zh-CN',
): { text: string; outcome: Record<string, unknown> } {
  const ctx: Ctx = { locale }
  const message = error instanceof Error ? error.message : String(error)
  const code = Object.keys(ERROR_HINT).find((key) => message.includes(key)) || null
  const hint = code ? ERROR_HINT[code] : null
  const recover = hint ? hint.recover.map((r) => L(ctx, r.zh, r.en)) : []
  const text = [
    `✗ ${hint ? L(ctx, hint.zh, hint.en) : message}`,
    code ? `${L(ctx, '诊断', 'diagnostic')} ${code}` : null,
    ...recover.map((line, index) => `${index + 1}. ${line}`),
    !hint && toolName === 'nomi_generate'
      ? L(ctx, '已完成的内容安全；确认模型服务与 API Key 后可重试。', 'Finished work is safe; verify the model service and API key, then retry.')
      : null,
  ].filter(Boolean).join('\n')
  return {
    text,
    outcome: { kind: 'error', tool: toolName, errorCode: code, message, recoveryActions: recover },
  }
}

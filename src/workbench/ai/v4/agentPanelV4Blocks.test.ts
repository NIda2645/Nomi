// 8 个积木**逐状态**的渲染断言。
//
// 为什么用 renderToStaticMarkup 而不是截图：截图证明「这一格今天长这样」，
// 断言证明的是「这个状态一定带这个东西」——比如失败收据一定带 danger 色和原因，
// 采用的候选一定带 accent 描边而不是把整格填成 accent 底（返工前就是后者）。
// 两者互补：像素归视觉基线，语义归这里。
import { beforeAll, describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { V4Intervention, V4Queue, V4TaskCard } from './AgentPanelV4Cards'
import { V4ContextRing } from './AgentPanelV4Context'
import { V4AssistantMessage, V4Thinking, V4UserBubble } from './AgentPanelV4Message'
import { V4ToolReceipt } from './AgentPanelV4Receipt'
import { AgentPanelV4Panel, V4FlowRow } from './AgentPanelV4Panel'
import ReconcileDeviationCard from '../../generationCanvas/components/ReconcileDeviationCard'
import { AgentPanelV4Composer } from './AgentPanelV4Composer'
import type { InterventionData, ToolReceipt, V4InterventionKind, V4TaskStatus, V4ToolStatus } from './agentPanelV4Types'

// 介入槽的写口在生产里是必填（R28）。测试里显式给一份空壳，表示「这一格不验行为」。
const NO_HANDLERS = { onPlanToggle: () => undefined, onCollapsePlan: () => undefined }

const el = React.createElement
const html = (node: React.ReactElement): string => renderToStaticMarkup(node)

const TOOL_STATUSES: readonly V4ToolStatus[] = [
  'input-streaming', 'input-available', 'approval-requested', 'approval-responded',
  'output-available', 'output-denied', 'output-error',
]
const TASK_STATUSES: readonly V4TaskStatus[] = ['queued', 'running', 'complete', 'failed', 'stopped']
const SLOT_KINDS: readonly V4InterventionKind[] = [
  'approval-irreversible', 'approval-reversible', 'reject-reason', 'spend',
  'question', 'plan', 'credential', 'deviation',
]

const taskLabels = {
  status: { queued: '排队', running: '生成中', complete: '完成', failed: '失败', stopped: '已停止' },
  adopt: '采用',
  undo: '撤销',
}
/** 模型自己写的那几个选项（标签 + 一句说明 + 可标推荐）——契约在 agentPanelV4Question.ts。 */
const QUESTION_OPTIONS = [
  { id: 'wide', label: '16:9 横版', description: '适合横屏平台', recommended: true as const },
  { id: 'tall', label: '9:16 竖版' },
]

const askLabels = {
  dismiss: '这次不答', skip: '跳过', continueLabel: '继续', send: '发送',
  customPlaceholder: '或者直接告诉它…', recommended: '推荐',
  step: (index: number, total: number) => `第 ${index} 题，共 ${total} 题`,
  prev: '上一题', next: '下一题',
}
const slotLabels = { confirm: '确认', reject: '不要', escalate: '不再问 →', cancel: '取消', confirmReject: '确认不要', collapsePlan: '收起 ▴', expandPlan: '展开 ▾', ask: askLabels }
// `unknown` 是「这个数我们没有」的那个字（环上写「—」而不是「0%」）。接线后它是必填的，
// 因为缺字段是常态：目录没写 contextWindow、供应商不报推理 token，都会走到它。
const contextLabels = { context: '上下文用量', input: '输入', output: '输出', reasoning: '推理', cache: '缓存命中', threadCost: '本线程花费', unknown: '—', usedOnly: '已用 {{amount}}' }
const usage = { used: 62400, max: 200000, input: '48.1K', output: '9.8K', reasoning: '2.1K', cache: '2.4K', cost: '¥0.83' }

beforeAll(async () => {
  // i18n 是全局单例，`initReactI18next` 注册后 useTranslation 就能拿到它（无需 Provider）。
  Reflect.set(globalThis, 'window', { localStorage: { getItem: () => null, setItem: () => {} } })
  Reflect.set(globalThis, 'document', { documentElement: { lang: '' } })
  await import('../../../i18n/index')
})

describe('① 用户气泡', () => {
  it('附件 chip 在气泡内，不是气泡外另起一行', () => {
    const markup = html(el(V4UserBubble, { text: '收紧结尾', chips: [{ kind: 'file', label: '参考.png' }] }))
    expect(markup).toContain('data-v4-block="user"')
    // chip 必须在同一个气泡 div 里：截断到 block 结束仍应含 chip。
    expect(markup).toContain('data-v4-chip="file"')
    expect(markup.indexOf('data-v4-chip')).toBeGreaterThan(markup.indexOf('data-v4-block="user"'))
  })

  it('暗色下用 ink-10 底而不是纯 ink（token 翻转后纯 ink 会变浅块）', () => {
    expect(html(el(V4UserBubble, { text: 'x', darkMode: true }))).toContain('bg-nomi-ink-10')
    expect(html(el(V4UserBubble, { text: 'x' }))).toContain('bg-nomi-ink ')
  })
})

describe('② 助手文本', () => {
  const labels = { copy: '复制回复', retry: '重来', continue: '继续', stopped: '已停止' }
  const wired = { onCopy: () => undefined, onRetry: () => undefined, onContinue: () => undefined }
  it('流式带光标、完成不带', () => {
    expect(html(el(V4AssistantMessage, { text: 'x', status: 'streaming', labels }))).toContain('style="--streamdown-caret:')
    expect(html(el(V4AssistantMessage, { text: 'x', status: 'complete', labels }))).not.toContain('style="--streamdown-caret:')
  })

  it('完成态的复制/重来 hover 才显（默认透明）', () => {
    const markup = html(el(V4AssistantMessage, { text: 'x', status: 'complete', labels, ...wired }))
    expect(markup).toContain('data-ai-element="actions"')
    expect(markup).toContain('opacity-0')
    expect(markup).toContain('group-hover:opacity-100')
    expect(markup).toContain('复制回复')
    expect(markup).toContain('重来')
  })

  // 没有 handler 的钮和有 handler 的钮在界面上长得**一模一样**，而按下去一个有事一个没事。
  // 2026-09-14 用户报「重试点了没反应」的机器成因就是这个：宿主从来没接 `onRetry`，
  // 钮照画。所以「钮在」从此等价于「这件事这里做得了」。
  it('宿主没接的动作**不画钮**——界面上不许有按下去没去处的钮', () => {
    const markup = html(el(V4AssistantMessage, { text: 'x', status: 'complete', labels }))
    expect(markup).not.toContain('复制回复')
    expect(markup).not.toContain('重来')
    const copyOnly = html(el(V4AssistantMessage, { text: 'x', status: 'complete', labels, onCopy: () => undefined }))
    expect(copyOnly).toContain('复制回复')
    expect(copyOnly).not.toContain('重来')
  })

  // 写剪贴板会失败（非安全上下文、权限被拒、文档没聚焦）。一颗「失败了也照样打勾」的钮
  // 比不打勾更糟——它把一次失败说成了成功，正是走查三升级③要拦的「假成功」。
  it('复制的 ✓ 只在宿主真的写成功之后才打', async () => {
    const { renderToString } = await import('react-dom/server')
    expect(renderToString(el(V4AssistantMessage, { text: 'x', status: 'complete', labels, onCopy: () => undefined })))
      .not.toContain('data-v4-copied')
  })

  it('中断态出「继续」，且不出复制/重来', () => {
    const markup = html(el(V4AssistantMessage, { text: 'x', status: 'interrupted', labels, ...wired }))
    expect(markup).toContain('继续')
    expect(markup).not.toContain('data-ai-element="actions"')
  })

  // 一次在模型吐出第一个字之前就被叫停的回合正文是空的。从前这一格整条不渲染，
  // 于是「停止」在界面上不留任何痕迹——用户唯一能得到的结论就是「没停下来」。
  it('一个字都没说就被停掉的回合，仍要留下「已停止」这张回执', () => {
    const markup = html(el(V4AssistantMessage, { text: '', status: 'interrupted', labels }))
    expect(markup).toContain('data-v4-stopped="true"')
    expect(markup).toContain('已停止')
  })

  it('空正文的中断态不画「继续」——没有半句话可接', () => {
    const markup = html(el(V4AssistantMessage, { text: '', status: 'interrupted', labels, ...wired }))
    expect(markup).not.toContain('继续')
  })

  it('思考行带秒数、不带纯转圈', () => {
    const markup = html(el(V4Thinking, { label: '正在想…', meta: '4s · esc 打断' }))
    expect(markup).toContain('data-v4-block="thinking"')
    expect(markup).toContain('4s · esc 打断')
    expect(markup).not.toContain('animate-spin')
  })
})

describe('③ 一行收据 · 七态', () => {
  const base: ToolReceipt = { label: '读取时间轴', action: 'timeline', status: 'output-available' }

  it.each(TOOL_STATUSES)('%s 渲得出且带自己的 data-status', (status) => {
    const markup = html(el(V4ToolReceipt, { receipt: { ...base, status }, statusLabel: '进行中' }))
    expect(markup).toContain(`data-status="${status}"`)
    expect(markup).toContain('读取时间轴')
  })

  it('失败/拒绝走 danger，完成走 success，其余走 accent', () => {
    const tone = (status: V4ToolStatus) => html(el(V4ToolReceipt, { receipt: { ...base, status }, statusLabel: 'x' }))
    expect(tone('output-error')).toContain('text-nomi-danger')
    expect(tone('output-denied')).toContain('text-nomi-danger')
    expect(tone('output-available')).toContain('text-nomi-success')
    expect(tone('input-streaming')).toContain('text-nomi-accent')
  })

  it('没有展开体的行不给 ›（不该给用户一个空按钮）', () => {
    expect(html(el(V4ToolReceipt, { receipt: base, statusLabel: 'x' }))).not.toContain('<details')
    const withBody = html(el(V4ToolReceipt, { receipt: { ...base, input: '{}', output: 'ok' }, statusLabel: 'x' }))
    expect(withBody).toContain('<details')
  })

  it('the collapsed tool group preserves the existing undo button on its exact receipt', () => {
    const markup = html(el(V4FlowRow, { darkMode: false, item: {
      kind: 'tool-group', label: 'Canvas', action: 'canvas', status: 'output-available', count: 2,
      trailing: 'Done', receipts: [base, { ...base, toolCallId: 'c2', undoable: true }],
    }, handlers: { onUndoTool: () => undefined } }))
    expect(markup).toContain('撤销')
    expect(markup.match(/<button/g)).toHaveLength(1)
  })

  it('可撤销的行在行尾多一个撤销', () => {
    expect(html(el(V4ToolReceipt, { receipt: { ...base, undoable: true }, statusLabel: 'x', undoLabel: '撤销' }))).toContain('撤销')
  })
})

describe('④ 任务卡 · 五态', () => {
  it('renders the real candidate thumbnail and cannot adopt an unreviewed candidate', () => {
    const markup = html(el(V4TaskCard, {
      task: { title: 'x', action: 'image', status: 'complete', candidates: [
        { tag: '1', artifactId: 'image-1', thumbnailUrl: 'nomi-local://asset/project-a/image.png', canAdopt: false },
      ] }, labels: taskLabels, onAdopt: () => undefined,
    }))
    expect(markup).toContain('<img')
    expect(markup).toContain('src="nomi-local://asset/project-a/image.png"')
    expect(markup).not.toContain('<button')
  })
  it.each(TASK_STATUSES)('%s 渲得出且带状态词', (status) => {
    const markup = html(el(V4TaskCard, { task: { title: '生成 3 张图片', action: 'image', status }, labels: taskLabels }))
    expect(markup).toContain(`data-status="${status}"`)
    expect(markup).toContain(taskLabels.status[status])
  })

  it('采用的候选是 accent 描边 + 角标，不是把整格填成 accent 底', () => {
    const markup = html(el(V4TaskCard, {
      task: { title: 'x', action: 'image', status: 'complete', candidates: [{ tag: '1', adopted: true }, { tag: '2', canAdopt: true }] },
      labels: taskLabels, onAdopt: () => undefined,
    }))
    expect(markup).toContain('outline-nomi-accent')
    expect(markup).toContain('data-adopted="true"')
    // 缩略图格本身仍是灰底占位，没有被 accent-soft 盖掉。
    expect(markup).not.toContain('bg-nomi-accent-soft')
    expect(markup).toContain('采用')
  })

  it('失败态带原因和「未扣费」的动作条', () => {
    const markup = html(el(V4TaskCard, {
      task: { title: 'x', action: 'video', status: 'failed', error: '供应商 500 · 未扣费', errorAction: '换模型重试' },
      labels: taskLabels,
    }))
    expect(markup).toContain('data-v4-block="errorbar"')
    expect(markup).toContain('未扣费')
    expect(markup).toContain('换模型重试')
  })

  it('每张卡都能带花费——这是我们要赢 MiniMax 的地方', () => {
    const markup = html(el(V4TaskCard, {
      task: { title: 'x', action: 'image', status: 'running', params: ['2K'], cost: '≈ ¥0.12' },
      labels: taskLabels,
    }))
    expect(markup).toContain('≈ ¥0.12')
    expect(markup).toContain('bg-nomi-warning-soft')
  })
})

describe('⑤ 介入槽 · 八种内容体', () => {
  const of = (kind: V4InterventionKind): InterventionData => ({ kind, title: '标题' })

  it.each(SLOT_KINDS)('%s 渲得出且带自己的 data-kind', (kind) => {
    const markup = html(el(V4Intervention, { ...NO_HANDLERS, data: of(kind), labels: slotLabels }))
    expect(markup).toContain(`data-kind="${kind}"`)
  })

  it('只有**可撤销的改动**显示「不再问 →」——不可逆和花钱的永远逐次问', () => {
    // 接线后「不再问 →」还多一个条件：**调用方真的能执行它**（给了 `onEscalate`）。
    // 没有去处的钮和有去处的钮长得一样，那就是在假装能按——空态发送钮那条同一个道理。
    const hasEscalate = (kind: V4InterventionKind) =>
      html(el(V4Intervention, { ...NO_HANDLERS, data: of(kind), labels: slotLabels, onEscalate: () => undefined })).includes('不再问')
    expect(hasEscalate('approval-reversible')).toBe(true)
    expect(hasEscalate('approval-irreversible')).toBe(false)
    expect(hasEscalate('spend')).toBe(false)
    expect(hasEscalate('credential')).toBe(false)
    // 计划槽没有「不再问」：它不是一个能「以后别问了」的能力。
    expect(hasEscalate('plan')).toBe(false)
  })

  it.each(['汤先到，人后到', '镜头 2：端起汤碗'])('计划人话与技术详情分开且默认折叠：%s', (label) => {
    const markup = html(el(V4Intervention, { ...NO_HANDLERS,
      data: { kind: 'plan', title: '计划', plan: [{ label, technical: '{"kind":"text"}', detail: 'MiniMax-H3 · 768P · 8s · 16:9', checked: true }] },
      labels: slotLabels,
    }))
    expect(markup).toContain(label)
    expect(markup).toContain('MiniMax-H3 · 768P · 8s · 16:9')
    expect(markup).toMatch(/<details[^>]*>/)
    expect(markup).not.toMatch(/<details[^>]* open/)
    expect(markup).not.toMatch(/<label[^>]*>[^]*?&quot;kind&quot;[^]*?<\/label>/)
  })

  it('计划槽底栏是「主动作 · 改一下 …… 收起 ▴ · ×」', () => {
    const markup = html(el(V4Intervention, { ...NO_HANDLERS,
      data: { kind: 'plan', title: '拆出 4 镜', confirmLabel: '生成 3 镜', alternateLabel: '改一下' },
      labels: slotLabels,
    }))
    expect(markup).toContain('生成 3 镜')
    expect(markup).toContain('改一下')
    expect(markup).toContain('收起 ▴')
    // 否定动作永远是那颗 ×（文字只当无障碍名），计划卡不再是唯一没有它的档
    // ——2026-09-11 用户实测「8 镜计划卡无法取消」。
    expect(markup).toContain('data-v4-control="reject"')
    expect(markup).not.toContain('>不要<')
  })

  it('收起态只换字、不丢底栏；展开态清单自己有滚动容器', () => {
    const plan = { kind: 'plan' as const, title: '拆出 8 镜', plan: [{ label: '镜头 1', checked: true }, { label: '镜头 2', checked: true }] }
    const expanded = html(el(V4Intervention, { ...NO_HANDLERS, data: plan, labels: slotLabels }))
    // 卡壳是 overflow-hidden，清单不自带滚动 = 第 N 行起看不见（用户 2026-09-11 实测）。
    expect(expanded).toContain('data-v4-block="plan-rows"')
    expect(expanded).toMatch(/class="[^"]*overflow-y-auto[^"]*"[^>]*data-v4-block="plan-rows"/)
    expect(expanded).toContain('镜头 2')
    expect(expanded).toContain('收起 ▴')

    const collapsed = html(el(V4Intervention, { ...NO_HANDLERS, data: plan, labels: slotLabels, planCollapsed: true }))
    expect(collapsed).not.toContain('data-v4-block="plan-rows"')
    expect(collapsed).toContain('展开 ▾')
    expect(collapsed).toContain('data-v4-control="confirm"')
  })

  it('按钮只有「确认 / 不要」，没有第三个主动作', () => {
    const markup = html(el(V4Intervention, { ...NO_HANDLERS, data: of('approval-irreversible'), labels: slotLabels }))
    expect(markup).toContain('确认')
    expect(markup).toContain('不要')
    expect(markup).not.toContain('取消')
  })

  it('反问卡：**和兄弟卡同一只外壳**，但没有卡头条、没有确认/不要、没有「不再问」', () => {
    const ask = html(el(V4Intervention, { ...NO_HANDLERS,
      data: { kind: 'question', title: '用什么画幅？', options: QUESTION_OPTIONS },
      labels: slotLabels,
    }))
    const spend = html(el(V4Intervention, { ...NO_HANDLERS, data: of('spend'), labels: slotLabels }))
    expect(ask).toContain('data-ask-card="true"')
    expect(ask).toContain('16:9 横版')

    // ① 外壳**同族**（2026-09-21 用户：「会不会格格不入？」）。
    //    第一版反问卡自带一套壳（纸色底 + 发丝环 + 柔影），放进真面板里一点边界都没有——
    //    分不清对话在哪结束、卡从哪开始。描边/圆角/底色现在由 `V4SlotShell` 一处给，
    //    这条判据就是「它俩还是不是一家人」：两张卡的外壳类名必须逐字相同。
    // `class` 不一定是 `<aside>` 上的第一个属性（反问卡还带 data-ask-card / tabindex），
    // 所以在整段开标签里找它，别写死属性顺序——那种写法只会在另一张卡上悄悄匹配不到。
    const shellOf = (markup: string) => markup.match(/<aside\b[^>]*?\bclass="([^"]*)"/)?.[1]
    expect(shellOf(ask)).toBeTruthy()
    expect(shellOf(ask)).toBe(shellOf(spend))

    // ② 但**没有卡头条**：问题本身就是标题，不再有「需要你定一下」那句套话。
    expect(ask).not.toContain('bg-nomi-accent-soft px-2.5 py-2')
    expect(spend).toContain('bg-nomi-accent-soft px-2.5 py-2')
    expect(ask.match(/用什么画幅？/g)).toHaveLength(1)
    expect(ask).toContain('data-v4-block="ask-question"')

    // ③ 没有确认/不要，也没有「不再问」（它根本没有那颗钮）。
    expect(ask).not.toContain('不要')
    expect(ask).not.toContain('不再问')
  })

  it('反问卡的主按钮用的是**卡族那一套**，不是自带的药丸', () => {
    const ask = html(el(V4Intervention, { ...NO_HANDLERS,
      data: { kind: 'question', title: '用什么画幅？', options: QUESTION_OPTIONS },
      labels: slotLabels,
    }))
    const spend = html(el(V4Intervention, { ...NO_HANDLERS, data: of('spend'), labels: slotLabels }))
    const primary = (markup: string, control: string) =>
      markup.match(new RegExp(`data-v4-control="${control}"[^>]*class="([^"]*)"`))?.[1]
        ?? markup.match(new RegExp(`class="([^"]*)"[^>]*data-v4-control="${control}"`))?.[1]
    const askPrimary = primary(ask, 'ask-continue')
    const spendPrimary = primary(spend, 'confirm')
    expect(askPrimary).toBeTruthy()
    expect(spendPrimary).toBeTruthy()
    // 同高、同圆角、同底色。第一版是 `rounded-pill`，在这个面板里是独一份——
    // 邻居全是方角 ink 钮，一颗药丸读起来像从别的 App 掉进来的。
    for (const token of ['h-7', 'rounded-nomi-sm', 'bg-nomi-ink', 'text-nomi-paper']) {
      expect(askPrimary).toContain(token)
      expect(spendPrimary).toContain(token)
    }
    expect(askPrimary).not.toContain('rounded-pill')
  })

  it('选项是整行可点的 radio 行——没有方框，也没有一排宽度参差的药丸', () => {
    const markup = html(el(V4Intervention, { ...NO_HANDLERS,
      data: { kind: 'question', title: '用什么画幅？', options: QUESTION_OPTIONS },
      labels: slotLabels,
    }))
    // 每个选项一个标记 + 一整行的按钮；chip 版那两个类名（自带 border、按内容定宽）绝迹。
    expect((markup.match(/data-ask-marker=/g) ?? []).length).toBe(QUESTION_OPTIONS.length)
    expect((markup.match(/data-v4-control="question-option"/g) ?? []).length).toBe(QUESTION_OPTIONS.length)
    expect(markup).toMatch(/data-v4-control="question-option"[^>]*class="[^"]*w-full/)
    expect(markup).not.toMatch(/data-v4-control="question-option"[^>]*class="[^"]*inline-flex/)
  })

  it('选项带说明与推荐时两样都印出来——模型写了我们就如实显示，但不预选', () => {
    const markup = html(el(V4Intervention, { ...NO_HANDLERS,
      data: { kind: 'question', title: '用什么画幅？', options: QUESTION_OPTIONS },
      labels: slotLabels,
    }))
    expect(markup).toContain('适合横屏平台')
    expect(markup).toContain('推荐')
    // 「推荐」是记号不是预选：卡一挂上来一个都不该是按下态。
    expect(markup).not.toContain('aria-pressed="true"')
  })

  it('末行自由输入是**无边框内联**的，和拒绝原因那条带框输入不是同一件', () => {
    const markup = html(el(V4Intervention, { ...NO_HANDLERS,
      data: { kind: 'question', title: '用什么画幅？', options: QUESTION_OPTIONS },
      labels: slotLabels,
    }))
    expect(markup).toContain('data-v4-control="question-answer"')
    expect(markup).toContain('或者直接告诉它…')
    const answerClass = markup.match(/data-v4-control="question-answer" class="([^"]*)"/)?.[1]
      ?? markup.match(/class="([^"]*)" data-v4-control="question-answer"/)?.[1]
    expect(answerClass).toBeTruthy()
    // 这一条就是用户骂的「蓝色粗框输入」的机器判据：它**不许**再长边框或底色。
    expect(answerClass).toContain('border-0')
    expect(answerClass).toContain('bg-transparent')
    expect(answerClass).not.toMatch(/\bborder-nomi-/)
    // 拒绝原因那条仍然有框——渐进披露出来的输入需要被看见，两者本来就不是一件。
    const reject = html(el(V4Intervention, { ...NO_HANDLERS,
      data: { kind: 'reject-reason', title: 'x', reasonPlaceholder: '拒绝原因（可选）' },
      labels: slotLabels,
    }))
    const rejectClass = reject.match(/data-v4-control="reject-reason" class="([^"]*)"/)?.[1]
      ?? reject.match(/class="([^"]*)" data-v4-control="reject-reason"/)?.[1]
    expect(rejectClass).toContain('border-nomi-line')
    expect(answerClass).not.toBe(rejectClass)
  })

  it('没有选项的反问照样有那一行——模型问的问题常常不是选择题', () => {
    const markup = html(el(V4Intervention, { ...NO_HANDLERS,
      data: { kind: 'question', title: '这段想要几秒？' },
      labels: slotLabels,
    }))
    expect(markup).toContain('data-v4-control="question-answer"')
    expect(markup).toContain('data-ask-card="true"')
  })

  it('只有一题时不显示页码——「1/1」是一句废话', () => {
    const one = html(el(V4Intervention, { ...NO_HANDLERS,
      data: { kind: 'question', title: '这段想要几秒？', options: QUESTION_OPTIONS },
      labels: slotLabels,
    }))
    expect(one).not.toContain('data-v4-block="ask-pager"')
    const three = html(el(V4Intervention, { ...NO_HANDLERS,
      data: {
        kind: 'question', title: '第一题', questions: [
          { question: '第一题', options: QUESTION_OPTIONS },
          { question: '第二题', options: QUESTION_OPTIONS, multiSelect: true },
          { question: '第三题', options: [] },
        ],
      },
      labels: slotLabels,
    }))
    expect(three).toContain('data-v4-block="ask-pager"')
    expect(three).toContain('1 / 3')
    // 多选那一题的标记是方的、单选是圆的——形状本身就说明了能选几个。
    expect(three).toContain('rounded-nomi-sm')
  })

  it('拒绝原因是渐进披露的输入 + 取消/确认不要', () => {
    const markup = html(el(V4Intervention, { ...NO_HANDLERS,
      data: { kind: 'reject-reason', title: 'x', reasonPlaceholder: '拒绝原因（可选）' },
      labels: slotLabels,
    }))
    expect(markup).toContain('拒绝原因（可选）')
    expect(markup).toContain('确认不要')
  })
})

describe('⑥ 队列行', () => {
  it('空队列不渲染——一个空框比没有框更吵', () => {
    expect(html(el(V4Queue, { rows: [], labels: { draft: '', queued: '排队', running: '进行中', complete: '完成' } }))).toBe('')
  })

  it('完成的划掉，进行中的点是 accent', () => {
    const markup = html(el(V4Queue, {
      rows: [{ title: 'a', status: 'complete' }, { title: 'b', status: 'running' }],
      labels: { draft: '', queued: '排队', running: '进行中', complete: '完成' },
    }))
    expect(markup).toContain('line-through')
    expect(markup).toContain('bg-nomi-accent')
  })
})

// ⑦ 收起坞的「叫回面板」那颗钮已搬到顶栏（09-01 定稿 §11.2），断言随它走进
// `src/ui/app-shell/AgentTopbarChip.test.tsx`——它现在的邻居是浏览器/设置那两颗钮，
// 断言该和它们放一起，不该留在面板积木这一叠里。本文件只剩画面下沿那一坞（无自有长相）。
// （合并 origin/main 时这里冲突过：main 那侧还留着 `V4CollapsedRail` 的 32px 断言，
//  而那个组件已在本分支随收起态返工删掉——保留删除，只取 main 对 Context 环的新说法。）
describe('⑧ Context 环', () => {
  it('缺分母时不画环，改说一句真的知道的话——0% 是一个我们没资格下的断言', () => {
    const markup = html(el(V4ContextRing, { usage: { used: 62400 }, labels: contextLabels, expanded: true }))
    expect(markup).not.toContain('0%')
    // 环是个仪表：没有分母时画一个恒定的灰圈，长得和「用量为 0」一模一样。
    // 2026-09-06 打包版实测——真实目录里的对话模型全都没写 contextWindow，
    // 整排空圈 + 「—」，一个能读的数都没有。有用量就把用量说出来。
    expect(markup).not.toContain('conic-gradient')
    expect(markup).toContain('已用 62.4K')
    // 分项一个都没有时那几行整行不渲染，不留 `0` 也不留占位。
    expect(markup).not.toContain('缓存命中')
  })

  it('连用量都没有（一个回合都还没结算）才退回「—」', () => {
    const markup = html(el(V4ContextRing, { usage: {}, labels: contextLabels, expanded: true }))
    expect(markup).toContain('—')
    expect(markup).not.toContain('已用')
    expect(markup).not.toContain('conic-gradient')
  })

  it('分母有了就画环，百分比是算出来的', () => {
    const markup = html(el(V4ContextRing, { usage: { used: 62400, max: 200000 }, labels: contextLabels, expanded: true }))
    expect(markup).toContain('conic-gradient')
    expect(markup).toContain('31%')
  })

  it('环显示真实百分比，展开体给 token 分项与花费', () => {
    const markup = html(el(V4ContextRing, { usage, labels: contextLabels, expanded: true }))
    expect(markup).toContain('31%') // 62400 / 200000
    expect(markup).toContain('48.1K')
    expect(markup).toContain('¥0.83')
    // 画布写的是「62.4K / 200K」——230px 的卡里千分位会把这一行挤成两截。
    expect(markup).toContain('62.4K / 200K')
  })
})

describe('⑧ composer 底栏逐件', () => {
  it('底栏是 [+] [模型名] ｜ [Skill] … [权限] [↑]，且没有语音钮', () => {
    const markup = html(el(AgentPanelV4Composer, {}))
    expect(markup).toContain('data-v4-control="model"')
    expect(markup).toContain('data-v4-control="skill"')
    expect(markup).toContain('data-v4-control="permission"')
    expect(markup).toContain('data-v4-control="send"')
    expect(markup).toContain('添加任意文件')
    // 模型钮只显示模型名，没有 icon 跟着它。
    expect(markup).toContain('GPT-5.6')
    expect(markup.toLowerCase()).not.toContain('microphone')
  })

  it('权限三档写进 data 属性，直接对应仓库合同两个字段', () => {
    const attrs = (tier: 'step' | 'safe-auto' | 'project') => html(el(AgentPanelV4Composer, { permission: tier }))
    expect(attrs('step')).toContain('data-approval-mode="step"')
    expect(attrs('step')).toContain('data-spend-policy="confirm"')
    expect(attrs('safe-auto')).toContain('data-approval-mode="safe-auto"')
    expect(attrs('project')).toContain('data-spend-policy="confirm"')
  })

  it('运行中变 ■ 停止，占位改「排队发送」', () => {
    const running = html(el(AgentPanelV4Composer, { mode: 'running' }))
    expect(running).toContain('排队发送')
    expect(running).toContain('aria-label="停止"')
    const idle = html(el(AgentPanelV4Composer, {}))
    expect(idle).toContain('aria-label="发送"')
  })

  it('Skill 选中后钮上带 accent 小点', () => {
    expect(html(el(AgentPanelV4Composer, { skillSelected: true }))).toContain('aria-pressed="true"')
    expect(html(el(AgentPanelV4Composer, {}))).toContain('aria-pressed="false"')
  })

  it('高度写进 data-height，随面板高度和内容 derive', () => {
    expect(html(el(AgentPanelV4Composer, { panelHeight: 620 }))).toContain('data-height="86"')
    expect(html(el(AgentPanelV4Composer, { panelHeight: 620, value: 'a\nb\nc\nd\ne\nf\ng\nh' }))).toContain('data-height="178"')
    // 同一段 8 行文本：620 高的面板封在 6 行（178），900 高的面板还没到 40% 上限，长满 218。
    expect(html(el(AgentPanelV4Composer, { panelHeight: 900, value: 'a\nb\nc\nd\ne\nf\ng\nh' }))).toContain('data-height="218"')
  })

  it('没有 onValueChange 时 textarea 只读——受控件不假装自己能编辑', () => {
    expect(html(el(AgentPanelV4Composer, { value: '只读' }))).toContain('readonly')
    expect(html(el(AgentPanelV4Composer, { value: '可编辑', onValueChange: () => undefined }))).not.toContain('readonly')
  })
})


it('the real panel mounts the approved domain deviation card at the end of its flow', () => {
  const markup = html(el(AgentPanelV4Panel, { slotHandlers: NO_HANDLERS,
    flow: [{ kind: 'assistant', text: 'Completed image', status: 'complete' }], context: usage,
    flowTail: el(ReconcileDeviationCard, {
      deviations: [{ kind: 'content', where: '镜头 1', field: '构图', expected: '杯子居中', actual: '偏左', reason: 'F_VERIFY_LOW' }],
      onDismiss: () => undefined, onAiFix: () => undefined,
    }),
  }))
  expect(markup).toContain('data-reconcile-deviation-card="true"')
  expect(markup.indexOf('F_VERIFY_LOW')).toBeGreaterThan(markup.indexOf('Completed image'))
  expect(markup.indexOf('F_VERIFY_LOW')).toBeLessThan(markup.indexOf('data-v4-block="composer"'))
})


describe('thinking disclosure boundary', () => {
  it('keeps the long body outside the summary and closed by default', () => {
    const text = 'reasoning body '.repeat(80)
    const markup = html(el(V4Thinking, { label: 'Thinking', meta: '', text, streaming: false }))
    expect(markup).toContain('<details')
    expect(markup).not.toMatch(/<details[^>]* open/)
    expect(markup.split('</summary>')[0]).not.toContain(text)
    expect(markup.split('</summary>')[1]).toContain(text)
    expect(markup).not.toContain('inline-flex h-7')
  })
})

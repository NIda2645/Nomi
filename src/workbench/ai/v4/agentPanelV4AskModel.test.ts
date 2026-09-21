// 反问卡视图模型（Approval Card 整件的那几条判断）。
//
// 这个文件钉的不是「长得对不对」，是**卡会出错的那几处**：单选点了该不该自己往下走、
// 最后一题的主按钮印什么、没答完能不能按、推荐项排第几、键盘按下去落到哪一项。
// 它们原来散在组件的 onClick 里，只有真人点过才知道对不对。
import { describe, expect, it } from 'vitest'
import {
  ASK_AUTO_ADVANCE_MS,
  EMPTY_ASK_DRAFT,
  askCardAnswer,
  askCardQuestions,
  askOptionIndexForArrow,
  askOptionIndexForKey,
  askQuestionAnswered,
  askSkipOutcome,
  isLastAskQuestion,
  orderedAskOptions,
  shouldAutoAdvance,
  shouldShowPager,
  shouldShowSkip,
  toggleAskOption,
  type V4AskQuestion,
} from './agentPanelV4AskModel'
import type { InterventionData } from './agentPanelV4Types'

const A = { id: 'a', label: '横版 16:9', description: '适合横屏平台' } as const
const B = { id: 'b', label: '竖版 9:16' } as const
const C = { id: 'c', label: '方版 1:1', recommended: true as const }

describe('「推荐」排第一，其余保持模型给的次序', () => {
  it('推荐项被提到最前面，剩下的**相对次序不变**', () => {
    // 模型写选项的顺序本身有意义（常常是从保守排到激进），所以只提一项、不重排全表。
    expect(orderedAskOptions([A, B, C]).map((option) => option.id)).toEqual(['c', 'a', 'b'])
  })

  it('推荐项已经在第一位时原样返回——不做无谓的新数组', () => {
    const options = [C, A, B]
    expect(orderedAskOptions(options)).toBe(options)
  })

  it('一个都没标推荐时原样返回', () => {
    const options = [A, B]
    expect(orderedAskOptions(options)).toBe(options)
  })

  it('标了不止一个推荐时只提最前面那一个——多标一个不该让排序变成随机', () => {
    const second = { id: 'b2', label: '第二个推荐', recommended: true as const }
    expect(orderedAskOptions([A, second, C]).map((option) => option.id)).toEqual(['b2', 'a', 'c'])
  })
})

describe('单选 / 多选：点一下之后这一题变成什么', () => {
  it('单选只留这一项，并且**清掉自己打的字**——一个答案不能既是「选了 B」又是「我另有说法」', () => {
    const typed = { picked: [] as readonly number[], custom: '我想要别的' }
    expect(toggleAskOption(typed, 1, false)).toEqual({ picked: [1], custom: '' })
  })

  it('单选再点另一项是替换，不是累加', () => {
    expect(toggleAskOption({ picked: [0], custom: '' }, 2, false)).toEqual({ picked: [2], custom: '' })
  })

  it('多选有则去、无则增，且**不动**那一行自己打的字', () => {
    const start = { picked: [0] as readonly number[], custom: '还有别的' }
    expect(toggleAskOption(start, 1, true)).toEqual({ picked: [0, 1], custom: '还有别的' })
    expect(toggleAskOption({ picked: [0, 1], custom: '' }, 0, true)).toEqual({ picked: [1], custom: '' })
  })

  it('单选点了就自己往下走，多选等「继续」——用户 2026-09-21 的原话', () => {
    expect(shouldAutoAdvance(false)).toBe(true)
    expect(shouldAutoAdvance(true)).toBe(false)
    // 延时照搬 Approval Card 的 `advanceTimer`，不自己调一个数。
    expect(ASK_AUTO_ADVANCE_MS).toBe(480)
  })
})

describe('答没答上 / 第几题 / 要不要页码', () => {
  it('选了任意一项算答上，只打了字也算，两样都没有就没答上（主按钮置灰的判据）', () => {
    expect(askQuestionAnswered(EMPTY_ASK_DRAFT)).toBe(false)
    expect(askQuestionAnswered({ picked: [1], custom: '' })).toBe(true)
    expect(askQuestionAnswered({ picked: [], custom: '3 秒' })).toBe(true)
    // 只打了空格不算：那是一次误触，不是一个答案。
    expect(askQuestionAnswered({ picked: [], custom: '   ' })).toBe(false)
  })

  it('只有一题时不显示页码——「1/1」是一句废话', () => {
    expect(shouldShowPager(1)).toBe(false)
    expect(shouldShowPager(0)).toBe(false)
    expect(shouldShowPager(3)).toBe(true)
  })

  it('最后一题的主按钮印「发送」，之前都印「继续」', () => {
    expect(isLastAskQuestion(0, 3)).toBe(false)
    expect(isLastAskQuestion(2, 3)).toBe(true)
    expect(isLastAskQuestion(0, 1)).toBe(true)
  })
})

describe('一次待决 → 题目表', () => {
  it('契约今天只有一题，所以摊成长度 1，页码因此自动不显示', () => {
    const data = { kind: 'question', title: '用什么画幅？', options: [A, B] } as InterventionData
    const questions = askCardQuestions(data)
    expect(questions).toHaveLength(1)
    expect(questions[0]!.question).toBe('用什么画幅？')
    expect(questions[0]!.options).toEqual([A, B])
    expect(shouldShowPager(questions.length)).toBe(false)
  })

  it('summary（熔断那句 / 模型的 note）落到问句下面那一行，不是第二个题目', () => {
    const data = { kind: 'question', title: '这 2 个镜头当什么用？', summary: '试了 3 次都没通过，交给你定。' } as InterventionData
    expect(askCardQuestions(data)[0]!.note).toBe('试了 3 次都没通过，交给你定。')
  })

  it('已经给了多题就原样用——契约哪天长出 questions[]，只改这一个函数', () => {
    const questions: readonly V4AskQuestion[] = [
      { question: '一', options: [] },
      { question: '二', options: [A], multiSelect: true },
    ]
    const data = { kind: 'question', title: '一', questions } as InterventionData
    expect(askCardQuestions(data)).toBe(questions)
    expect(shouldShowPager(askCardQuestions(data).length)).toBe(true)
  })
})

describe('收成回给模型的那一份（契约 §8.4 的形状：一题一条）', () => {
  it('单选给出 questionIndex + 一个 optionId + 文字', () => {
    const questions: readonly V4AskQuestion[] = [{ question: '用什么画幅？', options: [A, B] }]
    expect(askCardAnswer(questions, [{ picked: [1], custom: '' }]))
      .toEqual([{ questionIndex: 0, optionIds: ['b'], text: '竖版 9:16' }])
  })

  it('下标按**排过序之后**的位置算——推荐项排第一之后，点第一行拿到的必须是推荐那一项', () => {
    // 这一条是整份模型里最容易错的地方：排序在渲染层做、取值在这里做，
    // 两边用不同的数组就会把「他点的 C」记成「A」。
    const questions: readonly V4AskQuestion[] = [{ question: '用什么画幅？', options: [A, B, C] }]
    expect(askCardAnswer(questions, [{ picked: [0], custom: '' }]))
      .toEqual([{ questionIndex: 0, optionIds: ['c'], text: '方版 1:1' }])
  })

  it('自己打字时没有 optionIds——那句话就是答案', () => {
    const questions: readonly V4AskQuestion[] = [{ question: '几秒？', options: [] }]
    expect(askCardAnswer(questions, [{ picked: [], custom: '  3 秒  ' }]))
      .toEqual([{ questionIndex: 0, text: '3 秒' }])
  })

  it('多选给出**多个** optionIds，文字用「、」连起来', () => {
    const questions: readonly V4AskQuestion[] = [{ question: '要哪几样？', options: [A, B], multiSelect: true }]
    expect(askCardAnswer(questions, [{ picked: [0, 1], custom: '' }]))
      .toEqual([{ questionIndex: 0, optionIds: ['a', 'b'], text: '横版 16:9、竖版 9:16' }])
  })

  it('多题各成一条，questionIndex 对得上号——多题卡上这是唯一能对号的东西', () => {
    const questions: readonly V4AskQuestion[] = [
      { question: '用什么画幅？', options: [A, B] },
      { question: '几秒？', options: [] },
    ]
    expect(askCardAnswer(questions, [{ picked: [0], custom: '' }, { picked: [], custom: '5 秒' }]))
      .toEqual([
        { questionIndex: 0, optionIds: ['a'], text: '横版 16:9' },
        { questionIndex: 1, text: '5 秒' },
      ])
  })

  it('一题都没答就是空数组——按「继续」不该发一条空的出去', () => {
    const questions: readonly V4AskQuestion[] = [{ question: '几秒？', options: [A] }]
    expect(askCardAnswer(questions, [EMPTY_ASK_DRAFT])).toEqual([])
  })

  it('跳过的题**不出现在数组里**，而且后一题的 questionIndex 仍是 1（不是 0）', () => {
    // 跳过不是一个答案；但下标必须还是它在卡上的真实位置，
    // 按「第几条答复」重新编号会让主进程把答案对到另一题上。
    const questions: readonly V4AskQuestion[] = [
      { question: '一', options: [A] },
      { question: '二', options: [B] },
    ]
    expect(askCardAnswer(questions, [EMPTY_ASK_DRAFT, { picked: [0], custom: '' }]))
      .toEqual([{ questionIndex: 1, optionIds: ['b'], text: '竖版 9:16' }])
  })

  it('同一题既选了又打了字：两样都发，选项在前', () => {
    const questions: readonly V4AskQuestion[] = [{ question: '要哪几样？', options: [A, B], multiSelect: true }]
    expect(askCardAnswer(questions, [{ picked: [0], custom: '再加一个竖版' }]))
      .toEqual([{ questionIndex: 0, optionIds: ['a'], text: '横版 16:9、再加一个竖版' }])
  })
})

describe('「跳过」= 跳过当前这一题，不是整张卡不答（那是右上 ×）', () => {
  it('只有一题时页脚不放「跳过」——那时它和 × 是同一件事', () => {
    expect(shouldShowSkip(1)).toBe(false)
    expect(shouldShowSkip(2)).toBe(true)
  })

  it('不是最后一题：去下一题，并且**清掉这一题已有的作答**', () => {
    // 用户点过一项又按「跳过」，说的是「这题我不答了」，留着那一项等于替他答。
    const drafts = [{ picked: [1], custom: '' }, EMPTY_ASK_DRAFT, EMPTY_ASK_DRAFT]
    const outcome = askSkipOutcome(0, drafts)
    expect(outcome.next).toBe('next-question')
    expect(outcome.drafts[0]).toEqual(EMPTY_ASK_DRAFT)
  })

  it('最后一题：前面答过的照发，被跳过的题**不出现在答复里**', () => {
    const questions: readonly V4AskQuestion[] = [
      { question: '一', options: [A] }, { question: '二', options: [B] }, { question: '三', options: [] },
    ]
    const drafts = [{ picked: [0], custom: '' }, EMPTY_ASK_DRAFT, { picked: [], custom: '打了一半' }]
    const outcome = askSkipOutcome(2, drafts)
    expect(outcome.next).toBe('submit')
    // 第 2 题被跳过、第 3 题跳过时清空：答复里只有第 1 题，且 questionIndex 仍是它在卡上的真位置。
    expect(askCardAnswer(questions, outcome.drafts)).toEqual([{ questionIndex: 0, optionIds: ['a'], text: '横版 16:9' }])
  })

  it('最后一题且一题都没答过：等同整张卡不答', () => {
    expect(askSkipOutcome(1, [EMPTY_ASK_DRAFT, { picked: [0], custom: '' }]).next).toBe('dismiss')
  })
})

describe('键盘', () => {
  it('数字键 1–9 直选，越界返回 undefined——不静默取最后一项', () => {
    expect(askOptionIndexForKey('1', 3)).toBe(0)
    expect(askOptionIndexForKey('3', 3)).toBe(2)
    expect(askOptionIndexForKey('4', 3)).toBeUndefined()
    expect(askOptionIndexForKey('0', 3)).toBeUndefined()
    expect(askOptionIndexForKey('a', 3)).toBeUndefined()
    expect(askOptionIndexForKey('Enter', 3)).toBeUndefined()
  })

  it('↑↓ 环形走，没选中时 ↓ 落第一项、↑ 落最后一项', () => {
    expect(askOptionIndexForArrow(undefined, 1, 3)).toBe(0)
    expect(askOptionIndexForArrow(undefined, -1, 3)).toBe(2)
    expect(askOptionIndexForArrow(2, 1, 3)).toBe(0)
    expect(askOptionIndexForArrow(0, -1, 3)).toBe(2)
  })

  it('一个选项都没有时方向键不接管——纯自由作答的卡上 ↑↓ 该留给别人', () => {
    expect(askOptionIndexForArrow(undefined, 1, 0)).toBeUndefined()
  })
})

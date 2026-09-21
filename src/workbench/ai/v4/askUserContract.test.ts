/**
 * 提问工具的**逐字段对拍**：模型看到的那份 schema ↔ 渲染层画那张卡时读的那些字段。
 *
 * ── 它在守什么 ──
 *
 * 用户 2026-09-21 点名的那个坑：同一个工具的契约有好几份（schema / 描述 / 提示词里的用法 /
 * MCP 目录 / 校验器 / 渲染层类型），每份不一样，于是 Agent 很难触发它。提问工具是全新的
 * 模型可见工具，最容易再长出这个坑——而长出来的那一天，**编译器、单测、门岗谁都不会红**：
 * 模型多填一个字段，解析器安静地忽略它；渲染层多读一个字段，模型从来没被告知要填它。
 * 两种都是「安静地少做一件事」，用户那头看到的是「它问得不对」或者「它不问」。
 *
 * ── 判据 ──
 *
 * 不比较两份手写的清单（那只是把同一份漂移抄成两份）。这里从**模型真正收到的那份 JSON
 * Schema**（`MODEL_FACING_TOOL_SPECS` → `toPublishedJsonSchema`，与 pi 拿去跑 ajv 的是同一份）
 * 取出字段名，逐个要求渲染层这边给出「它怎么落到卡上」的具体断言。schema 加一个字段，
 * 下面 `FIELDS` 的键就对不上 —— 当场红，而且红在「你还没说这个字段怎么画」这句话上。
 *
 * 反向验红（2026-09-21 亲跑，日志 `scratchpad/C-redproof-drift.txt`）：
 *   ① 给 `askUserInputSchema` 加一个 `urgency` 字段（渲染层没人读） → ① 红
 *      「expected ['note','options','question','urgency'] to deeply equal ['note','options','question']」；
 *   ② 把 `questionOptions` 里读 `description` 那一行删掉 → ④ 红
 *      「选项的 "description" 字段模型填得出来，但渲染层没读」；
 *   ③ 把说明书里那句 `More than ${max}` 写死成 `More than 6`（判越界的仍是 4） → ⑥ 红
 *      「expected 'Two to four options, …' to contain '4'」。
 */
import { describe, expect, it } from 'vitest'

import { MODEL_FACING_TOOL_SPECS } from '../../../../electron/shared/agentCapabilities/modelFacingToolRegistry'
import { toPublishedJsonSchema } from '../../../../electron/shared/agentCapabilities/modelVisibleJsonSchema'
import {
  ASK_USER_OPTION_RANGE, askUserInputSchema, askUserPendingArgsSchema,
} from '../../../../electron/shared/agentCapabilities/askUser'
import { parseQuestionAsk, questionOptionCountIssue, questionOptions, V4_QUESTION_OPTION_RANGE } from './agentPanelV4Question'

const spec = MODEL_FACING_TOOL_SPECS.find(candidate => candidate.name === 'ask_user')

function properties(schema: unknown): Record<string, unknown> {
  const record = schema as { properties?: Record<string, unknown> }
  return record.properties ?? {}
}

/**
 * 模型那份 schema 的每一个字段，配一条「它怎么落到卡上」。
 * **键必须与 schema 逐字相等**（第 1 条断言），所以这张表不会悄悄落后。
 */
const FIELDS: Record<string, () => void> = {
  question: () => {
    expect(parseQuestionAsk({ question: '哪一个要删掉？' })?.question).toBe('哪一个要删掉？')
  },
  options: () => {
    const ask = parseQuestionAsk({ question: 'q', options: [{ label: 'A' }, { label: 'B' }] })
    expect(ask?.options.map(option => option.label)).toEqual(['A', 'B'])
  },
  note: () => {
    expect(parseQuestionAsk({ question: 'q', note: '因为这两条剪法完全不同' })?.note)
      .toBe('因为这两条剪法完全不同')
  },
}

/** 选项对象的每一个字段，同上。 */
const OPTION_FIELDS: Record<string, () => void> = {
  id: () => {
    expect(questionOptions({ options: [{ id: 'keep-wide', label: 'A' }] })[0]?.id).toBe('keep-wide')
  },
  label: () => {
    expect(questionOptions({ options: [{ label: '镜 2 · 推门' }] })[0]?.label).toBe('镜 2 · 推门')
  },
  description: () => {
    expect(questionOptions({ options: [{ label: 'A', description: '画布中间那张' }] })[0]?.description)
      .toBe('画布中间那张')
  },
  recommended: () => {
    expect(questionOptions({ options: [{ label: 'A', recommended: true }] })[0]?.recommended).toBe(true)
  },
}

describe('ask_user：一份契约，两端对拍', () => {
  it('① 模型看到的字段，渲染层每一个都说得出怎么画', () => {
    expect(spec, 'ask_user 不在模型可见工具表里；它没被注册，模型就永远问不出这一句').toBeDefined()
    expect(Object.keys(properties(toPublishedJsonSchema(spec!.schema))).sort()).toEqual(Object.keys(FIELDS).sort())
  })

  it('② 每个字段都真的被解析出来', () => {
    for (const [field, assertCarried] of Object.entries(FIELDS)) {
      try { assertCarried() } catch (cause) {
        throw new Error(`ask_user 的 "${field}" 字段模型填得出来，但渲染层没把它画到卡上：${String(cause)}`)
      }
    }
  })

  it('③ 选项对象的字段，两端也逐个对上', () => {
    const optionSchema = (properties(toPublishedJsonSchema(spec!.schema)).options as { items?: unknown }).items
    expect(Object.keys(properties(optionSchema)).sort()).toEqual(Object.keys(OPTION_FIELDS).sort())
  })

  it('④ 每个选项字段都真的被解析出来', () => {
    for (const [field, assertCarried] of Object.entries(OPTION_FIELDS)) {
      try { assertCarried() } catch (cause) {
        throw new Error(`选项的 "${field}" 字段模型填得出来，但渲染层没读：${String(cause)}`)
      }
    }
  })

  it('⑤ 说明书里的每个示例，卡都画得出来（示例本身已由装配期喂回 schema）', () => {
    expect(spec!.examples.length).toBeGreaterThan(0)
    for (const example of spec!.examples) {
      const ask = parseQuestionAsk(example.arguments)
      expect(ask, `示例「${example.when}」解析不出一张卡`).toBeDefined()
      expect(ask!.question, `示例「${example.when}」没有问句`).not.toBe('')
      const declared = (example.arguments as { options?: unknown[] }).options ?? []
      expect(ask!.options.length, `示例「${example.when}」的选项在解析时掉了`).toBe(declared.length)
    }
  })

  it('⑥ 印给模型的选项数量，和判越界用的是同两个数', () => {
    // 这里**不能**用 `toBe`：vitest 下渲染层那条 import 路径与本文件这条会各自实例化一次
    // `electron/shared/**`（两个 transform 上下文），同一个 `Object.freeze` 出来的常量因此
    // 不是同一个对象。身份比不了，但要守的那件事——「两边的数不许分家」——`toStrictEqual`
    // 正好守得住：渲染层哪天自己抄一份 {min:2,max:5} 出来，这一条当场红。
    expect(V4_QUESTION_OPTION_RANGE).toStrictEqual(ASK_USER_OPTION_RANGE)
    const guidelines = (spec!.promptGuidelines ?? []).join(' ')
    expect(guidelines).toContain(String(ASK_USER_OPTION_RANGE.max))
    expect(guidelines).toContain(String(ASK_USER_OPTION_RANGE.min))
    expect(questionOptionCountIssue({ question: 'q', options: questionOptions({ options: [{ label: 'A' }] }) })).toBe('too-few')
    expect(questionOptionCountIssue({
      question: 'q',
      options: questionOptions({ options: Array.from({ length: ASK_USER_OPTION_RANGE.max + 1 }, (_, i) => ({ label: `o${i}` })) }),
    })).toBe('too-many')
  })

  it('⑦ 两个宿主生产者的参数走同一份 schema，且模型填不出它们', () => {
    // 缺参数与熔断是同一张卡的另外两个生产者，所以它们必须过同一份待决 schema……
    expect(askUserPendingArgsSchema.safeParse({ missingParam: 'duration' }).success).toBe(true)
    expect(askUserPendingArgsSchema.safeParse({
      question: '这一镜要多长？', options: [{ label: '5 秒' }, { label: '10 秒' }],
      askReason: { code: 'retry_exhausted', attempts: 3 },
    }).success).toBe(true)
    // ……而模型那一份收不下它们：能自己声称「这是第 3 次了」就是给它一个伪造理由的字段。
    expect(askUserInputSchema.safeParse({ question: 'q', missingParam: 'duration' }).success).toBe(false)
    expect(askUserInputSchema.safeParse({ question: 'q', askReason: { code: 'retry_exhausted', attempts: 3 } }).success).toBe(false)
    // 一张既没有问句也没有缺失参数名的卡不成立（那是一张空白卡，用户看不懂要答什么）。
    expect(askUserPendingArgsSchema.safeParse({ options: [{ label: 'A' }, { label: 'B' }] }).success).toBe(false)
    expect(parseQuestionAsk({ options: [{ label: 'A' }] })).toBeUndefined()
  })

  it('⑧ 熔断那一句只接受码 + 次数，不接受成句的字符串', () => {
    expect(parseQuestionAsk({ question: 'q', askReason: { code: 'retry_exhausted', attempts: 3 } })?.reason)
      .toEqual({ code: 'retry_exhausted', attempts: 3 })
    // 成句的字符串会绕过 i18n：英文用户读到中文，或者反过来。
    expect(parseQuestionAsk({ question: 'q', askReason: '试了三次都不对' })?.reason).toBeUndefined()
  })
})

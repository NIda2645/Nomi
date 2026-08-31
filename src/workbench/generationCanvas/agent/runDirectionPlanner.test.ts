import { describe, expect, it } from 'vitest'
import { buildDirectionPlannerPrompt, parseDirectionCandidates } from './runDirectionPlanner'

describe('buildDirectionPlannerPrompt', () => {
  it('把 brief 有值字段拼进 prompt，缺省字段不占位', () => {
    const prompt = buildDirectionPlannerPrompt({
      brief: { goal: '本地优先 AI 视频工作台宣传片', tone: '真诚', sellingPoints: ['本地优先', '节点式画布'] },
      playbook: { key: 'brand.promo', name: '品牌宣传片' },
    })
    expect(prompt).toContain('本地优先 AI 视频工作台宣传片')
    expect(prompt).toContain('真诚')
    expect(prompt).toContain('本地优先、节点式画布')
    expect(prompt).toContain('品牌宣传片')
    expect(prompt).not.toContain('受众：') // audience 缺省 → 不出现该行
  })

  it('要求 2-3 个差异化方向、标题≤12 字、语言跟随 brief、只吐 JSON', () => {
    const prompt = buildDirectionPlannerPrompt({ brief: { goal: 'x' } })
    expect(prompt).toContain('2 到 3 个方向')
    expect(prompt).toContain('不超过 12 个字')
    expect(prompt).toContain('用与上面简报相同的语言')
    expect(prompt).toContain('只输出一个 JSON 对象')
  })

  it('brief 信息极少也能组出 prompt（给合理发挥提示）', () => {
    const prompt = buildDirectionPlannerPrompt({ brief: null, playbook: null })
    expect(prompt).toContain('简报信息较少')
  })
})

describe('parseDirectionCandidates', () => {
  it('解析裸 JSON 的候选', () => {
    const out = parseDirectionCandidates(
      '{"candidates":[{"key":"documentary","title":"纪录片式","oneLiner":"真实创作者。"},{"key":"kinetic","title":"动感剪辑","oneLiner":"快切画布。"}]}',
    )
    expect(out).toEqual([
      { key: 'documentary', title: '纪录片式', oneLiner: '真实创作者。' },
      { key: 'kinetic', title: '动感剪辑', oneLiner: '快切画布。' },
    ])
  })

  it('剥 ```json 围栏 + 容忍尾逗号', () => {
    const out = parseDirectionCandidates(
      '这是我的方案：\n```json\n{"candidates":[{"key":"a","title":"甲","oneLiner":"一"},{"key":"b","title":"乙","oneLiner":"二"},]}\n```',
    )
    expect(out.map((c) => c.key)).toEqual(['a', 'b'])
  })

  it('非法 key 按序号兜 dir-N，重复 key 去重', () => {
    const out = parseDirectionCandidates(
      '{"candidates":[{"key":"有中文!","title":"甲","oneLiner":"一"},{"key":"dup","title":"乙","oneLiner":"二"},{"key":"dup","title":"丙","oneLiner":"三"}]}',
    )
    // 非法 key → dir-1；后两个 key 相同 → 只留第一个
    expect(out.map((c) => c.key)).toEqual(['dir-1', 'dup'])
  })

  it('最多取 3 个候选', () => {
    const many = Array.from({ length: 5 }, (_, i) => `{"key":"k${i}","title":"t${i}","oneLiner":"o${i}"}`).join(',')
    const out = parseDirectionCandidates(`{"candidates":[${many}]}`)
    expect(out).toHaveLength(3)
  })

  it('不足两个可用候选 → 抛错（不静默编造）', () => {
    expect(() => parseDirectionCandidates('{"candidates":[{"key":"only","title":"甲","oneLiner":"一"}]}')).toThrow(
      '方向候选少于两个可用项',
    )
  })

  it('空标题/空描述的条目被丢弃，剩不足两个 → 抛错', () => {
    expect(() =>
      parseDirectionCandidates(
        '{"candidates":[{"key":"a","title":"","oneLiner":"一"},{"key":"b","title":"乙","oneLiner":""}]}',
      ),
    ).toThrow('方向候选')
  })

  it('非 JSON 输出 → 抛错', () => {
    expect(() => parseDirectionCandidates('抱歉我无法完成')).toThrow('非法 JSON')
  })
})

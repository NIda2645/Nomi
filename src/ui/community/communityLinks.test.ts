import { describe, expect, it } from 'vitest'
import { buildGitHubIssueUrl, buildShareMessage, NOMI_COMMUNITY_LINKS } from './communityLinks'
import { enCommunity, zhCommunity } from '../../i18n/locales/community'

describe('community links', () => {
  it('keeps public destinations on the real Nomi properties', () => {
    expect(NOMI_COMMUNITY_LINKS.website).toBe('https://nomiaqm.com/')
    expect(NOMI_COMMUNITY_LINKS.github).toBe('https://github.com/aqm857886159/Nomi')
    expect(NOMI_COMMUNITY_LINKS.issues).toContain('github.com/aqm857886159/Nomi/issues')
  })

  it('prefills only a safe template and short title', () => {
    const url = new URL(buildGitHubIssueUrl({ intent: 'problem', stage: 'model', errorKind: 'model-config' }))
    expect(url.origin).toBe('https://github.com')
    expect(url.searchParams.get('template')).toBe('bug_report.yml')
    expect(url.searchParams.get('title')).toBe('[Bug] model · model-config')
    expect(url.search).not.toContain('prompt')
    expect(url.search).not.toContain('details')
  })

  // ComfyUI「未知 combo 外壳」诊断复用这同一处 issue 深链拼装（P1：不为它另起一份），
  // `fields` 把 issue form 的字段 id（bug_report.yml 的 what_happened/extra）当查询参数预填。
  it('prefills issue-form fields by their form id when given', () => {
    const url = new URL(buildGitHubIssueUrl({
      intent: 'problem',
      stage: 'model',
      errorKind: 'comfyui-combo-shape:TripleCLIPLoader.clip_name1',
      fields: { what_happened: 'unknown combo shape', extra: '```json\n["WEIRD"]\n```' },
    }))
    expect(url.searchParams.get('what_happened')).toBe('unknown combo shape')
    expect(url.searchParams.get('extra')).toBe('```json\n["WEIRD"]\n```')
  })

  // 问题 #2：分享给朋友要的是「一段可直接转发的话」，不是裸 URL。这段话由 i18n 模板 + 真实链接拼出，
  // 链接只有一份真相源（NOMI_COMMUNITY_LINKS），拼出来的文本永远和它一致。
  it('builds a forwardable share message with a human line and both real links', () => {
    for (const [label, template] of [['zh', zhCommunity.shareMessage], ['en', enCommunity.shareMessage]] as const) {
      const message = buildShareMessage(template)
      // 真实链接被填进去了，占位符没有残留。
      expect(message, label).toContain(NOMI_COMMUNITY_LINKS.website)
      expect(message, label).toContain(NOMI_COMMUNITY_LINKS.github)
      expect(message, label).not.toContain('{{website}}')
      expect(message, label).not.toContain('{{github}}')
      // 不是一条裸链接：除了 URL，还有一句人话推荐（长度 + 换行足以承载多行推荐语）。
      expect(message.length, label).toBeGreaterThan(NOMI_COMMUNITY_LINKS.website.length + 40)
      expect(message, label).toContain('Nomi')
    }
  })

  // 2026-09-15：「私密表单」那条路整条删了（反馈改发我们自己的接收端）。
  // 这里留一条**反向**断言当守卫：任何第三方表单域名都不该再出现在这个模块里。
  it('no third-party form destination survives in this module', async () => {
    const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('./communityLinks.ts', import.meta.url), 'utf8'))
    expect(source).not.toContain('tally.so')
    expect(source).not.toContain('docs.google.com/forms')
    expect(source).not.toContain('feishu.cn/share')
  })
})

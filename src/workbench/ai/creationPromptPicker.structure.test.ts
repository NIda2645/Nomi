// 结构门岗：**每一个内置提示词都必须能在 UI 上选到**。
//
// 根因（2026-08-18 用户报「找不到调用的地方」）：选择器的前身 ActiveSkillChip 手写列表条目，
// 只列了「自动」和一个硬编码的 `onModeChange('assets')`。于是 CREATION_AI_MODES 的 7 个模式里
// 有 5 个（写故事 / 写剧本 / 写分镜文字稿 / Seedance 提示词 / 审校优化）在界面上**根本不存在**：
// 提示词写好了、设置页能编辑、就是永远调不起来。
//
// 单测和七道门岗都抓不到这种「数据在、入口不在」——它不是类型错、不是断言错，是**没人连线**。
// 所以用源码结构测试钉死：选择器必须从 listCreationAiModes() derive，且不许再出现硬编码模式名。
// 以后新增一个模式，它会自动出现在列表里；谁要是把列表改回手写，这条会当场红。
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { CREATION_AI_MODES, listCreationAiModes } from '../creation/creationAiModes'
import { SYSTEM_PROMPT_MODE_IDS } from '../../../electron/settings/systemPromptsContract'

const PICKER = path.resolve(__dirname, 'CreationPromptPicker.tsx')

/**
 * 扫源码前先剥注释。不剥的话，**记录这个 bug 的注释本身**会把这条门岗打红
 * （首跑就栽了：注释里写「旧代码硬编码 onModeChange('assets')」→ 命中）。
 * 不变量管的是代码行为，不是文字；把讲清根因的注释逼删掉，是让门岗反噬文档。
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('内置提示词不许再搁浅', () => {
  it('listCreationAiModes() 覆盖全部内置模式（选择器的唯一数据源）', () => {
    const listed = listCreationAiModes().map((mode) => mode.id)
    for (const mode of CREATION_AI_MODES) {
      expect(listed, `内置模式 ${mode.id} 没出现在 listCreationAiModes() 里`).toContain(mode.id)
    }
  })

  it('内置模式清单与设置契约的 id 一一对应（任一侧加漏了就红）', () => {
    // 漂移的后果是无声的：契约里少一个 id → 那个模式的用户覆盖被净化器当成未知字段丢掉，
    // 用户改了提示词、保存了、重启后改动消失，且没有任何报错。
    expect([...CREATION_AI_MODES.map((m) => m.id)].sort()).toEqual([...SYSTEM_PROMPT_MODE_IDS].sort())
  })

  it('选择器从 listCreationAiModes() derive，不手写条目', () => {
    const source = fs.readFileSync(PICKER, 'utf8')
    expect(
      source.includes('listCreationAiModes()'),
      'CreationPromptPicker 必须调用 listCreationAiModes() 取列表；手写条目会让新增模式再次搁浅',
    ).toBe(true)
  })

  it('选择器源码里不出现硬编码的内置模式名', () => {
    const source = stripComments(fs.readFileSync(PICKER, 'utf8'))
    // 'general' 是唯一豁免：它是「没特别选」的默认基准（判 chip 要不要高亮 / 删除后回退到哪），
    // 不是「要显示哪些条目」的清单，写死它不会让任何模式消失。
    const forbidden = CREATION_AI_MODES.map((mode) => mode.id).filter((id) => id !== 'general')
    for (const id of forbidden) {
      expect(
        source.includes(`'${id}'`),
        `CreationPromptPicker 里出现了硬编码模式名 '${id}' —— 列表必须全量 derive，`
          + '否则下一个新增的模式又会像 story/script/storyboard/seedance/review 那样调不起来',
      ).toBe(false)
    }
  })
})

// 设置 → AI → 系统提示词（用户 2026-08-17 拍板样张 B）。
// 起因：提示词过去只能在创作面板的技能 popover 里看，那是个 284px 宽 / 64px 高 / 截断 360 字的只读小框
// （ActiveSkillChip 旧实现，已按 P1 删除）。用户原话：「能看到但局限在一个非常小的框里」。
// 这里给它一个真正能读能改的家：模式 chip 选择 + 全文可编辑 textarea + 已自定义徽标 + 恢复默认。
//
// 默认提示词的真相源仍是 creationAiModes.ts；本组件只写「覆盖层」（systemPromptOverrides.ts）。
import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconRotate } from '@tabler/icons-react'

import { cn } from '../../utils/cn'
import { CREATION_AI_MODES, type CreationAiModeId } from '../creation/creationAiModes'
import {
  getSystemPromptOverrides,
  hasPromptOverride,
  pruneRedundantOverrides,
  resolveEffectivePrompt,
  saveSystemPromptOverrides,
  type SystemPromptOverrideMap,
} from '../creation/systemPromptOverrides'
import { useSystemPromptOverrides } from '../creation/useSystemPromptOverrides'

// 打字时不要每敲一个字就打一次 IPC：停顿 400ms 才写盘。
const WRITE_DEBOUNCE_MS = 400

const DEFAULT_PROMPT_BY_MODE = new Map<string, string>(
  CREATION_AI_MODES.map((mode) => [mode.id, mode.prompt]),
)

function defaultPromptOf(modeId: CreationAiModeId): string | undefined {
  return DEFAULT_PROMPT_BY_MODE.get(modeId)
}

export function SystemPromptSection(): JSX.Element {
  const { t } = useTranslation()
  const overrides = useSystemPromptOverrides()
  const [selectedMode, setSelectedMode] = React.useState<CreationAiModeId>(CREATION_AI_MODES[0].id)
  // 正在编辑的那一份草稿：受控 textarea 必须即时回显用户输入，不能等 debounce 写盘回来。
  const [draft, setDraft] = React.useState<string | null>(null)
  const writeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeMode = CREATION_AI_MODES.find((mode) => mode.id === selectedMode) ?? CREATION_AI_MODES[0]
  const defaultPrompt = activeMode.prompt
  const storedPrompt = resolveEffectivePrompt(defaultPrompt, overrides[activeMode.id])
  const value = draft ?? storedPrompt
  const customized = hasPromptOverride(overrides, activeMode.id, defaultPrompt)

  React.useEffect(() => () => {
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current)
  }, [])

  const flushWrite = React.useCallback((next: SystemPromptOverrideMap): void => {
    void saveSystemPromptOverrides(pruneRedundantOverrides(next, defaultPromptOf))
  }, [])

  const onEdit = React.useCallback((nextText: string): void => {
    setDraft(nextText)
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current)
    writeTimerRef.current = setTimeout(() => {
      // 用最新快照做基底，避免 debounce 期间别处的改动被这次写入抹掉。
      flushWrite({ ...getSystemPromptOverrides(), [activeMode.id]: nextText })
      setDraft(null)
    }, WRITE_DEBOUNCE_MS)
  }, [activeMode.id, flushWrite])

  const onReset = React.useCallback((): void => {
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current)
    setDraft(null)
    // 「恢复默认」= 删掉这一条覆盖，而不是把默认文本写回去（写回去会变成第二份副本）。
    const next = { ...getSystemPromptOverrides() }
    delete next[activeMode.id]
    flushWrite(next)
  }, [activeMode.id, flushWrite])

  const selectMode = React.useCallback((modeId: CreationAiModeId): void => {
    // 切模式前先把未落盘的编辑写掉，避免草稿丢失。
    if (writeTimerRef.current) {
      clearTimeout(writeTimerRef.current)
      writeTimerRef.current = null
      if (draft !== null) flushWrite({ ...getSystemPromptOverrides(), [activeMode.id]: draft })
    }
    setDraft(null)
    setSelectedMode(modeId)
  }, [activeMode.id, draft, flushWrite])

  const textareaId = 'settings-system-prompt-editor'

  return (
    <section
      data-settings-section="system-prompts"
      className="mt-6 border-t border-nomi-line pt-4"
      aria-labelledby="settings-system-prompt-title"
    >
      <h3 id="settings-system-prompt-title" className="mb-1 text-caption font-medium text-nomi-ink-60">
        {t('settings.ai.systemPrompt.title')}
      </h3>
      <div className="mb-3 text-caption leading-relaxed text-nomi-ink-40">
        {t('settings.ai.systemPrompt.hint')}
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label={t('settings.ai.systemPrompt.modeGroup')}>
        {CREATION_AI_MODES.map((mode) => {
          const selected = mode.id === activeMode.id
          return (
            <button
              key={mode.id}
              type="button"
              data-settings-prompt-mode={mode.id}
              aria-pressed={selected}
              onClick={() => selectMode(mode.id)}
              className={cn(
                'rounded-full px-2.5 py-1 text-caption font-medium cursor-pointer',
                'transition-colors duration-[var(--nomi-transition-fast)]',
                selected ? 'bg-nomi-accent-soft text-nomi-accent' : 'bg-nomi-ink-05 text-nomi-ink-60 hover:bg-nomi-ink-10',
              )}
            >
              {t(`creationAi.mode.${mode.id}.short` as 'creationAi.mode.general.short')}
            </button>
          )
        })}
      </div>

      <label htmlFor={textareaId} className="sr-only">
        {t('settings.ai.systemPrompt.editorLabel')}
      </label>
      <textarea
        id={textareaId}
        data-settings-field="system-prompt"
        value={value}
        spellCheck={false}
        onChange={(event) => onEdit(event.currentTarget.value)}
        aria-label={t('settings.ai.systemPrompt.editorLabel')}
        className="h-44 w-full resize-y overflow-y-auto rounded-nomi-sm border border-nomi-line bg-nomi-paper p-3 text-caption leading-relaxed text-nomi-ink outline-none focus:border-nomi-accent"
      />

      <div className="mt-2 flex min-h-8 items-center justify-between gap-3">
        <span className="min-w-0 text-micro text-nomi-ink-60">
          {customized ? (
            <span
              data-settings-prompt-customized
              className="inline-flex items-center rounded-full bg-nomi-accent-soft px-2 py-0.5 text-nomi-accent"
            >
              {t('settings.ai.systemPrompt.customized')}
            </span>
          ) : null}
        </span>
        {/* C1（§1.6）：没有覆盖时「恢复默认」无事可做 → 必须 disabled + title 说清为什么。
            禁用的 <button> 自己不触发 title，靠外层 span 兜（既有范式）。 */}
        <span
          title={customized ? undefined : t('settings.ai.systemPrompt.resetDisabledReason')}
          style={{ display: 'contents' }}
        >
          <button
            type="button"
            data-settings-prompt-reset
            disabled={!customized}
            onClick={onReset}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-nomi-sm border border-nomi-line bg-nomi-paper px-2.5 py-1.5 text-caption text-nomi-ink cursor-pointer',
              'transition-colors duration-[var(--nomi-transition-fast)] hover:bg-nomi-ink-05',
              'disabled:cursor-not-allowed disabled:text-nomi-ink-40',
            )}
          >
            <IconRotate size={14} stroke={1.7} aria-hidden="true" />
            {t('settings.ai.systemPrompt.reset')}
          </button>
        </span>
      </div>
    </section>
  )
}

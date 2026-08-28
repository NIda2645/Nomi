import React from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../../utils/cn'
import type { ArchetypeModeChoice } from './archetypeMeta'
import { NomiSegmented } from '../../../../design'

// 「生成方式」分段切换 —— 常驻参考区的头（样张 v3：切它能当场看到下方参考槽变化，不被弹层遮挡）。
// 主标签用**模型自己的真名**（vendor 原词：首帧/首尾帧/全能参考…）——用户已熟悉这些词，改成意图词反而
// 把能力说窄（如「全能参考」是多模态，写成「角色参考」会让人以为只能放角色）。决策 #2 拍板：保留 vendor 原词。
// 视觉对齐样张 .seg；用 Tailwind 写在元素上（规则 10），与本目录既有的手写文本模式切换器一致，不引 Mantine。

type ModeBarProps = {
  choices: ArchetypeModeChoice[]
  activeId: string
  onSelect: (modeId: string) => void
}

export default function ModeBar({ choices, activeId, onSelect }: ModeBarProps): JSX.Element | null {
  const { t } = useTranslation()
  // 只有 >1 模式时才显示分段（单模式无需切换）。
  if (choices.length <= 1) return null
  const active = choices.find((c) => c.id === activeId) ?? choices[0]
  return (
    <div className={cn('flex flex-col gap-1')}>
      <span className={cn('text-nomi-ink-40 text-micro leading-none')}>
        {t('generationCommon.parameters.generationMode')}
      </span>
      <div className="self-start" onPointerDown={(event) => event.stopPropagation()}>
        <NomiSegmented
          value={active.id}
          options={choices.map((choice) => ({ value: choice.id, label: choice.vendorTerm, title: choice.vendorTerm }))}
          onChange={onSelect}
          ariaLabel={t('generationCommon.parameters.generationMode')}
          density="compact"
          className="rounded-nomi-sm p-0.5"
        />
      </div>
      <div className={cn('text-nomi-ink-40 text-micro leading-[1.35]')}>{active.hint}</div>
    </div>
  )
}

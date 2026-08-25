import React from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../utils/cn'
import CreationAiPanel from './CreationAiPanel'
import WorkbenchEditor from './WorkbenchEditor'
import StoryboardPlanEditor from './storyboard/StoryboardPlanEditor'
import { NomiAILabel, WorkbenchButton } from '../../design'
import { useWorkbenchStore } from '../workbenchStore'

export default function CreationWorkspace(): JSX.Element {
  const { t } = useTranslation()
  // 创作助手默认展开成编辑器右侧的 344px 侧栏（用户拍板 2026-07-25：回到 3c2fe821 之前的常驻右栏）。
  // 收起态放 store（非本地 useState）→ 跨页面/跨导航不重置，收起「粘住」（根治 3c2fe821 本地 useState 每次进页重置的问题）。
  const collapsed = useWorkbenchStore((s) => s.creationAiCollapsed)
  const setCollapsed = useWorkbenchStore((s) => s.setCreationAiCollapsed)
  // 一次性信号：打开示例/新项目时自动展开助手，让「拆镜头」CTA 一眼可见，消费后清掉。
  const autoOpen = useWorkbenchStore((s) => s.creationAssistantAutoOpen)
  const setAutoOpen = useWorkbenchStore((s) => s.setCreationAssistantAutoOpen)
  // 原稿与分镜是同一创作阶段的两个工作面；方案存在后始终给出明确入口，避免“内容被替换”的错觉。
  const storyboardPlan = useWorkbenchStore((s) => s.storyboardPlan)
  const storyboardPlanCommitted = useWorkbenchStore((s) => s.storyboardPlanCommitted)
  const storyboardEditorOpen = useWorkbenchStore((s) => s.storyboardEditorOpen)
  const setStoryboardEditorOpen = useWorkbenchStore((s) => s.setStoryboardEditorOpen)
  React.useEffect(() => {
    if (autoOpen) {
      setCollapsed(false)
      setAutoOpen(false)
    }
  }, [autoOpen, setAutoOpen])

  return (
    <section
      className={cn(
        'workbench-creation relative',
        'w-full h-full min-w-0 min-h-0',
        'pt-[22px] px-6 pb-6',
        'bg-workbench-bg',
        collapsed
          ? // 收起态：编辑器 1fr + 右侧「重开」pill 各占一格（in-flow），pill 有自己的列、
            // 结构上不可能再压到编辑器。根治 3c2fe821 起 pill 用 absolute 浮在右上角、
            // bf026cac 把撤销/重做移到右端后 pill 盖住按钮的重叠（editor 恒 1fr，不复发 #45 裁切）。
            'grid grid-cols-[minmax(0,1fr)_auto] max-w-[1024px] mx-auto gap-5'
          : cn(
              'grid grid-cols-[minmax(0,1fr)_344px] max-w-[1264px] mx-auto gap-5',
              // 断点 1120→880（2026-08-07 飞书反馈「为什么变成上下了」）：1120 太宽，
              // 常规窗口就触发上下堆叠，违背「常驻右栏」拍板（2026-07-25）；右栏 344 + 主区
              // 最小可用 ~536 = 880 以下才真正需要堆叠。
              'max-[880px]:grid-cols-[minmax(0,1fr)] max-[880px]:grid-rows-[minmax(420px,1fr)_minmax(320px,42vh)]',
            ),
      )}
      aria-label={t('creationAi.workspace.aria')}
    >
      <div className="min-w-0 min-h-0 flex flex-col gap-2">
        {storyboardPlan ? (
          <div
            className="h-9 shrink-0 flex items-center justify-between gap-3 p-0.5 border border-nomi-line rounded-nomi bg-nomi-paper"
            role="tablist"
            aria-label={t('creationAi.workspace.surfacesAria')}
          >
            <div className="flex items-center gap-0.5">
              {(
                [
                  { label: t('creationAi.workspace.source'), active: !storyboardEditorOpen, open: false },
                  { label: t('creationAi.workspace.storyboard'), active: storyboardEditorOpen, open: true },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.label}
                  type="button"
                  role="tab"
                  aria-selected={tab.active}
                  onClick={() => setStoryboardEditorOpen(tab.open)}
                  className={cn(
                    'h-7 px-3 rounded-nomi-sm text-caption font-semibold cursor-pointer',
                    'transition-[background,color,box-shadow] duration-[var(--nomi-transition-fast)]',
                    tab.active
                      ? 'bg-nomi-ink-10 text-nomi-ink shadow-nomi-sm'
                      : 'bg-transparent text-nomi-ink-40 hover:text-nomi-ink-60',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <span
              className={cn('mr-2 text-micro', storyboardPlanCommitted ? 'text-workbench-success' : 'text-nomi-accent')}
            >
              {storyboardPlanCommitted ? t('creationAi.workspace.committed') : t('creationAi.workspace.draft')}
            </span>
          </div>
        ) : null}
        <div className="min-h-0 flex-1" data-creation-surface={storyboardEditorOpen ? 'storyboard' : 'source'}>
          {storyboardEditorOpen ? <StoryboardPlanEditor /> : <WorkbenchEditor />}
        </div>
      </div>
      {collapsed ? (
        <WorkbenchButton
          className={cn(
            // in-flow 占据右侧列、顶部对齐（mt-1 让 pill 竖直居中于 44px 工具栏带，
            // 落在展开态面板头所在的位置）；不再 absolute，故不压编辑器。
            'self-start mt-1',
            'inline-flex items-center gap-2 h-9 pl-[10px] pr-[14px]',
            'border border-nomi-line rounded-full bg-nomi-paper text-nomi-ink',
            'text-body-sm font-medium shadow-nomi-sm cursor-pointer',
            'hover:shadow-nomi-md hover:-translate-y-px',
          )}
          aria-label={t('creationAi.workspace.expandAssistant')}
          onClick={() => setCollapsed(false)}
        >
          <NomiAILabel markSize={18} wordSize={13} suffix={t('creationAi.workspace.assistantSuffix')} />
        </WorkbenchButton>
      ) : (
        <CreationAiPanel onCollapse={() => setCollapsed(true)} />
      )}
    </section>
  )
}

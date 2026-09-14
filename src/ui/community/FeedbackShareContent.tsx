import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowLeft, IconBrandGithub, IconCheck, IconCopy, IconExternalLink, IconMessage, IconWorld } from '@tabler/icons-react'
import { DesignButton } from '../../design'
import { buildShareMessage, NOMI_COMMUNITY_LINKS } from './communityLinks'
import { FeedbackReportCard } from './FeedbackReportCard'
import { type FeedbackOpenRequest } from './feedbackTypes'

// 反馈与分享的**容器无关**主体（2026-09-01 修：入口在设置内嵌，情境入口仍是浮层）。
// 为什么要拆出这一层：这块内容有两个家——
//   ① 设置 → 关于 → 「反馈与分享」：获批样张（docs/design/mockups/2026-09-01-feedback-share-center*.png）
//      画的是它**长在设置弹窗右栏里**，左侧 tab（文件/通用/关于）始终在，顶部一条「‹ 关于」面包屑；
//   ② 生成失败卡上「反馈此问题」：画布里冒出来的浮层，天然没有设置外壳，仍走 DesignModal。
// 它只有**一个**家：设置 → 关于 → 反馈。四个失败面那条路不经过这里——
// `FeedbackShareHost` 直接呈现 `FeedbackReportCard` 本身（理由写在那份文件里：
// 套上这层分页外壳，用户会以为自己从画布跑进了设置）。
//
// 报告那一页就是 `FeedbackReportCard`，与失败面共用同一份；`share` 页是**分享**不是反馈，
// 两件事本来就不同，所以它留着。

type Page = 'home' | 'feedback' | 'share'

function ActionRow({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-nomi border border-nomi-line bg-nomi-paper p-3.5 text-left transition-colors hover:border-nomi-accent hover:bg-nomi-accent-soft"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-nomi-sm bg-nomi-accent-soft text-nomi-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-body-sm font-medium text-nomi-ink">{title}</span>
        <span className="mt-0.5 block text-caption text-nomi-ink-40">{hint}</span>
      </span>
      <IconExternalLink size={15} stroke={1.7} className="shrink-0 text-nomi-ink-30 transition-colors group-hover:text-nomi-accent" aria-hidden="true" />
    </button>
  )
}

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function FeedbackShareContent({
  request = null,
  onBackToAbout,
}: {
  request?: FeedbackOpenRequest | null
  /** 内嵌态下，从 home 页顶部「‹ 关于」返回设置「关于」区块首页。浮层态传空。 */
  onBackToAbout?: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [page, setPage] = React.useState<Page>('home')
  const [shareCopied, setShareCopied] = React.useState(false)

  // 请求变化时重置到对应起点（失败面带上下文 → 直达反馈卡；否则落 home）。
  React.useEffect(() => {
    setPage(request?.intent || request?.stage || request?.surface ? 'feedback' : 'home')
    setShareCopied(false)
  }, [request])

  // 「一段可直接转发的话」：中文/英文推荐语 + 链接，一键复制（问题 #2 的正解）。
  // 用户原诉求是「发给朋友给的是网站链接」——分享给朋友要的是能直接粘进聊天框的一段话，
  // 不是让他自己去凑一句推荐词。文案在 communityLinks.buildShareMessage 里，随界面语言走。
  const shareMessage = React.useMemo(() => buildShareMessage(t('community.shareMessage')), [t])
  const handleShareCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareMessage)
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 1600)
    } catch {
      // Clipboard permissions are optional; the message stays visible for manual copy.
    }
  }, [shareMessage])

  return (
    <div data-feedback-share-content data-feedback-page={page}>
      {/* 首页自带标题 + 「‹ 关于」面包屑（2026-09-01 获批样张）。 */}
      {page === 'home' ? (
        <div className="mb-3">
          {onBackToAbout ? (
            <button
              type="button"
              onClick={onBackToAbout}
              data-feedback-back="about"
              className="mb-2 inline-flex items-center gap-1 text-caption text-nomi-ink-40 hover:text-nomi-ink"
            >
              <IconArrowLeft size={14} stroke={1.7} aria-hidden="true" /> {t('about.feedbackShare')}
            </button>
          ) : null}
          <h2 className="text-body font-medium text-nomi-ink">{t('community.title')}</h2>
        </div>
      ) : null}

      {page === 'home' ? (
        <div className="space-y-3">
          <p className="text-body-sm leading-relaxed text-nomi-ink-60">{t('community.homeHint')}</p>
          <div className="space-y-2.5">
            <ActionRow
              icon={<IconMessage size={19} stroke={1.7} aria-hidden="true" />}
              title={t('community.reportProblem')}
              hint={t('community.reportProblemHint')}
              onClick={() => setPage('feedback')}
            />
            <ActionRow
              icon={<IconExternalLink size={19} stroke={1.7} aria-hidden="true" />}
              title={t('community.shareNomi')}
              hint={t('community.shareNomiHint')}
              onClick={() => setPage('share')}
            />
          </div>
          <p className="pt-1 text-micro leading-relaxed text-nomi-ink-40">{t('community.trustLine')}</p>
        </div>
      ) : null}

      {page === 'share' ? (
        <div className="space-y-3">
          <button type="button" onClick={() => setPage('home')} className="inline-flex items-center gap-1 text-caption text-nomi-ink-40 hover:text-nomi-ink">
            <IconArrowLeft size={14} stroke={1.7} aria-hidden="true" /> {t('community.back')}
          </button>
          <h2 className="text-body font-medium text-nomi-ink">{t('community.shareTitle')}</h2>
          <p className="text-body-sm leading-relaxed text-nomi-ink-60">{t('community.shareHint')}</p>

          {/* 可直接转发的一段话：推荐语 + 链接，一键复制。这是问题 #2 的核心——
              分享给朋友拿到的是能直接粘进聊天框的话，不再是一条裸 URL。 */}
          <div data-share-message className="rounded-nomi border border-nomi-line bg-nomi-ink-05 p-3">
            <p className="whitespace-pre-wrap break-words text-body-sm leading-relaxed text-nomi-ink-80">{shareMessage}</p>
            <div className="mt-2.5 flex justify-end">
              <DesignButton
                variant={shareCopied ? 'light' : 'filled'}
                leftSection={shareCopied ? <IconCheck size={15} stroke={1.8} aria-hidden="true" /> : <IconCopy size={15} stroke={1.8} aria-hidden="true" />}
                onClick={() => void handleShareCopy()}
                data-share-copy
              >
                {shareCopied ? t('community.shareMessageCopied') : t('community.shareMessageCopy')}
              </DesignButton>
            </div>
          </div>

          {/* 两个入口保留：想自己看/发链接的人仍可直达官网与 GitHub。 */}
          <div className="space-y-2.5">
            <ActionRow icon={<IconWorld size={18} stroke={1.7} aria-hidden="true" />} title={t('community.website')} hint={NOMI_COMMUNITY_LINKS.website} onClick={() => openExternal(NOMI_COMMUNITY_LINKS.website)} />
            <ActionRow icon={<IconBrandGithub size={18} stroke={1.7} aria-hidden="true" />} title={t('community.github')} hint={NOMI_COMMUNITY_LINKS.github} onClick={() => openExternal(NOMI_COMMUNITY_LINKS.github)} />
          </div>
        </div>
      ) : null}

      {page === 'feedback' ? (
        <div className="space-y-3">
          <button type="button" onClick={() => setPage('home')} className="inline-flex items-center gap-1 text-caption text-nomi-ink-40 hover:text-nomi-ink">
            <IconArrowLeft size={14} stroke={1.7} aria-hidden="true" /> {t('community.back')}
          </button>
          {/* 四个失败面共用的那张卡，设置里的规范入口用的是同一份。 */}
          <FeedbackReportCard request={request} />
        </div>
      ) : null}
    </div>
  )
}

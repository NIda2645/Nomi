export const zhCommunity = {
  title: '反馈与分享',
  homeHint: '告诉我们哪里卡住了，或把 Nomi 分享给正在做影像的人。',
  reportProblem: '告诉我们一件事',
  reportProblemHint: '遇到问题，或有一个具体建议',
  shareNomi: '分享 Nomi',
  shareNomiHint: '一段可直接转发的话，一键复制发给朋友',
  trustLine: '默认只保存在本机；不会后台上传对话、素材或密钥。',
  back: '返回',
  // 2026-09-15 删掉的一批（手填表整块换成 FeedbackReportCard）：problem/suggestion（意图二选一）·
  // stageLabel/stages（手选功能阶段）· summaryLabel/Placeholder + detailsLabel/Placeholder（手写摘要与详情）·
  // screenshotLabel/Hint · diagnostics/diagnosticsHint（旧的字段清单折叠）· destinationHint +
  // submitPrivate/submitPublic + saved + privateOpened/publicOpened + openPrivate/openGitHub（目的地二选一）·
  // copied/copySummary/required。新文案在 feedbackReport 命名空间。
  shareTitle: '把 Nomi 发给朋友',
  shareHint: '复制下面这段话，直接发给朋友或团队——不需要注册 Nomi 账号。',
  // 一段可直接转发的话（问题 #2）：像人话，不是裸链接。{{website}}/{{github}} 由 buildShareMessage 填真实链接。
  shareMessage: '发你个好东西——Nomi，本地优先的 AI 视频创作工具。一句话就能生成分镜、出片，素材都在自己电脑上，不用等云端排队。\n官网：{{website}}\nGitHub：{{github}}',
  shareMessageCopy: '复制话术',
  shareMessageCopied: '已复制，去粘给朋友吧',
  website: '打开官网',
  github: '查看 GitHub',
}

export const enCommunity = {
  title: 'Feedback & share',
  homeHint: 'Tell us where you got stuck, or share Nomi with someone making images.',
  reportProblem: 'Tell us one thing',
  reportProblemHint: 'Report a problem or make a concrete suggestion',
  shareNomi: 'Share Nomi',
  shareNomiHint: 'A ready-to-send message you can copy in one tap',
  trustLine: 'Saved locally by default; conversations, assets, and keys are never uploaded in the background.',
  back: 'Back',
  shareTitle: 'Share Nomi with a friend',
  shareHint: 'Copy the message below and send it straight to a friend or teammate — no Nomi account required.',
  // A paste-ready message (issue #2): reads like a person, not a bare link. buildShareMessage fills the real URLs.
  shareMessage: 'Found something you should try — Nomi, a local-first AI video studio. Describe a shot in a sentence and it storyboards and renders it, with your footage staying on your own machine, no cloud queue.\nSite: {{website}}\nGitHub: {{github}}',
  shareMessageCopy: 'Copy Message',
  shareMessageCopied: 'Copied — go paste it to a friend',
  website: 'Open website',
  github: 'View GitHub',
}

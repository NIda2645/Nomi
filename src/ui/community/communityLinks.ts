export const NOMI_COMMUNITY_LINKS = {
  website: 'https://nomiaqm.com/',
  github: 'https://github.com/aqm857886159/Nomi',
  issues: 'https://github.com/aqm857886159/Nomi/issues/new/choose',
} as const

// 2026-09-15 删掉的：`PRIVATE_FEEDBACK_URL`（Tally 私密表单）与 `buildPrivateFeedbackUrl()`。
// 反馈的去向改成我们自己的接收端（`infra/feedback-worker/`，用户 09-15 拍板①），
// 所以「把版本/平台塞进 Tally hidden fields，再让用户在浏览器里自己提交」这条路整条不存在了。
// 连带删掉的 `platformLabel()` 只服务过那条 URL。
//
// `buildGitHubIssueUrl` **留着**：它不是第二个反馈表单，是「把一个不支持的 ComfyUI 节点
// 报到公开 issue 区」那件事的深链（`src/ui/onboarding/ComfyuiWorkflowImportPanel.tsx:71`）。
// 公开 issue 与一键反馈是两件事：一件要公开讨论，一件只要我们收到。

/**
 * The forwardable share message = a human recommendation line + the two canonical links.
 * The i18n template ({{website}}/{{github}} placeholders) is filled here so the exact URLs
 * live in one place (NOMI_COMMUNITY_LINKS) and can never drift from the copied text.
 * This is the fix for "sharing gave a bare URL": friends get a paste-ready sentence, not a link.
 */
export function buildShareMessage(template: string): string {
  return template
    .replace(/\{\{website\}\}/g, NOMI_COMMUNITY_LINKS.website)
    .replace(/\{\{github\}\}/g, NOMI_COMMUNITY_LINKS.github)
}

/**
 * `fields`：GitHub issue form 用字段 id 当查询参数名预填正文（如 bug_report.yml 的
 * `what_happened`/`extra`，见 .github/ISSUE_TEMPLATE/bug_report.yml）。P1：这是本仓库唯一一处
 * 拼 GitHub issue 深链的地方——诊断类调用方（如 ComfyUI 未知 combo 外壳反馈）复用它，不另起一份。
 */
export function buildGitHubIssueUrl(input: { intent: 'problem' | 'suggestion'; stage: string; errorKind?: string; fields?: Record<string, string> }): string {
  const kind = input.errorKind ? ` · ${input.errorKind.slice(0, 40)}` : ''
  const title = `${input.intent === 'problem' ? '[Bug]' : '[Idea]'} ${input.stage}${kind}`
  const params = new URLSearchParams({
    template: input.intent === 'problem' ? 'bug_report.yml' : 'feature_request.yml',
    title: title.slice(0, 80),
  })
  for (const [key, value] of Object.entries(input.fields ?? {})) params.set(key, value)
  return `${NOMI_COMMUNITY_LINKS.issues}?${params.toString()}`
}

// 三个库页面的样式：只用官网已有的 token（纸色底、墨色、Nomi 蓝），卡片画成 Nomi 画布上的节点。
import { baseCss } from '../styles.mjs'

const libraryOnlyCss = `
.lib-hero { padding-block: 40px 8px; }
.crumbs ol { list-style: none; margin: 0 0 18px; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; font-family: var(--font-ui); font-size: 13px; color: var(--ink-4); }
.crumbs li + li::before { content: "/"; margin-right: 6px; color: var(--ink-4); }
.crumbs a { text-decoration: none; color: var(--ink-3); }
.crumbs a:hover { color: var(--ink); }
.lib-title { font-size: clamp(34px, 4.4vw, 56px); }
.group-anchors { margin-top: 28px; display: flex; flex-wrap: wrap; gap: 8px; }
.group-anchors a { display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper); font-family: var(--font-ui); font-size: 14px; text-decoration: none; color: var(--ink-2); }
.group-anchors a span { font-size: 12px; color: var(--ink-4); font-variant-numeric: tabular-nums; }
.group-anchors a:hover { border-color: var(--ink-4); color: var(--ink); }

.lib-section { padding-block: 36px; scroll-margin-top: 64px; }
.section-head { display: flex; align-items: baseline; gap: 12px; }
.section-head h2 { margin: 0; font-size: clamp(24px, 2.6vw, 32px); }
.section-head .count { font-family: var(--font-ui); font-size: 14px; color: var(--ink-4); font-variant-numeric: tabular-nums; }
.section-note { margin: 10px 0 0; color: var(--ink-3); max-width: 44em; font-size: 15px; }
.card-grid { margin-top: 26px; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 28px 22px; }
.card-grid.compact { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 22px 16px; }
.measure { max-width: 760px; }

/* 节点卡：标题在框外左上，框左右各一个连接点（和首页功能段、App 画布上的节点同一个样子）。 */
.lib-card { display: flex; flex-direction: column; min-width: 0; }
.lib-card .node-title { margin: 0 0 6px 2px; min-height: 18px; font-family: var(--font-ui); font-size: 12px; color: var(--ink-4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-frame { position: relative; flex: 1; display: flex; flex-direction: column; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow-node); text-decoration: none; color: inherit; }
.card-frame::before, .card-frame::after { content: ""; position: absolute; top: 50%; width: 9px; height: 9px; margin-top: -4.5px; border-radius: 50%; background: var(--paper); border: 1px solid var(--ink-4); }
.card-frame::before { left: -5px; }
.card-frame::after { right: -5px; }
a.card-frame:hover { border-color: var(--ink-4); }
a.card-frame:hover h3 { color: var(--accent); }
.card-media { aspect-ratio: 16 / 9; max-width: 100%; overflow: hidden; border-radius: calc(var(--radius) - 1px) calc(var(--radius) - 1px) 0 0; background: var(--line-soft); }
.card-media img { width: 100%; height: 100%; object-fit: cover; }
.card-body { flex: 1; padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 6px; }
.card-body h3 { margin: 0; font-size: 18px; font-weight: 700; line-height: 1.35; }
html[lang="en"] .card-body h3 { font-family: var(--font-ui); font-weight: 600; }
.card-subtitle { margin: 0; font-size: 13px; color: var(--ink-4); }
.card-text { margin: 0; font-size: 14px; color: var(--ink-3); line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.chips { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.chips li { font-family: var(--font-ui); font-size: 12px; line-height: 1.5; padding: 2px 9px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); }
.card-meta { margin: auto 0 0; padding-top: 8px; font-family: var(--font-ui); font-size: 12px; color: var(--ink-4); }

/* 模型页：左边讲，右边一张档案卡（像 App 里的模型档案）。 */
.model-hero { padding-block: 40px 24px; }
.model-hero-grid { display: grid; grid-template-columns: minmax(0, 6fr) minmax(0, 5fr); gap: 48px; align-items: start; }
@media (max-width: 900px) { .model-hero-grid { grid-template-columns: 1fr; gap: 28px; } }
.model-title { font-size: clamp(40px, 5vw, 64px); }
.model-dates { margin: 14px 0 0; font-family: var(--font-ui); font-size: 13px; color: var(--ink-4); }
.hero-actions { margin-top: 26px; display: flex; flex-wrap: wrap; gap: 12px; }
.spec-card { background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: var(--shadow-node); padding: 18px 20px 16px; }
.spec-head { margin: 0 0 6px; font-family: var(--font-ui); font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3); }
.spec-rows { margin: 0; }
.spec-rows div { display: grid; grid-template-columns: 7.5em minmax(0, 1fr); gap: 12px; padding: 10px 0; border-top: 1px solid var(--line-soft); }
.spec-rows div:first-child { border-top: 0; }
.spec-rows dt { font-size: 14px; color: var(--ink-3); }
.spec-rows dd { margin: 0; display: flex; flex-wrap: wrap; row-gap: 2px; font-size: 14px; color: var(--ink); font-variant-numeric: tabular-nums; }
.spec-rows dd span { white-space: nowrap; }
.spec-rows dd span:not(:last-child)::after { content: "·"; margin: 0 7px; color: var(--ink-4); }
.spec-note { margin: 10px 0 0; font-size: 12px; color: var(--ink-4); line-height: 1.6; }

/* 正文排版：模型介绍与技能正文共用。 */
.prose-wrap { max-width: 760px; }
.prose { font-size: 17px; line-height: 1.8; color: var(--ink-2); min-width: 0; }
.prose h2 { margin: 40px 0 12px; font-size: 26px; line-height: 1.3; color: var(--ink); scroll-margin-top: 80px; }
.prose h2:first-child { margin-top: 0; }
.prose h3 { margin: 28px 0 8px; font-size: 19px; color: var(--ink); scroll-margin-top: 80px; }
.prose h4 { margin: 20px 0 6px; font-size: 17px; color: var(--ink); }
.prose p, .prose ul, .prose ol { margin: 12px 0 0; }
.prose ul, .prose ol { padding-left: 1.3em; }
.prose li + li { margin-top: 6px; }
.prose strong { color: var(--ink); }
.prose a { color: var(--accent); }
.prose code { font-family: var(--font-mono); font-size: 0.88em; background: var(--line-soft); padding: 1px 5px; border-radius: 5px; }
.prose pre { margin: 16px 0 0; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; overflow-x: auto; font-size: 14px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.prose pre code { background: none; padding: 0; font-size: inherit; }
.prose table { display: block; width: 100%; overflow-x: auto; border-collapse: collapse; margin-top: 16px; font-size: 15px; }
.prose th, .prose td { border-bottom: 1px solid var(--line); padding: 8px 10px; text-align: left; vertical-align: top; }
.prose th { color: var(--ink); font-weight: 700; }
.prose blockquote { margin: 16px 0 0; padding: 2px 0 2px 16px; border-left: 3px solid var(--accent); color: var(--ink-3); }
.prose hr { border: 0; border-top: 1px solid var(--line); margin: 28px 0; }
.source-list { font-size: 15px; }
.prose .prompt-block { margin-top: 12px; }
.prose pre.prompt-text { margin: 0; padding: 14px 16px 44px; background: var(--ground); border-color: var(--line); max-height: none; font-size: 14px; }

/* 技能页：左侧目录吸顶，右侧正文。 */
.skill-hero { padding-bottom: 0; }
.hero-chips { margin-top: 18px; }
.skill-use { padding-block: 28px 8px; }
.use-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 760px) { .use-grid { grid-template-columns: 1fr; } }
.use-box { background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; }
.use-box h2 { margin: 0; font-family: var(--font-ui); font-size: 15px; font-weight: 600; letter-spacing: 0; }
.use-box p { margin: 6px 0 0; font-size: 15px; color: var(--ink-2); }
.skill-preview { margin: 24px 0 0; }
.skill-preview img { width: 100%; height: auto; border-radius: var(--radius); border: 1px solid var(--line); }
.skill-preview figcaption { margin-top: 8px; font-size: 13px; color: var(--ink-4); }
.skill-body { padding-block: 32px; }
.skill-layout { display: grid; grid-template-columns: 220px minmax(0, 760px); gap: 48px; justify-content: start; }
.skill-layout.no-toc { grid-template-columns: minmax(0, 760px); }
@media (max-width: 960px) { .skill-layout { grid-template-columns: minmax(0, 1fr); gap: 20px; } .toc { position: static; } }
.skill-main { min-width: 0; }
.skill-main .attribution { margin-top: 36px; }
.toc { position: sticky; top: 84px; align-self: start; font-family: var(--font-ui); font-size: 13px; }
.toc p { margin: 0 0 8px; font-weight: 600; color: var(--ink-3); }
.toc ol { list-style: none; margin: 0; padding: 0; border-left: 1px solid var(--line); }
.toc li a { display: block; padding: 4px 0 4px 12px; color: var(--ink-3); text-decoration: none; line-height: 1.5; }
.toc li a:hover { color: var(--ink); }

/* 效果、表情预设、合集：一条一块，可复制。 */
.effect-list { padding-block: 28px; }
.effect-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; margin-top: 18px; }
.effect-entry { display: flex; flex-direction: column; min-width: 0; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; scroll-margin-top: 80px; }
.effect-entry:target { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.effect-media { aspect-ratio: 16 / 9; max-width: 100%; background: var(--line-soft); }
.effect-media.square { aspect-ratio: 1 / 1; }
.effect-media img { width: 100%; height: 100%; object-fit: cover; }
.effect-body { flex: 1; padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 8px; }
.effect-body h3 { margin: 0; font-size: 17px; font-weight: 700; line-height: 1.4; }
.alt-name { margin-left: 6px; font-family: var(--font-ui); font-size: 13px; font-weight: 400; color: var(--ink-4); }
.effect-summary { margin: 0; font-size: 14px; color: var(--ink-3); }
.prompt-block { position: relative; margin-top: auto; }
.prompt-text { margin: 0; padding: 12px 14px 40px; background: var(--ground); border: 1px solid var(--line-soft); border-radius: 8px; font-family: var(--font-mono); font-size: 13px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--ink-2); max-height: 280px; overflow: auto; }
.slot { background: var(--accent-soft); color: var(--accent); border-radius: 4px; padding: 0 3px; }
.copy-button { position: absolute; right: 8px; bottom: 8px; font-family: var(--font-ui); font-size: 12px; font-weight: 600; padding: 5px 11px; border-radius: 999px; border: 1px solid var(--line); background: var(--paper); color: var(--ink-2); cursor: pointer; }
.copy-button:hover { border-color: var(--ink-4); color: var(--ink); }
.copy-done { display: none; }
.copy-button[data-copied] .copy-idle { display: none; }
.copy-button[data-copied] .copy-done { display: inline; color: var(--accent); }
.collection-list { display: grid; gap: 18px; margin-top: 24px; }
.collection-entry { scroll-margin-top: 80px; }
.collection-entry h3 { margin: 0 0 8px; font-size: 16px; line-height: 1.4; }

/* 出处与许可证。 */
.attribution { margin-top: 20px; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 18px; font-size: 14px; }
.attribution dl { margin: 0; display: grid; gap: 6px; }
.attribution dl div { display: grid; grid-template-columns: 8em minmax(0, 1fr); gap: 12px; }
@media (max-width: 560px) { .attribution dl div { grid-template-columns: 1fr; gap: 0; } }
.attribution dt { color: var(--ink-4); }
.attribution dd { margin: 0; color: var(--ink-2); overflow-wrap: anywhere; }
.attribution a { color: var(--accent); }
.attribution > a { display: inline-block; margin-top: 10px; font-family: var(--font-ui); font-size: 13px; }
.license-text { margin-top: 10px; }
.license-text summary { cursor: pointer; font-family: var(--font-ui); font-size: 13px; color: var(--ink-3); }
.license-text pre { margin: 8px 0 0; max-height: 240px; overflow: auto; font-size: 12px; white-space: pre-wrap; background: var(--ground); padding: 10px 12px; border-radius: 8px; }

/* 页底下载条。 */
.download-band { padding-block: 48px 24px; }
.download-band-inner { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px 40px; padding: 28px clamp(20px, 4vw, 40px); background: var(--ink); color: var(--ground); border-radius: var(--radius-lg); }
.download-band h2 { margin: 0; font-size: clamp(22px, 2.4vw, 30px); color: var(--ground); }
.download-band p { margin: 6px 0 0; font-size: 14px; color: color-mix(in srgb, var(--ground) 70%, transparent); }
.download-band .button.primary { background: var(--ground); color: var(--ink); }
.download-band .button.primary:hover { background: color-mix(in srgb, var(--ground) 86%, transparent); }
`

export function libraryCss() {
  return baseCss + libraryOnlyCss
}

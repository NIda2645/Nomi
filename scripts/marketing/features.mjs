// 功能介绍页（/features）：按创作顺序讲 Nomi 能干完哪些活。每块一张真实界面图、三件具体能做的事、一个去深处的链接。
// 只写已经能用的能力；做不到的照实写（对口型）。截图集中在 FEATURE_SHOTS，界面大改后在这一处换。
import { contentByLocale } from './content.mjs'
import { libraryPaths } from './library/data.mjs'
import { renderDownloadBand, renderLibraryHero } from './library/common.mjs'
import { libraryCss } from './library/styles.mjs'
import { buildMetadata } from './metadata.mjs'
import { escapeAttr, escapeText, localizedPath, otherLocale, renderDocument } from './shell.mjs'

/** 每块能力用哪张真实界面图（0.22 宣传片静帧与 2026-08-17 的界面截图）。 */
const FEATURE_SHOTS = {
  agent: { src: '/assets/promo-0.22/still-agent.jpg', width: 1920, height: 1080 },
  autonomy: { src: '/assets/promo-0.22/still-charge.jpg', width: 1920, height: 1080 },
  storyboard: { src: '/assets/promo-0.22/still-storyboard.jpg', width: 1920, height: 1080 },
  canvas: { src: '/assets/screen-canvas-2026-08-17.png', width: 3200, height: 1722 },
  director: { src: '/assets/promo-0.22/still-director.jpg', width: 1920, height: 1080 },
  models: { src: '/assets/promo-0.22/still-model.jpg', width: 1920, height: 1080 },
  timeline: { src: '/assets/screen-timeline-2026-08-17.png', width: 3200, height: 1722 },
}

const zhCN = {
  path: '/features',
  meta: {
    title: 'Nomi 功能：从一句话到导出成片的 AI 视频工作台',
    description: 'Nomi 能做什么：Agent 对话出片、分镜表、生成画布与多版本、3D 导演台、接任何模型、时间轴剪辑与导出 MP4。开源、本地优先，模型按供应商原价付。',
    imageAlt: 'Nomi 功能介绍',
  },
  eyebrow: '功能',
  titleLead: '一个工作台，',
  titleEmphasis: '把一条片子做完。',
  lede: '写文稿、拆分镜、出关键帧、做视频、排时间轴、导出 MP4，都在 Nomi 里。模型用你自己接的，按供应商原价付；项目就是你电脑上的一个文件夹。',
  flowLabel: '一条片子在 Nomi 里怎么走',
  more: '详细了解',
  items: [
    { id: 'agent', kicker: 'Agent', title: '说一句，它就开始干活', body: '用大白话说你想拍什么。Agent 会读你的画布，把故事拆成镜头、出关键帧、做成视频、排进时间轴。它做的每一样东西都落在画布上，看得见，也随时能改。', points: ['读得懂画布上已经有什么，接着往下做', '拆镜头、写提示词、出图出视频、排时间轴一条龙', '背后有一套导演和编剧技能，拆镜头有章法'], link: { label: '看 Agent 用的技能', path: libraryPaths.skills } },
    { id: 'autonomy', kicker: '你说了算', title: '每一步问不问你，你来定', body: '三档自主程度：每步都问、自动改、全自动。自动改这一档，它改文稿和时间轴不打扰你，但要花钱的生成仍然先问。切到全自动要你亲手确认一次，不可逆的操作永远先问。', points: ['默认「自动改」：花钱的事先问', '全自动要手动确认才能打开', '删除这类不可逆操作永远先问'], link: null },
    { id: 'storyboard', kicker: '分镜表', title: '一镜一行，由你导演', body: '每个镜头一行：提示词、首帧、模型、时长，一眼看全。给角色或场景锁一张参考卡，用到它的镜头都是同一张脸、同一个地方。', points: ['一镜一行，批量改提示词、换模型', '参考卡锁住角色和场景', '每个镜头单独选模型'], link: { label: '看角色与场景配方', path: `${libraryPaths.skills}#character-and-scene` } },
    { id: 'canvas', kicker: '生成画布', title: '每次生成都留着，挑最好的那版', body: '镜头落在画布上变成节点：文生视频、首帧、首尾帧、多参考四种方式随手切。每次生成都留一个版本，不满意就再来一版，最后挑最好的那张放进时间轴。', points: ['四种生成方式：文生、首帧、首尾帧、多参考', '同一个镜头的多个版本并排比较', '效果提示词一键套到卡片上'], link: { label: '看提示词库', path: libraryPaths.prompts } },
    { id: 'director', kicker: '3D 导演台', title: '拿起手机，就是取景器', body: '在 3D 场景里摆好人物姿势、定好机位，用手机当取景器拍。拍到的画面直接回到画布上，接着拿去做视频。', points: ['摆人物、摆机位', '手机扫码当取景器', '拍到的画面直接当首帧'], link: null },
    { id: 'models', kicker: '接任何模型', title: '哪家模型都能用，一镜一换', body: '同一个镜头，Seedance、可灵、Wan、海螺随手换一版。接 APIMart、Kie.ai、火山方舟、魔搭社区、即梦会员、任意 OpenAI 兼容的中转站或本地 ComfyUI；新模型可以让 Claude Code 或 Codex 帮你接进来。', points: ['用你自己的 Key，按供应商原价付', '模型框里直接看到每个模型在哪几家能用', '新模型当天就能接'], link: { label: '看模型库', path: libraryPaths.models } },
    { id: 'timeline', kicker: '时间轴与导出', title: '排好，配上声音，导出 MP4', body: '挑好的镜头按顺序排进时间轴，加字幕、配乐，预览没问题就导出 MP4。整段片子在「预览」里从头看到尾。', points: ['图片轨、视频轨、配乐和字幕', '边排边预览', '一键导出 MP4'], link: { label: '看新手教程', path: '/quickstart' } },
  ],
  limitsTitle: '现在还做不到的',
  limits: ['精确对口型、唇形同步：暂时不支持。', 'Mac 安装包还没有苹果签名：第一次打开要右键「打开」，更新要重新下载安装包。'],
  localTitle: '东西都是你的',
  localBody: '不用注册账号，不上报数据。项目就是你硬盘上的一个文件夹，画布、分镜、时间轴和每一张图、每一段视频都在里面。代码全部开源（AGPL-3.0）。',
}

const english = {
  path: '/en/features',
  meta: {
    title: 'Nomi features: an AI video studio from one sentence to a finished film',
    description: 'What Nomi does: agent-driven film making, a storyboard, a generation canvas with versions, a 3D director’s stage, any model, and a timeline that exports MP4. Open source, local-first, models at provider prices.',
    imageAlt: 'Nomi features',
  },
  eyebrow: 'Features',
  titleLead: 'One studio',
  titleEmphasis: 'to finish a whole film.',
  lede: 'Write the script, split it into shots, generate keyframes and video, arrange the timeline and export MP4 — all in Nomi. You bring the models and pay the provider’s price; each project is a folder on your own disk.',
  flowLabel: 'How a film moves through Nomi',
  more: 'Learn more',
  items: [
    { id: 'agent', kicker: 'Agent', title: 'Say what you want, and it gets to work', body: 'Describe the film in plain words. The agent reads your canvas, splits the story into shots, generates keyframes and video and lays them on the timeline. Everything it makes lands on the canvas, where you can see it and change it.', points: ['Understands what is already on the canvas', 'Shots, prompts, images, video and timeline in one pass', 'Backed by directing and writing skills, so shots are planned'], link: { label: 'See the skills it uses', path: libraryPaths.skills } },
    { id: 'autonomy', kicker: 'You decide', title: 'You choose when it asks', body: 'Three levels: ask at every step, edit automatically, or fully automatic. On the default level it edits the script and timeline without interrupting you, but still asks before any paid generation. Full autonomy needs your explicit confirmation, and irreversible actions always ask first.', points: ['Default level asks before spending money', 'Full autonomy has to be switched on by hand', 'Irreversible actions such as deleting always ask'], link: null },
    { id: 'storyboard', kicker: 'Storyboard', title: 'One row per shot, and you direct', body: 'Each shot is one row: prompt, first frame, model and duration at a glance. Lock a reference card for a character or location and every shot that uses it keeps the same face and the same place.', points: ['Edit prompts and switch models row by row', 'Reference cards keep characters and places consistent', 'Pick a model per shot'], link: { label: 'Character and scene recipes', path: `${libraryPaths.skills}#character-and-scene` } },
    { id: 'canvas', kicker: 'Generation canvas', title: 'Every take is kept, so you pick the best', body: 'Shots become nodes on the canvas. Switch between text to video, first frame, first and last frame, and multi-reference. Every generation stays as a version; if it is not right, make another and put the best one on the timeline.', points: ['Four modes: text, first frame, first and last frame, multi-reference', 'Compare versions of the same shot side by side', 'Apply effect prompts to a card with one click'], link: { label: 'Browse the prompts', path: libraryPaths.prompts } },
    { id: 'director', kicker: '3D director’s stage', title: 'Your phone is the viewfinder', body: 'Pose the characters and place the camera in a 3D scene, then frame the shot with your phone. The frame goes straight back to the canvas and on into video.', points: ['Pose characters and place cameras', 'Scan a code and use your phone as the viewfinder', 'Use the captured frame as the first frame'], link: null },
    { id: 'models', kicker: 'Any model', title: 'Use any provider, switch per shot', body: 'Try the same shot on Seedance, Kling, Wan or Hailuo. Connect APIMart, Kie.ai, Volcano Engine Ark, ModelScope, a Jimeng membership, any OpenAI-compatible relay or a local ComfyUI; ask Claude Code or Codex to connect a new model for you.', points: ['Your own keys, at the provider’s price', 'The model picker shows where each model is available', 'New models can be connected the day they launch'], link: { label: 'Browse the models', path: libraryPaths.models } },
    { id: 'timeline', kicker: 'Timeline and export', title: 'Arrange it, add sound, export MP4', body: 'Put the chosen shots in order on the timeline, add captions and music, preview the whole film and export MP4.', points: ['Image and video tracks, music and captions', 'Preview while you edit', 'Export MP4 in one click'], link: { label: 'Read the getting-started guide', path: '/quickstart' } },
  ],
  limitsTitle: 'What it can’t do yet',
  limits: ['Precise lip sync is not supported yet.', 'The Mac app is not signed by Apple yet: open it with right-click → Open the first time, and updates need a fresh download.'],
  localTitle: 'Everything stays yours',
  localBody: 'No account, no telemetry. A project is a folder on your disk with the canvas, storyboard, timeline and every image and clip inside. All of the code is open source (AGPL-3.0).',
}

const featuresByLocale = { 'zh-CN': zhCN, en: english }

export function assertFeaturesParity() {
  const ids = (locale) => featuresByLocale[locale].items.map((item) => item.id).join(',')
  if (ids('zh-CN') !== ids('en')) throw new Error('Locale parity error in features items')
  for (const id of zhCN.items.map((item) => item.id)) if (!FEATURE_SHOTS[id]) throw new Error(`Feature ${id} has no screenshot`)
}

export function renderFeatures(locale, runtimeFacts) {
  const content = contentByLocale[locale]
  const page = featuresByLocale[locale]
  const flow = `<nav class="flow" aria-label="${escapeAttr(page.flowLabel)}"><ol>${page.items.map((item) => `<li><a href="#${escapeAttr(item.id)}">${escapeText(item.kicker)}</a></li>`).join('')}</ol></nav>`
  const sections = page.items.map((item, index) => {
    const shot = FEATURE_SHOTS[item.id]
    const link = item.link ? `<a class="feature-link" href="${escapeAttr(localizedPath(locale, item.link.path))}">${escapeText(item.link.label)} →</a>` : ''
    return `<article class="feature-row${index % 2 ? ' flip' : ''}" id="${escapeAttr(item.id)}">
  <div class="feature-copy">
    <p class="feature-kicker">${escapeText(item.kicker)}</p>
    <h2>${escapeText(item.title)}</h2>
    <p class="body">${escapeText(item.body)}</p>
    <ul class="feature-points">${item.points.map((point) => `<li>${escapeText(point)}</li>`).join('')}</ul>
    ${link}
  </div>
  <figure class="feature-shot"><img src="${escapeAttr(shot.src)}" alt="${escapeAttr(item.title)}" width="${shot.width}" height="${shot.height}" loading="${index < 2 ? 'eager' : 'lazy'}" decoding="async" /></figure>
</article>`
  }).join('\n')
  const main = `${renderLibraryHero({ eyebrow: page.eyebrow, titleLead: page.titleLead, titleEmphasis: page.titleEmphasis, lede: page.lede, locale })}
<section class="block features-body">
  <div class="wrap">
    ${flow}
    ${sections}
    <div class="feature-notes">
      <div><h2>${escapeText(page.limitsTitle)}</h2><ul>${page.limits.map((limit) => `<li>${escapeText(limit)}</li>`).join('')}</ul></div>
      <div><h2>${escapeText(page.localTitle)}</h2><p>${escapeText(page.localBody)}</p></div>
    </div>
  </div>
</section>
${renderDownloadBand(locale)}`
  const metadata = buildMetadata(locale, {
    path: page.path,
    htmlLang: content.htmlLang,
    ogLocale: content.ogLocale,
    meta: page.meta,
    alternates: { 'zh-CN': zhCN.path, en: english.path },
    breadcrumbs: [{ name: locale === 'zh-CN' ? '首页' : 'Home', path: localizedPath(locale, '/') }, { name: page.eyebrow, path: page.path }],
  }, runtimeFacts)
  return renderDocument({ locale, pageKey: 'features', runtimeFacts, metadata, css: libraryCss() + featuresCss, main, alternateHref: featuresByLocale[otherLocale(locale)].path })
}

const featuresCss = `
.features-body { padding-block: 24px 40px; }
.flow ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; counter-reset: flow; }
.flow li { counter-increment: flow; display: flex; align-items: center; gap: 8px; }
.flow li + li::before { content: "→"; color: var(--ink-4); font-family: var(--font-ui); }
.flow a { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper); font-family: var(--font-ui); font-size: 14px; text-decoration: none; color: var(--ink-2); }
.flow a::before { content: counter(flow); font-size: 12px; color: var(--accent); font-weight: 600; }
.flow a:hover { border-color: var(--ink-4); color: var(--ink); }
.feature-row { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 56px; align-items: center; padding-block: 56px; border-bottom: 1px solid var(--line-soft); scroll-margin-top: 64px; }
.feature-row.flip .feature-copy { order: 2; }
@media (max-width: 960px) { .feature-row, .feature-row.flip { grid-template-columns: 1fr; gap: 22px; padding-block: 36px; } .feature-row.flip .feature-copy { order: 0; } }
.feature-kicker { margin: 0; font-family: var(--font-ui); font-size: 13px; font-weight: 600; color: var(--accent); }
.feature-row h2 { margin-top: 8px; font-size: clamp(26px, 2.8vw, 34px); }
.feature-row .body { margin-top: 12px; }
.feature-points { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 8px; }
.feature-points li { position: relative; padding-left: 24px; color: var(--ink-2); font-size: 15px; }
.feature-points li::before { content: ""; position: absolute; left: 2px; top: 0.6em; width: 11px; height: 6px; border-left: 2px solid var(--accent); border-bottom: 2px solid var(--accent); transform: rotate(-45deg); }
.feature-link { display: inline-block; margin-top: 18px; font-family: var(--font-ui); font-size: 14px; font-weight: 600; color: var(--accent); text-decoration: none; }
.feature-link:hover { text-decoration: underline; }
.feature-shot { margin: 0; border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--line); box-shadow: var(--shadow-window); background: var(--paper); }
.feature-shot img { width: 100%; height: auto; }
.feature-notes { margin-top: 48px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
@media (max-width: 760px) { .feature-notes { grid-template-columns: 1fr; } }
.feature-notes > div { background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 22px 24px; }
.feature-notes h2 { margin: 0; font-size: 20px; }
.feature-notes ul, .feature-notes p { margin: 10px 0 0; color: var(--ink-2); font-size: 15px; }
.feature-notes ul { padding-left: 1.2em; }
`

export function featurePages() {
  return [{ render: renderFeatures, output: { 'zh-CN': 'marketing/features.html', en: 'marketing/en/features.html' } }]
}

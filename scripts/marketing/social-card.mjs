import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dataUri = (relativePath, mediaType) => `data:${mediaType};base64,${fs.readFileSync(path.join(root, relativePath)).toString('base64')}`
const logo = dataUri('marketing/assets/nomi-logo.svg', 'image/svg+xml')
const canvas = dataUri('marketing/assets/screen-canvas-2026-08-17.png', 'image/png')

const copy = {
  'zh-CN': {
    eyebrow: '开源 · 本地优先 · AI 视频工作台',
    lead: '把 AI 视频的成本，',
    emphasis: '打下来。',
    agentic: '用自己的模型与工作流 · 少付平台溢价、重复订阅与无效试错',
  },
  en: {
    eyebrow: 'LOCAL-FIRST · OPEN SOURCE · AI VIDEO WORKBENCH',
    lead: 'Bring the cost of',
    emphasis: 'AI video down.',
    agentic: 'BRING YOUR OWN MODELS · REDUCE MARKUP, DUPLICATE TOOLS, AND WASTED REROLLS',
  },
}

export function renderSocialCard(locale) {
  const content = copy[locale]
  if (!content) throw new Error(`Unknown social-card locale: ${locale}`)
  return `<!doctype html>
<html lang="${locale === 'en' ? 'en' : 'zh-CN'}">
<head><meta charset="utf-8" /><style>
*{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden}body{background:#f4f2ec;color:#171715;font-family:Arial,"PingFang SC",sans-serif}.card{position:relative;display:grid;grid-template-columns:58% 42%;width:100%;height:100%;border:18px solid #171715}.copy{position:relative;padding:52px 48px 42px 54px;background:#f4f2ec}.identity{display:flex;align-items:center;gap:13px;font-size:30px;font-weight:800}.identity img{width:42px;height:42px}.eyebrow{margin:66px 0 22px;color:#b83c24;font:800 11px/1.4 Arial,sans-serif;letter-spacing:0;text-transform:uppercase}.claim{margin:0;font-size:70px;line-height:.96;font-weight:800;letter-spacing:0}.claim em{display:block;color:#b83c24;font-style:normal}.agentic{position:absolute;left:54px;right:48px;bottom:48px;margin:0;padding-top:14px;border-top:1px solid #86827a;font:700 10px/1.5 Arial,sans-serif;letter-spacing:0}.monitor{position:relative;display:flex;align-items:center;padding:54px 42px;background:#242c29}.frame{position:relative;width:100%;padding:14px;background:#fff;border:1px solid rgba(255,255,255,.28);box-shadow:18px 18px 0 rgba(0,0,0,.2)}.frame img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top;border:1px solid rgba(0,0,0,.18)}.timecode{position:absolute;right:42px;top:30px;color:#ef6a49;font:700 10px Arial,sans-serif;letter-spacing:0}.rail{position:absolute;left:0;right:0;bottom:0;height:18px;background:#ef6a49}
</style></head>
<body><main class="card">
  <section class="copy">
    <div class="identity"><img src="${logo}" alt="" /><span>Nomi</span></div>
    <p class="eyebrow">${content.eyebrow}</p>
    <h1 class="claim">${content.lead}<em>${content.emphasis}</em></h1>
    <p class="agentic">${content.agentic}</p>
  </section>
  <section class="monitor">
    <span class="timecode">REC · 00:00:14:22</span>
    <div class="frame"><img src="${canvas}" alt="" /></div>
  </section>
  <div class="rail"></div>
</main></body></html>`
}

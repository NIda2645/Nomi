import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const MEDIA_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' }
const dataUri = (relativePath) => {
  const mediaType = MEDIA_TYPES[path.extname(relativePath).toLowerCase()]
  if (!mediaType) throw new Error(`Unsupported poster asset type: ${relativePath}`)
  return `data:${mediaType};base64,${fs.readFileSync(path.join(root, relativePath)).toString('base64')}`
}

// 营销配色单一真相源，与 scripts/marketing/social-card.mjs 同源（不是 app 内的 UI token）
const INK = '#171715'
const PAPER = '#f4f2ec'
const ORANGE = '#ef6a49'
const MUTED = '#86827a'

export const FORMATS = {
  xhs: { width: 1080, height: 1440, headline: 92, eyebrow: 22, sub: 30, shotScale: 1.34, searchBand: 212 },
  wide: { width: 1600, height: 900, headline: 68, eyebrow: 19, sub: 25, shotScale: 1.18, searchBand: 0 },
}

const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// 「怎么搜到 Nomi」是每张海报的硬性收口，两种版式共用同一块，不各写一份
const searchBlock = (spec) => `<div class="search">
        <div class="box">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.2-4.2" /></svg>
          <span>${escape(spec.searchQuery)}</span>
        </div>
        <p class="hint">${escape(spec.hint)}</p>
      </div>`

/**
 * 一张海报 = 一条 spec。AI 底板（board）只负责氛围，截图与文字全部程序化合成——
 * 截图保持原像素不重绘，文字 100% 正确，这两件事不交给模型赌。
 */
export function renderPosterCard(spec) {
  const format = FORMATS[spec.format]
  if (!format) throw new Error(`Unknown poster format: ${spec.format}`)
  if (!spec.headline?.length) throw new Error(`Poster ${spec.id} is missing headline lines`)

  const shot = dataUri(spec.screenshot)
  const logo = dataUri('marketing/assets/nomi-logo.svg')
  const board = spec.board ? dataUri(spec.board) : null
  const isWide = spec.format === 'wide'

  const headline = spec.headline
    .map((line, index) => (index === spec.emphasisLine ? `<em>${escape(line)}</em>` : `<span>${escape(line)}</span>`))
    .join('')

  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8" /><style>
*{box-sizing:border-box}
html,body{margin:0;width:${format.width}px;height:${format.height}px;overflow:hidden}
body{background:${INK};color:${PAPER};font-family:"PingFang SC","Hiragino Sans GB",Arial,sans-serif;-webkit-font-smoothing:antialiased}
.poster{position:relative;width:100%;height:100%;overflow:hidden}
.board{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.5}
.veil{position:absolute;inset:0;background:linear-gradient(165deg,rgba(23,23,21,.6) 0%,rgba(23,23,21,.93) 62%,${INK} 100%)}
.layer{position:relative;height:100%;display:${isWide ? 'grid' : 'flex'};${isWide ? 'grid-template-columns:53% 47%;' : 'flex-direction:column;'}}
.copy{display:flex;flex-direction:column;padding:${isWide ? '58px 40px 74px 66px' : '72px 68px 0'}}
.brand{display:flex;align-items:center;gap:12px;font-size:${format.eyebrow + 8}px;font-weight:800;letter-spacing:.5px}
.brand img{width:${format.eyebrow + 14}px;height:${format.eyebrow + 14}px;border-radius:6px}
.eyebrow{margin-left:auto;padding:7px 14px;border:1px solid ${MUTED};border-radius:999px;font-size:${format.eyebrow - 4}px;font-weight:700;letter-spacing:.6px;opacity:.82}
.claim{margin:${isWide ? '44px' : '58px'} 0 0;font-size:${format.headline}px;line-height:1.08;font-weight:800;letter-spacing:-1px}
.claim span,.claim em{display:block;font-style:normal}
.claim em{color:${ORANGE}}
.sub{margin:${isWide ? '22px' : '26px'} 0 0;font-size:${format.sub}px;line-height:1.55;font-weight:500;opacity:.6;max-width:${isWide ? '92%' : '88%'}}
/* 截图有自己的舞台，搜索区有自己的实底——两者不重叠 */
/* 旋转以左上为原点会把右上角抬起来，所以 top 要留够，否则截图会爬进副标题 */
.stage{position:relative;overflow:hidden;${isWide ? '' : 'flex:1;min-height:0;'}}
.shot{position:absolute;${isWide ? 'top:104px;left:-40px;width:132%;' : 'top:78px;left:16px;width:112%;'}border-radius:12px;overflow:hidden;transform:rotate(-6deg);transform-origin:left top;box-shadow:0 34px 74px rgba(0,0,0,.6);border:1px solid rgba(244,242,236,.14)}
.shot img{display:block;width:${Math.round(format.shotScale * 100)}%;object-fit:cover;object-position:top left}
.fade{position:absolute;left:0;right:0;bottom:0;height:${isWide ? '190px' : '260px'};background:linear-gradient(to bottom,rgba(23,23,21,0),${INK} 72%)}
.search{position:${isWide ? 'relative' : 'relative'};display:flex;flex-direction:column;align-items:${isWide ? 'flex-start' : 'center'};gap:14px;${isWide ? 'margin-top:auto;' : `height:${format.searchBand}px;justify-content:center;`}}
.box{display:flex;align-items:center;gap:16px;width:${isWide ? '86%' : '76%'};padding:${isWide ? '17px 28px' : '21px 32px'};background:#fff;border-radius:999px;box-shadow:0 12px 30px rgba(0,0,0,.45)}
.box svg{flex:none;opacity:.55}
.box span{color:#1f1f1f;font-size:${format.sub + 2}px;font-weight:500;letter-spacing:.2px}
.hint{margin:0;font-size:${format.eyebrow}px;font-weight:600;opacity:.5;letter-spacing:.4px}
.rail{position:absolute;left:0;right:0;bottom:0;height:${isWide ? '12px' : '16px'};background:${ORANGE}}
</style></head>
<body><main class="poster">
  ${board ? `<img class="board" src="${board}" alt="" /><div class="veil"></div>` : ''}
  <div class="layer">
    <section class="copy">
      <header class="brand"><img src="${logo}" alt="" /><span>Nomi</span><span class="eyebrow">${escape(spec.eyebrow)}</span></header>
      <h1 class="claim">${headline}</h1>
      <p class="sub">${escape(spec.sub)}</p>
      ${isWide ? searchBlock(spec, format) : ''}
    </section>
    <section class="stage">
      <figure class="shot"><img src="${shot}" alt="" /></figure>
      <div class="fade"></div>
    </section>
    ${isWide ? '' : searchBlock(spec, format)}
  </div>
  <div class="rail"></div>
</main></body></html>`
}

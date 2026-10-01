#!/usr/bin/env node
// 样张构建：docs/design/mockups/2026-10-01-paid-card-generate-remaining/index.html
//
// 改的只有一处：付费卡上加「生成剩下 N 张 / 段」（2026-10-01 拍板：一直显示、写明张数、去掉的不算、
// 每张各记一笔授权、报不出价时不写数）。其余一律照搬 A1 之后付费卡的真实样子：
//   · 改前截图取自本分支构建的真机走查（`before/*.png`）；
//   · 结构照 `AgentPanelV4Cards.tsx` / `AgentPanelV4SlotShell.tsx`（槽头 / 卡体 / 翻页行 / 动作行）；
//   · 颜色、圆角、阴影、字体只用 `src/theme/nomi-tokens.css`（光 / 暗两套值逐字来自该文件）；
//   · 图标只从 `@tabler/icons-react` 抽真实路径（找不到就报错，不画近似线条）。
// 用法：node docs/design/mockups/2026-10-01-paid-card-generate-remaining/build.mjs
/* global console */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../../../..')

function icon(name, size, stroke = 1.8, extraClass = '') {
  const file = path.join(repo, 'node_modules/@tabler/icons-react/dist/esm/icons', `${name}.mjs`)
  if (!fs.existsSync(file)) throw new Error(`Tabler icon not found: ${name}`)
  const match = fs.readFileSync(file, 'utf8').match(/__iconNode = (\[.*\]);/)
  if (!match) throw new Error(`Tabler icon has no __iconNode: ${name}`)
  const nodes = JSON.parse(match[1])
  const body = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('')
  return `<svg class="ti ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}

const png = (file) => `data:image/png;base64,${fs.readFileSync(path.join(here, 'before', file)).toString('base64')}`

// token：光色块原样；暗色块（运行时挂在 data-mantine-color-scheme 上）换成「跟系统 + 手动切」两种挂法，值不动。
function themedTokens() {
  const source = fs.readFileSync(path.join(repo, 'src/theme/nomi-tokens.css'), 'utf8')
  const dark = source.match(/:root\[data-mantine-color-scheme="dark"\]\s*\{([\s\S]*?)\n\}/)
  if (!dark) throw new Error('nomi-tokens.css has no dark block')
  const light = source.replace(dark[0], '').replace(/html,\s*body,\s*#root\s*\{[\s\S]*?\}/, '')
  return `${light}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {${dark[1]}
  }
}
:root[data-theme="dark"] {${dark[1]}
}`
}

const L = {
  zh: {
    titleImages: (n) => `生成这 ${n} 张图片？`, titleImage: '生成这 1 张图片？',
    badge: '付费 · Nomi 选的', modeLabel: '生成方式', t2i: '文生图', i2i: '图生图', t2iHint: '纯文字生成图像',
    prompts: ['一只橘猫在窗台上晒太阳', '一只橘猫在沙发上打盹'],
    auto: '自动', outputs: '1 个',
    remove: '去掉这张', confirm: '生成这张',
    remaining: (n) => `生成剩下 ${n} 张`,
    total: (n, amount) => `${n} 镜 · 合计 ${amount}`, newTag: '新增',
  },
  en: {
    titleImages: (n) => `Generate these ${n} images?`, titleImage: 'Generate this image?',
    badge: 'Paid · Nomi picked', modeLabel: 'Generation mode', t2i: 'Text-to-image', i2i: 'Image-to-image', t2iHint: 'Generate an image from text',
    prompts: ['An orange cat sunbathing on the windowsill', 'An orange cat napping on the sofa'],
    auto: 'Auto', outputs: '1 outputs',
    remove: 'Remove', confirm: 'Generate this one',
    remaining: (n) => `Generate remaining ${n}`,
    total: (n, amount) => `${n} shots · ${amount} total`, newTag: 'New',
  },
}

/**
 * 一张付费卡，照 A1 之后的真实结构：槽头（标题 · 徽章 · ×）/ 卡体那张生成框 / 翻页行 / 动作行。
 * `remaining` 不传 = 不画「生成剩下」。翻页行的东西在内容流里紧跟彼此（设计系统「行布局：附属信息跟随内容流」），
 * 只有主按钮贴右缘。
 */
function card(lang, { title, page, total, remaining, price, lead, prompt = 0 }) {
  const t = L[lang]
  const confirm = t.confirm + (price ? ` ${price}` : '')
  return `
  <section class="card" lang="${lang === 'zh' ? 'zh-CN' : 'en'}">
    <div class="head">
      <span class="title" contenteditable="true">${title}</span>
      <span class="badge" contenteditable="true">${t.badge}</span>
      <span class="grow"></span>
      <span class="close">${icon('IconX', 14)}</span>
    </div>
    <div class="composer">
      <div class="label" contenteditable="true">${t.modeLabel}</div>
      <div class="seg"><span class="on" contenteditable="true">${t.t2i}</span><span contenteditable="true">${t.i2i}</span></div>
      <div class="label" contenteditable="true">${t.t2iHint}</div>
      <div class="prompt" contenteditable="true">${t.prompts[prompt]}</div>
      <div class="chips">
        <span class="chip">${icon('IconCube', 13, 1.6)}<span contenteditable="true">GPT Image 2</span>${icon('IconChevronDown', 12, 1.6)}</span>
        <span class="chip"><span contenteditable="true">${t.auto}</span>${icon('IconChevronDown', 12, 1.6)}</span>
        <span class="chip"><span contenteditable="true">1K</span>${icon('IconChevronDown', 12, 1.6)}</span>
        <span class="chip"><span contenteditable="true">${t.outputs}</span>${icon('IconChevronDown', 12, 1.6)}</span>
      </div>
    </div>
    <footer class="foot">
      ${total > 1 ? `
      <div class="row pager-row">
        <span class="arrow">${icon('IconChevronRight', 12, 1.8, 'flip')}</span>
        <span class="num">${page}/${total}</span>
        <span class="arrow">${icon('IconChevronRight', 12, 1.8)}</span>
        <span class="keyhint">←→</span>
        ${remaining === undefined ? '' : `<span class="new-wrap"><span class="new-tag">${t.newTag}</span><button class="btn" type="button" contenteditable="true">${t.remaining(remaining)}</button></span>`}
      </div>` : ''}
      <div class="row">
        ${lead ? `<span class="lead" contenteditable="true">${lead}</span>` : ''}
        <span class="grow"></span>
        <button class="btn" type="button" contenteditable="true">${t.remove}</button>
        <button class="btn primary" type="button">${icon('IconCheck', 13, 2)}<span contenteditable="true">${confirm}</span><span class="enter">⏎</span></button>
      </div>
    </footer>
  </section>`
}

function artboard(caption, note, body) {
  return `<figure class="board"><figcaption><b>${caption}</b><span>${note}</span></figcaption>${body}</figure>`
}

const boards = (lang) => {
  const t = L[lang]
  const zh = lang === 'zh'
  return [
    artboard(zh ? '① 2 张 · 第 1 页 · 报不出价（今天的常态）' : '① 2 images · page 1 · price unknown (today\'s norm)',
      zh ? '一打开就在，紧跟在翻页器后面。N = 卡上还没定的镜，含这一页。报不出价：哪儿都不写数。' : 'There from the first page, right after the pager. N = undecided shots, this page included. No price: no number anywhere.',
      card(lang, { title: t.titleImages(2), page: 1, total: 2, remaining: 2 })),
    artboard(zh ? '② 2 张 · 点了第 1 张「生成这张」之后' : '② 2 images · after "Generate this one" on the first',
      zh ? '只剩 1 张：卡变回单张样子，不画「生成剩下 1 张」（它和「生成这张」是同一件事；默认，待确认）。' : 'One left: the card is a single-shot card again; no "Generate remaining 1" (same as "Generate this one"; default, please confirm).',
      card(lang, { title: t.titleImage, page: 1, total: 1, prompt: 1 })),
    artboard(zh ? '③ 33 张 · 用户去掉了 2 张之后' : '③ 33 images · after the user removed 2',
      zh ? '去掉的不算：标题、页码、按钮一起变成 31，三处是同一个数。' : 'Removed shots don\'t count: title, pager and button all say 31 — one number.',
      card(lang, { title: t.titleImages(31), page: 1, total: 31, remaining: 31 })),
    artboard(zh ? '④ 2 张 · 报得出价时' : '④ 2 images · when the price is known',
      zh ? '主按钮照旧带这一张的价；左下「2 镜 · 合计」就是「生成剩下 2 张」要花的数，按钮上不再印第二遍（默认，待确认）。' : 'The primary keeps this shot\'s price; the lower-left total is exactly what "Generate remaining 2" spends, so the button doesn\'t print it again (default, please confirm).',
      card(lang, { title: t.titleImages(2), page: 1, total: 2, remaining: 2, price: '¥0.30', lead: t.total(2, '¥0.60') })),
  ].join('\n')
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>生成剩下 N 张（样张）</title>
<style>
${themedTokens()}
* { box-sizing: border-box; }
html, body { background: var(--nomi-bg); }
body { margin: 0; color: var(--nomi-ink); font: 13px/1.5 var(--nomi-font-sans); }
.wrap { max-width: 1240px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 18px; margin: 0 0 4px; }
h2 { font-size: 15px; margin: 32px 0 10px; }
p, li { color: var(--nomi-ink-80); }
li { margin: 4px 0; }
code { font-family: var(--nomi-font-mono); font-size: 12px; }
.note { font-size: 12px; color: var(--nomi-ink-60); }
.update { font-size: 13px; color: var(--nomi-ink); background: var(--nomi-info-soft); border: 1px solid var(--nomi-info-edge); border-radius: var(--nomi-radius-sm); padding: 8px 10px; }
.bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 12px 0 0; }
.bar button { font: inherit; font-size: 12px; padding: 3px 10px; border-radius: var(--nomi-radius-sm); border: 1px solid var(--nomi-line); background: var(--nomi-paper); color: var(--nomi-ink); cursor: pointer; }
.bar button[aria-pressed="true"] { background: var(--nomi-ink); color: var(--nomi-paper); border-color: var(--nomi-ink); }
.before { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 16px; }
.before figure { margin: 0; }
.before img { width: 100%; border: 1px solid var(--nomi-line); border-radius: var(--nomi-radius); display: block; }
.before figcaption { font-size: 12px; color: var(--nomi-ink-60); margin-top: 4px; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(400px, 100%), 1fr)); gap: 32px; }
.col { display: none; flex-direction: column; gap: 28px; }
body[data-lang="zh"] .col-zh, body[data-lang="en"] .col-en, body[data-lang="both"] .col { display: flex; }
.board { margin: 0; }
.board figcaption { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; max-width: 400px; }
.board figcaption b { font-size: 13px; }
.board figcaption span { font-size: 12px; color: var(--nomi-ink-60); }
/* —— 卡：照 V4SlotShell / V4Intervention 的真实结构 —— */
.card { width: 366px; max-width: 100%; background: var(--nomi-paper); border: 1px solid var(--nomi-accent); border-radius: var(--nomi-radius); box-shadow: var(--nomi-shadow-sm); }
.head { display: flex; align-items: baseline; gap: 6px; padding: 8px 10px 0; }
.title { font-weight: 600; font-size: 13px; color: var(--nomi-ink); }
.badge { font-size: 11px; color: var(--nomi-ink-60); }
.grow { flex: 1; }
.close { color: var(--nomi-ink-60); display: inline-flex; align-self: center; }
.composer { padding: 2px 10px 8px; }
.label { font-size: 11px; color: var(--nomi-ink-40); margin-top: 4px; }
.seg { display: inline-flex; background: var(--nomi-ink-05); border-radius: var(--nomi-radius-sm); padding: 2px; margin-top: 2px; }
.seg span { font-size: 12px; padding: 3px 12px; border-radius: 4px; color: var(--nomi-ink-60); }
.seg span.on { background: var(--nomi-paper); color: var(--nomi-ink); font-weight: 600; box-shadow: var(--nomi-shadow-sm); }
.prompt { border-top: 1px solid var(--nomi-line-soft); margin-top: 6px; padding-top: 8px; min-height: 64px; font-size: 13px; color: var(--nomi-ink); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.chip { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 3px 8px; border: 1px solid var(--nomi-line); border-radius: 999px; color: var(--nomi-ink-80); }
.chip .ti { color: var(--nomi-ink-40); }
.foot { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--nomi-line-soft); padding: 8px 10px; }
.row { display: flex; align-items: center; gap: 6px; min-height: 28px; }
.pager-row { gap: 2px; min-height: 22px; font-size: 11px; color: var(--nomi-ink-80); }
.arrow { display: inline-flex; width: 20px; height: 20px; align-items: center; justify-content: center; color: var(--nomi-accent); border-radius: var(--nomi-radius-sm); }
.flip { transform: rotate(180deg); }
.num { font-variant-numeric: tabular-nums; }
.keyhint { margin-left: 4px; color: var(--nomi-ink-40); }
.lead { min-width: 0; font-size: 12px; color: var(--nomi-ink); font-variant-numeric: tabular-nums; }
.btn { font: inherit; font-size: 12px; display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 12px; flex-shrink: 0; border-radius: var(--nomi-radius-sm); border: 1px solid var(--nomi-line); background: var(--nomi-paper); color: var(--nomi-ink); white-space: nowrap; }
.btn.primary { background: var(--nomi-ink); color: var(--nomi-paper); border-color: var(--nomi-ink); min-width: 80px; }
.enter { font-size: 11px; opacity: 0.7; }
.new-wrap { position: relative; display: inline-flex; margin-left: 6px; outline: 1.5px dashed var(--nomi-accent); outline-offset: 3px; border-radius: var(--nomi-radius-sm); }
.new-tag { position: absolute; top: -15px; right: -4px; font-size: 10px; line-height: 1; padding: 1px 4px; border-radius: 3px; background: var(--nomi-accent); color: var(--nomi-paper); }
table { border-collapse: collapse; width: 100%; font-size: 12px; }
th, td { border: 1px solid var(--nomi-line); padding: 6px 8px; text-align: left; vertical-align: top; color: var(--nomi-ink-80); }
th { background: var(--nomi-ink-05); color: var(--nomi-ink); }
.table-wrap { overflow-x: auto; }
</style>
</head>
<body data-lang="both">
<div class="wrap">
  <h1>付费卡：加「生成剩下 N 张」</h1>
  <p class="note">只改一处（虚线框里那颗按钮）。其余照 A1 之后付费卡的真实样子画：结构照组件源码，颜色 / 圆角 / 字体取自 <code>src/theme/nomi-tokens.css</code>，图标取自 Tabler 真实路径。按钮和标题上的字可以直接点着改。</p>
  <p class="update"><b>位置已按用户 2026-10-01 看样张后的反馈调整，以实现为准。</b>按钮的样子和名字不变；位置改成：翻页那一行回到只有 <code>‹ 1/2 ›</code> 和 <code>←→</code>，报得出价时这一叠的合计贴在这一行最右端；「生成剩下 N 张」挪到下面动作那一行的<b>最左边</b>，右边照旧是「去掉这张」和主按钮「生成这张」——整叠的动作在左、这一张的动作在右，最贵的那颗离主按钮最远。英文一行放不下时，左边那颗整颗换到上一行、靠左，右边两颗保持一组、靠右。下面的画板是改位置之前的那一版。</p>
  <div class="bar">
    <span class="note">语言</span>
    <button type="button" data-set-lang="both" aria-pressed="true">中 + 英</button>
    <button type="button" data-set-lang="zh" aria-pressed="false">中文</button>
    <button type="button" data-set-lang="en" aria-pressed="false">English</button>
    <span class="note" style="margin-left:12px">主题</span>
    <button type="button" data-set-theme="" aria-pressed="true">跟系统</button>
    <button type="button" data-set-theme="light" aria-pressed="false">亮</button>
    <button type="button" data-set-theme="dark" aria-pressed="false">暗</button>
  </div>

  <h2>改前：今天的逐张卡（本分支真机截图）</h2>
  <div class="before">
    <figure><img alt="改前：2 张图片的付费卡（中文）" src="${png('card-two-shots-zh.png')}" /><figcaption>2 张图片 · 中文（走查夹具带价，所以按钮上有 ¥0.30，左下有合计）</figcaption></figure>
    <figure><img alt="改前：报不出价的付费卡（英文）" src="${png('card-unknown-price-en.png')}" /><figcaption>1 张图片 · 英文 · 报不出价（今天的常态）</figcaption></figure>
  </div>

  <h2>改后</h2>
  <div class="cols">
    <div class="col col-zh">${boards('zh')}</div>
    <div class="col col-en">${boards('en')}</div>
  </div>
  <p class="note">视频卡同一个位置、同一种按钮，只是说「段」：「生成剩下 3 段」；英文同样是 Generate remaining 3。</p>

  <h2>为什么放在翻页器后面</h2>
  <ul>
    <li><b>它管的是这一叠，不是这一页。</b>翻页那一行本来就是「这一叠」的控件（第几页、往哪翻）；「生成剩下 N 张」挨着它，读的时候不会和管这一页的「生成这张」混成一件事。</li>
    <li><b>动作行不加第三颗按钮。</b>动作行仍只有「去掉这张」和主按钮「生成这张」。三颗挤一行，英文放不下（Remove / Generate remaining 2 / Generate this one），而且一屏只能有一个主动作。</li>
    <li><b>描边次按钮，紧跟翻页器，不贴右缘。</b>和「去掉这张」同一种按钮；按设计系统「附属信息跟随内容流」，只有主按钮贴右缘。回车按的仍是「生成这张」。</li>
  </ul>

  <h2>点下去会发生什么（没有新界面）</h2>
  <ul>
    <li>等于把卡上还没定的每一张都点了一次「生成这张」：<b>每张各记一笔授权，没有总价授权</b>；去掉过的不在里面。</li>
    <li>每一张按它自己那一页现在的参数生成——你翻到别的页改过的，照改过的算。</li>
    <li>每一张都定了，卡就关；画布上每个节点、Agent 收到的回执，和逐张点完一模一样（同一份逐镜结果驱动）。哪一张没能开拍，它照逐张点时的样子留在卡上、写明原因。</li>
    <li>报不出价时按钮上不写数字，也不出现「价格未知」「预算」之类的字。</li>
  </ul>

  <h2>要确认的</h2>
  <div class="table-wrap"><table>
    <tr><th>问题</th><th>默认（样张就是这么画的）</th><th>另一种</th></tr>
    <tr><td>只剩 1 张时，还显示「生成剩下 1 张」吗？</td><td>不显示：它和「生成这张」是同一件事，两颗按钮做一件事让人犹豫该点哪颗</td><td>照样显示，位置不跳</td></tr>
    <tr><td>报得出价时，「生成剩下 N 张」上带不带合计？</td><td>不带：左下「N 镜 · 合计」就是这几张的合计，同一个数印两处，改参数时总有一处先漂</td><td>带上合计，左下那句删掉</td></tr>
    <tr><td>一张卡里图和视频都有时，按钮说张还是段？</td><td>跟标题同一条规则：有视频就说「段」（标题今天也这么说）</td><td>标题和按钮都改说「镜」（「生成这 3 镜？」「生成剩下 3 镜」）</td></tr>
  </table></div>

  <h2>和旧规矩的关系（请确认是有意改写）</h2>
  <p>设计系统 §1.8 写着「次动作不铺第二颗文字按钮」「文字标签 ≤4 字」；2026-09-10 那版卡也定过「批量不是第二颗文字按钮」（当时改成了翻页器旁的「逐镜 | 全部」切换，A1 随「全部」那条路删了）。这次按 2026-10-01 的拍板画成写明张数的文字按钮——它没有公认图形，张数就是它要说的那件事。确认后实现时同步改 §1.8 那一行，写明这颗是例外和原因，不留两条打架的规矩。</p>

  <h2>没放上去的</h2>
  <div class="table-wrap"><table>
    <tr><th>没放的</th><th>为什么</th></tr>
    <tr><td>放进动作行，和「生成这张」并排</td><td>三颗文字按钮一行，英文放不下；也会和主按钮抢「先点哪个」</td></tr>
    <tr><td>收进「…」菜单</td><td>要的是一直看得见；收起来要多点一下才知道有这件事</td></tr>
    <tr><td>点下去再弹一次「确定生成 N 张？」</td><td>按钮上已经写明张数；每一张都在卡上摆过、能翻看、能去掉；点完的结果和逐张点完一样</td></tr>
  </table></div>
</div>
<script>
  for (const button of document.querySelectorAll('[data-set-lang]')) {
    button.addEventListener('click', () => {
      document.body.dataset.lang = button.dataset.setLang
      for (const other of document.querySelectorAll('[data-set-lang]')) other.setAttribute('aria-pressed', String(other === button))
    })
  }
  for (const button of document.querySelectorAll('[data-set-theme]')) {
    button.addEventListener('click', () => {
      if (button.dataset.setTheme) document.documentElement.dataset.theme = button.dataset.setTheme
      else delete document.documentElement.dataset.theme
      for (const other of document.querySelectorAll('[data-set-theme]')) other.setAttribute('aria-pressed', String(other === button))
    })
  }
</script>
</body>
</html>
`

fs.writeFileSync(path.join(here, 'index.html'), html)
console.log(`wrote ${path.join(here, 'index.html')} (${html.length} bytes)`)

// 语义 token 作用域扫描（check-design-tokens 第 6 类的实现，独立成库以便单测）。
//
// 为什么存在（docs/plan/2026-08-24-workbench-token-root-scope.md）：CSS 自定义属性沿 **DOM 树**继承。
// 把 --nomi-* / --workbench-* 的**定义**写进 `.workbench-shell` 之类的类作用域，portal 到 body /
// 挂在 app 根 / 库页的浮层就解析不到 → var() 静默失效退回继承色（任务中心、库页确认卡勾勾
// 两度实锤 rgb(201,201,201)），并逼出「每个 portal 补挂作用域类」的桥。2026-08-24 已把两族全量
// 收口到 :root；本扫描拦「新定义写回作用域」的回潮。只扫真源层（.css + tailwind.config.ts 的
// addBase）；TSX 内联 style 的局部覆写是运行时参数化，不算定义真源、不扫。

const TOKEN_FAMILY = /^--(?:nomi|workbench)-[A-Za-z0-9-]*$/

/**
 * 「根层锚定」= 每个逗号分段都**只**选中根元素本身（:root/html/body + 可选属性/伪类后缀），
 * 不带任何后代/子代组合器——`:root[data-…="dark"]` 算根层，`:root[…] .workbench-shell` 不算
 * （它选中的是壳节点，portal 到 body 的浮层照样继承不到）。
 */
export function isRootAnchoredSelector(selector) {
  const parts = selector.split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return false
  return parts.every((part) => /^(?::root|html|body)(?:\[[^\]]*\]|:[A-Za-z-]+(?:\([^)]*\))?)*$/.test(part))
}

/** 剥 CSS 块注释，字符替换成空格保留换行（行号不漂）。 */
function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

/**
 * 扫 .css 文本：字符级 brace 走读（选择器可跨行）。
 * @returns {Array<{line:number, token:string, selector:string}>}
 */
export function scanCssText(text) {
  const src = stripCssComments(text)
  const findings = []
  const stack = []
  let buf = ''
  let bufStartLine = null
  let line = 1

  const noteDecl = () => {
    const decl = buf.trim()
    const m = decl.match(/^(--[A-Za-z0-9-]+)\s*:/)
    if (m && TOKEN_FAMILY.test(m[1])) {
      const sel = [...stack].reverse().find((s) => !s.startsWith('@'))
      if (sel && !isRootAnchoredSelector(sel)) {
        findings.push({ line: bufStartLine ?? line, token: m[1], selector: sel })
      }
    }
  }
  const resetBuf = () => {
    buf = ''
    bufStartLine = null
  }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch === '\n') {
      line += 1
      buf += ch
      continue
    }
    if (ch === '{') {
      stack.push(buf.trim().replace(/\s+/g, ' '))
      resetBuf()
      continue
    }
    if (ch === '}') {
      noteDecl() // 块尾最后一条声明允许不带分号
      stack.pop()
      resetBuf()
      continue
    }
    if (ch === ';') {
      noteDecl()
      resetBuf()
      continue
    }
    if (bufStartLine === null && !/\s/.test(ch)) bufStartLine = line
    buf += ch
  }
  return findings
}

/**
 * 扫 tailwind.config.ts 文本：跟踪引号 key 的对象层级（addBase 的选择器都是引号 key）。
 * 非选择器 key（colors/nomi/extend…）不参与判定；深度用花括号配对，箭头函数等无 key 的块只推深度。
 * @returns {Array<{line:number, token:string, selector:string}>}
 */
export function scanTailwindConfigText(text) {
  const findings = []
  const stack = [] // {key, depth}
  let depth = 0
  const selectorish = (key) => /[.:#[\]*>~+]/.test(key) || /^(?:html|body)\b/.test(key)

  text.split('\n').forEach((raw, idx) => {
    const line = raw.replace(/\/\/.*$/, '')
    // 行尾开块的引号 key（允许行内有前缀，如 `addBase({ '.y': {`）；同行多个取最内层（最后一个）。
    const keyOpens = [...line.matchAll(/(['"])((?:\\.|(?!\1).)*)\1\s*:\s*\{/g)]
    const endsOpen = /\{\s*$/.test(line)
    const keyOpen = endsOpen && keyOpens.length ? keyOpens[keyOpens.length - 1] : null
    if (!keyOpen) {
      const def = line.match(/^\s*(['"])(--[A-Za-z0-9-]+)\1\s*:/)
      if (def && TOKEN_FAMILY.test(def[2])) {
        const sel = [...stack].reverse().find((s) => selectorish(s.key))
        if (sel && !isRootAnchoredSelector(sel.key)) {
          findings.push({ line: idx + 1, token: def[2], selector: sel.key })
        }
      }
    }
    // 单行内联对象（`'.y': { '--nomi-a': 'b' }`）不经过栈，单独扫。
    for (const m of line.matchAll(/(['"])((?:\\.|(?!\1).)*)\1\s*:\s*\{([^{}]*)\}/g)) {
      const key = m[2]
      if (!selectorish(key) || isRootAnchoredSelector(key)) continue
      for (const d of m[3].matchAll(/(['"])(--[A-Za-z0-9-]+)\1\s*:/g)) {
        if (TOKEN_FAMILY.test(d[2])) findings.push({ line: idx + 1, token: d[2], selector: key })
      }
    }
    const opens = (line.match(/\{/g) || []).length
    const closes = (line.match(/\}/g) || []).length
    if (keyOpen) stack.push({ key: keyOpen[2], depth })
    depth += opens - closes
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop()
  })
  return findings
}

/**
 * 入口：files = [{path, content}]。.css 走 CSS 走读，tailwind.config.ts 走 config 走读，其余跳过。
 * @returns {Array<{file:string, line:number, token:string, selector:string}>}
 */
export function scanScopedTokenDefinitions(files) {
  const findings = []
  for (const { path: file, content } of files) {
    if (file.endsWith('.css')) {
      for (const f of scanCssText(content)) findings.push({ file, ...f })
    } else if (file.endsWith('tailwind.config.ts')) {
      for (const f of scanTailwindConfigText(content)) findings.push({ file, ...f })
    }
  }
  return findings
}

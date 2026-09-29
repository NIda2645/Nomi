// 从一份**构建产物 JS** 里读出它在运行时会去 Node 模块解析器要的东西（2026-09-28，发版审计 A）。
//
// 两个消费者，同一份判据（P1：扫描器只有这一个）：
//   · scripts/check-packaged-deps.mjs —— contracts 里静态判「dependencies 里每个包有没有运行时证据」；
//   · scripts/audit-package.mjs       —— 打包后判「装进包的 dist-electron 要的每个包，包里都解析得到」。
//
// 为什么用 TypeScript 解析器、不用正则/手写分词：产物里有正则字面量（`/["']/g` 这种），
// 手写分词器会把里面的引号当成字符串开头，一路吞到下一个同类引号——吞掉的若正好是一句
// `require("x")`，这个包就被判成「没人用」，挪走后装机版当场 `Cannot find module`。
//
// 认得的写法（都是 tsc 真会产出、或仓库里真写过的）：
//   import … from 'x' / export … from 'x' / import('x')
//   require('x') / require.resolve('x') / import.meta.resolve('x')
//   createRequire(…)('x') / (0, node_module_1.createRequire)(…)('x')
//   const r = createRequire(…); r('x'); r.resolve('x')   ← 别名（electron/protocol/localRuntimeAssets.ts 就这么写）
// 参数不是字面量的加载（`require(s)`）无法静态知道要什么，单列成 unresolved 交给调用方表态。
import { builtinModules, createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let typescript = null

/** TypeScript 是 devDependency：CI 的 contracts 与打包作业都先 `pnpm install`，所以一定在。 */
export function loadTypeScript() {
  typescript ??= require('typescript')
  return typescript
}

/** 运行时自带、不从 node_modules 解析的模块：Node 内置 + Electron 注入的两个。 */
const RUNTIME_PROVIDED_PACKAGES = new Set(['electron', 'original-fs'])
const NODE_BUILTINS = new Set(builtinModules)

/** 'x' / 'x/sub' / '@s/x' / '@s/x/sub' → 包名；不是合法包名形状时返回 null。 */
export function packageNameOf(specifier) {
  const parts = specifier.split('/')
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  if (specifier.startsWith('@') && parts.length < 2) return null
  return /^(?:@[^/\s@]+\/)?[^/\s@.][^/\s]*$/.test(name) ? name : null
}

/** 裸说明符 = 交给 node_modules 解析的那种（不是相对/绝对路径、不是 URL、不是 `#` 内部别名）。 */
export function isBareSpecifier(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')) return false
  if (/^[A-Za-z]:[\\/]/.test(specifier)) return false
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(specifier)) return false // node: / file: / data: / http:
  return packageNameOf(specifier) !== null
}

/** 运行时自带：Node 内置（含 `fs/promises` 这类子路径）与 Electron 注入的模块。 */
export function isRuntimeProvided(specifier) {
  if (specifier.startsWith('node:')) return true
  const name = packageNameOf(specifier)
  return NODE_BUILTINS.has(specifier) || (name !== null && (NODE_BUILTINS.has(name) || RUNTIME_PROVIDED_PACKAGES.has(name)))
}

/** 需要从 node_modules 解析的包名；内置/相对路径/URL 返回 null。 */
export function externalPackageOf(specifier) {
  if (!isBareSpecifier(specifier) || isRuntimeProvided(specifier)) return null
  return packageNameOf(specifier)
}

function unwrap(ts, node) {
  let current = node
  for (;;) {
    if (ts.isParenthesizedExpression(current)) current = current.expression
    // tsc 的 CommonJS 产物把具名导入的调用写成 `(0, mod_1.fn)(…)`：逗号表达式取右边。
    else if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.CommaToken) current = current.right
    else return current
  }
}

function isCreateRequireCall(ts, node) {
  const call = unwrap(ts, node)
  if (!ts.isCallExpression(call)) return false
  const callee = unwrap(ts, call.expression)
  return (ts.isIdentifier(callee) && callee.text === 'createRequire')
    || (ts.isPropertyAccessExpression(callee) && callee.name.text === 'createRequire')
}

function literalOf(ts, node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node : null
}

/**
 * @returns {{
 *   references: Array<{ specifier: string, kind: 'import' | 'resolve', line: number }>,
 *   unresolved: Array<{ kind: 'import' | 'resolve', line: number, expression: string }>,
 *   literals: Array<{ value: string, line: number }>,
 * }}
 *   references 是会真去解析模块的调用（import = 加载，resolve = 只要路径，按路径读二进制/资产）；
 *   literals 是**其余**所有字符串字面量，给调用方做「按名字提到了某个包」的兜底判断。
 */
export function scanModuleReferences(fileName, text, ts = loadTypeScript()) {
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const lineOf = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  const requireNames = new Set(['require'])

  const collectAliases = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isCreateRequireCall(ts, node.initializer)) {
      requireNames.add(node.name.text)
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(node.left) && isCreateRequireCall(ts, node.right)) {
      requireNames.add(node.left.text)
    }
    ts.forEachChild(node, collectAliases)
  }
  collectAliases(sourceFile)

  const references = []
  const unresolved = []
  const consumed = new Set()
  const record = (argument, kind, site) => {
    const literal = literalOf(ts, argument)
    if (literal) {
      consumed.add(literal)
      references.push({ specifier: literal.text, kind, line: lineOf(literal) })
    } else {
      unresolved.push({ kind, line: lineOf(site), expression: site.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 160) })
    }
  }
  const isRequireLike = (expression) => {
    const target = unwrap(ts, expression)
    return (ts.isIdentifier(target) && requireNames.has(target.text)) || isCreateRequireCall(ts, target)
  }
  const isResolveCall = (callee) => {
    const target = unwrap(ts, callee)
    if (!ts.isPropertyAccessExpression(target) || target.name.text !== 'resolve') return false
    const owner = unwrap(ts, target.expression)
    return isRequireLike(owner) || (ts.isMetaProperty(owner) && owner.keywordToken === ts.SyntaxKind.ImportKeyword)
  }

  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      record(node.moduleSpecifier, 'import', node)
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || isRequireLike(node.expression)) record(node.arguments[0], 'import', node)
      else if (isResolveCall(node.expression)) record(node.arguments[0], 'resolve', node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  const literals = []
  const collectLiterals = (node) => {
    const literal = literalOf(ts, node)
    if (literal && !consumed.has(literal)) literals.push({ value: literal.text, line: lineOf(literal) })
    ts.forEachChild(node, collectLiterals)
  }
  collectLiterals(sourceFile)
  return { references, unresolved, literals }
}

/**
 * 字面量是不是在「按名字提到」某个已声明的包：整串等于包名，或以 `包名/` 开头。
 * 例：`path.join(dir, 'node_modules', 'onnxruntime-web')` 里的 'onnxruntime-web'。
 */
export function mentionedPackage(value, declaredNames) {
  if (!isBareSpecifier(value)) return null
  const name = packageNameOf(value)
  return name !== null && declaredNames.has(name) ? name : null
}

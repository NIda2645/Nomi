// `check:walkthrough-tool-args` 的判据本体（R17：判据住在 lib 里，才喂得进假仓库验「它会不会红」）。
//
// ── 守的不变量 ──
//
// **走查里手写的模型面调用，键必须在那个动词今天发布的 schema 里。**
//
// 走查用字面量伪造模型的工具调用：
//
//   { type: 'tool', name: 'draft_shots', args: { shots: [{ modelKey: '…' }] } }
//
// 这个字面量**没有任何类型**——它经 IPC 以 JSON 进宿主，TypeScript 看不见它。
// 于是动词改一次名字，走查就静默失配一次：宿主按新名读，读到 undefined，
// 那一步什么也不做，表现为「草稿没有落成 3 个镜头节点」——一个看起来像产品 bug 的现象。
//
// 2026-09-18 实证：PR #814 把模型面四对字段改名（`modelKey→modelId`、`draftId→operationId`、
// `changeId→undoToken`、`revision→baseRevision`）。#814 自己的测试全同步了，
// `tests/ux/golden-path.e2e.mjs:245` 的 `modelKey` 没人管——它在另一条分支上。
// 更阴的是追平 main 那一步：git 把 `draftId` 那行标成了冲突（有人看），
// 把 `modelKey` 那行**自动合并、不报**（没人看）。
//
// **为什么门岗建在这里而不是让编译器管**：走查是 `.mjs`，宿主契约是 Zod schema，
// 中间隔着 JSON 和 IPC——两头都没有共同的静态类型可言。R17 的原话是
// 「能让编译器拦的别留给门岗」；这一处编译器**结构上**拦不住，才轮到门岗。
// （能让编译器拦的那一半已经在做：`cancelJobProjection.ts` 的投影原型，
// 见 `docs/plan/2026-09-18-tool-projection-cancel-job-prototype.md`。）
//
// ── 判据为什么不是「手抄一份字段名单」 ──
//
// 真相源只有一个：`MODEL_FACING_TOOL_SPECS` → `toPublishedJsonSchema()`，
// 也就是**模型此刻真正读到的那份 JSON Schema**。本文件里一个动词名、一个字段名都没写死；
// 调用方把 `schemasByVerb` 传进来。抄一份名单就等于又造一份「不会随注册表更新的副本」——
// 那正是这条门岗要防的病。

import ts from 'typescript'

/** 键路径里表示「数组的每一项」的段。只用于报错信息，不参与匹配。 */
const ITEM = '[]'

/**
 * 顺着 JSON Schema 往下走一层。
 * 返回 `{ schema, open }`：`open` 表示这一层 `additionalProperties: true`（宿主自己允许扩展键）。
 */
function descend(schema, key) {
  if (!schema || typeof schema !== 'object') return undefined
  const node = unwrapUnion(schema)
  if (!node?.properties) return undefined
  const next = node.properties[key]
  return next === undefined ? undefined : unwrapUnion(next)
}

/** `anyOf`/`oneOf` 取第一个带 properties 的分支；没有就原样返回。 */
function unwrapUnion(schema) {
  if (!schema || typeof schema !== 'object') return schema
  const branches = schema.anyOf ?? schema.oneOf
  if (!Array.isArray(branches)) return schema
  return branches.find((branch) => branch && typeof branch === 'object' && branch.properties) ?? schema
}

/** 数组 schema 在键路径上是透明的：`shots` 的子键其实住在 `shots.items` 上。 */
function throughArray(schema) {
  let node = unwrapUnion(schema)
  for (let i = 0; i < 8 && node?.type === 'array' && node.items; i += 1) node = unwrapUnion(node.items)
  return node
}

/**
 * 校验一个字面量 args 对象。递归下探，遇到 `additionalProperties: true` 的层就停（宿主自己开了口子）。
 * 返回违规键路径数组，以及真正比对过的键数（非空转的证据）。
 */
function checkObject(objectLiteral, schema, sourceFile, filePath, verb, out) {
  const node = throughArray(schema)
  if (!node || typeof node !== 'object' || !node.properties) return
  const open = node.additionalProperties === true
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      // 展开（`...args`）与计算键：我们看不见它的键，如实记成「没查」，不假装查过。
      if (ts.isSpreadAssignment(property)) out.skipped.push({ filePath, verb, reason: 'spread' })
      continue
    }
    const name = property.name
    if (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) {
      out.skipped.push({ filePath, verb, reason: 'computed-key' })
      continue
    }
    const key = name.text
    out.checked += 1
    const child = descend(node, key)
    if (child === undefined) {
      if (!open) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(name.getStart(sourceFile))
        out.violations.push({ filePath, line: line + 1, verb, key: [...out.path, key].join('.') })
      }
      continue
    }
    const initializer = ts.isPropertyAssignment(property) ? property.initializer : undefined
    if (!initializer) continue
    for (const nested of objectLiteralsUnder(initializer)) {
      out.path.push(child.type === 'array' || throughArray(child) !== unwrapUnion(child) ? `${key}${ITEM}` : key)
      checkObject(nested, child, sourceFile, filePath, verb, out)
      out.path.pop()
    }
  }
}

/** 一个初始化表达式下面直接挂着的对象字面量（数组字面量透明穿过）。 */
function objectLiteralsUnder(node) {
  if (ts.isObjectLiteralExpression(node)) return [node]
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(objectLiteralsUnder)
  // `SHOTS.map(x => ({...}))`：箭头函数体里的对象字面量也算，它就是每一项的形状。
  if (ts.isCallExpression(node)) return node.arguments.flatMap(objectLiteralsUnder)
  if (ts.isArrowFunction(node)) return objectLiteralsUnder(node.body)
  if (ts.isParenthesizedExpression(node)) return objectLiteralsUnder(node.expression)
  return []
}

/** 从一个对象字面量里取某个属性的初始化表达式。 */
function propertyOf(objectLiteral, key) {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const name = property.name
    if ((ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === key) return property.initializer
  }
  return undefined
}

/**
 * @param files `{ path, text }[]` —— 走查源码
 * @param schemasByVerb `Record<verb, publishedJsonSchema>` —— 模型此刻真正读到的 schema，注册表派生
 */
export function collectWalkthroughToolArgViolations(files, schemasByVerb) {
  const out = { violations: [], skipped: [], checked: 0, sites: 0, path: [] }
  for (const file of files) {
    const sourceFile = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS)
    const visit = (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const nameNode = propertyOf(node, 'name')
        const argsNode = propertyOf(node, 'args')
        if (nameNode && argsNode && ts.isStringLiteral(nameNode)) {
          const verb = nameNode.text
          const schema = schemasByVerb[verb]
          if (schema) {
            if (ts.isObjectLiteralExpression(argsNode)) {
              out.sites += 1
              out.path.length = 0
              checkObject(argsNode, schema, sourceFile, file.path, verb, out)
            } else {
              // `args: createArgs` —— 变量。查不了就记成没查，不算绿。
              out.skipped.push({ filePath: file.path, verb, reason: 'non-literal-args' })
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  const { path: _drop, ...result } = out
  return result
}

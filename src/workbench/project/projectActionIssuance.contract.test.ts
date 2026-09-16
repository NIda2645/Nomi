/**
 * Class regression for "an action re-reads the current project after it started".
 *
 * Structure (key = trusted window + project): project IO authority is issued only by
 * projectCanvasReadSurface.ts (`withProjectAction` for renderer-started actions,
 * `withMainProjectAction` for actions main started on its own trusted input). Downstream helpers
 * only accept the issued ProjectExecutionContext. The compiler already rejects a module-private
 * issuer import and a forgotten required context (see the @ts-expect-error block below, checked by
 * check:test-types). What the compiler cannot see is *when* an entry issues: calling the issuer
 * after an await is the late-binding bug again. This scan pins the remaining shapes.
 */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import type { ProjectCanvasReadSurfaceCoordinator, ProjectExecutionContext } from './projectCanvasReadSurface'

const repoRoot = path.resolve(__dirname, '../../..')
const OWNER = 'src/workbench/project/projectCanvasReadSurface.ts'
const ISSUERS = new Set(['withProjectAction', 'withMainProjectAction'])
const PRIVATE_ISSUER_NAMES = ['captureCurrentProjectExecutionContext', 'projectContextIssuers', 'captureProjectExecutionContext']

function productionSources(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); continue }
      if (!/\.(ts|tsx)$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name) || entry.name.endsWith('.d.ts')) continue
      out.push(full)
    }
  }
  walk(root)
  return out
}

export type IssuanceViolation = { file: string; line: number; rule: string; text: string }

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)
}

/** The context itself (optionally unioned with undefined/null), not a callback that merely receives one. */
function contextType(type: ts.TypeNode | undefined): { nullable: boolean } | null {
  if (!type) return null
  const isContext = (node: ts.TypeNode): boolean =>
    ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text === 'ProjectExecutionContext'
  if (isContext(type)) return { nullable: false }
  if (!ts.isUnionTypeNode(type) || !type.types.some(isContext)) return null
  return { nullable: type.types.some((member) => !isContext(member)) }
}

/** Pure scan so the rule itself can be proven red on a planted violation. */
export function scanProjectActionIssuance(file: string, text: string): IssuanceViolation[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const violations: IssuanceViolation[] = []
  const report = (node: ts.Node, rule: string): void => {
    violations.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, rule, text: node.getText(source).slice(0, 120) })
  }
  const isOwner = file === OWNER
  const visit = (node: ts.Node): void => {
    if (!isOwner && ts.isIdentifier(node) && PRIVATE_ISSUER_NAMES.includes(node.text)) report(node, 'private-issuer-reference')
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ISSUERS.has(node.expression.text) && !isOwner) {
      // Late issuance: an await earlier in the same function body means the action already yielded
      // before it fixed its project, so it would adopt whatever project is current by then.
      let fn: ts.Node | undefined = node.parent
      while (fn && !isFunctionLike(fn)) fn = fn.parent
      if (fn) {
        let awaitedBefore = false
        const findAwait = (inner: ts.Node): void => {
          if (awaitedBefore || inner.getStart(source) >= node.getStart(source)) return
          if (inner !== fn && isFunctionLike(inner)) return
          if (ts.isAwaitExpression(inner) || (ts.isForOfStatement(inner) && inner.awaitModifier)) {
            if (inner.getEnd() <= node.getStart(source)) { awaitedBefore = true; return }
          }
          ts.forEachChild(inner, findAwait)
        }
        ts.forEachChild(fn, findAwait)
        if (awaitedBefore) report(node, 'issued-after-await')
      }
    }
    if (!isOwner && (ts.isParameter(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node))) {
      const context = contextType(node.type)
      const optional = context && (context.nullable || Boolean(node.questionToken) || ('initializer' in node && Boolean(node.initializer)))
      if (optional) report(node, 'optional-project-context')
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return violations
}

describe('project action issuance', () => {
  it('has no private issuer reference, late issuance, or optional context anywhere in production sources', () => {
    const violations = productionSources(path.join(repoRoot, 'src')).flatMap((absolute) => {
      const file = path.relative(repoRoot, absolute).replace(/\\/g, '/')
      return scanProjectActionIssuance(file, fs.readFileSync(absolute, 'utf8'))
    })
    expect(violations).toEqual([])
  })

  it('rejects each planted violation shape', () => {
    const planted = `
      import { withProjectAction, type ProjectExecutionContext } from '../project/projectCanvasReadSurface'
      export async function late(file: File) { await file.arrayBuffer(); return withProjectAction((project) => project) }
      export async function persist(file: File, context?: ProjectExecutionContext) { return file }
      export async function fallback(file: File, context: ProjectExecutionContext | undefined) { return file }
      export type Options = { projectContext?: ProjectExecutionContext }
      export const selfCapture = () => captureCurrentProjectExecutionContext()
      export async function fine(file: File) { return withProjectAction(async (project) => { await file.arrayBuffer(); return project }) }
    `
    expect(scanProjectActionIssuance('src/planted.ts', planted).map((violation) => violation.rule)).toEqual([
      'issued-after-await', 'optional-project-context', 'optional-project-context', 'optional-project-context', 'private-issuer-reference',
    ])
  })
})

// Compile-time half (check:test-types). Each line must stay an error; if a default, optional
// context or exported self-capture comes back, the directive becomes unused and the gate turns red.
type Surface = typeof import('./projectCanvasReadSurface')
type PersistNodeImage = typeof import('../generationCanvas/adapters/persistNodeImage')
type AssetImport = typeof import('../generationCanvas/adapters/assetImportAdapter')
type ClipboardPaste = typeof import('../generationCanvas/adapters/clipboardImagePaste')
type ClipUpload = typeof import('../generationCanvas/nodes/clipNodeUpload')
type Rasterize = typeof import('../generationCanvas/nodes/artifact/rasterizeArtifactToReferenceAsset')
type ShotCuts = typeof import('../generationCanvas/nodes/extractShotCutsToNodes')
// @ts-expect-error the issuer is module-private: business code cannot read "the current project".
export type SelfCapture = Surface['captureCurrentProjectExecutionContext']
// @ts-expect-error the coordinator no longer exposes a capture method either.
export type CoordinatorCapture = ProjectCanvasReadSurfaceCoordinator['captureProjectExecutionContext']
export function forgottenContextsDoNotCompile(
  persist: PersistNodeImage, assetImport: AssetImport, clipboard: ClipboardPaste, clip: ClipUpload,
  rasterize: Rasterize, shotCuts: ShotCuts, file: File, project: ProjectExecutionContext,
): void {
  // @ts-expect-error required context
  void persist.persistNodeImageFile(file, 'node')
  // @ts-expect-error required context
  void persist.persistNodeImageBlob(file, 'node', 'name.png')
  // @ts-expect-error required projectContext
  void assetImport.importLocalMediaFilesToGenerationCanvas([file], { basePosition: { x: 0, y: 0 } })
  // @ts-expect-error required projectContext
  void clipboard.pasteClipboardMediaToGenerationCanvas({ basePosition: { x: 0, y: 0 } })
  // @ts-expect-error required context (the project id derives from it)
  void clip.importClipNodeAsset(file, 'project-id')
  // @ts-expect-error required project
  void rasterize.rasterizeArtifactToReferenceAsset({ fileType: 'svg', url: 'nomi-local://a.svg' })
  // @ts-expect-error required project
  void shotCuts.extractShotCutsToNodes({ reportFeedback: () => undefined, node: {} as never, seconds: [1] })
  void persist.persistNodeImageFile(file, 'node', project)
}

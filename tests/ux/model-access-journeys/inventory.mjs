import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

function sourceFile(repoRoot, relativePath) {
  const file = path.join(repoRoot, relativePath)
  const text = fs.readFileSync(file, 'utf8')
  return {
    file,
    text,
    ast: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS),
  }
}

function typeAlias(ast, name) {
  const declaration = ast.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === name)
  if (!declaration) throw new Error(`Production type alias not found: ${name}`)
  return declaration.type
}

function stringLiterals(node) {
  const values = new Set()
  const visit = (current) => {
    if (ts.isLiteralTypeNode(current) && ts.isStringLiteral(current.literal)) values.add(current.literal.text)
    ts.forEachChild(current, visit)
  }
  visit(node)
  return [...values].sort()
}

function propertyStringLiterals(node, propertyName) {
  const values = new Set()
  const visit = (current) => {
    if (ts.isPropertySignature(current) && current.name?.getText().replaceAll(/['"]/g, '') === propertyName && current.type) {
      for (const value of stringLiterals(current.type)) values.add(value)
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return [...values].sort()
}

// Reads the string members of an exported `const NAME = [...] as const` array.
// The model-access enums that runtime types now derive from live as these
// const arrays in electron/shared/modelAccessCapabilities.ts, so the inventory
// reads them from that production owner instead of a handwritten union.
function exportedConstArrayLiterals(ast, exportName) {
  let target = null
  const visit = (node) => {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === exportName) target = declaration.initializer
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!target) throw new Error(`Production const array not found: ${exportName}`)
  // `[...] as const` wraps the array literal in an `as` expression.
  const arrayNode = ts.isAsExpression(target) ? target.expression : target
  if (!ts.isArrayLiteralExpression(arrayNode)) throw new Error(`Production const is not an array literal: ${exportName}`)
  const values = new Set()
  for (const element of arrayNode.elements) {
    if (ts.isStringLiteral(element)) values.add(element.text)
  }
  return [...values].sort()
}

function renderedLocalComponents(drawer) {
  const imports = new Map()
  for (const statement of drawer.ast.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const moduleName = statement.moduleSpecifier.text
    if (!moduleName.startsWith('./')) continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) imports.set(element.name.text, moduleName)
  }

  const rendered = new Set()
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = node.tagName.getText()
      if (imports.has(name)) rendered.add(name)
    }
    ts.forEachChild(node, visit)
  }
  visit(drawer.ast)
  return [...rendered].sort()
}

function providerPresetClasses(presets) {
  const classes = []
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const fields = Object.fromEntries(node.properties.flatMap((property) => {
        if (!ts.isPropertyAssignment(property)) return []
        const name = property.name.getText().replaceAll(/['"]/g, '')
        if (!['id', 'providerKind', 'group'].includes(name) || !ts.isStringLiteral(property.initializer)) return []
        return [[name, property.initializer.text]]
      }))
      if (fields.id && fields.providerKind) classes.push(fields)
    }
    ts.forEachChild(node, visit)
  }
  visit(presets.ast)
  return classes.sort((a, b) => a.id.localeCompare(b.id))
}

function archetypeModeShapes(repoRoot) {
  const dir = path.join(repoRoot, 'src/config/modelArchetypes')
  const source = fs.readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'types.ts')
    .map((name) => fs.readFileSync(path.join(dir, name), 'utf8'))
    .join('\n')
  const checks = {
    'input-key': /\binputKey\s*:/.test(source),
    'single-value': /\basArray\s*:\s*false/.test(source),
    'array-value': /\basArray\s*:\s*true/.test(source),
    'character-indexed': /\bcharacterIndexed\s*:\s*true/.test(source),
    'vendor-params': /\bvendorParams\s*:/.test(source),
    'model-enum': /\bmodelEnum\s*:/.test(source),
    'combine-role-array': /\bcombineSlotsInto\s*:\s*\{(?![^}]*\bflat\s*:\s*true)[^}]*\}/s.test(source),
    'combine-flat-array': /\bcombineSlotsInto\s*:\s*\{[^}]*\bflat\s*:\s*true[^}]*\}/s.test(source),
    'fixed-params': /\bfixedParams\s*:/.test(source),
    variant: /\bvariants\s*:/.test(source),
  }
  return Object.entries(checks).filter(([, present]) => present).map(([shape]) => shape).sort()
}

export function scanProductionInventory(repoRoot) {
  const catalog = sourceFile(repoRoot, 'electron/catalog/types.ts')
  const capabilities = sourceFile(repoRoot, 'electron/shared/modelAccessCapabilities.ts')
  const videoCaps = sourceFile(repoRoot, 'electron/shared/videoCapabilities/types.ts')
  const results = sourceFile(repoRoot, 'src/workbench/generationCanvas/model/generationCanvasTypes.ts')
  const drawer = sourceFile(repoRoot, 'src/ui/onboarding/OnboardingDrawer.tsx')
  const presets = sourceFile(repoRoot, 'src/ui/onboarding/providerPresets.ts')

  return Object.freeze({
    // billing/task/provider/auth runtime unions now derive from these const
    // arrays (electron/shared/modelAccessCapabilities.ts); read them there.
    billingKinds: exportedConstArrayLiterals(capabilities.ast, 'BILLING_MODEL_KINDS'),
    taskKinds: exportedConstArrayLiterals(capabilities.ast, 'PROFILE_KINDS'),
    providers: exportedConstArrayLiterals(capabilities.ast, 'AI_SDK_PROVIDER_KINDS'),
    auth: exportedConstArrayLiterals(capabilities.ast, 'VENDOR_AUTH_TYPES'),
    // AssetIngestion.strategy is still an inline discriminated union in the
    // catalog; read it straight from production so a new strategy without a
    // journey is caught here.
    ingestion: propertyStringLiterals(typeAlias(catalog.ast, 'AssetIngestion'), 'strategy'),
    // Reference-slot vocabulary is owned by videoCapabilities/types.ts.
    slots: stringLiterals(typeAlias(videoCaps.ast, 'ArchetypeReferenceSlotKind')),
    outputs: stringLiterals(typeAlias(results.ast, 'GenerationResultType')),
    modeShapes: archetypeModeShapes(repoRoot),
    entryComponents: renderedLocalComponents(drawer),
    providerPresets: providerPresetClasses(presets),
  })
}

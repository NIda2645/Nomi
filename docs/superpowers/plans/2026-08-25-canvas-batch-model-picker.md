# Canvas Batch Model Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bottom “Generate all” dock expose the same per-execution-kind model picker as the multi-selection toolbar, and make that choice apply to the current canvas category when no nodes are selected.

**Architecture:** Centralize the distinction between an explicit node selection and the active-category scope in `canvasProductionScope.ts`. The production hook will derive both model groups and model-change targets from that scope; the dock and selection toolbar will reuse one `CanvasBulkModelSelect` component so the two entry points cannot drift again. Generation eligibility remains status-based (`idle`/`error`), while model changes preserve the current selection semantics and target all unlocked nodes in the active scope.

**Tech Stack:** React 18, TypeScript, Zustand canvas store, Vitest, Playwright/Electron UX walk.

---

### Task 1: Add the production-scope contract and failing unit tests

**Files:**
- Modify: `src/workbench/generationCanvas/components/canvasProductionScope.test.ts`
- Modify: `src/workbench/generationCanvas/components/canvasProductionScope.ts`
- Modify: `src/workbench/generationCanvas/components/useCanvasProductionActions.ts`

- [x] **Step 1: Write the failing tests**

  Extend `canvasProductionScope.test.ts` with a scope helper test proving that an explicit selection wins over category scope and that no selection resolves to the active category:

  ```ts
  it('resolves the selected-node scope or the active category scope', () => {
    const nodes = [
      node('shot-a', 'image', 'idle', 'shots'),
      node('shot-b', 'video', 'success', 'shots'),
      node('scene-a', 'image', 'idle', 'scene'),
    ]

    expect(nodesInCanvasProductionScope(nodes, { categoryId: 'shots' }).map((item) => item.id))
      .toEqual(['shot-a', 'shot-b'])
    expect(nodesInCanvasProductionScope(nodes, { nodeIds: ['scene-a'] }).map((item) => item.id))
      .toEqual(['scene-a'])
  })
  ```

  Add a regression assertion that grouping the active-category scope still exposes the image execution group even when `selectedNodeIds` is empty. This is the pure contract the hook will consume.

- [x] **Step 2: Run the focused test and verify it fails**

  Run:

  ```bash
  pnpm exec vitest run src/workbench/generationCanvas/components/canvasProductionScope.test.ts
  ```

  Expected: FAIL because `nodesInCanvasProductionScope` does not exist yet.

- [x] **Step 3: Implement the smallest scope helper**

  Add:

  ```ts
  export type CanvasGenerationScope = { categoryId?: string; nodeIds?: readonly string[] }

  export function nodesInCanvasProductionScope(
    nodes: readonly GenerationCanvasNode[],
    scope: CanvasGenerationScope = {},
  ): GenerationCanvasNode[] {
    const scopedIds = scope.nodeIds ? new Set(scope.nodeIds) : null
    return nodes.filter((node) => {
      if (scope.categoryId && (node.categoryId || 'shots') !== scope.categoryId) return false
      if (scopedIds && !scopedIds.has(node.id)) return false
      return true
    })
  }
  ```

  Refactor `eligibleGenerationNodeIds` to use this helper so eligibility and model changes share the exact same scope predicate.

- [x] **Step 4: Run the focused test and verify it passes**

  Run the same Vitest command. Expected: all scope tests pass.

### Task 2: Make the production hook scope model groups and writes consistently

**Files:**
- Modify: `src/workbench/generationCanvas/components/useCanvasProductionActions.ts`
- Test: `src/workbench/generationCanvas/components/canvasProductionScope.test.ts`

- [x] **Step 1: Write the failing behavior assertion**

  Add a pure test fixture assertion for the no-selection scope: `groupGenerationNodesByExecutionKind(nodesInCanvasProductionScope(nodes, { categoryId: 'shots' }))` must return the image group for `shot-a`. Keep the existing locked-node filtering in the hook, not in the general grouping helper.

- [x] **Step 2: Run the focused test and verify it fails**

  Run the focused Vitest command and confirm the new expectation fails against the current empty-selection wiring.

- [x] **Step 3: Implement the shared scope in the hook**

  In `useCanvasProductionActions`, derive:

  ```ts
  const productionScope = React.useMemo(
    () => selectedNodeIds.length > 0
      ? { nodeIds: selectedNodeIds }
      : { categoryId: activeCategoryId },
    [activeCategoryId, selectedNodeIds],
  )
  const scopedNodes = React.useMemo(
    () => nodesInCanvasProductionScope(nodes, productionScope),
    [nodes, productionScope],
  )
  ```

  Use `productionScope` for `eligibleIds`, and derive `executionGroups` from `scopedNodes.filter((node) => !node.locked)`.

  In `applyModel`, replace the empty-selection-dependent `new Set(selectedNodeIds)` filter with `nodesInCanvasProductionScope(state.nodes, productionScope)`, then keep the existing execution-kind and unlocked filters, `buildNodeModelChangePatch`, persistence, and undo toast unchanged.

- [x] **Step 4: Run the focused tests and verify they pass**

  Run:

  ```bash
  pnpm exec vitest run src/workbench/generationCanvas/components/canvasProductionScope.test.ts src/workbench/generationCanvas/nodes/buildNodeModelChangePatch.test.ts
  ```

### Task 3: Extract and reuse the bulk model picker UI

**Files:**
- Create: `src/workbench/generationCanvas/components/CanvasBulkModelSelect.tsx`
- Modify: `src/workbench/generationCanvas/components/CanvasSelectionToolbar.tsx`
- Modify: `src/workbench/generationCanvas/components/CanvasBatchGenerateDock.tsx`

- [x] **Step 1: Extract the existing picker without changing behavior**

  Move the current `BulkModelSelect` implementation and its callback input type into `CanvasBulkModelSelect.tsx`. Export `CanvasApplyModelInput` and `CanvasBulkModelSelect`. Keep `useGenerationModelOptionsState`, `useDedupedModelSelect`, the execution-kind label, empty-options behavior, and `NomiSelect` configuration identical.

- [x] **Step 2: Replace the selection-toolbar local implementation**

  Remove the local picker and render:

  ```tsx
  {executionGroups.map((group) => (
    <CanvasBulkModelSelect key={group.executionKind} group={group} onApplyModel={onApplyModel} />
  ))}
  ```

  Preserve all selection-toolbar actions and labels.

- [x] **Step 3: Add model groups to the bottom dock**

  Extend `CanvasBatchGenerateDock` props with `executionGroups` and `onApplyModel`, then render the same shared picker before the “Generate all” button. Add horizontal overflow handling to the existing dock so multiple execution groups remain reachable without covering the canvas.

- [x] **Step 4: Run type-focused tests**

  Run:

  ```bash
  pnpm exec vitest run src/workbench/common/useDedupedModelSelect.test.ts src/workbench/generationCanvas/components/canvasProductionScope.test.ts
  pnpm run typecheck
  ```

### Task 4: Add a real no-selection regression journey

**Files:**
- Modify: `tests/ux/canvas-batch-production.walk.mjs`

- [x] **Step 1: Add the no-selection model assertion before Generate all**

  After the existing `generateAll` locator is ready and before clicking it, select the image model through the new `图片 ×2` aria label, then assert the persisted project nodes use `IMAGE_B`. Keep the existing concurrency, spend-cancel, dependency-order, and mixed-selection checks.

- [x] **Step 2: Run the Electron journey**

  Run:

  ```bash
  node tests/ux/canvas-batch-production.walk.mjs
  ```

  Expected: the real bottom dock exposes the image model picker, the project file records the selected model before generation, and the existing batch flow remains green with zero vendor calls after spend cancellation.

### Task 5: Full verification and delivery

**Files:**
- Modify only the scoped files above plus the implementation plan.

- [x] **Step 1: Run targeted tests**

  ```bash
  pnpm exec vitest run src/workbench/generationCanvas/components/canvasProductionScope.test.ts src/workbench/common/useDedupedModelSelect.test.ts src/workbench/generationCanvas/nodes/buildNodeModelChangePatch.test.ts
  ```

- [x] **Step 2: Run project gates**

  ```bash
  pnpm run check:filesize
  pnpm run check:tokens
  pnpm run check:i18n
  pnpm run lint:ci
  pnpm run typecheck
  pnpm run test
  pnpm run build
  ```

- [x] **Step 3: Review the real journey artifacts**

  Confirm the light/dark screenshots show the dock model picker, the picker does not replace the Generate all action, and no unexpected console/page errors were emitted.

- [x] **Step 4: Commit the scoped implementation**

  ```bash
  git add docs/superpowers/plans/2026-08-25-canvas-batch-model-picker.md \
    src/workbench/generationCanvas/components/canvasProductionScope.ts \
    src/workbench/generationCanvas/components/canvasProductionScope.test.ts \
    src/workbench/generationCanvas/components/useCanvasProductionActions.ts \
    src/workbench/generationCanvas/components/CanvasBulkModelSelect.tsx \
    src/workbench/generationCanvas/components/CanvasSelectionToolbar.tsx \
    src/workbench/generationCanvas/components/CanvasBatchGenerateDock.tsx \
    tests/ux/canvas-batch-production.walk.mjs
  git commit -m "fix(canvas): allow model selection from generate-all dock"
  ```

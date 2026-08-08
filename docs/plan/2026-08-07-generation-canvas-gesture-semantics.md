# Generation Canvas Gesture Semantics Implementation Plan

> ⛔ **手势结论已于 2026-08-08 被用户真机推翻**，现行契约见
> [2026-08-08-canvas-drag-pan-and-quiet-render.md](2026-08-08-canvas-drag-pan-and-quiet-render.md)：
> 空白左键拖=**平移**，Shift+左键拖=框选（追加）。本文其余成果（显式平移和弦保连线、
> 上下文帮助面板替代常驻提示、纯模型仲裁 `canvasPointerGestureModel`）仍然有效并被继续使用。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the generation canvas selection-first: blank primary drag box-selects, explicit pan chords preserve in-progress connections, and contextual help replaces the persistent hint.

**Architecture:** A small pure gesture model becomes the shared truth for pointer arbitration, drag thresholds, and connection-ending buttons. Existing hooks keep transient React state but delegate semantic decisions to that model. A second pure model describes the help rows; the navigation UI renders it through the existing design-system tooltip and a local popover without adding a global store or dependency.

**Tech Stack:** React 18, TypeScript, Vitest, Zustand-backed canvas state, Tailwind tokens, Radix Tooltip, Tabler icons, i18next.

---

## File map

- Create `src/workbench/generationCanvas/components/canvasPointerGestureModel.ts`: pure pointer arbitration, threshold, and connection pointer-up rules.
- Create `src/workbench/generationCanvas/components/canvasPointerGestureModel.test.ts`: exhaustive gesture truth table.
- Modify `src/workbench/generationCanvas/components/useCanvasViewportGestures.ts`: explicit-pan-only viewport gestures; no connection cancellation; cleanup on cancel/blur.
- Modify `src/workbench/generationCanvas/components/useMarqueeSelection.ts`: primary blank drag, replace/add modes, blank-click clear, Escape/cancel cleanup.
- Modify `src/workbench/generationCanvas/components/useCanvasPointerInteractions.ts`: one composition point for pan/marquee events and pointer cancellation.
- Create `src/workbench/generationCanvas/components/useCanvasContextNodeMenu.ts`: defer blank-canvas context menus until the pointer gesture resolves, including macOS Ctrl-click.
- Modify `src/workbench/generationCanvas/components/useDragToConnect.ts`: only primary-button pointer-up can finish a connection.
- Create `src/workbench/generationCanvas/components/canvasControlsHelpModel.ts`: platform- and gesture-scheme-aware help rows.
- Create `src/workbench/generationCanvas/components/canvasControlsHelpModel.test.ts`: Mac/Windows and mouse/trackpad truth tables.
- Create `src/workbench/generationCanvas/components/CanvasNavigationTooltipButton.tsx`: styled tooltip wrapper for icon-only navigation buttons.
- Create `src/workbench/generationCanvas/components/CanvasControlsHelpPopover.tsx`: keyboard-icon help entry with outside-click/Escape behavior.
- Modify `src/workbench/generationCanvas/components/CanvasNavigationStack.tsx`: use styled tooltips and mount the help popover.
- Modify `src/workbench/generationCanvas/components/GenerationCanvas.tsx`: remove the persistent hint and wire pointer cancellation.
- Delete `src/workbench/generationCanvas/components/CanvasGestureHint.tsx`: remove the superseded persistent implementation.
- Modify `src/workbench/onboarding/onboardingState.ts`: remove dead gesture-hint persistence.
- Modify `src/i18n/locales/generationCommon.ts`: replace old hint strings with bilingual navigation/help strings.
- Modify `src/i18n/locales/settings.ts`: keep the existing wheel-preference explanation aligned with selection-first gestures.
- Modify `src/workbench/generationCanvas/styles/generationCanvas.css`: remove the superseded hint selector and update the gesture comment.
- Modify `src/workbench/generationCanvas/components/canvasGesturePreference.ts`: keep the preference contract comment aligned with the implemented gestures.
- Modify `src/vendor/tablerIcons.ts`: expose the keyboard icon through the runtime icon allowlist.
- Modify `tests/ux/smoke.e2e.mjs`: use the production Scene3D coach value so the verification journey is deterministic.
- Create `src/workbench/generationCanvas/components/canvasControlsStructure.test.ts`: structural regression assertions for removed fallback and mounted help.

### Task 1: Lock pointer arbitration in a pure model

**Files:**
- Create: `src/workbench/generationCanvas/components/canvasPointerGestureModel.test.ts`
- Create: `src/workbench/generationCanvas/components/canvasPointerGestureModel.ts`

- [x] **Step 1: Write the failing gesture truth-table tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  canvasDragExceededThreshold,
  resolveCanvasPointerDownAction,
  shouldFinishCanvasConnection,
} from './canvasPointerGestureModel'

describe('generation canvas pointer arbitration', () => {
  it('gives blank primary drag to marquee with or without Shift', () => {
    expect(resolveCanvasPointerDownAction({ button: 0, spaceHeld: false, interactiveTarget: false, readOnly: false })).toBe('marquee')
  })

  it.each([1, 2])('gives button %s to explicit pan', (button) => {
    expect(resolveCanvasPointerDownAction({ button, spaceHeld: false, interactiveTarget: true, readOnly: false })).toBe('pan')
  })

  it('gives Space + primary drag to explicit pan over nodes', () => {
    expect(resolveCanvasPointerDownAction({ button: 0, spaceHeld: true, interactiveTarget: true, readOnly: false })).toBe('pan')
  })

  it('ignores ordinary primary down on controls and read-only blank space', () => {
    expect(resolveCanvasPointerDownAction({ button: 0, spaceHeld: false, interactiveTarget: true, readOnly: false })).toBe('ignore')
    expect(resolveCanvasPointerDownAction({ button: 0, spaceHeld: false, interactiveTarget: false, readOnly: true })).toBe('ignore')
  })

  it('uses the shared four-pixel threshold', () => {
    expect(canvasDragExceededThreshold(0, 0, 3, 3)).toBe(false)
    expect(canvasDragExceededThreshold(0, 0, 4, 0)).toBe(true)
  })

  it('only lets primary pointer-up finish a connection', () => {
    expect(shouldFinishCanvasConnection(0)).toBe(true)
    expect(shouldFinishCanvasConnection(1)).toBe(false)
    expect(shouldFinishCanvasConnection(2)).toBe(false)
  })
})
```

- [x] **Step 2: Run the new test and verify RED**

Run: `pnpm exec vitest run src/workbench/generationCanvas/components/canvasPointerGestureModel.test.ts`

Expected: FAIL because `canvasPointerGestureModel` does not exist.

- [x] **Step 3: Implement the minimal pure model**

```ts
export const CANVAS_DRAG_THRESHOLD = 4
export type CanvasPointerDownAction = 'pan' | 'marquee' | 'ignore'

export function resolveCanvasPointerDownAction(input: {
  button: number
  spaceHeld: boolean
  interactiveTarget: boolean
  readOnly: boolean
}): CanvasPointerDownAction {
  if (input.spaceHeld || input.button === 1 || input.button === 2) return 'pan'
  if (input.button !== 0 || input.interactiveTarget || input.readOnly) return 'ignore'
  return 'marquee'
}

export function canvasDragExceededThreshold(startX: number, startY: number, x: number, y: number): boolean {
  return Math.abs(x - startX) >= CANVAS_DRAG_THRESHOLD || Math.abs(y - startY) >= CANVAS_DRAG_THRESHOLD
}

export function shouldFinishCanvasConnection(button: number): boolean {
  return button === 0
}
```

- [x] **Step 4: Run the test and verify GREEN**

Run: `pnpm exec vitest run src/workbench/generationCanvas/components/canvasPointerGestureModel.test.ts`

Expected: PASS with 0 failures.

### Task 2: Make selection primary and pan connection-safe

**Files:**
- Modify: `src/workbench/generationCanvas/components/useCanvasViewportGestures.ts`
- Modify: `src/workbench/generationCanvas/components/useMarqueeSelection.ts`
- Modify: `src/workbench/generationCanvas/components/useCanvasPointerInteractions.ts`
- Modify: `src/workbench/generationCanvas/components/useDragToConnect.ts`

- [x] **Step 1: Add failing structural regression assertions**

Create the first half of `canvasControlsStructure.test.ts` using `readFileSync` to assert that viewport gestures no longer accept/call `cancelConnection`, drag-to-connect calls `shouldFinishCanvasConnection(event.button)`, and pointer interactions expose `onPointerCancel`.

- [x] **Step 2: Run the structural test and verify RED**

Run: `pnpm exec vitest run src/workbench/generationCanvas/components/canvasControlsStructure.test.ts`

Expected: FAIL on the existing `cancelConnection()` side effect and missing pointer-cancel wiring.

- [x] **Step 3: Route only explicit chords to viewport panning**

Use `resolveCanvasPointerDownAction` inside capture handling. Delete the bubble-phase blank-primary `beginPan` path, delete `cancelConnection` and `pendingConnectionSourceId` from the viewport hook contract, and reuse `canvasDragExceededThreshold` for context-menu suppression.

- [x] **Step 4: Move blank primary click/drag ownership to marquee**

Start marquee for every editable blank primary down. Store `additive: event.shiftKey` in the drag session; on drag completion pass that flag to `selectNodesInRect`; on an unmoved non-additive click call `clearSelection`. Add Escape, blur, and pointer-cancel cleanup without changing node/group hit rules.

- [x] **Step 5: Keep secondary pan from finishing a connection**

At the start of the document `pointerup` handler in `useDragToConnect`, return unless `shouldFinishCanvasConnection(event.button)` is true. This leaves the pending source and preview intact when middle/right pan ends.

- [x] **Step 6: Wire pointer cancellation through the composition hook**

Expose `onPointerCancel` from `useCanvasPointerInteractions`, invoke both transient-state owners, and attach it to the stage in `GenerationCanvas`.

- [x] **Step 7: Run focused pointer tests and verify GREEN**

Run: `pnpm exec vitest run src/workbench/generationCanvas/components/canvasPointerGestureModel.test.ts src/workbench/generationCanvas/components/canvasControlsStructure.test.ts`

Expected: PASS with 0 failures.

### Task 3: Define the operation-help truth source

**Files:**
- Create: `src/workbench/generationCanvas/components/canvasControlsHelpModel.test.ts`
- Create: `src/workbench/generationCanvas/components/canvasControlsHelpModel.ts`

- [x] **Step 1: Write failing Mac/Windows and scheme tests**

Test that all models contain `selection`, `pan`, `zoom`, and `node` sections; `wheel-zoom` describes bare-wheel zoom; `modifier-zoom` describes wheel/two-finger pan plus modified-wheel/pinch zoom; and the displayed modifier is `⌘` on Mac and `Ctrl` elsewhere.

- [x] **Step 2: Run the new test and verify RED**

Run: `pnpm exec vitest run src/workbench/generationCanvas/components/canvasControlsHelpModel.test.ts`

Expected: FAIL because the model does not exist.

- [x] **Step 3: Implement immutable help descriptors**

Export `canvasControlsHelpSections(scheme, platform)` returning translation-key descriptors only. Keep display strings in i18n and derive `{mod}` from `isMacCanvasPlatform(platform)`; do not duplicate complete help panels per scheme.

- [x] **Step 4: Run the model test and verify GREEN**

Run: `pnpm exec vitest run src/workbench/generationCanvas/components/canvasControlsHelpModel.test.ts`

Expected: PASS with 0 failures.

### Task 4: Replace persistent hints with contextual help and styled tooltips

**Files:**
- Create: `src/workbench/generationCanvas/components/CanvasNavigationTooltipButton.tsx`
- Create: `src/workbench/generationCanvas/components/CanvasControlsHelpPopover.tsx`
- Modify: `src/workbench/generationCanvas/components/CanvasNavigationStack.tsx`
- Modify: `src/workbench/generationCanvas/components/GenerationCanvas.tsx`
- Delete: `src/workbench/generationCanvas/components/CanvasGestureHint.tsx`
- Modify: `src/workbench/onboarding/onboardingState.ts`
- Modify: `src/i18n/locales/generationCommon.ts`
- Modify: `src/i18n/locales/settings.ts`
- Modify: `src/workbench/generationCanvas/styles/generationCanvas.css`
- Modify: `src/workbench/generationCanvas/components/canvasGesturePreference.ts`
- Modify: `src/vendor/tablerIcons.ts`
- Modify: `src/workbench/generationCanvas/components/canvasControlsStructure.test.ts`

- [x] **Step 1: Extend the structural test and verify RED**

Assert that `GenerationCanvas` no longer imports/renders `CanvasGestureHint`, `CanvasNavigationStack` renders `CanvasControlsHelpPopover`, and every icon action goes through `CanvasNavigationTooltipButton` or the help component.

- [x] **Step 2: Add the shared navigation tooltip button**

Wrap `WorkbenchButton` with existing design-system `Tooltip`, `TooltipTrigger`, and `TooltipContent`; preserve `aria-label`; use a wrapper trigger when disabled so the reason remains hoverable.

- [x] **Step 3: Add the keyboard help popover**

Render `IconKeyboard` in the same navigation control cluster. Open a token-only panel above the button, render model sections, close on outside pointer-down or Escape, return focus after Escape, and stop panel pointer events from reaching canvas gestures.

- [x] **Step 4: Convert navigation icons to styled tooltips**

Replace native `title` usage for fit, reset, tidy, and minimap with the shared tooltip button. Preserve independent `aria-label`, disabled reasons, and pressed state.

- [x] **Step 5: Delete the superseded persistent path**

Remove the `CanvasGestureHint` import/render/file and delete its now-dead localStorage key/functions from onboarding state. No fallback hint remains.

- [x] **Step 6: Add bilingual help and tooltip copy**

Replace `gestureHint` resources with `controlsHelp` section/action/shortcut keys and add `navigation.canvasControls`. Use interpolation for the platform modifier; keep all visible text inside `zh-CN` and `en` resources.

- [x] **Step 7: Run focused tests and checks**

Run: `pnpm exec vitest run src/workbench/generationCanvas/components/canvasControlsHelpModel.test.ts src/workbench/generationCanvas/components/canvasControlsStructure.test.ts`

Run: `pnpm run check:tokens && pnpm run check:i18n && pnpm run typecheck`

Expected: all commands exit 0.

### Task 5: Verify behavior and visual parity

**Files:**
- Modify only if a failing verification reveals an in-scope defect.
- Modify `tests/ux/smoke.e2e.mjs` only if its isolated setup blocks the real journey.

- [x] **Step 1: Run all focused generation-canvas tests**

Run: `pnpm exec vitest run src/workbench/generationCanvas/components src/workbench/generationCanvas/nodes/completeNodeConnection.test.ts`

Expected: PASS with 0 failures.

- [x] **Step 2: Run the full gate suite**

Run: `pnpm run gates`

Expected: all repository gates exit 0 and `.claude/.gates-ok` is written.

- [x] **Step 3: Run the real canvas journey**

Start the renderer/Electron development entry, open a real generation canvas, and verify: blank primary drag replaces selection; Shift-drag adds; Space/middle/right drag pans without marquee; right click without drag still opens the menu; a pending connection survives right-button pan; the keyboard icon opens/closes help; every bottom-left icon exposes a styled name on hover/focus.

- [x] **Step 4: Capture and inspect light/dark screenshots**

Capture the actual generation-canvas entry in both themes. Inspect the images directly against the approved companion: no persistent pill, one keyboard icon in the navigation cluster, compact panel above it, no V/H tool mode, and no visual token drift.

- [x] **Step 5: Review the diff against the specification**

Run: `git diff --check && git status --short && git diff --stat && rg -n "CanvasGestureHint|hasSeenCanvasGestureHint|markCanvasGestureHintSeen" src`

Expected: no whitespace errors; only planned files changed; the final `rg` has no matches.

### Task 6: Land the isolated change on main

**Files:**
- Commit all planned source, test, i18n, and plan files.

- [x] **Step 1: Commit after fresh verification**

```bash
git add docs/plan/2026-08-07-generation-canvas-gesture-semantics.md \
  src/workbench/generationCanvas/components \
  src/workbench/generationCanvas/styles/generationCanvas.css \
  src/workbench/onboarding/onboardingState.ts \
  src/i18n/locales/generationCommon.ts \
  src/i18n/locales/settings.ts \
  src/vendor/tablerIcons.ts \
  tests/ux/smoke.e2e.mjs \
  public/tailwind.generated.css
git commit -m "feat(canvas): make selection the primary gesture"
```

- [x] **Step 2: Re-fetch and verify the integration base**

Run: `git fetch origin main && git merge-base --is-ancestor origin/main HEAD`

Expected: exit 0; otherwise rebase/cherry-pick in a fresh detached worktree and rerun gates.

- [x] **Step 3: Push the verified detached worktree to main**

Run: `git push origin HEAD:main`

Expected: remote `main` advances to the verified commit.

## Self-review record

- Spec coverage: all selection, explicit pan, connection preservation, existing zoom scheme, persistent-hint deletion, tooltip, i18n, accessibility, cleanup, and real-journey requirements map to Tasks 1–5.
- Scope: no V/H mode, no new preference, no global store, no model/data/export changes, and no other canvas is touched.
- Type consistency: `CanvasPointerDownAction`, `CanvasGestureScheme`, help descriptor keys, and pointer-cancel handlers each have one declared source and one spelling throughout the plan.
- Placeholder scan: no deferred implementation markers or unspecified error-handling steps remain.

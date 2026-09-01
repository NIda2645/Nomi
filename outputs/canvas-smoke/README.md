# canvas PR216 review — smoke failure capture (2026-08-28)

Raw evidence recovered from the PR #216 (`codex/canvas-stack-finish-20260828`) review run,
executed in worktree `Nomi-pr216-review-20260828` against a built Electron `dist`.

- `failure.json` — `smoke.e2e.mjs` boundingBox timeout waiting for the composer card, with the
  captured renderer diagnostics: **Minified React error #185** (an update-on-unmounted /
  re-entrant `setNodes` loop) thrown at the `React Flow 画布` chunk boundary during
  `GenerationCanvasReactFlow` node projection, plus WASM single-thread fallback warnings and the
  debug counters (68 canvas renders, 56 node projections, repeated 620-char prompt updates) that
  characterize the loop. This is the failing-state signal that motivated the PR216 canvas fixes.
- `failure.png` — screenshot at the moment of the timeout.

## Relationship to `outputs/canvas-card-stack-20260827/`

This branch was recovered as "canvas PR216 evidence" and originally re-shipped the full
card-stack walkthrough. The card-stack acceptance screenshots and the 21-check
`walk-report.json` were already landed on `main` by PR #260
(`test: recover canvas card stack evidence`, commit `b185ff99`), so those duplicates were
dropped here. What this branch keeps is only the evidence `main` does not already carry:

- `outputs/canvas-smoke/failure.{json,png}` — the PR216 smoke-failure capture above (absent on main).
- `outputs/canvas-card-stack-20260827/06-real-project-switch-sidebar-collapsed.png` — a
  project-switch / sidebar-auto-collapse screenshot absent on main.
- `outputs/canvas-card-stack-20260827/walk-report-pr216.json` — a **36-check superset** of
  main's 21-check `walk-report.json`. It re-covers all of main's card-stack checks and adds 15
  more (history image preview load / download entry / non-empty download, delete-history keeps
  other versions, version tray avoids viewport edge, hover video real playback element / default
  mute / leave-resets-to-start / native controls, reopen-keeps-history, asset library panel
  visible after expand, sidebar auto-collapse on project switch, return-to-library shows both
  projects). Named `-pr216` so it sits alongside main's `walk-report.json` instead of replacing it.

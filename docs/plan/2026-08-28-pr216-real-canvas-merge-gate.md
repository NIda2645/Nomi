# PR 216 real-canvas merge gate

> 状态：🚧 进行中

## Objective

Treat PR 216 as a canvas-engine migration rather than a collection of isolated
component changes. The merge gate must prove that the production Electron app
can create, render, edit, persist, and reopen the migrated canvas through real
pointer and keyboard interactions.

## Scope

- Fix regressions found while exercising PR 216 from the project library into
  the production React Flow canvas.
- Keep Zustand/project snapshots as the only persisted canvas truth.
- Make React Flow the only owner of node placement, drag, connection, and
  resize controls while a node is mounted in the React Flow renderer.
- Add a required, repeatable real-canvas CI stage with inspectable screenshots
  and a machine-readable suite summary.
- Run the broader canvas acceptance set and a medium-canvas performance pass
  locally before merge.

## Do not change

- Provider/model request contracts or generation spending behavior.
- Persisted node, edge, group, or project schemas.
- Unrelated application surfaces or open pull requests beyond PR 201 and PR
  203, which PR 216 explicitly supersedes.
- The approved card-stack visual design except where a real walkthrough proves
  a functional regression.

## Test system

| Layer | Purpose | Required evidence |
|---|---|---|
| Store and adapter contracts | Lock graph, history, selection, projection, and path invariants | Focused Vitest suite |
| Production-entry smoke | Prove project library -> workbench -> add node -> visible composer in the built app | Electron assertions plus failure screenshot/diagnostics |
| Critical real-canvas CI | Exercise pan/drag/selection, group ports, result stacks, persistence, project switch, and read-only reload | Required Linux CI stage with screenshots and JSON summary |
| Full pre-merge acceptance | Cover shortcuts, context menus, batch production, group semantics, landing/reconcile, and medium-canvas responsiveness | Local Electron suite and inspected screenshots/performance JSON |

The critical suite must run after the production build and must fail closed if
any child walkthrough exits non-zero. It is not a source scan and does not call
the canvas store as a substitute for user interaction.

## Root-cause hypothesis

The CI smoke creates a node successfully but never finds its composer. React
Flow already positions the outer node from `node.position`, while the legacy
`BaseGenerationNode` wrapper still applies its own absolute translation. This
double placement can leave the real card/composer outside the visible stage.
The same incomplete ownership transfer leaves duplicate legacy connection and
resize controls under React Flow.

## Rollback

The hardening commit is additive to the existing PR branch and can be reverted
without changing persisted data. Reverting restores the pre-review renderer
behavior and removes only the new test profile/diagnostics.

## Acceptance gate

- A newly added image node's business-card bounds align with its React Flow
  wrapper; its inner wrapper has no second translation.
- React Flow-mounted nodes expose one drag/connection/resize implementation.
- The production smoke reaches and edits the node composer.
- Focused unit/contract tests, full repository gates, and the required remote
  checks pass.
- The critical and full real-canvas suites pass; their screenshots are opened
  and visually inspected.
- The medium-canvas benchmark completes without page errors or hard failures.
- PR 216 merges before PR 201 and PR 203 are closed as superseded; Issue 198 is
  confirmed closed by the merge keyword.

## Verification log

- Before fix: PR 216 Linux CI and local production smoke both time out waiting
  for `.generation-canvas-v2-node__composer-card` after clicking Add image node.
- Before fix: 19 focused Vitest files pass (182 tests), demonstrating that the
  existing unit layer does not detect the production DOM-geometry regression.

# 2026-08-14 branch / worktree audit

## Status

- Audit baseline: `origin/main@0c5fd0cd` after PR #76 was merged and `git fetch --prune origin` on
  2026-08-14.
- Final audit branch: `codex/final-branch-audit-20260814`, created directly from that baseline.
- Product delivery is complete through PRs #70, #72, #73, #74, #75, and #76. CLA, Quality Gate,
  Mac Package, and Workers Build all passed before each PR was merged.
- 73 obsolete local branches were deleted: the original 69 audited branches plus 4 merged delivery branches.
  No remote branch or worktree was deleted.
- The historical aggregate branch `codex/integrate-branch-audit-20260814@387a057e` is not a second pending
  product delivery. Its surviving behavior was split into the scoped PRs above; its audit record is refreshed
  by this branch from current `main`.

The integration worktree is `/Users/aoqimin/Desktop/Nomi-branch-audit-integration-20260814`.
The original `/Users/aoqimin/Desktop/Nomi` worktree remains protected because it has 109 status entries,
including 6 unresolved conflicts. Another session changed it to `task/replicate-model-contract-tests`;
none of its branch, index, working-tree, merge, or untracked state was changed by this audit.

## Method

The audit does not equate a different branch name or commit hash with missing work.

1. Refresh `origin` and pin the comparison baseline to `origin/main`.
2. Group local and `origin/*` refs by tip object ID, so aliases are reviewed once.
3. Mark a tip `ancestor` when `git merge-base --is-ancestor <tip> origin/main` succeeds.
4. For remaining tips, use `git cherry origin/main <tip>` to distinguish patch-equivalent commits from
   patches which still produce `+` entries.
5. Review every `+` tip semantically against current source and tests. A `+` entry is not an instruction
   to cherry-pick: refactors, later rewrites, deleted architecture, experiments, and security-sensitive
   local tooling can all have different patch IDs while already being covered or no longer appropriate.
6. Inspect every registered worktree with `git status --porcelain`, preserving all uncommitted work.

## Census

After local cleanup and the PR #76 merge, there are 96 displayed refs when the `origin/HEAD` symbolic alias
is included: 49 local branches and 47 remote refs, representing 81 distinct tip objects. The remote count
includes the retained delivery branches created for the scoped PRs.

| Tip classification | Count | Decision |
| --- | ---: | --- |
| Already an ancestor of `origin/main` | 27 | No merge needed |
| Different history, patch-equivalent to `origin/main` | 30 | Retained only when protected by a worktree/tip |
| Contains at least one strict `git cherry +` patch | 24 | Semantic decisions below |

The pre-integration snapshot had 118 distinct tips (19 ancestor, 64 equivalent, 35 strict-unique). The
pre-cleanup audit had 120 distinct tips (19 ancestor, 63 equivalent, 38 strict-unique). The current count
reflects the local branch deletion, all six scoped merges, the final audit branch, and retained remote refs.

The detailed tip lists below record the pre-cleanup review. Deleted local names remain in the record so the
reason for deletion stays auditable; similarly named remote refs were not deleted.

## Integrated Result

Current `main` contains the missing behavior that survived semantic review:

- Settings child surfaces render above Settings, own focus/hit testing, stay in the viewport, and consume
  Escape before the parent Settings dialog.
- Local/LAN `http://` model gateways are accepted; verification continues after an individual model fails;
  failed-but-saved models remain visible and selectable.
- Settings storage and Electron test profiles are isolated and use valid absolute paths.
- The collapsed creation assistant no longer covers undo/redo.
- Clip nodes have compact import/upload UX, a growing scrollable timeline, shared playhead/split coordinates,
  and per-clip outputs.
- Scene3D runtime writes yield to direct user dragging, runtime stamps share export sampling and ground height,
  and trajectory marker refs self-register after viewfinder remounts.
- Electron walkthroughs and `pnpm start` now run the existing macOS revoked-signature repair before spawning.
- Scene3D walkthroughs use the shared isolated Electron launcher and current accessible quick-add controls.

## Strict-Unique Tip Decisions

Every one of the 38 strict-unique tip objects from the original pre-cleanup snapshot is accounted for below.
The live post-delivery snapshot has 24 strict-unique tips; the larger historical list is intentionally retained
so deleted names and their decisions remain auditable.

### Delivered through scoped PRs

| Tip/ref group | Resolution |
| --- | --- |
| `claude/charming-albattani-c12f27` (+ remote alias) | Scene3D marker remount fix integrated |
| `claude/eager-easley-a83ca5` (+ remote alias) | Collapsed assistant overlay fix integrated |
| `claude/friendly-lamport-885069` | Scene3D ground-height sampling fix integrated |
| `claude/intelligent-williamson-104007` | Obsolete trajectory playback path removed by the combined Scene3D integration |
| `claude/modest-snyder-117ca4` (+ remote alias) | Absolute settings-root invariant integrated |
| `claude/optimistic-herschel-d7b6be` (+ remote alias) | Electron stub path fix integrated |
| `claude/quirky-mirzakhani-c5c976` | Two stale lint suppressions removed |
| `origin/codex/clip-node-visual-alignment` | Four Clip alignment/upload commits included |
| `codex/clip-node-visual-alignment@73f06a3e` | Local continuation committed; growing timeline and per-clip outputs included |
| `codex/fix-settings-relay-layering-20260814` (+ remote alias) | Settings overlay and local relay fixes included |
| `codex/integrate-branch-audit-20260814@387a057e` | Historical aggregate only. Surviving behavior was delivered through scoped PRs #70 and #72-#76; do not merge this old history mechanically |

### Covered semantically; do not cherry-pick mechanically

| Tip/ref group | Evidence / reason |
| --- | --- |
| `claude/amazing-mendeleev-1ac8a2` | ComfyUI import/video tests are covered by the later ComfyUI implementation and current suite |
| `claude/bold-sinoussi-2a0c04` | Browser screenshot fallback behavior is present in current browser/media code |
| `claude/elastic-archimedes-f243ab` | Windows overlay/no-drag behavior is present in current overlay implementation |
| `claude/focused-bouman-ac0901` | ComfyUI video input series is represented in current workflow import and media ingestion paths |
| `claude/great-tharp-87f7d1` | Seedance gates are present; its relevant Scene3D ancestor was integrated separately |
| `claude/practical-fermat-514235` | Save-dialog crash behavior is already present as `9b2c8f44`; current code has the non-parented dialog and invariant test |
| `claude/sad-haslett-53e8b0` | Mannequin/upload/WASD behavior is present in the current Scene3D stack |
| `claude/suspicious-mclaren-06ee2c` | Timeline draft action is covered by the current timeline workflow |
| `claude/tender-leavitt-94596e` (+ remote alias) | Camera-move quick entry exists in current canvas controls |
| `codex/full-test-system` | Current test-system runner/matrix supersedes the remaining patch |
| `origin/codex/scene3d-reference-pack` | Current Scene3D reference pack and workspace boundary handling cover this tip |
| `pr-39` | POSIX normalization is already in `fencedCanvas.invariant.test.ts`; the other old fixture no longer exists |

### Preserve or archive; do not merge into current product

| Tip/ref group | Reason |
| --- | --- |
| `archive/cleanup-20260808/Nomi-bilingual-growth-spec` | Explicit archive branch; old generated/design/license material |
| `claude/blissful-kare-fedb5c` | Seedance observation/spike tooling, not a product patch |
| `claude/bold-meitner-ba7296` | WeChat local-read/key tooling; security-sensitive and has additional uncommitted work |
| `claude/mystifying-greider-a2b7fd` | WeChat database-key recovery tooling; security-sensitive archive only |
| `docs/design-system-v2` | Historical design documentation superseded by current tokens and checks |
| `feat/memory-cards` | Old memory-card implementation line; current architecture has diverged |
| `feat/memory-setting-cards`, `refactor/light-only-fonts` | Same old theme/settings tip; do not revive |
| `feat/quick-ux-wins` | Historical feedback tooling plus local artifacts; review separately if the tooling is wanted |
| `feat/spend-gate` | Old plan-only spend-gate line, superseded by current production policy work |
| `fix/feedback-wechat-key-diagnosis` | Security-sensitive WeChat key diagnosis; archive only |
| `refactor/design-consistency` | Historical design-system refactor, superseded by current product and token gates |

### Rejected from merge

| Tip/ref group | Reason |
| --- | --- |
| `claude/eloquent-booth-617228` | Explicitly marked WIP; broad Scene3D work without its required split/gates/walkthrough |
| `claude/eloquent-wright-7c5db8` | Broadly trusts a ComfyUI vendor origin and weakens the intended boundary |
| `origin/claude/strange-meninsky-13acd3` | Obsolete monorepo-era structure; 18 strict patches are not compatible with current architecture |
| `pr29-head` | Old provider/vendor architecture, superseded by the current catalog/onboarding system |

## Ancestor Tips

The following 19 distinct tips were already reachable from `origin/main` in the original pre-cleanup
snapshot. The live post-delivery count is 27; this historical list remains unchanged for traceability:

```text
claude/confident-golick-f42477
claude/gallant-black-946f06
claude/zen-torvalds-43d065
codex/apimart-seedance-h3-20260811
codex/integrate-pr59-production-recovery-20260810, origin/codex/integrate-pr59-production-recovery-20260810
feat/apimart-gemini-vision
main
origin/claude/confident-golick-f42477
origin/claude/happy-tesla-f1a851
origin/claude/nifty-heisenberg-d4c768
origin/codex/apimart-seedance-h3-20260811
origin/codex/clip-node-editing
origin/codex/prompt-wheel-containment
origin/codex/real-model-selection
origin/feat/mp4-export-bundled-ffmpeg
origin/feat/timeline-drag-affordance-and-prd
origin/main
origin/worktree-agent-ad6072f105af5ddc6
work/comfyui-workflow-page
```

## Patch-Equivalent Tips

The following 63 distinct tips had no remaining `git cherry +` patch in the original pre-cleanup snapshot.
The live post-delivery count is 30 after local cleanup and the scoped merges:

```text
audit/design-conformance
claude/adoring-colden-eb5bd1, claude/jolly-shamir-33d12c
claude/adoring-ishizaka-38ffe6, origin/claude/adoring-ishizaka-38ffe6
claude/amazing-leavitt-f2a721, claude/objective-driscoll-3c26dc, claude/stupefied-euler-2a1320, claude/upbeat-torvalds-a202db
claude/angry-dijkstra-975d44
claude/awesome-yonath-4d7f81, origin/claude/awesome-yonath-4d7f81
claude/blissful-joliot-3dc602, origin/claude/blissful-joliot-3dc602
claude/bold-williams-eaabac
claude/brave-galileo-02f95a
claude/clever-einstein-9fe134
claude/confident-vaughan-6093d3
claude/eager-ritchie-4b77d6
claude/eloquent-satoshi-f513bb
claude/exciting-nobel-fb3910
claude/flamboyant-boyd-1ff1a8
claude/friendly-hawking-e3d3a5
claude/friendly-wiles-a9f9e0, origin/claude/friendly-wiles-a9f9e0
claude/frosty-lovelace-846d66
claude/frosty-poitras-1af228
claude/gallant-mcnulty-e002ea
claude/gifted-mclaren-c96f2e
claude/gracious-bose-a1ff95, claude/objective-panini-26f8d7, codex/browser-assetbox-audit-20260713
claude/great-driscoll-422d29
claude/happy-shaw-30f6d9, claude/tender-nobel-ba7592, claude/zen-booth-8d33da
claude/heuristic-banach-1ef197, origin/claude/heuristic-banach-1ef197
claude/inspiring-ride-7efcd2
claude/jovial-jennings-2ab177
claude/laughing-aryabhata-504663
claude/laughing-ptolemy-5db2a0
claude/laughing-wiles-71a907
claude/relaxed-raman-760432, origin/claude/relaxed-raman-760432
claude/reverent-tesla-7f7cf1
claude/sad-lichterman-27c8f8
claude/sad-maxwell-00ed07, claude/trusting-kare-5759df
claude/trusting-margulis-5f74e5
claude/upbeat-aryabhata-b03004
claude/wizardly-volhard-f1585b
claude/wonderful-galileo-4e1d06, origin/claude/wonderful-galileo-4e1d06
claude/youthful-proskuriakova-3ece90
claude/zen-haibt-9c5853
codex/production-budget-ux-20260809, origin/codex/production-mcp-finalization-20260809
codex/production-mcp-finalization-20260809
codex/ux-clarity-edit-node
feat/memory-cards-clean
feat/memory-cards-clean2
feat/prompt-library, origin/feat/prompt-library
feat/self-improving-loop, origin/feat/self-improving-loop
fix/dreamina-direct-connect, origin/fix/dreamina-direct-connect
integ/pr17-0.11.0
origin/claude/confident-vaughan-6093d3
origin/claude/friendly-hawking-e3d3a5
origin/claude/sad-lichterman-27c8f8
origin/perf/followup, perf/followup
origin/refactor/scene3d-split, refactor/scene3d-split
origin/worktree-cto-audit, worktree-cto-audit
pr-17
pr-38
pr18
pr36
pref/memory-usage
spend-gate-land
worktree-agent-aa1be7033d569050e
worktree-director-upgrade
```

## Worktree Safety

There are 34 registered worktrees: 10 clean and 24 with status entries. Dirty does not always mean source
work: several contain only generated CSS, screenshots, test outputs, `node_modules`, or leaked
`model-catalog.json`. Nothing is safe to delete solely from that count.

### Protected product work

| Worktree | Status entries | Conflicts | Decision |
| --- | ---: | ---: | --- |
| `/Users/aoqimin/Desktop/Nomi` | 109 | 6 | Concurrent user work on `task/replicate-model-contract-tests`; do not clean, switch, reset, merge, or resolve it from this audit |
| `Nomi-agentic-production-ux` | 108 | 0 | Preserve broad uncommitted production/MCP UX work |
| `Nomi-production-budget-ux` | 67 | 0 | Preserve broad uncommitted production budget work |
| `Nomi-production-mcp-final` | 12 | 0 | Preserve uncommitted budget guard/settings work |
| `Nomi-run-main` | 17 | 0 | Preserve uncommitted video deconstruction/audio extraction work |
| browser audit worktree under `/Users/aoqimin/Documents/Codex/.../Nomi` | 46 | 0 | Preserve browser/asset-box work |

### Additional uncommitted candidate material

- `claude/bold-meitner-ba7296`: 7 entries in security-sensitive WeChat tooling.
- `claude/amazing-mendeleev-1ac8a2` worktree: 5 untracked walkthrough/output items.
- `claude/laughing-aryabhata-504663`: 3 untracked pricing/design items.
- `claude/upbeat-aryabhata-b03004`: 16 start-screen/promo implementation and design items.
- `codex/integrate-pr59-production-recovery-20260810`: 2 untracked MCP blueprint mockups.
- `feat/quick-ux-wins`: generated CSS plus 6 walkthrough/output items.
- `claude/zen-torvalds-43d065`: one untracked research note.

These require separate ownership/content decisions before any branch or worktree cleanup. They were not
silently folded into the current product integration.

### Artifact-only or generated dirt observed

- `Nomi-latest`, `Nomi-main-latest-20260814`, `Nomi-main-run-42d58099`: generated Tailwind output only.
- `nomi-perf`: `node_modules` and perf results.
- `claude/confident-golick-f42477`, `claude/reverent-tesla-7f7cf1`: leaked `model-catalog.json` only.
- `claude/gallant-black-946f06`: two changed screenshots with zero byte-count diff.
- `claude/great-tharp-87f7d1`, `claude/practical-fermat-514235`: untracked `node_modules` only.

Even these are only cleanup candidates after user approval and after confirming no process still uses the
worktree.

## Verification

All verification below ran in the integration worktree against the production builds used for the scoped
delivery branches. Each PR was then merged only after its remote checks passed.

- `pnpm gates`: pass.
  - 530 test files passed, 1 skipped.
  - 4653 tests passed, 1 skipped.
  - lint: 0 errors, 86 warnings (repository gate permits 98).
  - application and Electron TypeScript checks passed.
  - renderer and Electron production builds passed.
- `scripts/settings-nested-overlay-walkthrough.mjs`: pass at desktop and minimum window width; z-order,
  hit testing, focus, viewport containment, and Escape ownership verified.
- `tests/ux/local-gateway-onboarding.walk.mjs`: pass; LAN HTTP, continue-after-failure, failed-model
  selection, later video verification, and mapping assertions passed.
- `tests/ux/creation-pill-overlap.walk.mjs`: pass; the collapsed creation assistant stayed clear of
  undo/redo across the tested editor widths.
- `tests/ux/clip-node-editing.walk.mjs`: 17/17 assertions passed.
- `tests/ux/scene3d-viewfinder-playback-marker.walk.mjs`: pass; phase A and post-viewfinder-remount phase B
  both showed marker motion with zero console errors.
- `scripts/scene3d-stamp-groundcontact-walkthrough.mjs`: pass; automatic anchors hit and screenshots show
  the mannequin remaining grounded during trajectory playback.
- `tests/ux/_launchApp.test.mjs`: 3/3 tests passed.

## Next Safe Actions

1. Commit this refreshed record alone, open the final audit PR from current `main`, and merge it only after
   CLA, Quality Gate, Mac Package, and Workers Build pass.
2. Fetch the resulting `origin/main`, rerun `pnpm gates`, and repeat the Settings overlay, LAN HTTP/model,
   creation layout, Clip editing, and both Scene3D walkthroughs against that exact revision.
3. Fast-forward the local `main` ref only after confirming no worktree has it checked out and no history
   rewrite is required.
4. Delete only fully accounted local integration/audit branches which are not checked out by a worktree.
   Retain all remote branches and every registered worktree.
5. Launch Nomi from an isolated worktree pinned to final `origin/main`, then verify Electron's renderer
   `--app-path` resolves to that checkout rather than an older worktree.

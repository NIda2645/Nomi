# Core A execution and acceptance

Status: implementation in progress; no release approval.

Coordinator checkpoint: the complete K0-K7 / C01-C30 / CJ1-CJ4 contract remains active. User refinements to creation are additions within K4, never substitutes for payment, task identity, persistence/Undo, message lifecycle, T7 or final delivery. The coordinator owns overall judgment, dependencies, progress and independent acceptance; executors supply scoped commits and evidence. For efficiency, retain one meaningful red reproduction per root cause, then affected and safety-adjacent regressions; run integrated delivery checks and candidate journeys after convergence. Repeat checks only for changes, failures or unresolved risk. No discretionary visual polish or full-plan expansion.

## Authority and baseline

The user approved execution of `Nomi_plan_A_core_fixes_2026-09-19.md`, with the coordinator owning decisions, task issuance and acceptance, and GPT-6 medium subagents implementing. The source specification's K0-K7, C01-C30 and CJ1-CJ4 remain the acceptance contract. Paid providers, real user project mutation, publishing and merging are not authorized.

User clarification: T7 from `Nomi_Plan_B_Full_Reviewed_Taskbook_2026-09-19.md` is explicitly mandatory in this iteration because a mouse click sometimes fails to reveal the node parameter bar. Include its S30-S34/S39 behavior and actual hit/input/save-reopen checks, without expanding into the full repair plan or a layout rewrite. This clarification strengthens K6; it does not replace the original core scope with the conflicting historical summaries pasted alongside it.

Additional user reproduction: clicking New Plan in creation sends an Agent request to split the current document; the resulting storyboard appears on canvas but creation still lists only old plans. Trace the real launcher, captured source, created Run, notification, selection and creation reader before diagnosing it as a refresh defect. A missing connection may be repaired at the existing owner, but copying the result into a second writable plan is prohibited. Record the exact blocker if correcting this requires the deferred full migration. The user also reports easier node-parameter access before React Flow: compare actual pre/post migration selection, lightweight rendering and composer mounting before attributing the symptom solely to gesture cleanup.

The user also requires multiple documents per project, multiple plans per document, and a visible document/plan target in the right Agent. The existing document collection is retained. The bounded K4 implementation persists trusted captured document provenance on new Runs, projects their canonical generation shots into the existing shot grid, and routes draft edits through the existing generation owner with revision checks. Legacy plans remain separate existing records; there is no copy into legacy B and no authoring migration. Submitted snapshots stay immutable with a visible state. Run selection is project-scoped and mutually exclusive with legacy plan selection. Untagged historical Runs must not be assigned to whichever document is currently active.

K4 acceptance adds two documents with two new plans each, preserving old plans; actual prompt/model/reference content opens from the creation tree; requests completed after switching still belong to their captured document; right Agent identifies the addressed document/plan; save/reopen retains ownership and content. Stale edits preserve the user's draft and surface a conflict instead of silently raising the expected revision. Creation-list presence alone is insufficient.

### User-approved separation of plans and canvas

The user explicitly changed the creation interaction during implementation: remove the plan editor's Discard Plan and Re-split actions and replace them with **放到画布 / Place on canvas**. A new document-owned plan is saved and editable under its document before any canvas nodes exist. Placing projects existing content; it neither asks the model to split again nor authorizes paid generation. Once placed, the action becomes **在画布中查看 / View on canvas** and focuses the existing plan group. Repeated clicks and reopening must not duplicate nodes; distinct plans must not overwrite each other's groups. The existing sidebar delete affordance is outside this removal request.

This is an explicit user action, not an extra Agent question/answer round. The Agent should identify the addressed document/plan and report plan creation truthfully without claiming canvas placement. The current ownership repair remains mandatory: removing automatic landing alone cannot make an unlisted plan accessible.

Payment owns the durable placement intent and the existing shared landing boundary, covering draft hooks, confirmation, result observation and project reconciliation. Canvas owns the two editor surfaces, labels, group navigation and content projection independent of canvas existence. Messages owns captured provenance, visible Agent target and any directly conflicting completion text. Preserve existing canvas content and ordinary non-creation generation behavior; do not infer source ownership for historical untagged Runs. Do not add a second materialization pipeline, duplicate editable plan, automatic regeneration, or full historical migration.

Additional acceptance: create multiple plans without increasing canvas node count; open/edit their actual content; explicitly place only one and observe exactly its nodes; repeat the action without duplication; reopen with unplaced plans still unplaced and placed content intact; verify placement does not call paid providers. Existing user edits and results on placed nodes must not be silently overwritten by navigation or reconciliation.

Fresh `origin/main`: `dfca9990b89c9c401b8ac81ea9ce30ab032e1be4`; tree `b03bf18849c7d9189c591733a440bb783e5289a1`. Integration preflight passed with a clean worktree. All worktrees are siblings of the main checkout. Existing source worktrees remain read-only.

Initial source manifest SHA-256: `99a87fbd285f1845ecf0a1777bb4a83233b84a816e2eb6f9be2dd3048280c18c`. Per-file staged/unstaged/untracked and content/patch hashes are preserved locally. Source counts (unstaged/untracked): main 1/3, final-journeys 87/79, reliability 89/41, creation-owner 21/16, F12 10/5, pi 0/0; all staged counts are zero. These counts are inventory, not permission to include those files.

## Task ownership

| Executor | Unique branch / worktree basename | Scope and initial budget |
| --- | --- | --- |
| Coordinator | `codex/core-a-integration-20260919` / `Nomi-core-a-0919` | K0, taskbook, source manifests, independent acceptance and K7 delivery; documentation only before integration |
| payment_identity | `codex/core-a-payment-20260919` / `Nomi-core-a-payment-0919` | K1-K3; productionRun and shared payment/task identity contracts; approximately 70 files / 4,000 changed lines including existing deltas and tests |
| messages_stop | `codex/core-a-messages-20260919` / `Nomi-core-a-messages-0919` | K5; pi history, replay, input lifecycle and admission cancellation; approximately 55 files / 3,500 lines including existing deltas and tests |
| persistence_canvas | `codex/core-a-canvas-20260919` / `Nomi-core-a-canvas-0919` | K4/K6 plus document-owned explicit deletion Undo; approximately 45 files / 2,500 lines including existing deltas and tests |

Absolute execution roots are issued directly to each executor and are not embedded in committed evidence. Every executor runs delivery preflight and installs frozen dependencies before edits/commits. No executor writes another branch or the original source trees. Over-budget work requires an explained inventory, not a broad transplant.

Payment owns `productionRun`, production IPC/preload/API, spend confirmation UI, generation adapters, task routing and failure contracts. Messages owns lane history/runtime/client/actions and resident shell; its edits to task routing/failure files require coordination with payment. Canvas owns canvas/editor/document launch/save paths. Shared workbench store, i18n and framework registry changes must be reported as explicit independent hunks for integration. No partial `Run.authoring` migration or new legacy storyboard Agent write surface.

K4 coordinated addition: payment owns the durable Run origin fields and generation patch authorization semantics; messages owns captured input provenance through the generation planning adapter and the existing Agent target label; canvas owns creation projection, selection and draft editor adaptation. Canvas may add approximately six frontend files / 450 implementation lines plus focused tests; payment approximately five to seven provenance files. Reference writes from the reused panel composer must use the same host-owned write boundary as the payment card.

## Prior-art and implementation judgment

Existing investigation: `docs/plan/2026-09-18-tool-layer-prior-art-verdict.md` compares MCP, pi, Vercel and neighboring tools; payment authorization belongs to the host and binds the actual validated payload. Existing `docs/research/2026-09-18-storyboard-single-ledger/prior-art.md` supports one editable owner with immutable execution snapshots. Executors recheck relevant installed source before adopting APIs.

Use existing ProductionRun CAS, authorization history and submission outbox; do not add a task index or global lock. Use pi 0.85.1 branch entries for full UI history, existing watch for execution state, and existing model context separately. `watchSession` is not implemented in the installed version. Preserve React Flow positioning and repair editor/gesture ownership without a toolbar migration.

Candidate reusable deltas, subject to independent review: payment `b39333729` plus `883f6904b`; history `45a8293be`; canvas `93ff9c20a`. These are source commits, not acceptance evidence. F12 `27fa8888d` is prohibited as a transplant baseline. Source dirty authoring changes and unknown-price approval mode are excluded.

## Required red-green work

- Payment: real adapter 33-to-3 scope; empty/duplicate/unknown IDs; independent later batches; stale quote confirm/close and concurrent refresh; unknown submission blocks repayment; close preserves full creative state on reopen. Domain-tagged task references and typed owner-produced absence must prevent cross-domain cancellation and secret leakage.
- Messages: replay the original input with skill/attachment references while preserving a new draft; cancellation restores input; two real SDK compactions retain readable branch history while model constraints are checked separately; pre-admission Stop and late ACK cannot admit the old request or stop a newer input.
- Persistence/canvas: capture document/project/plan identity before awaits; late result cannot overwrite a new draft; save/reopen fixtures; explicit group deletion and one Undo preserve structure and target identity. History, single selection, drag cancellation/blur/unmount/read-only changes and lazy/zero-size recovery preserve a reachable editor in both hosts.

Every recurring repair first records a machine-generated door map and schema-v3 root-cause contract. Run a compilable reported-case red test before production changes, then changed class tests and adjacent regressions. Missing APIs or dependencies are infrastructure failures, not defect reproductions. Preserve logs with commit/tree, dirty diff hash, lock hash, fixture, mode, command and exit status.

## Acceptance and delivery

Coordinator personally compares implementation to the specification, checks two-point diff and baseline lag, and independently reviews payment, cancellation and persistence. Worker reports are evidence indexes, not acceptance decisions. No enabled data loss, wrong cancellation or unauthorized submission may be deferred as a minor issue.

Each worker commits scoped units after green focused verification and reports unresolved C assertions accurately. Do not push worker branches. Integrated delivery uses final-commit branch review, findings resolution, risk-selected gates and integration ci-chain. No hook bypass, fabricated review receipt or raised gate baseline. Commands already holding the gates lock must not be wrapped in another lock.

Build a macOS arm64 candidate from the final identified tree, then run CJ1-CJ4 with isolated controlled providers and project fixtures where supported. Preserve app/package hashes and inspect actual screenshots/hit tests. Source builds do not prove package acceptance. Windows, other architectures, unrun provider paths and incomplete journeys remain unverified. A code PR is separate from a release recommendation; no automatic merge or publish.

## Rollback and reporting

Revert only this task's scoped commits through review if required; do not reset or clean another worktree. No data migration is introduced. Evidence must include K/C-to-commit/test/package status and deferred-item-to-full-plan mapping. Keep raw profiles/logs local; commit only sanitized indexes and hashes.

Workers must finish or explicitly stop their own command sessions before reporting. No indefinite watch, unattended background verification or final response while required tests still run. Report a progress/evidence checkpoint at least every 15 minutes; escalation at 90 minutes per implementation unit is a review checkpoint, not permission to abandon authorized work.

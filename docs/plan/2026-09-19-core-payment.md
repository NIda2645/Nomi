# Core payment and task identity repair

Baseline: dfca9990b. Scope: K1-K3 of Core A. No paid calls, real projects, authoring migration, push or merge.

Reuse reviewed payment-only deltas b39333729 and 883f6904b. Existing prior art: docs/research/2026-09-18-storyboard-single-ledger/prior-art.md and docs/plan/2026-09-18-tool-layer-prior-art-verdict.md. Keep ProductionRun CAS, immutable events and submission outbox as owners.

Red baseline: real generation adapter selected 3 but projected 33; all four invalid scopes resolved; dismissal persisted cancelled. Six failures, no missing APIs, 2026-09-19 20:57 local. Command: python3 scripts/with-gates-lock.py -- pnpm exec vitest run electron/capabilityCore/agentPanelSpendConfirm.e2e.test.ts -t 'reliability: scoped'.

Next: displayed quote CAS for close and subset confirmation; typed domain task references and trusted absence; safe errors; candidate reference host isolation. Focused red/green tests, typecheck and root-cause contracts before scoped commits. Integration owns final gates and candidate package. Rollback uses scoped commits; no stored data migration.

## Payment verification

2026-09-19: C09 red slice added to the reused implementation. Old close returned discarded for a stale quote; subset confirm returned spend_confirmed after an unseen prompt change during present. Both tests executed and failed on their target assertion (exit 1, 49 ms test duration). Following the fix, the four core payment suites passed 50 tests (exit 0, 25.95 s), including both C09 tests, 33-to-3, later batches, unknown submission and confirmation races. Eighteen adjacent suites passed 183 tests (exit 0, 2.36 s). typecheck and check:root-cause-contracts passed (48 checker tests).

Tests used only temporary projects and controlled loopback HTTP; no provider billing proof. The first sandboxed broad run was stopped after the loopback tests stalled; the focused rerun outside the sandbox completed. C08 full renderer reopen, C19 explicit delete/Undo, final installed package and live supplier tests remain for integration acceptance.

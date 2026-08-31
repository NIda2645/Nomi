# MCP client journey hardening

Date: 2026-08-16
Branch: `codex/mcp-journey-hardening-20260816`
Baseline: `origin/main@5b508e84`

## User problem

Claude Code and Codex can keep an old Nomi MCP entry after an update. The entry still exists, so old UI treated it as connected, but the deleted launcher cannot start. The current main detects the failure, but asks every affected user to repair it manually. At the same time, the documented 13-tool contract has grown to 15 in source, `confirm_all` promises a per-shot stop that is not implemented, and `nomi_decide_gate` relies on tool-description discipline instead of a server-enforced human boundary.

The target experience is simple: existing users upgrade without losing unrelated client configuration, assistants can operate Nomi in natural language, and every consequential decision has one truthful approval surface.

## Decision

| Option | What the user sees | Cost |
|---|---|---|
| Documentation-only repair | Existing users still see a broken connection and must reconnect each client | Lowest implementation cost, preserves the current failure |
| Manual repair with better copy | Failure is clearer, but every legacy user still has work to do | Moderate UI work, no migration guarantee |
| Safe owned-entry migration + enforced gates | Known Nomi legacy entries upgrade with backup; custom entries stay untouched; approvals match their promise | More domain and journey coverage, selected for this work |

## Scope

1. Add an explicit MCP configuration version and classify configured entries as current, known legacy, stale development, stale authentication, custom broken, or absent.
2. Migrate only entries that match a known Nomi-owned historical shape. Back up first and replace only the `nomi` entry. Unknown/custom entries remain user-controlled and receive a repair action.
3. Prevent normal development sessions from silently writing a disposable worktree launcher when a packaged Nomi launcher is available. Mark unavoidable development entries so their lifecycle is visible and testable.
4. Make one exported 15-tool catalog the source of truth for protocol tests and documentation contracts.
5. Restrict `nomi_decide_gate` to reversible creative gates. Budget, export, publish, and other irreversible scopes remain Nomi-only. A supported MCP client must complete a server-issued elicitation before a creative decision is applied.
6. Implement real per-shot submission gates for `confirm_all`; approving one shot resumes exactly that shot, then the next shot stops again. `budget_only` still cannot bypass the budget contract.
7. Improve the existing connection card and Production Run task card without adding a new navigation surface.
8. Add two repeatable user journeys:
   - Quick draft: natural-language project creation, model discovery, three canvas nodes, references, and one generated result.
   - Durable production: brief, direction, storyboard, contract, per-shot/sample behavior, rough cut, export, restart recovery, and final playable artifact.

## Interaction contract

### Assistant connection card

- Idle: segmented client choice, one primary connect/repair action.
- Checking: stable card dimensions and a non-blocking checking status.
- Migrated: success state states that the connection was upgraded and a backup exists; real handshake/tool count is the proof.
- Known legacy: action label is "Upgrade connection", not a generic failure.
- Custom broken: action label is "Repair connection" and never silently overwrites before the user acts.
- Connected: show actual tool count from `tools/list`; do not hardcode 13 or 15 in the UI.
- Error: concise cause plus one recovery action; raw diagnostics stay out of the visible card.
- Keyboard/narrow layout: segmented control and primary action remain reachable; labels wrap; minimum touch target is 44px on narrow surfaces.

### Production Run task card

- Direction/sample/per-shot gates identify the exact decision and consequence.
- Per-shot gate names the shot and states that no provider submission occurs before approval.
- Budget and export actions remain in Nomi and cannot be completed by `nomi_decide_gate`.
- Pause/cancel report already-submitted exposure truthfully; resume continues from the durable cursor.
- `confirm_all` is shown only when the runtime actually stops per shot.

## Architecture boundaries

- `mcpConfig.ts`: parse, classify, version, backup, owned-entry migration, stable launcher selection.
- `mcpVerify.ts`: verify the configured entry and return a precise reason; no configuration writes.
- `mcpProtocol.ts`: tool catalog, protocol-level elicitation, tool result contract.
- `dispatcher.ts`: enforce gate scope regardless of client wording.
- `productionRunDriverOps.ts`: per-shot submission gate at the single pre-submit boundary.
- Existing settings and task-center components remain the only UI homes.

## Not changing

- No new model provider or API contract.
- No new top-level navigation or marketing page.
- No silent overwrite of unknown MCP configurations.
- No automatic approval of budget, export, publish, delete, or file replacement.
- No second production playbook in this PR; both journeys exercise the existing low-level canvas workflow and the durable `brand.promo` playbook.

## Rollback

- Migration always creates the existing `.nomi-backup`; restoring it reverts a client entry.
- MCP configuration versioning is additive and ignored by older Nomi builds.
- Per-shot gates are durable run events. Switching a run back to `key_confirm` or `budget_only` uses the existing policy command path.
- The branch is isolated from `main`; no default-branch push or merge is part of this work.

## Verification gates

1. Unit/contract tests for all historical Claude Code, Codex, and Cursor entry shapes, backup preservation, idempotent migration, custom-entry non-overwrite, stable dev launcher, and argument-path diagnostics.
2. Protocol tests: exact 15 tools, read-only annotations, elicitation required, irreversible gate scopes rejected.
3. Production tests: `confirm_all` stops before every submission, approval resumes once, restart recovers a waiting shot gate, budget remains mandatory.
4. Real stdio journeys against the built app for quick draft and complete production.
5. Real Claude Code, Codex, and Cursor configuration/handshake checks without exposing proofs.
6. Visual evidence in zh-CN and en at desktop and narrow viewport; inspect every screenshot.
7. Repository gates: filesize, tokens, i18n, lint, typecheck, full test, build.

## Six-role review

- CTO: one tool catalog and one pre-submit gate boundary avoid parallel truth sources.
- Product: automatic repair is limited to deterministic Nomi-owned entries; custom configurations remain explicit.
- Design: reuse the current settings detail card and task center; no new surface or instruction-heavy onboarding.
- Frontend: derive labels from verification/migration state; preserve loading/error/keyboard contracts.
- Backend: enforce irreversible scopes in the dispatcher and make every shot approval a durable event.
- User: say the creative goal once, watch Nomi update, approve only meaningful consequences, and recover after restart without reconstructing context.

## Completion record

Implementation and review are complete on `codex/mcp-journey-hardening-20260816`; delivery identifiers are recorded after the verified commits are pushed.

- Client versions exercised: Claude Code `2.1.232`, Codex CLI `0.147.0`, Cursor `3.12.17`.
- MCP contract: 15 tools, 24 resources, signed origins verified for Claude Code / Codex / Cursor.
- Focused regression after final review: 12 files, 88 tests passed, including concurrent Helper cold start, owned-entry migration, custom-entry preservation, elicitation enforcement, per-shot rejection/retry, restart recovery, stage bookkeeping, and task-center revision reconciliation.
- Repository gates: passed on 2026-08-16, including filesize/tokens/secrets/symlinks/i18n/control/site checks, lint with no errors, typecheck, 587 passing test files (5080 passed, 1 skipped), and the production renderer/Electron build.
- Quick-draft journey: real model generation completed once; project `workspace-7bcd6b46-9eb8-4000-8f77-dee8770283a9`, generated node `node-b8a9f7a5-2`. It is not rerun during final verification because it consumes user credit.
- Durable-production journey: 43/43 assertions passed in the real packaged Electron app. The completed Run shows 9/9 stages with no stale running badge. The final MP4 has positive duration, H.264 video, and AAC audio: `/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-production-mcp-e2e-Cwy7rh/projects/未命名项目 08_16 21_27-msvua2za-dbb8d31d/exports/nomi-run-4328b2cc-c136-434e-a4f3-6da7a48bc031.mp4`.
- Visual evidence:
  - `tests/ux/shots/mcp-client-activation/renderer-en-dark-narrow-active-tab.png`
  - `tests/ux/shots/mcp-client-activation/isolated-zh-light-cursor-needs-permission.png`
  - `tests/ux/shots/mcp-quick-draft/quick-draft-complete.png`
  - `tests/ux/shots/production-mcp/02a-shot-1-gate.png`
  - `tests/ux/shots/production-mcp/03a-sample-gate.png`
  - `tests/ux/shots/production-mcp/03b-shot-2-gate.png`
  - `tests/ux/shots/production-mcp/03-rough-cut-player.png`
  - `tests/ux/shots/production-mcp/04-completed-900x700.png`
- Security audit: `pnpm audit --prod --audit-level=high` reports 34 pre-existing dependency advisories (5 low, 16 moderate, 13 high), including `xlsx`, `undici`, `react-router`, `js-yaml`, `nanoid`, and `ip-address`. This branch changes no dependency manifest or lockfile; broad upgrades remain separate work.
- Commit ids and PR URL: recorded in the delivery follow-up after the verified branch is pushed.

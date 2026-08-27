# Quality Gate Parallel Orchestration Implementation Plan

> 🚧 实现完成，等待 PR 当前 HEAD 验证（2026-08-28）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut merge-gate wall time without reducing coverage by running independent validation surfaces in parallel and preserving one fail-closed required `Quality Gate` result.

**Architecture:** Extract the static repository command chain into `gates:contracts`, declare three executable CI profiles in `tests/system/profiles.mjs`, and map them to parallel GitHub Actions jobs. Keep Mac packaging independent and add an `always()` aggregator named `Quality Gate` that accepts only four successful dependencies. Contract tests compare the workflow/profile/package graph with the legacy required coverage set.

**Tech Stack:** GitHub Actions YAML, pnpm scripts, Node.js `node:test`, existing system-profile runner.

---

### Task 1: Lock the coverage contract with failing tests

**Files:**
- Modify: `scripts/check-quality-gate-workflow.node-test.mjs`

- [x] Add assertions for `contracts`, `unit`, `desktop-linux`, `mac-package`, and final `quality` jobs.
- [x] Assert the aggregator uses `if: always()` and accepts only `success` from every dependency.
- [x] Assert the three Linux jobs invoke the three canonical system profiles and contain no path-based skip.
- [x] Assert the expanded profile union is exactly contracts, unit, build, e2e, and journeys-ci.
- [x] Run `pnpm run check:quality-gate-workflow` and record the expected RED failures on the legacy serial workflow.

### Task 2: Establish the command and profile truth source

**Files:**
- Modify: `package.json`
- Modify: `tests/system/profiles.mjs`

- [x] Extract all static checks, lint, typecheck, and test-types into `gates:contracts`.
- [x] Rewrite `gates` as `gates:contracts && test && build && success stamp` without changing its effective command set.
- [x] Add stages/profiles for `ci-contracts`, `ci-unit`, and `ci-desktop`.
- [x] Add package scripts that invoke each profile through `scripts/test-system.mjs`.
- [x] Run the workflow contract and profile expansion tests GREEN.

### Task 3: Parallelize the workflow without changing trigger semantics

**Files:**
- Modify: `.github/workflows/quality-gate.yml`

- [x] Preserve `pull_request`, `push: main`, concurrency, permissions, and base-ref expressions.
- [x] Add parallel Ubuntu jobs for Contracts, Unit, and Desktop Linux.
- [x] Keep Linux walkthrough evidence upload on the desktop job with `if: always()`.
- [x] Keep Mac Package steps unchanged.
- [x] Replace the old serial `quality` job with a final `Quality Gate` aggregator that fails closed on any non-success dependency.
- [x] Run focused contract tests GREEN.

### Task 4: Verify no coverage loss and no runtime drift

**Files:**
- Modify only if verification exposes a scoped defect.

- [x] Run `pnpm run test:system:contracts` (60.7 s, PASS).
- [x] Run `pnpm run test:system:unit` (58.3 s, 843 files / 8059 tests plus 151 agent-runtime tests, PASS).
- [x] Run `pnpm run build`, Electron smoke, and J3/J5 through `test:system:desktop` (192.8 s, 3/3 stages, PASS).
- [x] Run full `pnpm run gates` and verify Electron identity remains package/runtime `43.4.1`.
- [x] Run `git diff --check` and inspect the complete scoped diff; final delivery status waits for live PR evidence.

### Task 5: Deliver through a pull request

**Files:**
- Commit only the plan/spec, workflow, profile, package, and contract-test changes.

- [ ] Commit the scoped implementation on `codex/quality-gate-parallel-20260828`.
- [ ] Re-check live `main` and rebase or merge it into the branch if required without force-push.
- [ ] Push the branch and open a PR with RED/GREEN and full-gate evidence.
- [ ] Observe the PR job graph: Contracts, Unit, Desktop Linux, Mac Package, and final Quality Gate.
- [ ] Verify all checks succeed and report real wall time; do not merge unless separately authorized.

## Plan self-review

- Coverage: every command previously reached by `gates`, Electron smoke, CI journeys, Mac packaging, packaged MCP smoke, and codesign remains required.
- Safety: no test deletion, no change-based skipping, no retry masking, no stale-result reuse, and no direct push to `main`.
- Rollback: reverting the workflow/package/profile commit restores the single serial Ubuntu job without changing production code or persisted data.

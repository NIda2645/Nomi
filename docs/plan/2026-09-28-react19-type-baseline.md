# React 19 and Type Baseline Implementation Plan

> 状态：🚧 React 19/type baseline 实施中

**Goal:** Move Nomi from React 18.3 to React 19 with the smallest compatible runtime set, keeping the application behavior unchanged and leaving AI SDK and Tailwind upgrades for later phases.

**Architecture:** Upgrade React, its type packages, scheduler, and the React Three Fiber peer pair together because fiber 8 rejects React 19. Keep Mantine 8 on its existing React 18/19-compatible line. Convert the removed global JSX namespace mechanically in one isolated commit, then fix only compiler or R3F 9 compatibility errors exposed by the upgrade.

**Tech Stack:** React 19.3, TypeScript 5.6, Mantine 8.3, React Three Fiber 9.8, Drei 10.7, Vite 7, Vitest 4.

**Spec:** `docs/plan/2026-09-06-stack-upgrade-react19-aisdk-tailwind4.md` §2 and §6 step ③, with the user's 2026-09 decision to start with React 19/type baseline.

## 先查别人（R27）

本阶段沿用 [`docs/plan/2026-09-06-stack-upgrade-react19-aisdk-tailwind4.md`](2026-09-06-stack-upgrade-react19-aisdk-tailwind4.md) 的阶段顺序，并核对 [`docs/research/2026-09-08-mantine-8-upgrade-probe.md`](../research/2026-09-08-mantine-8-upgrade-probe.md) 中 React 19、Mantine 8 与 R3F 9 的兼容边界；AI SDK 与 Tailwind 留到后续阶段。

- React 19 升级指南说明了 JSX namespace、ref 与类型兼容迁移：[React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)。
- R3F v9 的迁移边界以官方说明为准：[React Three Fiber v9 migration guide](https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide)。
- Mantine 8 的现有兼容探针与本仓约束记录在 [`docs/research/2026-09-08-mantine-8-upgrade-probe.md`](../research/2026-09-08-mantine-8-upgrade-probe.md)。

## Global Constraints

- Do not upgrade AI SDK, Tailwind, Mantine, or unrelated UI libraries in this phase.
- Keep `forwardRef`, `MutableRefObject`, Mantine theme `defaultProps`, and StrictMode semantics unchanged unless compilation proves a direct incompatibility.
- Do not introduce a second rendering or state implementation.
- Keep each mechanical or behavior change independently revertible.
- Validate on the actual merge base and report any Node engine warning separately.

## Review Focus

- Global JSX namespace references must all use the React 19 scoped namespace without changing runtime behavior.
- React 19's ref and StrictMode behavior must not create duplicate canvas writes or effect side effects.
- Fiber 9/drei 10 must preserve scene3d editor, fullscreen, trajectory, camera preset, and model library behavior.
- Mantine 8 must remain the source of the existing color-scheme attribute and theme defaults.
- Existing test and build contracts must continue to run under the new dependency graph.

### Task 1: Baseline and dependency contract

**Files:**
- Create: `docs/plan/2026-09-28-react19-type-baseline.md`
- Modify: `package.json`, `pnpm-lock.yaml`
- Test: dependency resolution and `pnpm run typecheck`

- [ ] Record the clean `origin/main` base, current versions, and npm peer evidence in the branch notes.
- [ ] Update React, React DOM, their type packages, scheduler, `@react-three/fiber`, and `@react-three/drei` to the pinned compatible versions.
- [ ] Install with the repository lockfile and confirm no unrelated dependency family moved.
- [ ] Run `pnpm run typecheck` to expose the scoped JSX and R3F errors before source edits.

### Task 2: Scoped JSX mechanical migration

**Files:**
- Modify: all tracked `.ts`/`.tsx` files with global `JSX.*` references.
- Test: the repository typecheck and a diff audit for runtime-neutral changes.

- [ ] Run the scoped JSX codemod over the actual tracked source surface.
- [ ] Review the diff for imports, comments, generated files, and string literals; revert any runtime or unrelated edits.
- [ ] Commit the mechanical migration alone.
- [ ] Run `pnpm run typecheck` and `pnpm run check:test-types`.

### Task 3: React 19 and R3F compatibility fixes

**Files:**
- Modify: only files named by the compiler or R3F 9 migration surface under `src/workbench/generationCanvas/nodes/scene3d`, `src/workbench/model3d`, `src/devlab`, and shared canvas helpers.
- Test: focused scene3d tests, StrictMode tests, full typecheck, lint, and relevant canvas acceptance/performance checks.

- [ ] Fix each compiler/API error with the smallest equivalent change; do not refactor unrelated components.
- [ ] Re-run the three StrictMode-sensitive tests and inspect their assertions for real coverage.
- [ ] Run the focused scene3d and canvas tests, then the repository gates selected by the validation policy.
- [ ] Run Ponytail branch review and record every finding in the PR body before delivery.

### Task 4: Delivery evidence

**Files:**
- Modify: PR description and handoff receipt only after the branch is verified.

- [ ] Run the appropriate validation tier, commit, push, and open a PR from `codex/react19-type-baseline`.
- [ ] Verify the merge SHA with `delivery:verify-merged` before calling the phase complete.
- [ ] Update `Nomi-协调交接.md` with the exact PR, merge, and validation receipts.

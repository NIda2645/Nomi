# APIMart DeepSeek Text Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale APIMart `deepseek-v3.1-250821` seed with the currently available DeepSeek chat models and make the latest verified model the default Nomi text brain.

**Architecture:** Keep APIMart text models in the existing single-source `electron/catalog/apimartTexts.ts` seed. Reconcile the old key out of APIMart-only catalog state, seed several IDs confirmed by the authenticated `/v1/models` catalog, and leave the existing OpenAI-compatible `/v1/chat/completions` runtime unchanged. Add migration/regression coverage and run one real chat + tool-call probe through the app.

**Tech Stack:** Electron, TypeScript, Vitest, Vercel AI SDK OpenAI-compatible chat, APIMart `/v1/models` and `/v1/chat/completions`.

---

### Task 1: Lock the new APIMart model contract with a failing migration test

**Files:**
- Modify: `electron/catalog/apimartTextMigration.test.ts`
- Modify: `electron/catalog/seedBuiltins.test.ts`

- [x] **Step 1: Assert the stale key is removed and the verified current set is seeded**

Update the APIMart migration test to start with `deepseek-v3.1-250821` and assert it is removed, then assert these enabled `kind: "text"` rows exist: `deepseek-v4-pro`, `deepseek-v4-flash`, `deepseek-v3.2`, `deepseek-v3.2-think`, and `deepseek-v3.1-terminus`. Keep the cross-vendor non-deletion assertion.

- [x] **Step 2: Update the seed contract assertion**

Change the `seedBuiltins.test.ts` text-brain assertions from one V3.1 row to the five-model APIMart set, while preserving the no-archetype/no-mapping invariant for every text row.

- [x] **Step 3: Run the focused tests and verify RED**

Run:

```bash
pnpm exec vitest run electron/catalog/apimartTextMigration.test.ts electron/catalog/seedBuiltins.test.ts
```

Expected: FAIL because the current seed still contains only `deepseek-v3.1-250821` and retires `deepseek-v4-pro`.

### Task 2: Replace the stale seed and reconcile migration

**Files:**
- Modify: `electron/catalog/apimartTexts.ts`
- Modify: `electron/catalog/seedBuiltins.ts`

- [x] **Step 1: Replace the curated DeepSeek list**

Set `APIMART_TEXT_MODELS` to this ordered list, with `deepseek-v4-pro` first so the default no-preference text brain is the latest verified pro model:

```ts
export const APIMART_TEXT_MODELS: ApimartTextModel[] = [
  { modelKey: "deepseek-v4-pro", labelZh: "DeepSeek V4 Pro" },
  { modelKey: "deepseek-v4-flash", labelZh: "DeepSeek V4 Flash" },
  { modelKey: "deepseek-v3.2", labelZh: "DeepSeek V3.2" },
  { modelKey: "deepseek-v3.2-think", labelZh: "DeepSeek V3.2 Think" },
  { modelKey: "deepseek-v3.1-terminus", labelZh: "DeepSeek V3.1 Terminus" },
  { modelKey: "gemini-3.5-flash", labelZh: "Gemini 3.5 Flash", meta: { supportsImageInput: true } },
  { modelKey: "MiniMax-H3-Context-IR", labelZh: "MiniMax H3 · Context-IR 提示词增强", meta: { promptRefineOnly: true } },
];
```

Update the file comments to say the IDs were confirmed from APIMart’s authenticated model catalog on 2026-08-21. Do not add mappings for chat models.

- [x] **Step 2: Retire the stale APIMart V3.1 seed**

Change `RETIRED_APIMART_TEXT_MODEL_KEYS` to `['deepseek-v3.1-250821']`, preserving the vendor-scoped exact-match pruning so user models from other vendors are untouched.

- [x] **Step 3: Run focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run electron/catalog/apimartTextMigration.test.ts electron/catalog/seedBuiltins.test.ts
```

Expected: PASS with the old APIMart key removed and all five current DeepSeek rows present.

### Task 3: Update default model fixtures and the real smoke contract

**Files:**
- Modify: `tests/ux/apimart-text-brain.e2e.mjs`
- Modify: `tests/ux/model-selection-real.e2e.mjs`
- Modify: `tests/ux/adapter-failed-unlock.walk.mjs`
- Modify: `tests/ux/camera-move-agent-eval.e2e.mjs`
- Modify: `tests/ux/camera-move-render-e2e.mjs`
- Modify: `tests/ux/custom-call-config.walk.mjs`
- Modify: `tests/ux/model-pick-confirm.walk.mjs`
- Modify: `tests/ux/staging-agent-eval.e2e.mjs`
- Modify: `tests/ux/staging-reference.e2e.mjs`
- Modify: `tests/ux/walk-ref-e2e.mjs`
- Modify: `docs/superpowers/specs/2026-08-13-ux-clarity-and-discoverability-design.md`
- Modify: `electron/providerAdapter/promotionEnables.test.ts`
- Modify: `electron/providerAdapter/textProbeBudget.test.ts`
- Modify: `electron/providerAdapter/verifier.ts`
- Modify: `src/workbench/ai/assistantModelIdentity.test.ts`

- [x] **Step 1: Make the real APIMart probe default to V4 Pro**

Change the smoke test default model and comments to `deepseek-v4-pro`; retain `APIMART_TEXT_MODEL` as an override so other verified rows can be checked without another code change. The test must still require both streamed content/tool lifecycle evidence and remain opt-in behind `APIMART_E2E`/`APIMART_API_KEY`.

- [x] **Step 2: Move non-migration fixtures to V4 Pro**

Replace old V3.1 fixture IDs in model-selection, failed-unlock, camera/staging, custom-call, and assistant identity tests with `deepseek-v4-pro`; keep the stale V3.1 ID only in migration coverage as the retired key.

- [x] **Step 3: Update probe-budget comments/fixtures**

Use `deepseek-v4-pro` in the text probe fixtures and comments so the regression describes the current thinking model rather than the retired ID. Do not reduce `TEXT_PROBE_MAX_TOKENS`.

- [x] **Step 4: Run focused TypeScript/UX contract tests**

Run:

```bash
pnpm exec vitest run electron/providerAdapter/promotionEnables.test.ts electron/providerAdapter/textProbeBudget.test.ts src/workbench/ai/assistantModelIdentity.test.ts
```

Expected: PASS.

### Task 4: Verify the real APIMart route and repository gates

**Files:**
- Modify: `docs/plan/2026-08-13-real-model-selection.md` (update stale current-model wording only)

- [x] **Step 1: Run the authenticated APIMart smoke**

Run:

```bash
pnpm run build
APIMART_E2E=1 APIMART_TEXT_MODEL=deepseek-v4-pro node tests/ux/apimart-text-brain.e2e.mjs
```

Expected: the app uses the seeded APIMart row and reports `chat=✓ tool_use=✓` without the old model-not-found error. If the installed app key is absent, report the exact skip instead of claiming a live pass.

- [x] **Step 2: Run all required repository gates**

Run, in order:

```bash
pnpm run check:filesize
pnpm run check:tokens
pnpm run check:i18n
pnpm run lint:ci
pnpm run typecheck
pnpm run test
pnpm run build
```

Expected: every command exits 0; pre-existing warnings must not increase.

- [x] **Step 3: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Confirm no APIMart API key, temporary probe, unrelated file, or generated artifact is staged.

- [x] **Step 4: Commit the scoped change**

```bash
git add electron/catalog/apimartTexts.ts electron/catalog/seedBuiltins.ts electron/catalog/apimartTextMigration.test.ts electron/catalog/seedBuiltins.test.ts electron/providerAdapter/promotionEnables.test.ts electron/providerAdapter/textProbeBudget.test.ts electron/providerAdapter/verifier.ts src/workbench/ai/assistantModelIdentity.test.ts tests/ux/apimart-text-brain.e2e.mjs tests/ux/model-selection-real.e2e.mjs tests/ux/adapter-failed-unlock.walk.mjs tests/ux/camera-move-agent-eval.e2e.mjs tests/ux/camera-move-render-e2e.mjs tests/ux/custom-call-config.walk.mjs tests/ux/model-pick-confirm.walk.mjs tests/ux/staging-agent-eval.e2e.mjs tests/ux/staging-reference.e2e.mjs tests/ux/walk-ref-e2e.mjs docs/plan/2026-08-13-real-model-selection.md docs/superpowers/specs/2026-08-13-ux-clarity-and-discoverability-design.md docs/superpowers/plans/2026-08-21-apimart-deepseek-text-models.md
git commit -m "fix(apimart): refresh DeepSeek text models"
```

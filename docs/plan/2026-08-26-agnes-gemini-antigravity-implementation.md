# Agnes / Gemini / Antigravity Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the independent Agnes contract task, then spec and code review; the coordinator owns Gemini and application integration. Steps use checkboxes. Never commit before the repository gates or modify the shared conflicted checkout.

**Goal:** Deliver the Agnes public model catalog, Gemini API endpoint correction, and all officially supported local Antigravity capabilities with verified contracts and honest per-capability validation state.

**Scope correction (2026-08-26, user):** Antigravity is not text-only; integrate every supported capability. The text adapter below is one profile, not the delivery boundary. Before shipping CLI UI/transport, add official capability inventory and media execution contracts (image generation/editing/input, plus any documented video/audio support), task-scoped tool permissions, artifact validation/import and real media tests. The original text-only mockup copy is superseded. Do not claim full delivery from text tests.

**Architecture:** Keep existing catalog, generic generation controls and text task transport. Fix SDK base selection at its owner. Add an isolated official agy process adapter behind the existing text task contract; no second Nomi business loop, no extracted credentials, no tool-capability masquerading.

**Tech Stack:** Existing Electron / React / Zustand / AI SDK v4 / Vitest / Playwright; Node child_process; no new framework.

## 1. Agnes contracts (implementer ownership)

Files: `electron/catalog/agnesTexts.ts`, `agnesImages.ts`, `agnesVideos.ts`, `agnesVendor.ts`, `agnes.test.ts`, `seedBuiltins.ts` Agnes sections; `src/config/modelArchetypes/agnesImage.ts`, `agnesVideo.ts` and required archetype registration/source whitelist; Agnes provider copy in existing locale and vendor config.

- [x] Read the ten individual current official model pages; reuse downloaded evidence only after verifying provenance. Record each mode, parameter type, enum/default, reference channel and response field.
- [x] Extend existing Agnes contract suite before implementation; render actual mappings with realistic inputs. Example invariants:

```ts
expect(body.seconds).toBe("4");
expect(body.mode).toBe("reference");
expect(query.model_name).toBe("agnes-video-2.5-flash");
expect(body.extra_body.response_format).toBe("url");
```

- [x] Run `pnpm exec vitest run electron/catalog/agnes.test.ts` and capture expected missing-model/field failures.
- [x] Implement the five text, two image and three video contracts through existing seed/archetype mechanisms. Use per-model video polling when needed; include `supportsImageInput` metadata. Reject illegal mode/reference combinations before the request.
- [x] Extend existing seed preservation tests; rerun affected suites and `pnpm run typecheck`. No secrets in fixtures; no assumption that every public model is enabled on this Key.

## 2. Gemini endpoint root fix (coordinator)

Files: `electron/ai/vendorLanguageModel.ts`, `electron/ai/buildAiSdkModel.test.ts`.

- [x] Add a request URL regression through `buildLanguageModelForVendor(...).doGenerate(...)` using the existing fake fetch fixture. Matrix: bare host, `/v1`, `/api/v3`, `/api/paas/v4`, `/v1beta/openai`, custom path, trailing slash. Keep Anthropic/Responses behavior explicit.

```ts
expect(requestUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
```

- [x] Run the focused suite to observe the extra `/v1` failure.
- [x] Replace unconditional version appending with a small explicit SDK base resolver; do not change arbitrary catalog operation URL joining.
- [x] Run `pnpm exec vitest run electron/ai/buildAiSdkModel.test.ts electron/vendorEndpoint.test.ts electron/ai/requestPipeline.test.ts`.

## 3. Official CLI preflight and process adapter

Files: new focused `electron/ai/antigravityCli*.ts` modules/tests; existing `streamTextTask.ts` transport boundary as required.

- [ ] Inspect official installer, CLI help, headless, permissions and model discovery docs. Install only official binary without editing shell profiles or global Google config. User performs Google login; do not read tokens.
- [ ] Before exposing execution, verify per-run permissions can reject file/command/MCP operations without mutating global permissions. Failure keeps the connection disabled and explicitly reports the missing guarantee.
- [x] Write process-fixture tests for split NDJSON, text deltas, one SUCCESS result, malformed/missing/duplicate terminal result, nonzero exit, stderr errors, timeout, cancellation and task process cleanup. For example:

```ts
expect(events.map(event => event.type)).toContain("text-delta");
await expect(run).rejects.toMatchObject({ name: "AbortError" });
```

- [x] Implement no-shell spawn with allowlisted argv, bounded output, isolated cwd, per-task process ownership, explicit terminal result validation and usage. Do not resume global latest conversation, fallback to gemini or auto-switch to paid API.
- [ ] Run adapter tests; use the actual installed binary for help, discovery and permission checks. Authentication-required is not success.

## 4. Catalog, IPC and approved connection card

Files: dedicated CLI vendor seed and UI connection card, existing onboarding bridge/IPC registries, `OnboardingDrawer.tsx` connection projection, text-model capability filters and existing locale files.

- [ ] Extend existing catalog and model eligibility tests: auth-none does not require a Key; CLI only appears for supported text tasks; native tool-required Agent selection rejects it instead of silently choosing another model.
- [ ] Register disabled-by-default `antigravity-cli` vendor, default automatic model, bounded detect/models/test/login actions. Installation is not authentication; installation/auth errors remain distinct from a successful paid or subscription request.
- [ ] Implement the approved existing-setting card: one state-dependent main action, recheck, disclosure details; no Key field, extra canvas button, fake live state or duplicate network settings.
- [ ] Validate i18n, light/dark, persisted enable state, stale results after disabling, and cancellation. Use approved HTML as the visual comparison, not as production code.

## 5. Real model/user-task acceptance and delivery

- [x] Extend `tests/ux/agnes.e2e.mjs` to the new enabled capabilities and validate actual media download/project persistence. Reuse current Key only via process env; do not resubmit pending video jobs. Stop permission/quota failures without blind retries.
- [ ] Run short and cancellable long CLI text tasks after user login; verify no unauthorized file/tool side effects. Google API requires its own credential, never the Agnes Key.
- [ ] Spec review then code-quality review; resolve findings and repeat affected tests.
- [ ] Run `pnpm run check:filesize`, `check:tokens`, `check:i18n`, `lint:ci`, `typecheck`, `test`, `build` in order. Then actual Electron walkthrough, visual comparison and persisted-effects verification.
- [ ] Refresh remote baseline safely, commit only scoped source/docs/tests after gates, push task branch and open PR using a body file. Do not merge. Report exact passed/blocked checks and measured usage without guessing charges.

## Known external resources

Current Agnes Key lists six models; remaining four need provider eligibility for true full-model testing. Official agy 1.1.21 is now installed and checksum-verified; the real process returns LOGIN_REQUIRED before any model prompt is sent. Google login and approval of the revised full-capability mockup remain external prerequisites. Native Gemini API tests separately require a Google API credential. These constraints must not be relabeled as successful real tests.

## Current checkpoint after scope correction

Baseline was synchronized to origin/main 5f09b95d (#185), then refreshed again to 7dab8ee8 (#187 reference asset transport) before the checkpoint PR. The upstream split default generator and builtin vendor registry are retained; non-Agnes generated defaults are unchanged by this task. Recovery stashes 81e6ff9433d13cdc076dcdf29064ae7d7fddc9ee and b1dcd7b08ec7a3364e0c9046f48e2cd8c03eb522 are retained. Final gates and UI checks are rerun on 7dab8ee8; earlier 5f09b95d evidence remains explicitly dated below.

- Agnes ten-model contracts implemented, reviewed and covered by focused mapping/seed/archetype tests. Parent fixed fps × duration silent clamping and nomi-local text attachment resolution. Nine actual Nomi runtime scenarios now have successful results; one initial keyframe rejection led to min-two validation and a successful corrected run. See the runtime verification audit. Old Image 2.1 pixel-size migration now preserves the original aspect ratio with the valid new tier.
- Gemini explicit SDK base paths preserved; 64 focused tests and independent review passed. No live Google API test without its credential.
- CLI process/protocol and connection lifecycle are infrastructure only; 17 ownership tests cover silent descendants on success/cancel and cancellation during asynchronous cleanup; Mac/Linux owned process-group cancellation, bounded output and strict single-turn parsing have fixtures. Native Windows remains gated pending equivalent descendant ownership. Real CLI authentication probe fails before model use.
- UI neutral extraction/controller exists, but full-capability card and IPC/task wiring do not. The unfinished CLI homepage entry is hidden so it cannot open an empty detail page.
- Revised mockup contains independent text/vision/generate/edit states; 25 design checks passed. It is not real CLI acceptance and awaits user approval.
- Final 7dab8ee8 checkpoint: full `pnpm run gates` exit 0; 760 test files / 6876 tests passed, one file/test skipped; build passed. Extra test-type gate exposed malformed Model fixtures; corrected them and reduced the existing baseline from 111 to 110. Actual Electron walkthrough verified ten visible catalog rows, both Image 2.1 modes and their parameters, and six retained assets after restart. No old canvas nodes were present, so legacy migration has unit coverage only. See the runtime audit for exact build/evidence boundaries.
- Remaining: authenticated media contract/permission probes; actual image artifact import and cancellation; production capability routes/card; Gemini credential test; full Antigravity user-task acceptance. Preserve scoped changes in a draft checkpoint PR after gates; do not mark the overall task complete or merge.

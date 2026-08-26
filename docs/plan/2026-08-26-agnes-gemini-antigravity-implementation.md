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

- [x] Inspect official installer, CLI help, headless, permissions and model discovery docs. Install only official binary without editing shell profiles or global Google config. User performs Google login; do not read tokens.
- [x] Before exposing execution, verify per-run permissions can reject file/command/MCP operations without mutating global permissions. Failure keeps the connection disabled and explicitly reports the missing guarantee.
- [x] Write process-fixture tests for split NDJSON, text deltas, one SUCCESS result, malformed/missing/duplicate terminal result, nonzero exit, stderr errors, timeout, cancellation and task process cleanup. For example:

```ts
expect(events.map(event => event.type)).toContain("text-delta");
await expect(run).rejects.toMatchObject({ name: "AbortError" });
```

- [x] Implement no-shell spawn with allowlisted argv, bounded output, isolated cwd, per-task process ownership, explicit terminal result validation and usage. Do not resume global latest conversation, fallback to gemini or auto-switch to paid API.
- [x] Run adapter tests; use the actual installed binary for help, discovery and permission checks. Authentication-required is not success.

## 4. Catalog, IPC and approved connection card

Files: dedicated CLI vendor seed and UI connection card, existing onboarding bridge/IPC registries, `OnboardingDrawer.tsx` connection projection, text-model capability filters and existing locale files.

- [x] Extend existing catalog and model eligibility tests: auth-none does not require a Key; CLI only appears for supported text tasks; native tool-required Agent selection rejects it instead of silently choosing another model.
- [x] Register disabled-by-default `antigravity-cli` vendor, default automatic model, bounded detect/models/test/login actions. Installation is not authentication; installation/auth errors remain distinct from a successful paid or subscription request.
- [x] Implement the approved existing-setting card: one state-dependent main action, recheck, disclosure details; no Key field, extra canvas button, fake live state or duplicate network settings.
- [ ] Validate i18n, light/dark, persisted enable state, stale results after disabling, and cancellation. Use approved HTML as the visual comparison, not as production code.

## 5. Real model/user-task acceptance and delivery

- [x] Extend `tests/ux/agnes.e2e.mjs` to the new enabled capabilities and validate actual media download/project persistence. Reuse current Key only via process env; do not resubmit pending video jobs. Stop permission/quota failures without blind retries.
- [x] Run short and cancellable long CLI text tasks after user login; verify no unauthorized file/tool side effects. Google API requires its own credential, never the Agnes Key.
- [x] Spec review then code-quality review; resolve findings and repeat affected tests.
- [x] Run the complete repository gates on the final synchronized source and repeat the actual Electron grouped-model/detail/reopen walkthrough. Persisted text and manual asset evidence are recorded; automatic image persistence remains externally blocked rather than marked complete.
- [x] Refresh the remote baseline safely, commit only scoped source/docs/tests after gates, push the task branch and update draft PR #188 with a body file. Do not merge. Report exact passed/blocked checks and measured usage without guessing charges.

## Known external resources

Agnes models without an eligible upstream channel cannot pass real calls despite catalog integration. Official agy 1.1.21 is installed and signed in; the grouped-model replacement is approved and implemented. Google image generation currently returns account-capacity 429 (reset 2026-09-02T16:07:23Z), so the full automatic media persistence journey remains blocked. Native Gemini API tests separately require a Google API credential. See the current application acceptance audit; do not relabel these constraints as successful real tests.

### Authenticated continuation (2026-08-27)

### Approved application wiring (2026-08-27)

**Latest steering — design consistency (2026-08-27):** The user rejects the separate four-capability/model-selection interaction. Preserve completed runtime wiring and tests; pause further acceptance of the old card. Read the current design revision in `2026-08-26-agnes-gemini-antigravity-design.md`. Revise the same mockup to the real `SettingsDialog` connection shell, `ModelChipGroups`, and `ModelSettingsDetailDialog` / `ModelWorkspacePage` detail structure. The replacement was approved below and is now implemented for acceptance. Discovery/verification/enablement remain distinct; count 14 actual model IDs separately from automatic routing and the image tool. Remove the old card's independent selector/test/enable surface when replacing it; do not create a parallel details page. No new model calls during this design correction.

**Follow-up — group reasoning variants:** Display seven model families, retaining all fourteen discovered wire IDs. Reuse the generic model-variant concept and existing detail/parameter controls: multiple discovered tiers get a selector, single-tier families get a fixed value. Preserve exact-ID verification, enabled preferences and existing node choices; grouping must not silently substitute IDs or promote one tier's successful check to its siblings. Keep unknown model identities separate. The revised static mockup includes seven initially rendered model names and declares exact tier IDs once in their metadata; no runtime-created empty model list. The user subsequently approved this revision; production replacement is implemented and under acceptance.

**Approval and execution — 2026-08-27:** User approved “好的替换接入吧”. Replace production now; no further mockup approval needed. Steps: (1) add exact model-family/variant projection and identity tests, preserving unknown IDs; (2) replace the connection card with existing grouped chips and route them to the common model detail dialog; (3) extend common detail slots for per-model verification and variant selection, retaining the existing enable switch, input summary and request summary; (4) propagate the same grouping to existing creative/canvas selectors without dropping original IDs or migrating old selections to other tiers; (5) remove the former standalone capability selector, rerun unit/type/lint/build gates, verify the real Electron design and full media task/persistence/cancellation paths, then update scoped PR without merging. Existing official contract references and authenticated results remain valid inputs, not substitutes for new app acceptance.

User approved proceeding with the four-capability design and explicitly requires listing the integrated models. Refreshed origin/main: existing task branch remains 2 commits ahead, 0 behind. Preserve previous mockup edits and outputs; no default-branch mutation.

1. Extend the existing process lifecycle with trusted per-task media profiles, exact staged-image allowlists and the verified private plugin hook. No separate process runner, global config changes, token handling, unrestricted tools or shell supplied by renderer. Reuse strict stream validation; tool ERROR is failure. Only task-scoped emitted conversation artifacts may be read, validated and imported.
2. Route text/vision and image/edit through existing Nomi task/asset persistence contracts. Input references must use the existing authorized asset reader. Media results must survive project reopening; cancellation must not mark success or leave published artifacts.
3. Extend main-process connection state with individual capability and actual-model verification records. Discovery preserves exact IDs/labels, never manufactures current entitlement. Register text models from discovery and a separate image-tool capability (not a fabricated upstream model). Each model/capability verification is independent; no historical test data hardcoded as current readiness.
4. Implement the approved card in the existing settings shell, with all four capability rows and the discovered model list/statuses. Use existing enable controls, i18n and token styles. Show failures and unverified entries explicitly. Enforce readiness in the backend, not only in renderer.
5. Test first at each boundary, then spec and quality reviews. Run real native-through-Nomi text/vision/image/edit scenarios, persisted asset reopening, cancellation and permission negatives. Complete all repository gates before scoped branch commit/push and update draft PR #188; do not merge.

Rollback: revert scoped application-wiring commits; retain user credentials, global Google config and generated user assets. No new framework or SDK; official CLI remains the only subscription transport. Video/audio generation remains unadvertised without a verified official callable contract. The local mockup file is blocked by Browser Use URL policy; do not use another surface to bypass that block. Production Electron acceptance is a distinct application task and must use its existing test harness.

The login prerequisite is now resolved: explicitly passing the existing system proxy fixed the OAuth TCP timeout, and the user completed native Google login. See `docs/audit/2026-08-27-antigravity-authenticated-verification.md`; the earlier checkpoint remains historical evidence.

- [x] Prove native text output and custom agent system-body loading without reading account credentials.
- [x] Compare an empty tool whitelist against a view_file-only visual task using task-owned fixtures; distinguish advertised init inventory from effective agent permissions.
- [x] Native image generation/editing, exact task reference evidence, JPEG decode and actual output path verification. Real Nomi text streaming cancellation passed.
- [x] Complete media execution-before-tool reference restrictions and application artifact import before implementing/exposing the media runtime adapter.
- [x] Correct the process profile to the verified documented custom-agent format. Replace the false empty-init-inventory assumption with schema checks plus declared/reviewed per-profile permission rules; keep tool-event rejection for the text-only profile. Add regression fixtures before code edits and rerun the real adapter, not just native CLI.
- [x] Discover 14 actual CLI model IDs and run each once: initially 11 exact text passes, GPT-OSS response mismatch, 2 Pro timeouts; bounded follow-up passes Pro High/GPT-OSS arithmetic, Pro Low still times out (13/14 with a passing real assertion).
- [x] Implement model discovery projection with malformed-output and stdin EOF tests; do not advertise account access from discovery alone.
- [x] Wire existing text/media task paths and status/cancel IPC only after the relevant contract is verified; do not silently fall back to a paid API or mix API-key and subscription sessions.
- [x] Obtain revised full-capability/grouped-model mockup approval and replace the production card. Complete gates and draft PR delivery are tracked separately; automatic media acceptance remains blocked by the documented upstream quota.

## Current checkpoint after scope correction

Baseline was synchronized to origin/main 5f09b95d (#185), then refreshed again to 7dab8ee8 (#187 reference asset transport) before the checkpoint PR. The upstream split default generator and builtin vendor registry are retained; non-Agnes generated defaults are unchanged by this task. Recovery stashes 81e6ff9433d13cdc076dcdf29064ae7d7fddc9ee and b1dcd7b08ec7a3364e0c9046f48e2cd8c03eb522 are retained. Final gates and UI checks are rerun on 7dab8ee8; earlier 5f09b95d evidence remains explicitly dated below.

- Agnes ten-model contracts implemented, reviewed and covered by focused mapping/seed/archetype tests. Parent fixed fps × duration silent clamping and nomi-local text attachment resolution. Nine actual Nomi runtime scenarios now have successful results; one initial keyframe rejection led to min-two validation and a successful corrected run. See the runtime verification audit. Old Image 2.1 pixel-size migration now preserves the original aspect ratio with the valid new tier.
- Gemini explicit SDK base paths preserved; 64 focused tests and independent review passed. No live Google API test without its credential.
- CLI process/protocol and connection lifecycle are infrastructure only; 17 ownership tests cover silent descendants on success/cancel and cancellation during asynchronous cleanup; Mac/Linux owned process-group cancellation, bounded output and strict single-turn parsing have fixtures. Native Windows remains gated pending equivalent descendant ownership. Real CLI authentication probe fails before model use.
- UI neutral extraction/controller exists, but full-capability card and IPC/task wiring do not. The unfinished CLI homepage entry is hidden so it cannot open an empty detail page.
- Revised mockup contains independent text/vision/generate/edit states; 25 design checks passed. It is not real CLI acceptance and awaits user approval.
- Final 7dab8ee8 checkpoint: full `pnpm run gates` exit 0; 760 test files / 6876 tests passed, one file/test skipped; build passed. Extra test-type gate exposed malformed Model fixtures; corrected them and reduced the existing baseline from 111 to 110. Actual Electron walkthrough verified ten visible catalog rows, both Image 2.1 modes and their parameters, and six retained assets after restart. No old canvas nodes were present, so legacy migration has unit coverage only. See the runtime audit for exact build/evidence boundaries.
- Remaining: authenticated media contract/permission probes; actual image artifact import and cancellation; production capability routes/card; Gemini credential test; full Antigravity user-task acceptance. Preserve scoped changes in a draft checkpoint PR after gates; do not mark the overall task complete or merge.

### Grouped-model acceptance progress (2026-08-27)

- Seven visible family chips use the existing connection card and model dialog. Fourteen raw IDs remain intact; unknown IDs stay separate, and auto/tool are separate categories.
- Thinking tier uses the existing select control, preserves the selected raw ID on return, and does not inherit sibling verification or enabled state. Canvas text nodes reuse the generic model/variant controls.
- The former four-tile connection panel and raw-ID list implementation are removed. Native verification occupies the common model status section; the common enable switch remains explicit.
- Added regression coverage for unselected/home rendering, grouping and unknown identities, renderer selector writes, exact proof and enablement, dialog dismissal cancellation, and quit while native/persistence work is active.
- Real production Electron screenshots 08/09/11 were inspected: seven names visible, common detail raw ID matches selected High/Medium, dismissed test reports cancelled with no proof. Real High text verification passed. Media/asset and final-base acceptance remain in progress.
- Repeatable native-app driver: `NOMI_LIVE_ANTIGRAVITY=1 node tests/ux/antigravity-cli.live.walk.mjs`; JSON-line actions are recorded in local outputs. The driver requires an already-installed/logged-in official CLI and explicitly opts into quota use. No account tokens or API keys are accepted by the driver.

### Latest formal-app acceptance

See `docs/audit/2026-08-27-antigravity-application-acceptance.md` for current evidence. The historical checkpoint sections above are not the current capability state. Grouped UI and all four runtime routes are implemented; text and manual asset persistence have been observed in the actual app. Strict image/edit verification succeeded, but subsequent real canvas image calls hit Google image quota. Automatic generation/import/reopen is not claimed passed. The formal 14-ID text/vision matrix completed 28 checks: 24 passed, 4 failed with retained diagnostics; it is independent from the native preflight matrix. See the audit table for each raw model ID and the distinction between strict-response failure, timeout, upstream congestion, and rejected nonce handshake.

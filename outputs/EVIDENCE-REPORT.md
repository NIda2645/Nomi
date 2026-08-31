# Agnes / Gemini / Antigravity provider evidence — REPORT

**What this is.** The recovered QA evidence backing the Agnes + Gemini + Antigravity provider
onboarding work (2026-08-26 → 2026-08-27). Originally shipped as PR #267
(`test: recover Agnes provider evidence`) — a pure-add of 178 raw artifact files / 24.76 MB.
Per the maintainer ruling, this branch is slimmed to **this report + a per-file manifest
(`EVIDENCE-MANIFEST.md`) + a small set of representative samples**. The full raw artifacts stay
in git history and are retrievable via the manifest.

**Why slim.** The *conclusions* these artifacts prove are already merged on `main`, twice over:
the five `docs/audit/2026-08-2{6,7}-*.md` audit docs write up the findings, and the provider
feature itself (`electron/ai/antigravity*`, `electron/catalog/agnes*` / `antigravity*`,
`src/config/modelArchetypes/{agnesImage,agnesVideo,antigravityImage,geminiOmni11}.ts`,
`src/ui/onboarding/Antigravity*`, `src/i18n/locales/antigravity.ts` and their tests) is shipped.
Keeping 24.76 MB of screenshots and raw event logs in the tree buys nothing the audit docs and
manifest don't already give; it just bloats every clone. So we keep the human-readable reports,
the small high-signal result JSONs, the regression/fix screenshots, and one representative media
artifact — and index the rest.

## What the evidence proves (four runs)

1. **Agnes real Electron UI acceptance** (`agnes-latest-main-ui-walk-20260826/`, zero spend).
   The Agnes catalog renders **5 text / 2 image / 3 video** models with enabled states retained,
   and Image 2.1 exposes both **文生图** and **改图** modes. This run **caught a regression** —
   the capability editor rendered a blank `文生图 · 0 素材槽 · 0 参数` while the details page
   still reported two modes (`05-image21-input-contract.png`) — root-caused to a trusted builtin
   archetype being wrongly routed through the custom-contract normalizer that requires an explicit
   integer `max` (`customCapabilityContract.ts:228`) and rejecting the whole builtin. The parent
   fixed the projection and rebuilt; `13-fixed-build-agnes-catalog.png` and
   `15-fixed-image21-modes.png` independently verify the corrected display, and
   `latest187-REPORT.md` re-confirms on a second fresh build (0 renderer errors, stable asset IDs).
   Reference-slot max is truthfully **blank/unknown**, not a fabricated cap.

2. **Agnes / Gemini model preflight** (`agnes-gemini-preflight-20260826/`).
   Zero-spend + paid smoke across text (streaming + tools), vision, image (image20), and video
   (2.0 t2v/i2v, 2.5 flash) with media-decode checks. Result JSONs (`text-smoke.json`,
   `paid-recheck.json`, `video*-media-check.json`) record that each probed model responds and its
   media decodes.

3. **Antigravity authenticated CLI verification** (`antigravity-authenticated-20260827/`).
   Official CLI v1.1.21, no copied OAuth tokens. Native text, local-image vision, image generation
   and reference editing **pass**; generated/edited JPEGs are **1024×1024, mjpeg, decode pass**,
   SHA-pinned in `artifacts.json`. **14** model IDs discovered, **13** with a passing real
   assertion (Pro Low timeout retained honestly). Native `view_file` hooks correctly **block** on
   explicit deny / exit 1 / malformed JSON / timeout against a task-owned canary
   (`hook-negative-results.json`). Focused tests 76 passed; final full gates 6896 passed / 1
   skipped. No monetary charge returned.

4. **Antigravity capability mockup** (`antigravity-full-capability-mockup-20260826/`).
   Pre-implementation design reference: capability states rendered light / dark / mobile via
   `verify.mjs`, result in `verification.json`. Design reference, not a live run.

## Honest limits (carried from the source reports)

- Old Image-2.1 **node migration** was NOT UI-verified — the fixture project has zero nodes; no
  node was fabricated.
- Full **generation / video-codec quality** and full Nomi media routing were not exercised in the
  zero-spend UI walks.
- Antigravity **Pro Low** timed out; GPT-OSS exact-marker mismatch retained for bounded follow-up.
- No native **Windows** readiness or production UI completion is claimed.

## Full artifacts

See `EVIDENCE-MANIFEST.md` for every original file (name · bytes · sha256 · what it proves · kept
vs pruned) and the exact `git show <sha>:<path>` retrieval commands.

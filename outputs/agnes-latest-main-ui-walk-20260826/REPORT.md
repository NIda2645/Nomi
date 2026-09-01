# Agnes latest-main real Electron UI walkthrough · 2026-08-26

## Scope and safety

Read-only acceptance on the actual built Electron app, launched through `tests/ux/_launchApp.mjs` with the designated isolated profile and project `workspace-6c604c6d-0157-4b57-b798-0727808e9889`. No credential read/reveal, generation action, request test, model toggle, node creation, or custom capability save was performed. Credential observation was limited to `hasApiKey: true` and the visible “凭证已保存”. This run spent no generation quota. Existing settings can perform their normal connectivity check on opening; no generation test was invoked.

No production code was edited by this QA subtask. All artifacts are in this directory. Antigravity card implementation is outside this acceptance and remains unverified/unapproved.

## Actual result

| Check | Result | Evidence |
|---|---|---|
| Agnes catalog | 5 text, 2 image, 3 video models actually visible; 10 enabled retained | `13-fixed-build-agnes-catalog.png`, `fixed-observations.json` |
| Existing project reopened after process restart | 3 image and 3 video cards visible; image thumbnails all loaded locally at 1024×1024 | `12-fixed-build-reopened-assets.png` |
| Assets retained | Before/after final walkthrough list returned the same 6 asset IDs (3 PNG + 3 MP4); nothing generated | `fixed-observations.json` assetSnapshots |
| Image 2.1 modes after fix | 文生图: 0 slots / 2 parameters; 改图: 1 slot / 2 parameters | `15-fixed-image21-modes.png` |
| Reference slot after fix | Reference image input preserved; min 1; max blank, with no invented cap | `16-fixed-image21-edit-mode.png`, `17-fixed-image21-edit-size.png` |
| Image 2.1 parameters after fix | Both modes show size / 清晰度 and ratio / 比例; defaults 1K and 1:1 | `17`–`20` screenshots |
| Old Image 2.1 node migration | NOT UI-VERIFIED: designated project has no nodes (name-only project payload and empty actual canvas); no node was fabricated | `12-fixed-build-reopened-assets.png` and nodeCount 0 |
| Generation / full endpoint eligibility | NOT TESTED in this zero-spend walkthrough | No generation actions |

Screenshots 12, 13, 15, 16, 17, 18, 19, and 20 were opened and visually inspected by this agent after capture. They show the actual macOS Electron build, not a mock or alternate dev server. Video cards and thumbnails were checked, not full playback/codec quality. Double-clicking an image in the earlier sidebar run did not open a preview; `08-image-doubleclick-no-preview.png` records only the unchanged asset panel.

## Regression found and fix independently verified

Initial real UI evidence `05-image21-input-contract.png` showed only “默认模式 / 文生图 · 0 个素材槽 · 0 个参数”, despite the details page reporting two modes. No save was performed. Parent fixed the production root cause and rebuilt; the final screenshots above independently verify the corrected display.

This was a lost builtin projection, not an intentional blank custom override:

- `src/ui/onboarding/ModelCapabilityEditor.tsx:50` resolves the builtin archetype; lines 56–61 explicitly pass it into the draft initializer.
- In baseline HEAD `5f09b95d`, `capabilityContractDraft.ts:192` converted the builtin through `normalizeCustomCapabilityContract`; the source selection at baseline line 228 then fell back to an empty default when conversion returned null.
- Current `src/config/modelArchetypes/agnesImage.ts:17` truthfully omits the unpublished reference max. Baseline Agnes Image had a fabricated `max: 6`; this task removed it.
- `src/config/modelArchetypes/customCapabilityContract.ts:228` still correctly requires explicit integer max for a user-authored custom contract (checks at lines 240 and 242). Routing a trusted builtin through it rejected the entire builtin.
- `src/ui/onboarding/modelCapabilityProjection.ts:141` maps builtin modes directly, explaining why the details summary remained two modes while the editor lost them.
- Current `src/ui/onboarding/capabilityContractDraft.ts:204` documents and directly projects builtin modes. Custom-save validation remains at `ModelCapabilityEditor.tsx:98`; valid custom save writes an override at lines 113–120. No save was tested or attempted.
- Existing test intent already required prefilling curated archetypes, so the blank state contradicted that design. Parent added unknown-max/all-archetype preservation coverage; test results are owned by the parent, not asserted from this UI run.

## Build identity

{
  "branch": "codex/agnes-gemini-integration-20260826",
  "head": "5f09b95d5077bf01ae6e99ce2e86c22d26e647d9",
  "main": "dist-electron/main.js",
  "mainMtime": "2026-08-26T15:30:05.295Z",
  "mainSha256": "52dad3f2f51c0f944e63d0350efdf3f3c3d1a8ff2d34ca7461709883e4b9c8b6",
  "rendererIndexSha256": "8514b8eaccc5f9dd364a98126d8558b08ba72062091fc1674f3c485dfc8f1069",
  "rendererIndexMtime": "2026-08-26T15:30:00.776Z"
}

The git HEAD is the synchronized upstream baseline; the actual build includes uncommitted task changes. The renderer index digest distinguishes this frontend fix build, since main-process code digest did not change.

## Harness caveats

- `first-observations.json`: initial UI run that found the editor regression.
- `reopen-observations.json`: intermediate run invalidated while a concurrent build replaced dist chunks; two `Failed to fetch dynamically imported module` errors were observed. This is a harness/build-overlap artifact, not counted as an app regression. `10-reopened-existing-assets.png` actually shows the library before the project opened and is NOT asset acceptance evidence.
- `fixed-observations.json`: final fresh build launch; zero renderer page errors. One failed locator used the library-only model-settings test ID while on the project page; the observed project-page aria selector succeeded immediately afterward.
- `08-existing-image-preview.png` is an earlier misleading filename retained as raw evidence; it is identical to `08-image-doubleclick-no-preview.png` and does not prove image preview.
- `walk.mjs` is an interactive reconnaissance harness, not an automatically passing scenario. Action history and screenshots must be reviewed together. It uses explicit Node imports, and scoped ESLint passed with exit 0 (only the repository's MODULE_TYPELESS_PACKAGE_JSON runtime warning).

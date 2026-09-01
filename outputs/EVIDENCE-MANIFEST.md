# Agnes / Antigravity provider evidence — MANIFEST

Recovered evidence for the Agnes + Gemini + Antigravity provider work. This branch was
originally PR #267 (`test: recover Agnes provider evidence`), a pure-add of **178 files /
24.76 MB** of raw QA artifacts. The *conclusions* those artifacts back are already on
`main` as five audit docs and the full provider implementation (see "Where the conclusions
live" below), so this branch is slimmed to **report + manifest + representative samples**.

## Retrieval (full raw artifacts)

Every original file below is preserved in git history. To retrieve any pruned file:

```
git show e3c88384:<path>            # original evidence commit (PR #267)
# or the post-rebase tip, identical blobs:
git show 356a6d5f:<path>
```

- Original evidence commit (pre `update-branch`): `e3c88384` — `test: recover Agnes provider evidence`
- Post-`update-branch` tip (same evidence blobs, rebased on main): `356a6d5f`
- Branch: `codex/recover-agnes-evidence-20260831` (this slim commit is layered on top; pruned files remain reachable via the parent commit above)

## Where the conclusions live (already on `main`)

- `docs/audit/2026-08-26-agnes-gemini-preflight.md`
- `docs/audit/2026-08-26-agnes-runtime-verification.md` (references this dir's REPORT.md / latest187-REPORT.md)
- `docs/audit/2026-08-26-antigravity-full-capability.md`
- `docs/audit/2026-08-27-antigravity-application-acceptance.md` (references `antigravity-authenticated-20260827/application/`)
- `docs/audit/2026-08-27-antigravity-authenticated-verification.md` (references `antigravity-authenticated-20260827/`)
- Provider implementation: `electron/ai/antigravity*.ts`, `electron/catalog/agnes*.ts` / `antigravity*.ts`, `src/config/modelArchetypes/{agnesImage,agnesVideo,antigravityImage,geminiOmni11}.ts`, `src/ui/onboarding/Antigravity*`, `src/i18n/locales/antigravity.ts`, plus their `.test.ts` siblings.

## Representative samples kept in this branch

Legend: **KEPT** = file retained in this branch · pruned = removed here, retrievable from git history (see Retrieval above).

### `outputs/agnes-latest-main-ui-walk-20260826/`  (40 files, 9.30 MB → 6 kept)

Real macOS Electron UI acceptance of the Agnes catalog + Image 2.1 capability editor; found a blank-capability-editor regression and independently verified the fix on a rebuilt binary. Zero generation spend.

| file | bytes | sha256[:12] | status | what it proves |
|---|--:|---|---|---|
| `05-image21-input-contract.png` | 124552 | `4f1498dea6e9` | **KEPT** | Regression evidence: editor showed 文生图 · 0 素材槽 · 0 参数 despite details reporting two modes. |
| `13-fixed-build-agnes-catalog.png` | 439815 | `c9223ba2dd83` | **KEPT** | Fix verified: catalog shows 5 text / 2 image / 3 video, enabled states retained. |
| `15-fixed-image21-modes.png` | 249280 | `c94f07b46d46` | **KEPT** | Fix verified: 文生图 (0 slot/2 param) + 改图 (1 slot/2 param) after rebuild. |
| `REPORT.md` | 6364 | `46e65f0823c8` | **KEPT** | Human-readable acceptance report for this run (checks, evidence map, build identity, caveats). |
| `latest187-REPORT.md` | 2583 | `e11b5945e8fb` | **KEPT** | Second fresh-build recheck report on upstream baseline 7dab8ee8 (catalog 5/2/3, Image 2.1 two modes, 0 renderer errors). |
| `manifest.txt` | 1130 | `ca0b10990df0` | **KEPT** | Original file listing for this dir. |
| `01-initial.png` | 106149 | `ac7ce6c989a2` | pruned | UI walkthrough screenshot (step-by-step). |
| `02-model-settings-home.png` | 230845 | `7a69d6751c6c` | pruned | UI walkthrough screenshot (step-by-step). |
| `03-agnes-catalog-all-models.png` | 228567 | `5569c3958e21` | pruned | UI walkthrough screenshot (step-by-step). |
| `04-image21-model-details.png` | 169807 | `95924da74fe1` | pruned | UI walkthrough screenshot (step-by-step). |
| `06-existing-project-opened.png` | 131201 | `1f2730281ae9` | pruned | UI walkthrough screenshot (step-by-step). |
| `07-existing-assets.png` | 583569 | `f3123e2b9728` | pruned | UI walkthrough screenshot (step-by-step). |
| `08-existing-image-preview.png` | 588255 | `d5dc026a0725` | pruned | UI walkthrough screenshot (step-by-step). |
| `08-image-doubleclick-no-preview.png` | 588255 | `d5dc026a0725` | pruned | UI walkthrough screenshot (step-by-step). |
| `09-reopened-library.png` | 105909 | `8d37fe66d834` | pruned | UI walkthrough screenshot (step-by-step). |
| `10-reopened-existing-assets.png` | 115096 | `f51da03c0717` | pruned | UI walkthrough screenshot (step-by-step). |
| `11-fixed-build-library.png` | 106364 | `7166588021e3` | pruned | UI walkthrough screenshot (step-by-step). |
| `12-fixed-build-reopened-assets.png` | 583479 | `3a9592dd50ae` | pruned | UI walkthrough screenshot (step-by-step). |
| `14-fixed-image21-details.png` | 286137 | `dbcd60fa5a3b` | pruned | UI walkthrough screenshot (step-by-step). |
| `16-fixed-image21-edit-mode.png` | 280607 | `97b2654ca435` | pruned | UI walkthrough screenshot (step-by-step). |
| `17-fixed-image21-edit-size.png` | 319442 | `4873bf90973c` | pruned | UI walkthrough screenshot (step-by-step). |
| `18-fixed-image21-edit-ratio.png` | 301421 | `d33458101604` | pruned | UI walkthrough screenshot (step-by-step). |
| `19-fixed-image21-text-size.png` | 298682 | `4e6745c78cbc` | pruned | UI walkthrough screenshot (step-by-step). |
| `20-fixed-image21-text-ratio.png` | 301777 | `43668f6e935e` | pruned | UI walkthrough screenshot (step-by-step). |
| `first-observations.json` | 77135 | `5ebe53acbc94` | pruned | Raw DOM/observation dump for a walk run. |
| `fixed-observations.json` | 31367 | `f43915f7cd0a` | pruned | Raw DOM/observation dump for a walk run. |
| `latest187-01-library.png` | 106065 | `a68b53611f60` | pruned | Second-recheck screenshot. |
| `latest187-02-reopened-assets.png` | 445889 | `0916fefa0ebe` | pruned | Second-recheck screenshot. |
| `latest187-03-agnes-catalog.png` | 439815 | `c9223ba2dd83` | pruned | Second-recheck screenshot. |
| `latest187-04-image21-modes.png` | 249280 | `c94f07b46d46` | pruned | Second-recheck screenshot. |
| `latest187-05-image21-reference-slot.png` | 280606 | `44b875707d3e` | pruned | Second-recheck screenshot. |
| `latest187-06-image21-edit-size.png` | 319435 | `7c27474c31c0` | pruned | Second-recheck screenshot. |
| `latest187-07-image21-edit-ratio.png` | 301417 | `4cbaa5864ab4` | pruned | Second-recheck screenshot. |
| `latest187-08-image21-text-size.png` | 298682 | `4e6745c78cbc` | pruned | Second-recheck screenshot. |
| `latest187-09-image21-text-ratio.png` | 301777 | `43668f6e935e` | pruned | Second-recheck screenshot. |
| `latest187-10-reopened-assets-loaded.png` | 583635 | `0efe0330e132` | pruned | Second-recheck screenshot. |
| `latest187-observations.json` | 71257 | `ae974ea2328e` | pruned | Raw DOM/observation dump for a walk run. |
| `observations.json` | 77135 | `5ebe53acbc94` | pruned | Raw DOM/observation dump for a walk run. |
| `reopen-observations.json` | 10981 | `4e145f6ce450` | pruned | Raw DOM/observation dump for a walk run. |
| `walk.mjs` | 6925 | `efe8f8f5b5f8` | pruned | Harness / driver script. |

### `outputs/agnes-gemini-preflight-20260826/`  (24 files, 5.12 MB → 2 kept)

Zero-spend + paid smoke of Agnes / Gemini text, image and video models (text streaming+tools, vision, image20, video 2.0 t2v/i2v, video 2.5 flash) with media-decode checks.

| file | bytes | sha256[:12] | status | what it proves |
|---|--:|---|---|---|
| `paid-recheck.json` | 682 | `8ad872780fb1` | **KEPT** | Paid recheck result confirming the models bill/respond as expected. |
| `text-smoke.json` | 1702 | `cee9ae38fa26` | **KEPT** | Zero-spend text-model smoke result (streaming + tool call). |
| `additional-model-smoke.json` | 1072 | `da0da942d47e` | pruned | Raw result/metadata JSON. |
| `antigravity-mockup-limited-dark.png` | 86829 | `61cd40b5aaeb` | pruned | Capability mockup screenshot. |
| `antigravity-mockup-missing.png` | 72131 | `e48dec4b9ab9` | pruned | Capability mockup screenshot. |
| `antigravity-mockup-mobile.png` | 77383 | `314e8aa9a5dd` | pruned | Capability mockup screenshot. |
| `antigravity-mockup-ready.png` | 83654 | `98f70e84a243` | pruned | Capability mockup screenshot. |
| `image20-smoke.png` | 1303048 | `1b5536d0e90d` | pruned | UI walkthrough screenshot (step-by-step). |
| `replacement-image20.json` | 404 | `e4c8261f1eef` | pruned | Raw result/metadata JSON. |
| `replacement-key-recheck.json` | 884 | `ca7887c866e4` | pruned | Raw result/metadata JSON. |
| `replacement-text-stream-tools.json` | 814 | `7ed089d3aa57` | pruned | Raw result/metadata JSON. |
| `replacement-text-vision.json` | 402 | `32b6726c48d2` | pruned | Raw result/metadata JSON. |
| `replacement-video25flash-frame.png` | 689816 | `aa38bbe38f30` | pruned | UI walkthrough screenshot (step-by-step). |
| `replacement-video25flash-media-check.json` | 309 | `1783af50832a` | pruned | Raw result/metadata JSON. |
| `replacement-video25flash.json` | 821 | `4a5bca6ce26f` | pruned | Raw result/metadata JSON. |
| `replacement-video25flash.mp4` | 538686 | `9c3b0228910d` | pruned | Generated video artifact (smoke). |
| `video20-i2v.mp4` | 859326 | `c56c0cc86cf9` | pruned | Generated video artifact (smoke). |
| `video20-media-check.json` | 1399 | `3037dc2a97b7` | pruned | Raw result/metadata JSON. |
| `video20-t2v.mp4` | 1009320 | `7683ce4a1cca` | pruned | Generated video artifact (smoke). |
| `video25-serial.json` | 228 | `f8050f552ac2` | pruned | Raw result/metadata JSON. |
| `video25flash-media-check.json` | 383 | `2106f4d8b12e` | pruned | Raw result/metadata JSON. |
| `video25flash-result.json` | 397 | `d8e0c8e50e8a` | pruned | Raw result/metadata JSON. |
| `video25flash-serial.json` | 445 | `a19fc7da8420` | pruned | Raw result/metadata JSON. |
| `video25flash-smoke.mp4` | 639246 | `12d24b1cd8a4` | pruned | Generated video artifact (smoke). |

### `outputs/antigravity-authenticated-20260827/`  (106 files, 9.72 MB → 7 kept)

Authenticated Antigravity CLI (v1.1.21) verification: native text / local-image vision / image generation / reference edit passing, 14 models discovered (13 asserting), native view_file hook negative tests, and real generated/edited JPEG artifacts (1024x1024, decode pass, SHA-pinned). Includes an in-app `application/` Electron walk.

| file | bytes | sha256[:12] | status | what it proves |
|---|--:|---|---|---|
| `REPORT.md` | 1394 | `50a956c48fae` | **KEPT** | Human-readable acceptance report for this run (checks, evidence map, build identity, caveats). |
| `application/model-matrix.json` | 4499 | `72b21d916cfc` | **KEPT** | Model coverage matrix for the in-app Antigravity walk. |
| `artifacts.json` | 529 | `69e002be3960` | **KEPT** | SHA256 + byte size + ffprobe decode result for generated-crane.jpg / edited-crane.jpg (both mjpeg 1024x1024, decode pass). |
| `edit-reference-proof.json` | 160 | `b83000a098a3` | **KEPT** | Exact task-reference check for the reference-edit path (no account traces). |
| `generated-crane.jpg` | 457616 | `4ec6c6f32c60` | **KEPT** | REPRESENTATIVE MEDIA: real generated image (mjpeg 1024x1024, decode pass, sha256 96cf6832…) proving live generation actually produced a decodable artifact. |
| `hook-negative-results.json` | 1531 | `285825d1f5ef` | **KEPT** | Native view_file hook negative tests: explicit deny / exit 1 / malformed JSON / timeout each blocked against a task-owned canary. |
| `model-results.json` | 5422 | `c9c81298eb33` | **KEPT** | Per-model assertion results across the 14 discovered Antigravity models (13 pass; Pro Low timeout, GPT-OSS marker mismatch retained). |
| `application-walk.mjs` | 8394 | `6098a7f8b504` | pruned | Harness / driver script. |
| `application/01-initial.png` | 164373 | `a831bcc0ca17` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/02-antigravity-initial.png` | 284467 | `a2624c71bb9f` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/03-before-consistency-correction.png` | 271504 | `d37048b55d40` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/04-before-consistency-top.png` | 280791 | `8b407c6c6b5c` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/05-existing-agnes-connection.png` | 280807 | `7941a3e68bf7` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/06-existing-model-detail.png` | 183805 | `084e4196f650` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/07-grouped-load.png` | 147996 | `ac7e946b9f24` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/08-grouped-connection.png` | 219788 | `868f18a1ec6e` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/09-grouped-model-detail.png` | 218612 | `2f04c7fc4532` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/10-high-exact-identity.png` | 217230 | `504f5434049e` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/11-closed-test-cancelled-high-retained.png` | 226461 | `dec8e9482619` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/12-high-verified.png` | 212830 | `233e3f536644` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/13-image-tool-verified.png` | 201217 | `539b4644b608` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/14-edit-tool-verified.png` | 203947 | `6a0faa6088f0` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/15-final-image-result.png` | 192238 | `3f663ab95c4c` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/16-final-edit-result.png` | 196106 | `4e8c7b0f5824` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/17-canvas-image-ready.png` | 230109 | `cdeb336a86fb` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/18-image-generate-submitted.png` | 243386 | `f0ef3d285066` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/19-canvas-image-result.png` | 243966 | `44cbd1f243a6` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/20-canvas-image-generated.png` | 243966 | `44cbd1f243a6` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/21-canvas-failure-details.png` | 264510 | `a5fea2b3f317` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/22-observed-image-failure.png` | 257581 | `681780e58aa3` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/23-native-canvas-text-result.png` | 117448 | `dd5c879004f3` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/24-canvas-text-complete.png` | 124443 | `71b3e5251f7e` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/25-reopened-text-and-manual-asset.png` | 126604 | `2d678b3251a0` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/26-matrix-complete-canvas.png` | 410532 | `15c1150c3efe` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/27-final-grouped-models-light.png` | 260354 | `4a1f9883b0c4` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/28-final-model-detail-medium.png` | 242304 | `4aeda9210a9f` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/29-final-model-detail-medium.png` | 242633 | `b0e668cf9214` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/30-final-model-detail-medium.png` | 242633 | `b0e668cf9214` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/31-final-detail-low.png` | 242339 | `aff130c5812d` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/32-final-reopened-canvas.png` | 164507 | `4da7cdbcfa40` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/33-final-reopened-canvas.png` | 368625 | `689f97f738ad` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/34-final-grouped-models.png` | 260270 | `74f5b85490b4` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/35-final-model-detail.png` | 242234 | `2afd86d089d3` | pruned | In-app Electron walk screenshot (step-by-step). |
| `application/model-matrix-usage.json` | 10517 | `5e26e2256fa1` | pruned | Raw result/metadata JSON. |
| `application/native-1787768313394-34498.jsonl` | 4301 | `647a9c8c4d5e` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768415478-36155.jsonl` | 5166 | `d1f07d9d5a6f` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768638169-40207.jsonl` | 2147 | `11d94cf451b9` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768652554-40804.jsonl` | 3994 | `c1c9daa93de9` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768676648-41564.jsonl` | 2139 | `8c224e97558b` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768690712-41826.jsonl` | 4157 | `5105037d573d` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768710715-41979.jsonl` | 2132 | `93cbe6efc640` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768730099-42049.jsonl` | 3992 | `77e3bc32614a` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768746089-42203.jsonl` | 2310 | `809474555f15` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768757788-42252.jsonl` | 3997 | `facba1590d71` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768772444-42301.jsonl` | 2143 | `d655643803b6` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768784742-42384.jsonl` | 4168 | `70befe4feaa0` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768798818-42412.jsonl` | 2132 | `0cc757193af6` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768810630-42445.jsonl` | 4326 | `8b5b02d5ae1f` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768824937-42471.jsonl` | 2321 | `99b5496bd947` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768836312-42569.jsonl` | 4156 | `055d906523a3` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768850424-42611.jsonl` | 2149 | `b88213f32ec1` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768864911-42709.jsonl` | 4164 | `665a7aeaeb81` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768878916-42840.jsonl` | 2132 | `37b3d5b11193` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768879094-42842.jsonl` | 2907 | `503e11d476b6` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768890614-42941.jsonl` | 4141 | `033e18c9b160` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768904925-43052.jsonl` | 2135 | `0ca1567528a6` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787768920841-43189.jsonl` | 1848 | `455c179147dd` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787769170192-44647.jsonl` | 2142 | `b621f511eb01` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787769191466-44830.jsonl` | 3983 | `d225a5236839` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787769269164-45159.jsonl` | 2131 | `8df6c7411973` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787769281744-45304.jsonl` | 4328 | `8e8783c23ee4` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787769302394-45689.jsonl` | 2137 | `8192574fd4ec` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787769316077-46032.jsonl` | 3999 | `1fedbff03e04` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787769338179-46334.jsonl` | 2237 | `2cc961117968` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/native-1787769350046-46485.jsonl` | 2377 | `208b14fbe5e0` | pruned | Raw native-CLI event log (jsonl) for one probe. |
| `application/report-1787766745206.json` | 4924 | `9d8ff9582d51` | pruned | Raw per-run harness report dump. |
| `application/report-1787767723685.json` | 35690 | `bd7eae050821` | pruned | Raw per-run harness report dump. |
| `application/report-1787768251665.json` | 80355 | `0ee3f0c31b8d` | pruned | Raw per-run harness report dump. |
| `application/report-1787768283874.json` | 80355 | `0ee3f0c31b8d` | pruned | Raw per-run harness report dump. |
| `application/report-1787768619054.json` | 33310 | `9308465537cd` | pruned | Raw per-run harness report dump. |
| `application/report-1787769526733.json` | 6236 | `de8ef59da13b` | pruned | Raw per-run harness report dump. |
| `application/report-1787769664529.json` | 38041 | `20fc9953e9fd` | pruned | Raw per-run harness report dump. |
| `application/report-1787769781578.json` | 18399 | `650eb2738aaa` | pruned | Raw per-run harness report dump. |
| `application/report.json` | 2144 | `60d341a4271b` | pruned | Raw result/metadata JSON. |
| `application/verified-edit-blue.jpg` | 104043 | `58603da48c74` | pruned | Generated/edited image artifact. |
| `design-before-consistency.html` | 22519 | `36a24be9a464` | pruned | Captured design snapshot. |
| `edited-crane.jpg` | 467698 | `244a3ed022dc` | pruned | Generated/edited image artifact. |
| `electron-edit-diagnostic.jsonl` | 4748 | `17820ef5df07` | pruned | Raw event log (jsonl). |
| `electron-edit-diagnostic.jsonl.result.json` | 202 | `a84a19c88474` | pruned | Raw result/metadata JSON. |
| `electron-runtime-diagnose.mjs` | 1397 | `5f7871cb349c` | pruned | Harness / driver script. |
| `model-followup-results.json` | 1168 | `23080f527c00` | pruned | Raw result/metadata JSON. |
| `model-models.json` | 1163 | `4a9c0bd3837a` | pruned | Raw result/metadata JSON. |
| `observe-cli.mjs` | 1562 | `7fd4692b98ad` | pruned | Harness / driver script. |
| `runtime-edit-0.jpg` | 138184 | `bc4c44956c51` | pruned | Generated/edited image artifact. |
| `runtime-edit-events.jsonl` | 4388 | `dcb527509058` | pruned | Raw event log (jsonl). |
| `runtime-edit-events.jsonl.denied.json` | 312 | `9c97943d515f` | pruned | Raw result/metadata JSON. |
| `runtime-edit-events.jsonl.gate-state.json` | 52 | `9d349e7160d1` | pruned | Raw result/metadata JSON. |
| `runtime-edit.json` | 652 | `4e9c8224d75e` | pruned | Raw result/metadata JSON. |
| `runtime-image-0.jpg` | 511929 | `451fb420cc63` | pruned | Generated/edited image artifact. |
| `runtime-image-events.jsonl` | 4500 | `03904f1d44ea` | pruned | Raw event log (jsonl). |
| `runtime-image.json` | 638 | `116ac47a92af` | pruned | Raw result/metadata JSON. |
| `runtime-live.ts` | 2157 | `98d6eaf524e0` | pruned | Runtime probe script. |
| `runtime-text-events.jsonl` | 2105 | `a23d0c3dcb5d` | pruned | Raw event log (jsonl). |
| `runtime-text.json` | 293 | `8a4f733ae515` | pruned | Raw result/metadata JSON. |
| `runtime-vision-events.jsonl` | 4127 | `e760239635c4` | pruned | Raw event log (jsonl). |
| `runtime-vision.json` | 300 | `5b37ef11b5bb` | pruned | Raw result/metadata JSON. |

### `outputs/antigravity-full-capability-mockup-20260826/`  (8 files, 0.62 MB → 2 kept)

Static capability mockup (light / dark / mobile) with a verify.mjs driver and verification.json — pre-implementation design reference, not a live run.

| file | bytes | sha256[:12] | status | what it proves |
|---|--:|---|---|---|
| `verification.json` | 1251 | `27a32cb0b609` | **KEPT** | Mockup verification result (states rendered light/dark/mobile). |
| `verify.mjs` | 4916 | `2d32ed408388` | **KEPT** | Driver that rendered and verified the capability mockup. |
| `01-current-login-light.png` | 104185 | `aa50f6b635fa` | pruned | Capability mockup screenshot. |
| `02-text-only-verified-light.png` | 108279 | `19d7d41629b8` | pruned | Capability mockup screenshot. |
| `03-text-image-verified-light.png` | 109269 | `79e50c8f8e3c` | pruned | Capability mockup screenshot. |
| `04-image-limited-dark.png` | 110104 | `7ed4d250119a` | pruned | Capability mockup screenshot. |
| `05-mobile-current-login-dark.png` | 94829 | `b084d2eff863` | pruned | Capability mockup screenshot. |
| `06-mobile-details-dark.png` | 122295 | `46ae19375c02` | pruned | Capability mockup screenshot. |


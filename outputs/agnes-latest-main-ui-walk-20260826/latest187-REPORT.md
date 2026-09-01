# latest187 final real Electron recheck

Fresh launch after BUILD READY on upstream baseline `7dab8ee8cc0990bdd57cca565966d9bfcddb4167`, with the designated isolated profile and unchanged existing project. No production edits, generation, custom capability saves, model toggles, uploads, or key reveal/read. Only the saved-credential boolean and safe capability field whitelist were inspected. Normal automatic connection checking may occur when the model settings page opens.

## Verified in the actual UI

- Agnes catalog: **5 text / 2 image / 3 video**, all existing enabled states retained. Screenshot `latest187-03-agnes-catalog.png`.
- Existing project reopened: **3 images / 3 videos** visible, all thumbnail images loaded locally. Screenshot `latest187-10-reopened-assets-loaded.png` is the settled asset evidence; `latest187-02-reopened-assets.png` was captured before video thumbnails finished loading.
- Asset IDs match both before/after this recheck and the prior fixed-build run: unchanged six assets.
- Image 2.1: **文生图 and 改图**, each **2 parameters**; both modes retain `size` and `ratio`. Screenshot `latest187-04-image21-modes.png` and detail screenshots `06`–`09`.
- Edit reference slot preserved, minimum **1**, maximum **blank** (unknown, not invented): `latest187-05-image21-reference-slot.png`.
- **0 renderer page errors; 0 failed walkthrough actions.**
- Screenshots 02–10 were individually opened and visually inspected, not just asserted through DOM values.

Old-node migration remains outside this fixture: the project has zero nodes; no old node was fabricated. Generation and full video playback were not tested in this zero-spend recheck. Antigravity UI/CLI is not part of this result.

## Build identity

```json
{
  "branch": "codex/agnes-gemini-integration-20260826",
  "head": "7dab8ee8cc0990bdd57cca565966d9bfcddb4167",
  "main": "dist-electron/main.js",
  "mainMtime": "2026-08-26T15:43:19.918Z",
  "mainSha256": "52dad3f2f51c0f944e63d0350efdf3f3c3d1a8ff2d34ca7461709883e4b9c8b6",
  "rendererIndexSha256": "a6af35ee41b6db9f330bce2c7548b199228ba2ad18524b7c6d490d0b6bc59497",
  "rendererIndexMtime": "2026-08-26T15:43:15.249Z"
}
```

`latest187-observations.json` contains the action log, safe catalog projection, asset IDs, and safe capability field values. A local evidence-consistency check confirmed the catalog count, stable IDs, both modes' parameter keys, unknown max, no failed actions, and no renderer errors. The shared `walk.mjs` passed scoped ESLint and Node syntax check after preparation. Earlier evidence was preserved.

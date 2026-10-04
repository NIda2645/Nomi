# Director 3D-BOX shell R13 evidence (2026-10-04)

All seven files are 1280×933 PNGs and under 400 KB. The six flag-on files are true Electron/Playwright captures from the baked dev build (`NOMI_DIRECTOR_3DBOX=true`); the flag-off comparison uses the same launcher with `NOMI_DESKTOP_DEV=1` and `NOMI_DIRECTOR_3DBOX=false`.

- `zh-empty-director.png`: zh-CN empty Director view. The canvas-only shell keeps Agent on the right, shows the dark PIP empty state, four topbar clusters, disabled `用这段预演出成片 ▾`, and an empty read-only shot strip.
- `zh-three-director.png`: zh-CN `t2-courtyard` project after external store write, 2-second autosave window, and reload. Three cards show `远景/拉远`, `远景/static`, `全景/推近` with measured time windows.
- `zh-three-refine.png`: zh-CN Refine mode with the existing scene/object panel, inspector, PIP, and timeline unchanged.
- `en-empty-director.png`: English empty Director view with `Director/Refine`, `Produce from this preview`, Program, and the empty shot strip.
- `en-three-director.png`: English three-shot Director view with `Far/Pull out`, `Far/Static`, and `Wide/Push in` cards.
- `en-three-refine.png`: English Refine mode using the existing full editor.
- `flag-off-legacy-director.png`: flag-off Chinese comparison; the old full Director desk and its original controls remain visible.

The Chinese captures were re-read after the PIP z-index fix. The English captures were produced by the earlier true Electron run and re-read; a later attempt to refresh the English set was blocked by a concurrent Electron process from another worktree, so the English empty capture remains the pre-z-index image and is retained as an evidence limitation rather than claimed as a refreshed dark-PIP capture.

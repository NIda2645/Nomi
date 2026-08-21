# Real draft film results (2026-08-21)

## Result

The acceptance film contract passes with a real local MP4:

- duration: 30.000 seconds (900 frames at 30 fps)
- video: H.264
- audio: AAC
- subtitles: `mov_text`, 29.900 seconds, 10 cues
- timeline: 8 contiguous clips and 3 authored transitions
- project persistence: script, storyboard, timeline, Run snapshot, subtitles and export are under one project

Run the deterministic media check with:

```bash
pnpm vitest run tests/production/real-draft-film.test.mjs
```

## What this proves

It proves the production contract from reviewed drafts to a project-local, playable,
captioned rough cut. The companion MCP Electron journey proves the external
Claude/Codex-style path, including script review before storyboard review,
materialization, per-shot gates, restart recovery and safe artifact projection.

## What this does not claim

The visual source is the repository's existing `launch-film-en.mp4`, not a fresh
provider generation. This is intentional: the test must not turn an unavailable
provider key into a fake quality claim. A provider-backed identity/action evaluation
should run the same Run with real credentials and record provider, model, spend,
retry counts and shotVerify scores separately.

The sample uses explicit hard cuts. The timeline contract preserves `dissolve`,
`fade`, `match_cut` and `whip_pan` as authored metadata, but the exporter has not
yet rendered those non-cut effects as visual xfade filters.

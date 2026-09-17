---
name: video-gen
description: |
  AI video generation via Seedance, Kling, Gemini Omni, MiniMax H3, and MiniMax H3 Max. Use when the user wants to generate a video clip — text-to-video, image-to-video, first/last-frame transitions, reference-guided generation — or wants to modify / edit / extend an existing generated clip.
user-invocable: true
---

# Video Gen

Submits one video generation job per call and returns a `jobId`. Job status and later check-backs belong to `track_progress`; this skill does **not** place videos on the timeline automatically.

## When to Use

## 摘录（只保留点名工具的段落）

Submits one video generation job per call and returns a `jobId`. Job status and later check-backs belong to `track_progress`; this skill does **not** place videos on the timeline automatically.
`firstFrame` / `lastFrame` / `refImages` / `refVideos` / `refAudios` all take a project asset reference. Prefer a full UUID or short prefix from `browse_assets`; `asset://<id>` and same-project asset URLs returned by asset tools are also accepted. Per-slot type: frame slots and `refImages` → image; `refVideos` → video; `refAudios` → audio.
- `submit_video.ratio` controls the generated asset only; it does not change the project timeline canvas. If the user requested a final output aspect ratio (for example "9:16 vertical" or "16:9 landscape"), set the timeline canvas to the same ratio with `manage_timelines` action=update (e.g. ratio:"9:16") before placing the completed asset. If the user asked for no black bars / full-bleed, pass `fit:"cover"` when setting the canvas or updating/adding the visual item.
- Do not use this skill for job management — use Desktop's reactive `track_progress action=wait` for generation completion, or `action=status` for an immediate snapshot.
- After submitting, call `track_progress` with `target=generation action=wait` so the result returns to this conversation. End the turn with only the job ID only when the user explicitly asked to queue it without waiting.
- `submit_video` reports the omni edit round; when it warns about chain depth, relay the suggestion to the user instead of silently continuing.
- When a shot depends on a previous generation, call `track_progress` with `target=generation action=wait`, then use its terminal `outputAssetId` as the anchor reference. Desktop keeps the wait open reactively; do not submit dependent shots in parallel.
submit_video({
submit_video({
submit_video({
After submission, call `track_progress` with `target=generation action=wait jobIds=<jobId>` by default. Desktop subscribes to the live job, so completion or failure enters this same conversation and any dependent step can continue with `outputAssetId`. If the user explicitly asked only to queue the job, return the `jobId` and end the turn instead; do not busy-poll.
submit_video({
- Do not try to manage jobs through `submit_video` — status and later check-backs belong to `track_progress`.

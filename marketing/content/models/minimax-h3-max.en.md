---
model: minimax h3-max
name: MiniMax H3-Max
maker: MiniMax and fal.ai
checkedAt: 2026-09-28
headline: The speed-optimized variant of MiniMax H3, jointly released by MiniMax and fal.ai, for faster text-, image-, and reference-to-video generation.
sources:
  - title: Video Generation (MiniMax official API docs, describing H3-Max as jointly released with fal.ai)
    url: https://platform.minimax.io/docs/guides/video-generation
  - title: MiniMax H3 Max (Text to Video) model page (fal.ai)
    url: https://fal.ai/models/minimax/h3-max/text-to-video
---

## What’s new

Compared with the base MiniMax H3:

- **Built jointly by MiniMax and fal.ai**: the official docs describe H3-Max as a model fal.ai post-trained on top of MiniMax H3, specifically optimized for generation speed.
- **Faster generation**: it's positioned around mainstream resolutions with higher throughput, for work where turnaround matters more than the top resolution tier.
- **fal.ai says it's tuned for stronger prompt adherence and better aesthetics**, while aiming not to sacrifice output quality (that framing comes from fal.ai itself).
- **Resolution shifted to 480P/768P**: the ceiling moved down to the more common tiers, in line with the faster positioning.

## What it’s good for

- Producing a lot of material quickly — batch storyboard tests, fast creative iteration.
- Work where 480P/768P is plenty and turnaround time matters more than peak resolution.
- The same three modes as MiniMax H3 — text-to-video, image-to-video (first/last frame), and reference-to-video — just on the faster track.

## Prompting tips

- **Prompting works the same way as MiniMax H3**: describe the relationship between your references in one sentence rather than filling in a fixed task template.
- **Use bracketed camera tags** like [pan] or [zoom] right after the relevant description.
- **First/last-frame accepts 0, 1, or 2 images**: with no image, it becomes plain text-to-video.
- **Reference mode caps mixed inputs at 12 files total** (images, video and audio combined) — the same per-type limits as MiniMax H3 apply.
- **Duration is an integer from 5–15 seconds**, a slightly higher floor than MiniMax H3's 4 seconds — don't ask for anything under 5.

```text
Reference-to-video, 768P, 8 seconds.
The character keeps the look from reference image 1, moving to the street-dance rhythm from reference video 1.
[follow shot] keep the character centered in frame, with a neon-lit night market in the background.
```

## Known limits

- The resolution ceiling is 768P, below MiniMax H3's 2K — use the base H3 model when top resolution matters most.
- Minimum duration is 5 seconds; MiniMax H3 itself allows as low as 4.
- The post-training approach was done by fal.ai, and MiniMax's own docs don't go into detail on the tuning method.

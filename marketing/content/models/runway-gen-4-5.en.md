---
model: runway gen-4.5
maker: Runway
released: 2025-12-01
checkedAt: 2026-09-28
headline: Runway’s current flagship video model, with both text-to-video and image-to-video support and more realistic physics — liquids, collisions and momentum — than Gen-4.
description: "Runway’s current flagship video model: text-to-video and image-to-video, with more realistic physics than Gen-4 — liquids, collisions and momentum."
sources:
  - title: Introducing Runway Gen-4.5 (Runway Research announcement, 2025-12-01)
    url: https://runway.com/research/introducing-runway-gen-4.5
  - title: Creating with Gen-4.5 (Runway Help Center)
    url: https://help.runwayml.com/hc/en-us/articles/46974685288467-Creating-with-Gen-4-5
  - title: Prompting Guide (Runway Academy)
    url: https://academy.runwayml.com/guides/prompting-guide
  - title: Models Catalog (Runway Dev)
    url: https://dev.runwayml.com/models/catalog
---

## What’s new

- **The first Gen-4 model with real text-to-video**: every earlier Gen-4 model (standard and Turbo) needed a starting image. Gen-4.5 is the first in the family to generate from text alone — image-to-video is still there too.
- **More believable physics**: Runway says objects now move with realistic weight, momentum and force, and liquids flow with proper dynamics.
- **Details hold up over time**: fine details like hair strands and material weave stay coherent across motion and time in longer shots, instead of shifting between frames.
- **Tops the leaderboard, per Runway**: Runway’s own announcement says Gen-4.5 ranked #1 on the Artificial Analysis Text-to-Video Arena with an Elo score of 1,247, ahead of Google Veo 3 (1,226), Kling 2.5 (1,225) and OpenAI Sora 2 Pro (1,206) — as of the December 2025 launch; the leaderboard may have moved since.

## What it’s good for

- Shots where physics has to look convincing — splashing water, shattering glass, objects colliding.
- Longer takes that need hair and material detail to stay stable and consistent all the way through, without popping or shifting.
- A workflow where you generate a first cut from a text prompt, then pick a frame and continue it with image-to-video.

## Prompting tips

- **For text-to-video, describe both the picture and the motion**: Runway recommends covering subject appearance, environment, lighting, composition and style, plus subject action, environmental motion and camera movement.
- **For image-to-video, focus on motion only**: the image already sets composition and style, so the prompt should mainly describe what happens next.
- **Use the recommended structure**: “[camera move] shot of [subject] [action] in [environment]. [supporting detail]”.
- **Be specific about the camera**: Runway suggests spelling out camera choreography, scene composition detail and the precise timing of events, rather than vague words like “cinematic”.
- **Use positive phrasing, and don’t overload the prompt**: describe what you want rather than what you don’t, and avoid long, over-specified paragraphs that end up limiting the model instead of guiding it.
- **Sequence multiple actions explicitly**: use “first… then…” language or timestamps to control order, e.g. “0–3s: X happens, 3–6s: Y happens”.

```text
Medium shot, slow leftward pan. A woman stands in front of a rain-streaked glass
facade wearing a beige trench coat. Rain runs down the glass as she turns to look
at the street, her coat hem lifting in the wind. First she glances at her watch,
then looks up and around, then turns and walks toward the camera.
Continuous camera movement, no cuts.
```

## Known limits

- **Three limitations Runway itself lists**: causal reasoning can run backwards (effects sometimes precede causes), object permanence can fail (objects appear or disappear unexpectedly), and there’s a success bias (actions succeed more often than they realistically should).
- **Keyframes and video-to-video aren’t there yet**: Runway’s help documentation still lists these as “coming soon” — for now only text-to-video and image-to-video are available.
- **Output caps out at 720p**: Runway’s documentation lists 720p output, 24fps or 25fps, and generations from 2–10 seconds. If you only need image-to-video and want something faster and lighter, Runway also offers Gen-4 Turbo.

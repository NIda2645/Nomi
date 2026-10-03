---
model: 可灵 3.0
name: Kling 3.0
maker: Kuaishou (Kling AI)
released: 2026-01-31
checkedAt: 2026-09-28
headline: Kuaishou's flagship Kling video model, with multi-shot storyboarding, synchronized audio-video generation, element references, and native 4K output.
sources:
  - title: Kling AI official release notes (Kling 3.0 full rollout, 2026-01-31)
    url: https://kling.ai/release-note/release-history
  - title: Kling AI Open Platform API docs — Getting Started overview
    url: https://kling.ai/document-api/guides/get-started/overview
  - title: Kling 3.0 API reference (Kie.ai)
    url: https://docs.kie.ai/market/kling/kling-3-0
---

## What’s new

- **Synchronized audio-video generation**: clips come with matching sound built in, no separate audio pass needed — Kuaishou lists this as a core 3.0-series capability.
- **Multi-shot storyboarding**: up to 5 shots in one generation, each with its own prompt, so a whole short story can play out in one take.
- **Element references**: tag up to 3 reference elements with `@name` syntax — people, products, or sounds — and the model keeps them consistent throughout the clip.
- **Native 4K output**: Kling AI said in April 2026 it was the first AI video model with native 4K output, and the 3.0 series can render directly at that tier.

## What it’s good for

- Multi-shot shorts that need a real beginning, middle and end: ads, product films, short-drama scenes.
- Projects where a character or product has to look the same in every shot — pin it down with element references.
- Clips that need built-in sound instead of a separate audio pass afterward.

## Prompting tips

- **Pick a quality tier first**: std, pro, or 4K — higher tiers hold more detail but render slower.
- **State duration in seconds**: 3–15 seconds per task; in multi-shot mode, split that total across the shots explicitly.
- **Turn sound on when you want it**, and describe the actual sound rather than just saying "with audio".
- **Reference elements with `@name`**: up to 3 elements per task, each holding 2–4 images, one 3–8 second video clip, or one 5–30 second audio clip.
- **Skip the aspect ratio when you supply an image**: it's picked up automatically from the reference image.
- **Mark shot boundaries clearly in multi-shot mode**: one sentence per shot, not several scenes crammed into one line.

```text
16:9, pro quality, 15 seconds, three connected shots, sound on.
Reference @girl: same face, same red coat, consistent throughout.
Shot 1 (0-5s): early morning, she steps out of a café holding a coffee cup.
Shot 2 (5-10s): medium shot, she sits on a bench as the wind lifts her hair.
Shot 3 (10-15s): wide shot, she looks down the street and smiles.
Sound: street ambience, wind, distant traffic. No extra people in frame.
```

## Known limits

- Multi-shot mode only supports a first-frame image — it can't be combined with first-and-last-frame mode.
- Each task can reference at most 3 `@` elements, and each element has its own caps (2–4 images, one video clip, one audio clip).
- Higher quality tiers, especially 4K, take longer to render — the docs don't give an exact multiplier.

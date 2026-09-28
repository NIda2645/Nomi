---
model: agnes image 2.1
maker: Agnes AI
checkedAt: 2026-09-28
headline: Agnes AI's image model tuned for dense, complex compositions, with tiered resolution up to 4K and support for text-to-image, editing and multi-image composition.
sources:
  - title: Agnes Image 2.1 Flash official docs (Agnes AI)
    url: https://agnes-ai.com/doc/agnes-image-21-flash
  - title: Agnes Image 2.1 Flash - Overview (Agnes-Ai Docs)
    url: https://wiki.agnes-ai.com/en/docs/agnes-image-21-flash
  - title: Agnes Image 2.0 Flash official docs (Agnes AI, for comparison with 2.1)
    url: https://agnes-ai.com/en/docs/agnes-image-20-flash
  - title: AgnesAI-Models official model catalog (GitHub, AgnesAI-Labs)
    url: https://github.com/AgnesAI-Labs/AgnesAI-Models
---

## What’s new

- **Tuned for information-dense images**: Agnes AI says this version handles complex compositions and detail-rich scenes — posters, infographic-style images — better than 2.0.
- **Resolution moved to tiers plus ratio**: instead of typing exact pixel dimensions, you pick a 1K/2K/3K/4K tier and one of 8 aspect ratios (1:1, 3:4, 4:3, 16:9, 9:16, 2:3, 3:2, 21:9); 2.0 still takes literal pixel sizes.
- **Better composition preservation on edits**: image-to-image and local edits hold the original layout together more reliably instead of drifting.
- **Multi-image composition**: beyond editing one image, it can combine several reference images into one new output.

## What it’s good for

- Information-dense visuals: posters, infographics, layout-heavy marketing assets.
- Edits that need to keep the original composition — restyling without reflowing the layout.
- Multi-image composition: stitching several assets into a single new image.

## Prompting tips

- **Structure the prompt**: Agnes AI's own recommended order is subject + scene/environment + style + lighting + composition + quality requirements — going through them one at a time beats stacking adjectives.
- **For edits, say what changes and what stays**: in image-to-image or editing tasks, spell out both sides explicitly, or the model will decide on its own.
- **Reference images must be publicly reachable**: if you pass a URL, it has to load without authentication — no gated links.
- **Give each image a role in multi-image composition**: name what each reference contributes to the final shot to avoid the model mixing up which is which.
- **A bigger tier isn't automatically the right choice**: 4K suits print-grade assets; 1K/2K is usually enough for everyday images — pick by use case rather than maxing it out by default.

```text
Subject: a cup of hand-poured coffee with steam rising, on a wooden table. Scene: by a window at dawn, soft natural light from the left.
Style: still-life photography, shallow depth of field. Composition: subject centered-left, negative space on the right for text. Quality: sharp, detail-rich, 4K.
```

## Known limits

- An exact pixel size outside the tier list (e.g. 1920x1080) gets normalized to the nearest tier rather than produced as-is.
- Reference image URLs must be publicly accessible; authenticated links aren't supported.
- Processing time scales with scene complexity; Agnes AI recommends clients allow a 60-360 second timeout.

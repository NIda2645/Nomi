---
model: gpt image 2
maker: OpenAI
released: 2026-04-21
checkedAt: 2026-09-28
headline: OpenAI's image model for generation and editing in one, with transparent backgrounds and resolution up to 4K.
sources:
  - title: GPT-Image-2 model reference (OpenAI official API docs)
    url: https://developers.openai.com/api/docs/models/gpt-image-2
  - title: Image prompting guide (OpenAI official API docs)
    url: https://developers.openai.com/api/docs/guides/image-prompting
  - title: GPT Image 2 text-to-image API reference (Kie.ai)
    url: https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image.md
  - title: GPT Image 2 image-to-image API reference (Kie.ai)
    url: https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image.md
---

## What’s new

- **Generation and editing in one model**: OpenAI positions it as its model "for fast, high-quality image generation and editing," with inpainting built in rather than needing a separate tool.
- **Up to 16 reference images per edit call**: whether you're generating from references or editing an existing image, a single call can take up to 16 input images.
- **Resolution up to 4K, with transparent backgrounds**: three resolution tiers (1K/2K/4K), and at 1K you can generate directly with a transparent background (PNG/WebP), skipping a separate cutout step.
- **A wide spread of aspect ratios**: 16 supported ratios, from square 1:1 to extreme banners like 21:9 and 9:21.

## What it’s good for

- Product shots, icons and stickers that need a transparent background — generate straight onto a clean alpha channel instead of cutting one out afterward.
- Editing an existing image while preserving the rest — swap the copy on a product shot while keeping composition, lighting and packaging details untouched.
- Print or large-display work where resolution matters, using the 4K tier.

## Prompting tips

- **State the use case and composition up front**: OpenAI's guide suggests naming the subject and intended use (a product photo, an ad, a diagram) first, then specifying composition, aspect ratio and where key elements should sit.
- **Use whatever format is easiest for you to edit**: there's no special syntax to memorize — plain prose, a labeled list, or tags all work, so pick whichever you can read and revise most easily.
- **Ask for "photorealistic" explicitly when that's the goal**: describe framing, materials and lighting too, since realism isn't the default assumption.
- **Separate what changes from what stays the same, for edits**: the recommended pattern is "change only X," then list everything to preserve — identity, geometry, layout, lighting, labels.
- **Iterate one step at a time across multiple edits**: feed the previous output back in as the next input, request a single change, and restate the details that must stay the same.
- **Put on-image text in quotes**: quote the exact wording you want rendered and describe its position and typography; spell out unusual words or brand names letter by letter if needed.

```text
A product photo of a dark chocolate protein bar, 1:1, transparent background (PNG). Photorealistic,
soft overhead light, slightly glossy wrapper, visible nut pieces on the surface. The wrapper reads
"PURE FUEL" in bold sans-serif, centered near the top. Clean background, just the product and a soft
drop shadow, no extra decoration. Change only the wrapper text; keep composition, lighting and
materials the same.
```

## Known limits

- **Transparent backgrounds only work at 1K**: setting background to transparent or opaque requires 1K resolution — 2K and 4K don't support it.
- **Some aspect ratios can't go to higher resolutions**: a 1:1 image can't be rendered at 4K; leaving aspect ratio on auto caps output at 1K; 5:4, 4:5, 3:1, 1:3 and 9:21 aren't available at 2K, and 3:1, 1:3, 9:21 aren't available at 4K either.

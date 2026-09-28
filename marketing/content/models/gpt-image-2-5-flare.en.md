---
model: gpt image 2.5 flare
maker: OpenAI
released: 2026-09-08
checkedAt: 2026-09-28
headline: OpenAI's fast tier of GPT Image 2.5, built for everyday generation, batch work and quick drafts.
sources:
  - title: GPT-Image-2.5 Flare model reference (OpenAI official API docs)
    url: https://developers.openai.com/api/docs/models/gpt-image-2.5-flare
  - title: Image prompting guide (OpenAI official API docs)
    url: https://developers.openai.com/api/docs/guides/image-prompting
  - title: GPT Image 2.5 Flare text-to-image API reference (Kie.ai)
    url: https://docs.kie.ai/market/gpt/gpt-image-2-5-flare-text-to-image.md
  - title: GPT Image 2.5 API reference (APIMart, covers both Flare and Sunburst)
    url: https://docs.apimart.ai/en/api-reference/images/gpt-image-2.5/generation.md
---

## What’s new

- **The fast tier of the 2.5 generation**: shipped 2026-09-08, officially described as OpenAI's "fastest model for high-quality, everyday image generation" — a separate product line from the precision-focused Sunburst, not just a speed setting on the same model.
- **Two new quality tiers**: the quality parameter now goes up to `xhigh` and `max` (alongside the existing low/medium/high/auto), and those top two tiers are exclusive to the 2.5 generation — the previous gpt-image-2 can't use them.
- **Up to 16 reference images per edit call**, with transparent-mask support for local inpainting so you can touch up just one region.
- **A more specialized aspect-ratio set**: 13 ratios including unusual wide/tall ones like 27:16, 16:27, 9:8 and 8:9 (though those four are capped at 1K — no 2K or 4K).

## What it’s good for

- High-volume work like social posts and e-commerce product shots, where generation speed matters.
- Fast drafting: rough out composition and creative direction on Flare before deciding whether a piece needs the more precise Sunburst tier.
- Batch-generating a family of similar assets (e.g. several angles of the same product) where each individual image doesn't need heavy polish.

## Prompting tips

- **Check whether you actually need the higher-precision tier first**: OpenAI's own guide suggests starting with Flare when quality demands aren't extreme, and if Sunburst's output already meets your bar, running the identical prompt on Flare to see if it's fast enough too.
- **State the use case and composition up front**: name whether it's a product photo, an ad, or a diagram, then specify aspect ratio and where key elements should sit.
- **Use whatever format is easiest for you to edit**: plain prose, a labeled list, or tags all work — there's no special syntax required.
- **Ask for "photorealistic" explicitly when that's the goal**, and describe framing, materials and lighting.
- **Put on-image text in quotes** and describe its position and typography.
- **Request a transparent background explicitly**: it won't default to transparent — set background to transparent and output as PNG/WebP.

```text
Four product shots of the same sport water bottle, all 16:9, white-background studio style,
photorealistic, soft light from the upper left at 45 degrees. Colors: black, white, navy, olive,
bottle angle varies slightly (front, 45-degree side, top-down, 45-degree back). Clean background,
just a soft drop shadow, no extra decoration.
```

## Known limits

- **A few extreme aspect ratios are capped at 1K**: 27:16, 16:27, 9:8 and 8:9 don't support 2K or 4K.
- **Leaving aspect ratio on auto, or picking certain ratios, can cap the resolution you can select** — check which resolution tiers are actually available before you pick a ratio.
- **Transparent backgrounds have to be requested explicitly**: the background parameter defaults to opaque/auto, not transparent — you need to set it to transparent and pair it with PNG/WebP output.

---
model: grok imagine image 2
name: Grok Imagine Image 2.0
maker: xAI
released: 2026-08-07
checkedAt: 2026-09-28
headline: xAI's image model that treats editing as a first-class feature — targeted region edits, background removal, up to 5 reference images, and a claimed #2 world ranking.
sources:
  - title: Imagine Image 2.0 (xAI news, 2026-08-07)
    url: https://x.ai/news/grok-imagine-image-2
  - title: Grok Imagine Image 2.0 model reference (xAI developer docs)
    url: https://docs.x.ai/developers/models/grok-imagine-image-2.0
  - title: Image Generation API reference (xAI developer docs)
    url: https://docs.x.ai/developers/model-capabilities/images/generation
---

## What’s new

- **Editing is now first-class**: a magic wand for targeted region edits, segmentation for precise selection, and background removal with transparent export are all new this generation, not bolted on top of text-to-image.
- **Multi-image reference input**: editing accepts up to 5 source images at once, for combining subjects, transferring styles or composing scenes.
- **Noticeably stronger text and layout**: xAI says it plans typography and layout the way a designer would, following instructions closely enough to keep small text legible in dense compositions.
- **Smart Resize**: automatically recomposes a shot across different aspect ratios instead of just cropping it.

## What it’s good for

- E-commerce and product photography: recoloring, cutting out backgrounds, producing transparent assets.
- Avatar and character work: professional headshots, game icons, character sprites.
- Precise local edits where you want to change one area without disturbing the rest of the image.

## Prompting tips

- **Point at exactly what should change**: combine the magic wand or segmentation tools with a prompt that states the target region and the desired outcome.
- **Write layout requests like a design brief**: it understands design language — typography, white space, composition — so describe it the way you'd brief a designer.
- **Ask directly for background removal**: it's one of the model's headline features, so just say "remove the background, export with transparency".
- **Use the count parameter for batches**: up to 10 images per request, useful when you want several options at once.
- **Pick a quality tier instead of relying on "auto"**: the API's quality parameter (low/medium/auto) resolves "auto" to low for generation but medium for editing — set it explicitly for final output.

```text
Remove the background from this product photo and export as a transparent PNG.
Keep the product's position, angle and color exactly as they are, with clean edges
and no leftover background color fringing.
```

## Known limits

- Multi-image editing tops out at 5 reference images per request.
- The "auto" quality setting resolves differently depending on the task — low by default for generation, medium for editing — which is easy to trip over if you don't set it explicitly.
- Only two resolution tiers are available, 1K and 2K, with nothing higher.

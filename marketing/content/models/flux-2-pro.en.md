---
model: flux.2 pro
name: FLUX.2 Pro
maker: Black Forest Labs
released: 2025-11-25
checkedAt: 2026-09-28
headline: Black Forest Labs' flagship image model, fusing up to 10 reference images at up to 4MP output, with a strong edge in typography and brand-consistent visuals.
sources:
  - title: "FLUX.2: Frontier Visual Intelligence (Black Forest Labs blog, 2025-11-25)"
    url: https://bfl.ai/blog/flux-2
  - title: FLUX.2 Overview (Black Forest Labs docs)
    url: https://docs.bfl.ml/flux_2/flux2_overview
  - title: FLUX.2 Prompting Guide (Black Forest Labs docs)
    url: https://docs.bfl.ml/guides/prompting_guide_flux2
  - title: Flux-2 Pro Image to Image API reference (kie.ai)
    url: https://docs.kie.ai/market/flux2/pro-image-to-image.md
---

## What’s new

- **Multi-reference fusion**: combines up to 10 reference images into one new output (the image-editing endpoint Nomi reaches through kie.ai caps at 8 — see Known limits).
- **Editing output up to 4MP**: edits keep their detail and coherence instead of degrading with each pass.
- **Noticeably stronger text and layout**: small text stays legible in dense layouts, infographics and UI mockups.
- **Better world knowledge and prompt adherence**: it follows more complex descriptions, composes more coherently, and holds brand guidelines (colors, fonts, logos) more consistently.

## What it’s good for

- Commercial visuals that need to stay on-brand: consistent colors, fonts and logos.
- Text-heavy, precisely laid-out work like infographics and UI mockups.
- Multi-image composition: combining several source images into one new scene while keeping each subject recognizable.

## Prompting tips

- **Write subject, then action, then style, then context**: put the most important details first — word order visibly affects what the model prioritizes.
- **No negative prompts**: the official guide states "FLUX.2 does not support negative prompts" — describe what you want, not what to avoid.
- **Be specific about photography**: naming a camera, lens and film stock ("shot on a Hasselblad X2D, 80mm lens, f/2.8") beats a generic "professional photo".
- **Use hex codes for color**: tying a hex value to a specific object ("the sofa in hex #1B6B6F") is far more precise than a color name.
- **Quote in-image text and describe placement/font**: wrap the text you want rendered in quotes and say where it sits and what typeface it should look like.
- **Use structured JSON prompts for complex scenes**: declaring scene, subjects, positions, lighting and camera separately helps with production work that needs to repeat reliably.

```text
A minimalist product shot for a skincare brand, subject centered on a matte pedestal in hex #EDE6DB.
Shot on a Hasselblad X2D, 80mm lens, f/2.8, soft studio light from the upper left.
A small card beside the product reads "NEW · Vitamin C Serum" in elegant serif type.
Square 1:1, clean negative space on the right third for a text overlay.
```

## Known limits

- No negative prompt support — only positive descriptions work.
- Text-to-image and image-to-image are separate model IDs: the edit endpoint Nomi reaches via kie.ai tops out at 8 reference images and supports one extra "auto" aspect-ratio option that text-to-image doesn't — the two parameter sets aren't interchangeable.
- Maximum output is 4MP, and dimensions must be multiples of 16 or the request is rejected.

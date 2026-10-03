---
model: runway gen-4 turbo
maker: Runway
released: 2025-04-07
checkedAt: 2026-09-28
headline: Runway’s faster, lighter video model — image-to-video only, generating a 10-second clip in about 30 seconds from a source image and a motion prompt.
sources:
  - title: Creating with Gen-4 Video (Runway Help Center)
    url: https://help.runwayml.com/hc/en-us/articles/37327109429011-Creating-with-Gen-4-Video
  - title: Models Catalog (Runway Dev)
    url: https://dev.runwayml.com/models/catalog
  - title: Product Changelog (Runway, “Gen-4 Turbo” entry, 2025-04-07)
    url: https://runway.com/changelog
  - title: API Changelog & Updates (Runway Dev, 2025-10-08 entry)
    url: https://docs.dev.runwayml.com/api-details/api_changelog/
  - title: Prompting Guide (Runway Academy)
    url: https://academy.runwayml.com/guides/prompting-guide
  - title: Official Runway X post (@runwayml, 2025-04-07)
    url: https://x.com/runwayml/status/1909302613192876102
---

## What’s new

- **Billed as the fastest way to use Runway’s most powerful video model**: Runway’s launch post described it as "the fastest way to generate with our most powerful video model yet," with scale and reliability kept at the level of the previous Gen-3 Alpha Turbo.
- **A 10-second clip in about 30 seconds**: Runway’s own launch post put it plainly — generating a 10-second video now takes just 30 seconds, faster than standard Gen-4, which Runway pitched for rapid iteration and creative exploration.
- **More flexible duration via the API**: since October 2025, the Runway API lets you pick any duration from 2–10 seconds with Gen-4 Turbo, instead of being limited to the product’s two fixed options (5s / 10s).

## What it’s good for

- Animating an image whose composition and style are already locked in — a product shot, a character portrait, a keyframe.
- Quickly testing camera moves or directions of motion before committing to a fully detailed final shot.
- Iterating on the same source image with different motion prompts until one feels right.

## Prompting tips

- **Prompt for motion only, not the picture**: the image already sets composition, lighting and style, so Runway says the text prompt should be “almost entirely focused on describing the desired motion.”
- **Use positive phrasing**: say what you want rather than what you don’t — Runway’s prompting guide notes that negative phrasing can produce unpredictable results.
- **Structure it as “camera move + subject action”**: for example, “the camera slowly pushes in as the subject turns.”
- **State it explicitly if you want a static camera**: add a line like “the camera remains perfectly still.”
- **Add “continuous, seamless shot” if you’re getting too many cuts**: this cuts down on unwanted scene breaks.
- **Start simple, then add detail**: keep your first prompt short, check the result, and iterate from there.

```text
The camera slowly pushes in as the skateboarder takes a running start, launches
into the air, completes a spin, and lands cleanly. Wind lifts the hem of his jacket.
Continuous, seamless shot, no cuts, camera holds steady throughout.
```

## Known limits

- **Image-to-video only — no pure text-to-video**: Runway Dev’s official model catalog lists only “Image to Video” as a supported task for Gen-4 Turbo, and the Help Center confirms Gen-4-family generations require an input image. For text-to-video, Runway’s current flagship, Gen-4.5, supports it.
- **Only two duration presets in the product**: 5 or 10 seconds; picking any duration from 2–10 seconds requires going through the API (available since October 2025).
- **Text prompts are capped at 1,000 characters.**

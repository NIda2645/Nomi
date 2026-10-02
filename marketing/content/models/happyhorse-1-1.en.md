---
model: happyhorse 1.1
name: HappyHorse 1.1
maker: Alibaba Cloud (Bailian / Model Studio)
checkedAt: 2026-09-28
headline: HappyHorse 1.1 from Alibaba Cloud Bailian, one model that auto-routes between text-to-video, image-to-video, and character reference.
sources:
  - title: HappyHorse 1.1 Video Generation API reference (APIMart)
    url: https://docs.apimart.ai/en/api-reference/videos/happyhorse-1.1/generation.md
  - title: HappyHorse 1.0 Video Generation API reference (APIMart, for comparison with the previous version)
    url: https://docs.apimart.ai/en/api-reference/videos/happyhorse-1.0/generation
---

## What’s new

- **One model auto-routes between three modes**: send a first-frame image and you get image-to-video, send 1–9 reference images and you get character reference, send neither and it's plain text-to-video — no mode switch needed.
- **No special syntax required in prompts**: the API docs state prompts can't contain special tokens, unlike some models that need @1/@2-style numbering to point at reference images.
- **Drops the standalone "edit" mode from 1.0**: version 1.0 had a separate video-editing mode for modifying existing footage; 1.1 currently keeps just the three generation modes — text, image, and character reference.

## What it’s good for

- Workflows where you'd rather drop in assets and let the model figure out the mode than pick one yourself.
- Character-reference work, with up to 9 reference images per task.
- Standard-resolution shorts at 720P/1080P, with duration freely chosen from 3–15 seconds.

## Prompting tips

- **Describe the scene in plain language**: don't add @-numbering or other special markers to point at reference images — the model handles that automatically.
- **Keep prompts to roughly 2,500 characters or under** (the stated limit).
- **Spell out camera movement and mood directly**, e.g. "slow push-in, cinematic, warm tones" — this works better than a purely static scene description.
- **Reference images have a quality bar**: a short side of at least 720px is recommended, and each file should stay under 10MB.
- **First-frame and reference images are mutually exclusive**: the two fields can't both be filled — pick one mode and leave the other set of assets empty.

```text
1080P, 16:9, 8 seconds.
The young man in the reference image wears a khaki trench coat, same face throughout.
Slow push-in, cinematic, warm tones, a city rooftop at dusk, wind catching his coat as he looks out toward the skyline.
```

## Known limits

- The first-frame (image-to-video) and reference-image (character reference) fields are mutually exclusive — they can't be used together.
- The aspect-ratio parameter has no effect in image-to-video mode.
- Reference images are capped at 9 — trim your set if you have more.

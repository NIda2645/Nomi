---
model: wan 3.0
maker: Alibaba Cloud (Tongyi Wan)
checkedAt: 2026-09-28
headline: Alibaba's Wan 3.0, with native 30-second duration, up to 20 reference assets, document and webpage parsing, and built-in audio.
sources:
  - title: Wan official site — Wan 3.0 feature overview
    url: https://wan.video/
  - title: Wan 3.0 API reference (Kie.ai)
    url: https://docs.kie.ai/market/wan/3-0-video.md
  - title: Wan 3.0 API reference (APIMart)
    url: https://docs.apimart.ai/cn/api-reference/videos/wan3.0-video/generation
---

## What’s new

- **Native 30-second duration**: a single generation can run up to 30 seconds, which Wan says supports more complete storytelling and creative freedom, including a "smart duration" mode that lets the model judge the right length itself.
- **Omni-creation with up to 20 reference assets**: images, video and audio combined can total up to 20 references, and Wan can also parse complex documents and webpages as reference material.
- **Pixel-level consistency**: Wan says it accurately reproduces reference detail, aimed at production workflows where delivery certainty matters — not just an approximate likeness.
- **Immersive audiovisual quality and precise video editing**: Wan highlights across-the-board gains in realism, texture and sound design in this version, plus instruction- or reference-based editing of existing video.

## What it’s good for

- Longer shorts that need to tell a complete story in one native 30-second take, without stitching together several shorter clips.
- Brand and product work where reference detail needs to come through accurately.
- Making a targeted edit to an existing clip with a text instruction or reference, instead of regenerating the whole thing.

## Prompting tips

- **Prompts have generous headroom, up to 20,000 characters** — enough to spell out scene, characters, and camera work in detail.
- **First/last-frame mode and omni-reference mode are mutually exclusive**: choosing first/last-frame rules out adding reference images, video, or audio, and vice versa.
- **Reference video and audio duration is counted per clip**: 1–15 seconds each, and combined with the output length, the total can't exceed 30 seconds.
- **Leave the aspect ratio on adaptive unless you're sure**: it's inferred from your reference material by default, and forcing a ratio can clash with what you supplied.
- **Decide on audio up front**: it's on by default, so switch it off explicitly if you don't want generated sound.

```text
Omni-reference, adaptive ratio, 1080P, 20 seconds.
The girl in reference image 1 keeps the same face and white dress throughout.
Reference video 1 sets the camera rhythm: a slow lateral approach, then one steady orbit.
A garden at dawn, dappled light through the leaves, she walks through the flowers and stops under a cherry tree, looking up with a smile.
Sound: birdsong, a light breeze through the leaves, distant wind chimes.
```

## Known limits

- First/last-frame mode and omni-reference mode can't be used together.
- NSFW filtering is off by default, and the docs note filtering effectiveness isn't guaranteed, so content compliance is on you.
- Reference video and images have resolution, aspect-ratio, and file-size limits — material outside those bounds won't be accepted.

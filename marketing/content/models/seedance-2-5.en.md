---
model: seedance 2.5
maker: ByteDance Seed
released: 2026-07-31
checkedAt: 2026-09-28
headline: ByteDance’s video model that generates multi-shot clips of up to 30 seconds with sound, taking up to 30 reference images, 10 videos and 10 audio clips at once.
sources:
  - title: Introducing Seedance 2.5 (ByteDance Seed blog, 2026-07-31)
    url: https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5
  - title: Seedance 2.5 product page (ByteDance Seed)
    url: https://seed.bytedance.com/en/seedance2_5
  - title: Seedance 2.5 prompt guide (Dreamina)
    url: https://dreamina.capcut.com/seedance/seedance-2-5-prompt
  - title: Seedance 2.5 API reference (Kie.ai)
    url: https://docs.kie.ai/market/bytedance/seedance-2-5
---

## What’s new

- **Up to 30 seconds in one generation**, twice as long as 2.0, and you can keep extending it. Thirty seconds is enough for several connected shots that take a small story from setup to ending.
- **Far more references**: up to 30 images, 10 videos and 10 audio clips per generation, so characters, products, locations and sound can all be matched.
- **Edit one part only**: point at a moment and change it instead of regenerating the whole clip. ByteDance also lists green-screen, clay-model and reference-video camera editing.
- **Smoother shot changes**: according to ByteDance, cuts and scene changes hold together better, and materials, skin, eyes and lighting look more real.

## What it’s good for

- Complete short pieces under 30 seconds that need a beginning, middle and end: ads, product films, short-drama scenes.
- Films where a character or product must look the same throughout: hand it reference images, video and audio together.
- A clip that is almost right: fix one detail with a local edit instead of starting over.

## Prompting tips

- **State the format first**: duration, aspect ratio and number of shots, e.g. “30 seconds, 16:9, four connected shots”.
- **Write the timing in beats**: 0–6 s setup, 6–18 s development, 18–26 s climax, 26–30 s closing frame.
- **Name shot size and camera move separately**: “medium close-up, slow clockwise orbit”, not a move buried in style words.
- **Tie each reference to a person or object**: say which reference image is whom and that they must stay consistent.
- **Attach sounds to actions**: “rain, a distant tram, a suitcase latch” rather than “nice sound”.
- **Only list the exclusions that matter**: “no face changes, no wardrobe changes, no extra people”.

```text
30 seconds, 16:9, four connected shots. The girl in reference image 1 keeps the same face and the same yellow raincoat throughout.
A seaside town at dawn. 0–6 s: wide shot, she walks her bicycle down a cobbled slope. 6–18 s: medium tracking shot, she parks under the lighthouse and looks out to sea.
18–26 s: close-up, the sea wind lifts her hood and she smiles. 26–30 s: extreme wide closing frame on the lighthouse and the whole bay.
Sound: waves, a bicycle chain, distant gulls. No face changes, no extra people.
```

## Known limits

- ByteDance says the physical plausibility of complex motion and stability when several subjects interact still need work.
- First-and-last-frame mode and multi-reference mode cannot be combined: with first and last frames set, you cannot add reference images, videos or audio.

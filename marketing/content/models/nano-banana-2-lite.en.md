---
model: nano banana 2 lite
maker: Google DeepMind
released: 2026-06-30
checkedAt: 2026-09-28
headline: Google's fastest, most efficient Gemini image model, generating in as little as 4 seconds with up to 10 reference images.
sources:
  - title: Nano Banana 2 Lite model page (Google DeepMind official)
    url: https://deepmind.google/models/gemini-image/flash-lite/
  - title: Nano Banana 2 Lite prompting guide (Google DeepMind official, shared across the family)
    url: https://deepmind.google/models/gemini-image/prompt-guide/
  - title: Nano Banana 2 Lite general availability announcement (Google Cloud official blog, 2026-06-30)
    url: https://cloud.google.com/blog/products/ai-machine-learning/nano-banana-2-lite-and-gemini-omni-flash-available
  - title: Nano Banana 2 Lite API reference (Kie.ai)
    url: https://docs.kie.ai/market/google/nano-banana-2-lite.md
---

## What’s new

- **The fastest, leanest tier of the family**: launched 2026-06-30, Google positions it as "the fastest, most efficient Gemini Image model"; its official developer name is Gemini 3.1 Flash-Lite Image.
- **As fast as 4 seconds per image**: Google says latency is dramatically reduced compared to the main Nano Banana 2 tier.
- **Fewer controls than the main tier**: only an aspect-ratio parameter is exposed — no resolution or output-format options — so it's simpler to use but leaves less to fine-tune.
- **Up to 10 reference images per call**: fewer than the main Nano Banana 2's 14, but it keeps core capabilities like character consistency and real-world knowledge.

## What it’s good for

- Producing lots of variations quickly — A/B-testing ad creative or generating a batch of rough directions.
- Real-time generation features serving many users at once, like in-app generation inside a social app, where speed matters most.
- E-commerce virtual try-ons or storyboard sketches — cases that need speed more than pixel-level polish.

## Prompting tips

- **Cover all five elements up front**: style, subject, setting, action and composition, written out clearly to cut down on back-and-forth revisions.
- **Use it to explore directions fast, and save fine detail for a heavier model**: Lite has no resolution or format controls, so it's a good fit for generating several directions before picking one to polish with a more capable model.
- **Put on-image text in quotes**: quote the words you want rendered and add a typography note, like "handwritten" or "bold sans-serif."
- **Name your characters when using reference images**: upload a reference and give the person a consistent name in the prompt so it recognizes them as the same character.
- **Ask directly for multiple variations**: e.g. "give me four different compositions," to get several options in one pass.

```text
Product photography style, a mint-green wireless earbud charging case on a wooden desk, soft natural
light from a window on the right, shallow depth of field. Give me four different compositions: a flat
front shot, a 45-degree overhead angle, a close-up with the case open, and a shot held in a hand.
1:1, clean background.
```

## Known limits

- **Small faces, exact spelling and fine detail can still go wrong**: the same issue applies as with other models in this family.
- **Data-heavy visuals can get misread**: when generating infographics or data visualizations, it can misinterpret or misrender the underlying information.
- **Complex edits are less reliable**: more involved editing operations can sometimes produce unnatural results, visible artifacts, or elements that don't quite fit together.

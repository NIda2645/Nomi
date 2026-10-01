---
model: z-image
maker: Alibaba Tongyi Lab
released: 2026-01-27
checkedAt: 2026-09-28
headline: The full 6B foundation model behind Z-Image-Turbo, trading generation speed for more diversity and fine-tunability — Tongyi Lab's base for LoRA and downstream work.
description: "The full 6B foundation model behind Z-Image-Turbo, trading speed for more diversity and fine-tunability — Tongyi Lab's base for LoRA and downstream work."
sources:
  - title: Tongyi-MAI/Z-Image official repository (GitHub README, with version history)
    url: https://github.com/Tongyi-MAI/Z-Image
  - title: Tongyi-MAI/Z-Image model card (Hugging Face)
    url: https://huggingface.co/Tongyi-MAI/Z-Image
---

## What’s new

- **The foundation model behind Z-Image-Turbo**: same 6B parameters and Single-Stream DiT architecture, but it keeps the full 50-step generation process for more diversity and controllability.
- **Negative prompts actually work here**: Turbo's CFG-free distillation weakens this, but the base model supports proper negative prompting for fine control.
- **Built for downstream development**: Tongyi Lab positions it as the base for community fine-tuning, LoRA training and ControlNet work.
- **Same bilingual text rendering, different trade-off**: visual quality is rated "High" (versus Turbo's "Very High") in Tongyi Lab's own comparison, trading some raw per-image quality for more diversity across runs.

## What it’s good for

- Developers who want an open base to fine-tune, train LoRAs on, or use with ControlNet.
- Creative work that needs fine control over unwanted elements via negative prompts.
- Batch creative generation where you want more variation across outputs from the same prompt.

## Prompting tips

- **Use both positive and negative prompts**: unlike Turbo, negative prompts are an effective control here — use them to cut flaws and unwanted elements.
- **Keep guidance scale moderate**: pushing it too high tends to distort the image; Tongyi Lab's reference range is moderate-to-low (3.0–5.0).
- **Name the style you want**: realism, anime, fine art — the model responds to a wide range of style terms.
- **Enrich complex ideas before feeding them in**: Tongyi Lab's own showcase demonstrates a "reasoning" style of prompting that lets the model draw on broader world knowledge rather than just parsing your words literally.

```text
An old fisherman sits in a wooden boat mending a net, backlit silhouette at dusk,
sunlight glittering on the water, fishing boats heading home and a lighthouse in the distance,
realistic photography style, warm orange tones, grainy film texture.
Negative prompt: cartoonish, over-sharpened, malformed hands, blurry.
```

## Known limits

- 50-step generation is much slower than Turbo, so it's not suited to real-time or low-latency interactive use.
- Editing is handled by a separate Z-Image-Edit variant — this base model is aimed mainly at text-to-image.
- Tongyi Lab's own model-zoo table rates the base model's visual quality as "High," a tier below Turbo's "Very High" — if you just want the best single image and don't need fine-tuning or diversity, Turbo may be the better fit.

---
model: z-image turbo
maker: Alibaba Tongyi Lab
released: 2025-11-26
checkedAt: 2026-09-28
headline: Alibaba Tongyi Lab's 6B open-weight speed model that generates in 8 steps on consumer GPUs, with accurate bilingual text and the top open-source score on Artificial Analysis.
description: "Alibaba Tongyi Lab's 6B open-weight speed model: 8-step generation on consumer GPUs, accurate bilingual text, top open-source score on Artificial Analysis."
sources:
  - title: Tongyi-MAI/Z-Image official repository (GitHub README, with version history)
    url: https://github.com/Tongyi-MAI/Z-Image
  - title: Tongyi-MAI/Z-Image-Turbo model card (Hugging Face)
    url: https://huggingface.co/Tongyi-MAI/Z-Image-Turbo
---

## What’s new

- **6B parameters, 8 steps to an image**: distilled for speed — sub-second inference on an enterprise H800 GPU, and it still fits on a consumer 16GB card.
- **Accurate bilingual text rendering**: text rendering is a classic weak spot for open image models, and Tongyi Lab's own showcase highlights a clear improvement here in both Chinese and English.
- **A strong benchmark showing**: per Z-Image's own repository update on 2025-12-08, it ranks 8th overall on the Artificial Analysis text-to-image leaderboard and 1st among open-source models.
- **Single-Stream DiT architecture**: text, visual semantic tokens and image VAE tokens are concatenated into one sequence, which Tongyi Lab says is more parameter-efficient than dual-stream designs.

## What it’s good for

- Interactive products that want near-top-tier quality with fast generation and low deployment cost.
- Local deployment on consumer GPUs (16GB VRAM or less).
- Posters and social media graphics that mix Chinese and English text.

## Prompting tips

- **Be specific, and don't worry about length**: Tongyi Lab's own showcase examples get more stable results from more specific detail, not less.
- **Write bilingual text straight into the prompt**: whatever Chinese or English text you want rendered, type it as-is — this is one of the model's strong points.
- **Name the style explicitly**: ask for photography-style description for realism, or specific style terms for anime/illustration — the official showcase spans everything from photorealism to anime.
- **Switch to the base model for fine negative control**: Turbo uses CFG-free distillation, so negative prompts have limited effect; for precise exclusion of specific elements, the base Z-Image model does better.

```text
A cyberpunk city-night poster, neon shop signs reading "Future Market" in glowing letters,
rain-slicked streets reflecting colorful lights, a silhouette holding an umbrella at the center,
high-contrast purple-blue and pink color palette, detailed illustration style.
```

## Known limits

- Speed comes at the cost of diversity and fine-tunability: Tongyi Lab's own model-zoo table marks Turbo's fine-tunability as "N/A," and outputs vary less across runs of the same prompt than the base model.
- Image editing is a separate Z-Image-Edit variant — Turbo itself is built for text-to-image.
- Turbo runs CFG-free with guidance scale fixed at 0, so negative prompts have less control than on the base Z-Image model.

---
model: flux.2 klein
name: FLUX.2 Klein
maker: Black Forest Labs
released: 2026-01-15
checkedAt: 2026-09-28
headline: Black Forest Labs' open-weight image model with 4-step distilled inference for sub-second generation; BFL says the 9B build matches or beats models five times its size.
description: "Black Forest Labs' open-weight image model: 4-step distilled inference, sub-second generation; BFL says the 9B build matches or beats models 5x its size."
sources:
  - title: "FLUX.2 [klein]: Towards Interactive Visual Intelligence (Black Forest Labs blog, 2026-01-15)"
    url: https://bfl.ai/blog/flux2-klein-towards-interactive-visual-intelligence
  - title: black-forest-labs/FLUX.2-klein-9B model card (Hugging Face)
    url: https://huggingface.co/black-forest-labs/FLUX.2-klein-9B
  - title: FLUX.2 Overview (Black Forest Labs docs)
    url: https://docs.bfl.ml/flux_2/flux2_overview
  - title: FLUX.2 Prompting Guide (Black Forest Labs docs)
    url: https://docs.bfl.ml/guides/prompting_guide_flux2
---

## What’s new

- **Fast and open**: 4-step distilled inference gets you sub-second generation, and it runs on a consumer GPU (the 9B build needs roughly 13GB VRAM and up).
- **One model for generation and editing**: no need to switch models for editing — the same architecture handles text-to-image, image editing and multi-reference input.
- **Small model, big-model results**: Black Forest Labs says the 9B variant matches or exceeds models five times its size on text-to-image, single-reference editing and multi-reference generation, in under half a second.
- **Positioned as the "spiritual successor" to FLUX.1 [schnell]**: built for speed, editing and local deployment rather than chasing the highest possible quality ceiling.

## What it’s good for

- Low-latency, interactive generation and editing — think real-time previews inside a design tool.
- Local deployment for developers who don't want to depend on a cloud API.
- Fast, capable image editing (background swaps, local changes) where top-tier quality isn't the priority.

## Prompting tips

- **Don't expect prompt expansion**: Black Forest Labs says klein has no prompt upsampling, so writing one or two vague words will get you a weaker result — spell it out yourself.
- **Same structure as FLUX.2 Pro**: subject, then action, then style, then context, with the most important details first.
- **No negative prompts here either**: describe what you want; there's no supported way to say what to avoid.
- **Be explicit about the edit target**: when you supply a reference image, state exactly what should change and how — not just "make it look better".

```text
Replace this product photo's background with a plain light-gray studio backdrop, keeping the product's
position, angle and color unchanged. Add a soft contact shadow on the ground, cool-toned overall lighting,
and keep the output at the same aspect ratio as the source image.
```

## Known limits

- The 9B build Nomi uses ships under the FLUX Non-Commercial License (only the 4B build is fully open under Apache 2.0), so it can't be used commercially as-is.
- No negative prompts and no prompt auto-expansion, so results are more sensitive to how detailed your prompt is.
- It's built for speed first — the quality ceiling is lower than the Pro or Max tiers.

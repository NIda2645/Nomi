---
model: flux.1 krea
name: FLUX.1 Krea
maker: Black Forest Labs and Krea
released: 2025-07-31
checkedAt: 2026-09-28
headline: A photorealism-focused image model from Black Forest Labs and Krea that fights the oversaturated "AI look" and matched FLUX.1 Pro on human preference tests.
sources:
  - title: "FLUX.1 Krea [dev]: An 'Opinionated' Text-to-Image Model (Black Forest Labs announcement, 2025-07-31)"
    url: https://bfl.ai/announcements/flux-1-krea-dev
  - title: Releasing Open Weights for FLUX.1 Krea (Krea blog)
    url: https://www.krea.ai/blog/flux-krea-open-source-release
  - title: black-forest-labs/FLUX.1-Krea-dev model card (Hugging Face)
    url: https://huggingface.co/black-forest-labs/FLUX.1-Krea-dev
---

## What’s new

- **Built to fight the "AI look"**: Black Forest Labs calls it an "opinionated" model, deliberately avoiding the blown-out highlights and plastic-looking skin common in AI images.
- **Co-tuned with Krea's aesthetic sense**: Krea's experience with realism and visual diversity fed directly into training — this is a joint release, not a BFL-only model.
- **Matches the flagship on human preference**: Black Forest Labs' own data shows this open model performing on par with its closed flagship, FLUX.1 [pro], in human preference testing.
- **Drop-in compatible with the FLUX.1 [dev] ecosystem**: a 12B-parameter, guidance-distilled model that works with existing FLUX.1 [dev] tooling and LoRAs.

## What it’s good for

- Portraits and scenes that need to look like a real photo, not an obviously AI-generated one.
- Teams already on the FLUX.1 [dev] ecosystem (LoRAs, ComfyUI workflows) who want a more photorealistic base model.
- Photography-style work — ads, portraits — where you want to avoid the oversaturated "plastic" look.

## Prompting tips

- **Favor real-world detail over stacked style words**: it's tuned for "natural detail," not for piling on vague aesthetic terms like "cinematic" or "premium".
- **Describe actual lighting conditions**: natural light, an overcast day, indoor lamp light — this fits its character better than "dreamy" or "dramatic" lighting requests.
- **Don't push guidance scale too high**: BFL's own examples use a moderate value (around 4.5) — pushing it too far can undo the realistic look the model is built for.
- **Don't over-clean with negative prompts if you want its character**: BFL says the model's imperfections and diversity are part of its intended style.

```text
A young woman sits by a window reading a book, soft natural light coming in from the side,
unforced and gentle. Realistic skin texture with faint pores and natural, uneven skin tone,
wearing a casual knit sweater, background is a slightly cluttered home study.
The overall feel is a candid snapshot, not a carefully staged studio photo.
```

## Known limits

- The model card explicitly states it "is not intended or able to provide factual information" and, as a statistical model, may amplify existing societal biases.
- It ships under the FLUX.1 [dev] Non-Commercial License, so it can't be used commercially as-is.
- Black Forest Labs acknowledges the model has "idiosyncrasies" and that results are quite sensitive to phrasing, without detailing exactly which ones.

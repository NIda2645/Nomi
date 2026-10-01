---
model: qwen-image
maker: Alibaba Qwen
released: 2025-08-04
checkedAt: 2026-09-28
headline: Alibaba Qwen's fully open-source image model line, first released August 2025 and updated continuously, known for strong Chinese text rendering with downloadable weights.
description: "Alibaba Qwen's fully open-source image model line, first released August 2025 and updated continuously, known for strong Chinese text rendering."
sources:
  - title: QwenLM/Qwen-Image official repository (GitHub README, with full version history)
    url: https://github.com/QwenLM/Qwen-Image
  - title: Qwen-Image launch post (Qwen blog)
    url: https://qwenlm.github.io/blog/qwen-image/
  - title: Qwen-Image-2512 model card (Hugging Face, updated 2025-12-31)
    url: https://huggingface.co/Qwen/Qwen-Image-2512
---

## What’s new

- **A 20B-parameter open image foundation model**: it turned heads at its August 2025 launch for complex text rendering, especially accurate Chinese text.
- **Continuously updated with dated releases**: this isn't a one-and-done launch — the 2512 (December 2025) update noticeably improved human realism and material detail, cutting down the "obviously AI" look.
- **A companion Edit line that keeps pace**: Qwen-Image-Edit has iterated all the way to Edit-2511, with better multi-image input and stronger subject consistency along the way.
- **Fully open under Apache 2.0**: weights and code are downloadable, with free commercial use, fine-tuning and self-hosting allowed — this is the open line Nomi reaches through ModelScope, currently pinned to the Qwen-Image-2512 weights released 2025-12-31.

## What it’s good for

- Self-hosted, free-to-commercialize image generation when you don't want to depend on a cloud API key.
- Posters, covers and UI work that need accurate Chinese text rendering.
- Developers and hobbyists who want an open base model to fine-tune or attach LoRAs to.

## Prompting tips

- **Append quality boosters to your positive prompt**: the official examples recommend "Ultra HD, 4K, cinematic composition" in English (or the Chinese equivalent for Chinese prompts).
- **Write real negative prompts**: the official example lists specifics like "low resolution, low quality, malformed limbs, malformed fingers, oversaturated" — adapting that list beats leaving it blank.
- **Use prompt rewriting for edits**: Qwen recommends running edit instructions through its Prompt Enhancement Tool first, which noticeably improves editing stability.
- **Write out any text you want in the image**: accurate text rendering is one of its strongest features, so spell it out rather than leaving it vague.

```text
A modern minimalist poster for a bookstore, featuring a stack of open books and a cup of coffee,
warm yellow tones. Headline text "Midnight Bookstore · Open 24 Hours", subhead
"One coffee, one book, one quiet night." Ultra HD, 4K, cinematic composition.
Negative prompt: low resolution, low quality, blurry text, distorted, oversaturated.
```

## Known limits

- It's a separate product line from the newer Qwen-Image 3.0: 3.0 currently has no public weight information and is only usable through official or reseller APIs, while this open line (including the 2512 build Nomi uses) ships downloadable weights for self-hosting — the two run in parallel rather than one simply superseding the other.
- Qwen acknowledged "performance misalignments" on 2025-08-19 and recommended updating to the latest diffusers commit to get the expected results.
- At 20B parameters it's not light on local hardware, which is why the community keeps shipping acceleration options like the LightX2V distillation project.

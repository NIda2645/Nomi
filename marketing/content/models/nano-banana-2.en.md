---
model: nano banana 2
maker: Google DeepMind
released: 2026-02-26
checkedAt: 2026-09-28
headline: Google's image model with Pro-level generation and editing at Flash speed, taking up to 14 reference images.
sources:
  - title: Nano Banana 2 model page (Google DeepMind official)
    url: https://deepmind.google/models/gemini-image/flash/
  - title: Nano Banana 2 prompting guide (Google DeepMind official)
    url: https://deepmind.google/models/gemini-image/prompt-guide/
  - title: Introducing Nano Banana 2 in the Gemini app (Google Workspace Updates official blog, 2026-02-26)
    url: https://workspaceupdates.googleblog.com/2026/02/introducing-nano-banana-2-in-gemini-app.html
  - title: Nano Banana 2 API reference (Kie.ai)
    url: https://docs.kie.ai/market/google/nanobanana2.md
---

## What’s new

- **Its official developer/API name is Gemini 3.1 Flash Image**: Nano Banana 2 is what it's called in the Gemini app and other consumer products; Google positions it as "Pro-level image generation and editing, Flash-level speed."
- **Keeps up to 5 characters and 14 objects consistent**: it maintains people's likeness and object details across a single workflow, good for a series of images that need the same character or product to keep reappearing.
- **Pulls in real-world information before drawing**: Google says it draws on Gemini's knowledge base plus real-time web search results for more accurate renderings — useful for infographics and data visuals that need to be factually right.
- **Upscales to 2K/4K in seconds**: upscaling is built in, so there's no separate tool needed after generation.

## What it’s good for

- Series of product or character shots that need the same face, product or details to stay consistent across images.
- Posters, marketing material and infographics that need accurate, legible text baked into the image — Google also positions it for translating and localizing that text.
- The same image reformatted for different platforms, by adjusting the aspect ratio to fit the placement.

## Prompting tips

- **Cover five elements**: style (illustration/photo/watercolor…), subject (appearance, clothing, pose), setting (location + atmosphere), action (what's happening), and composition (shot type + angle) — the more detail you give, the closer the result gets to what you pictured.
- **Use one of the five official editing moves**: swap the character, adjust the composition (a new angle), change the action, swap the setting, or rethink the style — pick one at a time and describe exactly what should change.
- **Put on-image text in quotes**: quote the words you want rendered and pair them with a typography note, like "bold sans-serif" or "neon cursive."
- **Name your characters and objects when using reference images**: upload clear references and give people or objects consistent names in the prompt so they stay recognizable across generations.
- **Ask directly for multiple variations**: e.g. "three different product photography styles" or "four color palettes," to get several versions in one pass.
- **State aspect ratio and intended use together**: e.g. "vertical social post" or "widescreen backdrop," and use the 2K/4K upscale option when you need the extra resolution.

```text
Illustration style. Subject: an orange cat named "Mochi" wearing a vintage dive mask and a yellow
raincoat. Setting: a seaside town at dawn, cobblestone streets, light fog. Action: Mochi is pushing
a small bicycle toward a lighthouse. Composition: medium shot, slightly high angle.
Hand-lettered text in the upper left reads "Good Morning." Vertical 9:16, for a social media poster.
```

## Known limits

- **Small faces, exact spelling and fine detail can still go wrong**: Google states the model can struggle with small faces, accurate spelling, and fine details in images.
- **Infographics can get misread**: when generating infographics or data visualizations, it can sometimes misinterpret the underlying information.
- **Advanced edits are less reliable**: masked editing, major lighting changes (like day to night), or blending multiple images can sometimes produce unnatural results, per Google.

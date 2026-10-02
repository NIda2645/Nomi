---
model: gemini image 3 pro
name: Gemini 3 Pro Image
maker: Google DeepMind
released: 2025-11-20
checkedAt: 2026-09-28
headline: Google's Gemini 3 Pro Image, also known as Nano Banana Pro — its best model for complex, multi-turn editing, up to 4K.
sources:
  - title: Gemini 3 Pro Image (Nano Banana Pro) model page (Google DeepMind official)
    url: https://deepmind.google/models/gemini-image/pro/
  - title: Nano Banana Pro launch announcement (Google official blog, 2025-11-20)
    url: https://blog.google/innovation-and-ai/products/nano-banana-pro/
  - title: Gemini Image prompting guide (Google DeepMind official, shared across the family)
    url: https://deepmind.google/models/gemini-image/prompt-guide/
  - title: Gemini 3 Pro Image API reference (APIMart)
    url: https://docs.apimart.ai/en/api-reference/images/gemini-3-pro/generation.md
---

## What’s new

- **Its official developer/API name is Gemini 3 Pro Image**: Nano Banana Pro is what it's called in the Gemini app and other consumer products. Built on Gemini 3 Pro's reasoning, Google positions it as its best model for complex, multi-turn generation and editing.
- **Text rendering is a strength**: Google calls it the model that "creates images with correctly rendered and legible text directly in the image," in multiple languages, and it can translate designs for different locales.
- **Studio-level control**: camera angle, shot type, color grading and lighting direction can all be set individually; across multi-turn edits it can also shift depth of field to refocus on a different subject.
- **Keeps up to 5 characters and 14 objects consistent, at resolution up to 4K**: every output carries an invisible SynthID watermark that can identify it as AI-generated or -edited.

## What it’s good for

- Polished shots that need precise camera control — ad visuals and poster design where angle, lighting and color grading matter.
- Anything that needs accurate on-image text — posters, charts, multilingual material — with clean text rendering and localization.
- Complex, multi-round edits, like shifting depth of field to refocus the shot while keeping people and props consistent across versions.

## Prompting tips

- **Cover five elements**: style, subject, setting, action and composition — the more detail you give, the closer the result gets to what you pictured.
- **Write studio-control language straight into the prompt**: camera angle (high/low/eye-level), shot size (wide/medium/close-up), lighting direction and color grading can all be specified directly.
- **Use one of the five official editing moves**: swap the character, adjust the composition, change the action, swap the setting, or rethink the style — pick one at a time and describe exactly what should change.
- **Put on-image text in quotes**: quote the words you want rendered, and note the typography and language.
- **Name your characters and objects when using reference images**: upload clear references and give people or objects consistent names so they stay recognizable across generations.
- **Iterate one step at a time across multiple edits**: feed the previous version back in as input, request a single change, and state what needs to stay the same.

```text
Product advertising photography, a bottle of amber perfume on a dark marble counter, 45-degree
backlight, warm color grading, shallow depth of field, blurred background. Composition: medium
close-up, slightly low angle. The label reads "AMBER NOIR" in a clean serif font. 16:9, 4K.
```

## Known limits

- **Small faces, exact spelling and fine detail can still go wrong**: Google acknowledges these issues exist.
- **Its world knowledge is broad but not infallible**: Google says its real-world knowledge is "extensive but not infallible," and localized translation can also get grammar, spelling, cultural nuance or idiom wrong.
- **Advanced edits and character consistency aren't guaranteed every time**: for masked editing or major lighting changes, Google states it "may not always get it right."

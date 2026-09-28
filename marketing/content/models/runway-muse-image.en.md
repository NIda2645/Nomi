---
model: runway muse image
maker: Meta Superintelligence Labs
released: 2026-07-07
checkedAt: 2026-09-28
headline: Meta's image model, served through Runway's API — it plans the full layout before drawing, blends up to 10 reference images, and revises its own output.
sources:
  - title: Introducing Muse Image and Muse Video (AI at Meta blog, 2026-07-07)
    url: https://ai.meta.com/blog/introducing-muse-image-muse-video-msl/
  - title: Introducing Muse Image; Image Generation Built for Your World (Meta newsroom, 2026-07)
    url: https://about.fb.com/news/2026/07/introducing-muse-image-meta-ai/
  - title: Muse Image API developer guide (developer.meta.com, Meta)
    url: https://developer.meta.com/ai/resources/blog/build-with-muse-Image/
  - title: Muse Image (muse_image) model page (Runway Dev, Nomi's access route)
    url: https://dev.runwayml.com/endpoints/text_to_image?modelId=muse_image
---

## What’s new

- **It's Meta's model, served through Runway**: Muse Image was built by Meta Superintelligence Labs and became available through Runway's image API in 2026 — that's the route Nomi uses to call it.
- **Plans first, self-checks while generating**: instead of mapping a prompt straight to pixels, it reads every input image and works out the overall layout first — what goes where, how many parts, how they relate — then reviews its own output mid-generation and may make a local fix, redo the whole thing, or switch approach.
- **Composes up to 10 reference images**: feed it a character, a product and a background separately and it treats each as its own ingredient, keeping identity and setting consistent.
- **More trustworthy text in the image**: for baked-in text like prices, signage or taglines, Meta says rendering accuracy is stronger in this version.

## What it’s good for

- Keeping an identity consistent: the same product across different scenes, or the same person in different looks, without drifting.
- Posters, price tags or signage-style assets that need legible in-image text.
- Stitching existing assets together: combine a character, a background and props you already have into one new image instead of generating from scratch.

## Prompting tips

- **Say who or what sits where**: "the lamp on the desk, angled toward the keyboard, shot straight on at desk height" pins the composition far more than "there's a lamp on the desk."
- **Give every reference image a job**: name it in the prompt — "the tan leather tote from the second image" — instead of a vague "that image," so the model knows exactly whose look to keep.
- **Write down anything you need to survive the next run**: there's no seed, so two identical prompts return two different images and you can't get back to yesterday's version — anything you didn't put into words gets re-decided every time.
- **Spell out exact numbers and copy for in-image text**: for prices, taglines or labels, write the exact digits and wording rather than letting the model guess.
- **When you're not sure, generate a batch and pick**: with no seed to pin a version, a batch is how you get a choice — not repeated micro-edits of one run.

```text
Combine the woman from reference image 1 with the tan leather tote from reference image 2 into one autumn sale poster:
she's walking down a street scattered with fallen leaves, the tote slung over one shoulder, waist-height shot, side backlight.
Leave space at the top for the headline "Autumn Arrivals - 20% Off", clean and legible type. Keep the warm brown tone from reference image 2 throughout.
```

## Known limits

- No seed parameter: the same prompt gives a different result every time, and you can't return to a specific earlier generation.
- In multi-image composition, layout can reflow based on the inputs, and exact text rendering varies run to run — for text-critical assets, generate a few times and check.

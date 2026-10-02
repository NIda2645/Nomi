---
model: soul 2
name: Higgsfield Soul 2
maker: Higgsfield
released: 2026-02
checkedAt: 2026-09-28
headline: Higgsfield's in-house fashion-portrait model with taste built into the model itself, 20+ curated presets, and a trainable, reusable character identity.
sources:
  - title: Introducing Higgsfield SOUL 2.0 (Higgsfield official X/Twitter announcement, 2026-02)
    url: https://x.com/higgsfield/status/2024562515871469605
  - title: Soul 2.0 - High Aesthetic AI Photo Generation Model (Higgsfield product page)
    url: https://higgsfield.ai/soul-intro
  - title: SOUL V2 generate endpoint docs (docs.higgsfield.ai, Higgsfield official developer docs)
    url: https://docs.higgsfield.ai/docs/models/soul-2/generate
---

## What’s new

- **Taste is built in, not bolted on**: Higgsfield says this version bakes taste straight into how the model composes, lights and styles a shot, rather than applying a style pass after the fact.
- **Train a character once, then call it by ID**: Soul ID trains a reusable character from photos; later generations just reference that character's ID, with an adjustable strength for how much it drives the result — no need to re-describe the look each time.
- **Presets are API-level too**: the 20+ curated presets map to a style reference you can pass in, with its own adjustable strength, so you get a look without writing a prompt from scratch.
- **Can pad out a thin prompt for you**: there's a built-in auto-enhance toggle that expands a short prompt automatically.

## What it’s good for

- Editorial-style portraits and magazine-cover-style images.
- Series where the same face needs to recur — virtual personas, campaign sets — driven by a trained character reference instead of re-describing it each time.
- UGC and lifestyle-style social and ad creative.

## Prompting tips

- **Let a preset carry the look, keep the prompt simple**: once a style is set, naming the subject and setting is usually enough — no need to stack style adjectives.
- **Turn on auto-enhance when you're not sure**: if your own prompt is thin, the enhance toggle fills in detail for you.
- **Character strength is a dial, not just a switch**: when using a trained character reference, strength runs 0 to 1 — push it up for a stronger likeness, or down to give the scene more freedom.
- **Save the seed for a result you like**: seed runs 1 to 1,000,000; the same seed with the same prompt gets you back to something close to a result you liked.
- **A vague prompt still gives a different result each time**: batch size tops out at 4, not dozens to sift through, so a clear prompt matters more than generating extra copies.

```text
Editorial portrait, model in a beige tailored coat, standing on a city rooftop after rain, warm side backlight at sunset, 35mm film texture, cool tone, gazing off-camera.
```

## Known limits

- No direct reference-image upload: there's no field for attaching a photo as a composition reference — keeping a character consistent means training a Soul ID character first and referencing it by ID.
- Batch size is only 1 or 4 — there's no 2 or 3 in between.
- Resolution is limited to two tiers, 720p and 1080p.

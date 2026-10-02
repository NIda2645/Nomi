---
model: soul cinema
name: Higgsfield Soul Cinema
maker: Higgsfield
released: 2026-03
checkedAt: 2026-09-28
headline: Higgsfield's Soul-family model built specifically for film-still visuals — natural grain and mood lighting, often used as a video keyframe.
sources:
  - title: Soul Cinema Preview; Cinematic-Grade Visuals In One Click (Higgsfield blog, 2026-03)
    url: https://higgsfield.ai/blog/soul-cinema-preview
  - title: Soul Cinema - Cinematic AI Image Generation (Higgsfield product page)
    url: https://higgsfield.ai/soul-cinema
  - title: SOUL Cinema generate endpoint docs (docs.higgsfield.ai, Higgsfield official developer docs)
    url: https://docs.higgsfield.ai/docs/models/soul-cinema/generate
---

## What’s new

- **One look only, and it's fixed**: the API docs state Soul Cinema's style is fixed and any client-supplied style parameter is ignored — the cinematic look is baked into the model, unlike Soul 2's swappable presets.
- **More convincing grain and depth**: Higgsfield describes the grain as closer to real film stock than digital noise, with foreground/background separation and material detail built to cinematography standards.
- **Understands different film eras**: it distinguishes the look of the 1970s, the 1990s and today without you having to spell out what each era should feel like.
- **Works directly as a video keyframe**: Higgsfield recommends feeding a Soul Cinema image into video models like Kling or Seedance as the opening frame.

## What it’s good for

- Storyboard and keyframe previews, and mood references for film projects.
- Visual concepts for music videos and commercials.
- Gallery-grade artwork that needs a cinematic look.

## Prompting tips

- **Describe the scene, subject and mood**: that's Higgsfield's own guidance — no need to stack cinematography jargon on top.
- **Use a trained character ID for a recurring face**: it shares Soul 2's Soul ID mechanism — train once, then call the character by ID with an adjustable 0-to-1 strength.
- **Turn on auto-enhance when you're not sure**: if your own prompt is thin, the enhance toggle fills in detail for you.
- **Name the light source**: terms like twilight, blue hour or soft-focus carry more cinematic information than just "nice lighting."
- **Save the seed for a result you like**: the same seed with the same prompt gets you back to something close to a result you liked.

```text
Blue hour after rain in an old town street, a man in a trench coat seen from behind gazing into the distance,
35mm prime lens look, film grain, vignette, close shot, quiet and subdued mood.
```

## Known limits

- No direct reference-image upload: keeping a character consistent relies on a trained Soul ID reference, not attaching a photo as a composition reference.
- No swappable style presets: the API docs state a client-supplied style parameter is ignored — the cinematic look is fixed.
- Batch size is only 1 or 4, with nothing in between.

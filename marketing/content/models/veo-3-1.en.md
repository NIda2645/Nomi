---
model: veo 3.1
maker: Google DeepMind
released: 2025-10-15
checkedAt: 2026-09-28
headline: Google DeepMind’s video model with native synchronized sound and dialogue, able to chain reference-image-driven clips into scenes over a minute long.
sources:
  - title: Introducing Veo 3.1 and new creative capabilities in the Gemini API (Google Developers Blog, 2025-10-15)
    url: https://developers.googleblog.com/introducing-veo-3-1-and-new-creative-capabilities-in-the-gemini-api/
  - title: Veo 3.1 model page (Google DeepMind)
    url: https://deepmind.google/models/veo/
  - title: Veo 3.1 technical docs (Google AI for Developers, Gemini API)
    url: https://ai.google.dev/gemini-api/docs/veo
  - title: Veo 3.1 Ingredients to Video update (Google official blog, 2026-01-13)
    url: https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/
  - title: Ultimate prompting guide for Veo 3.1 (Google Cloud Blog, 2025-10-15)
    url: https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1
  - title: Veo 3.1 video generation API reference (Kie.ai)
    url: https://docs.kie.ai/veo3-api/generate-veo-3-video
---

## What’s new

- **Consistent references (Ingredients to Video)**: feed it up to 3 reference images and a character’s look or a style can hold across several shots; the January 2026 update added native 9:16 vertical output for this mode plus better dialogue and character/background consistency.
- **Scenes over a minute long (Scene Extension)**: you’re not capped at 8 seconds — Google says you can keep extending a clip and stay coherent past a minute, adding 7 seconds per extension for up to 20 extensions, though the footage you extend from has to be 720p.
- **First and last frame, AI fills the middle (Frames to Video)**: give it a start and end frame and it generates the camera movement and transition between them; unlike before 3.1, this mode now comes with synchronized audio too.
- **Up to native 4K, vertical included**: beyond the default 720p, the 8-second option can render at 1080p or 4K, and paired with Ingredients to Video it can output native 9:16 vertical without cropping.

## What it’s good for

- A piece where a character or product has to look the same across multiple shots: hand references to Ingredients to Video.
- A story that needs more than 8 seconds with a real beginning, middle and end: generate one clip, then keep going with Scene Extension.
- You already have a start and end frame and want the camera move and transition between them handled automatically: use Frames to Video.

## Prompting tips

- **Build the prompt in Google’s own order**: camera move, subject, action, scene, style/mood — that structure works better than a pile of adjectives.
- **Keep camera move and composition separate**: dolly, tracking shot, crane, aerial, slow pan describe movement; wide shot, close-up, extreme close-up, low angle describe framing — don’t blend the two.
- **Put dialogue in quotes**: write it as `she says, "we should go now."` so the model treats it as spoken line rather than a scene description.
- **Tag sound effects and ambience separately**: something like “SFX: distant thunder” and “ambience: low hum of a starship cockpit” works better than a vague “nice sound”.
- **Write exclusions as positive descriptions**: instead of “no man-made buildings”, write “bare ground, no houses, no roads” — a concrete description beats a negation.
- **Break long shots into timestamps**: a single prompt can use segments like [00:00–00:03], [00:03–00:06] to control multiple camera moves within one shot.

```text
16:9, 8 seconds. Low-angle tracking shot of an old sea captain in a worn leather jacket standing on a fishing boat deck, looking out at the horizon, sea wind lifting his white hair.
A foggy harbor at dawn, the rising tide slapping against the hull. Realistic, nostalgic look, film grain, cold morning light.
[00:00–00:03] The captain turns toward camera. [00:03–00:06] He raises a hand and points toward a distant lighthouse. [00:06–00:08] The camera slowly pulls back to reveal the whole harbor.
He says, "Time to set sail." SFX: waves against the hull, rope creaking. Ambience: distant gulls, a foghorn.
An empty deck, no other crew, no modern equipment.
```

## Known limits

- Google says natural, coherent dialogue — especially short lines — is still being refined, and lines can come out disjointed sometimes.
- 1080p, 4K, and reference images (Ingredients to Video) all require the 8-second duration; the 4- and 6-second options only come with default 720p generation.
- Scene Extension only works on Veo 3.1 and Veo 3.1 Fast, not the Lite version, and the footage you extend from must itself be 720p.

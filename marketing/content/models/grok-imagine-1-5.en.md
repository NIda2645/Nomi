---
model: grok imagine 1.5
maker: xAI
released: 2026-06-03
checkedAt: 2026-09-28
headline: xAI's video model that turns text or a starting image into clips up to 15 seconds, now with native 1080p and up to seven image or voice references.
sources:
  - title: Grok Imagine 1.5 Preview (xAI news, 2026-06-03)
    url: https://x.ai/news/grok-imagine-1-5
  - title: Grok Imagine Video 1.5 (xAI news, general availability, 2026-06-16)
    url: https://x.ai/news/grok-imagine-video-1-5
  - title: Imagine Video 1.5 with References (xAI news, 2026-07-31)
    url: https://x.ai/news/grok-imagine-video-1-5-references
  - title: Video Generation (xAI developer docs)
    url: https://docs.x.ai/developers/model-capabilities/video/generation
  - title: Reference-to-Video (xAI developer docs)
    url: https://docs.x.ai/developers/model-capabilities/video/reference-to-video
  - title: Video Editing (xAI developer docs)
    url: https://docs.x.ai/developers/model-capabilities/video/editing
  - title: Video Extension (xAI developer docs)
    url: https://docs.x.ai/developers/model-capabilities/video/extension
  - title: Release Notes (xAI developer docs, July 2026 entry)
    url: https://docs.x.ai/developers/release-notes
---

## What’s new

- **Pure text-to-video, no starting image required**: at launch in June, 1.5 could only animate a starting image plus a prompt; the July 31 update added text-to-video, so a written description alone is now enough.
- **Native 1080p**: the June preview and the general-availability release were both capped at 720p; the July 31 update brought native 1080p to both text-to-video and image-to-video.
- **Image and voice references together, up to seven per generation**: a reference image can lock in a face, a product, or a location, and a voice reference keeps the voice consistent throughout the clip.
- **Faster generation with steadier motion and physics**: xAI says a 6-second, 720p clip now renders in about 25 seconds, down from 40-plus seconds previously, with better motion, physics, and audio.

## What it’s good for

- **Clips where a character or product has to look the same throughout**: feed it reference images and a voice reference together; xAI lists virtual try-on, product placement, and character-consistent storytelling as use cases.
- **A quick concept clip when you don't have a starting image**: describe the shot in a prompt and it generates directly from text, no reference image needed.
- **Touching up or continuing a clip you already have**: use video editing to change one detail (add an accessory, change a color) or video extension to keep the action going from the last frame, instead of regenerating the whole thing.

## Prompting tips

- **Describe the camera move, the pacing, and the sound design**: that's xAI's own framing for what a prompt should cover.
- **Write one flowing, cinematic scene description instead of a list of keywords**: xAI's own examples read like a single sentence tying subject, action, setting, and mood together — for example, "a glowing crystal-powered rocket launching from the red dunes of Mars, ancient alien ruins lighting up in the background."
- **Tag reference images and voices by position**: use `<IMAGE_0>`, `<IMAGE_1>`, `<AUDIO_0>` in the prompt to point at which uploaded reference you mean.
- **State the aspect ratio if you want one other than your source image's**: image-to-video defaults to the input image's aspect ratio unless you set it explicitly.
- **Sound is on by default, so write what you want to hear**: effects, ambience, and dialogue are generated in the same pass as the picture — describe them ("rain," "a door latch," a line of dialogue) rather than leaving them out, or turn audio off if you don't want it.
- **Keep prompts only as complex as they need to be**: xAI's docs note that prompt complexity affects processing time.

```text
Vertical 9:16. The girl in <IMAGE_0> keeps the same face and the same red hoodie throughout.
An alley at dawn, lanterns strung overhead. She jogs down the narrow street, the camera tracking her in a slow lateral pan, and glances back with a smile as she turns the corner.
Sound: footsteps, distant firecrackers, the soft rustle of lanterns swaying. No face changes, no extra people.
```

## Known limits

- **Editing and extension inherit the source clip's limits**: video editing and video extension keep the original video's duration and aspect ratio and cap out at 720p, even though a fresh generation can reach 1080p.
- **You can't clone your own voice yet**: voice references are drawn from a small set of preset voices (up to three per generation); using your own recorded audio as a voice reference is, per xAI's docs, available to trusted partners on request.
- **Reference timing is coarse**: reference-to-video generation allows at most four keyframes per request, and timestamps snap to a 1/3-second grid.

---
model: vidu q3
maker: ShengShu Technology
released: 2026-01-30
checkedAt: 2026-09-28
headline: ShengShu Technology's video model that generates up to 16 seconds of native audio-synced video, with reference-to-video to keep characters and scenes consistent.
description: "ShengShu Technology's video model: up to 16 seconds of native audio-synced video, with reference-to-video to keep characters and scenes consistent."
sources:
  - title: Vidu Q3 product page (Vidu)
    url: https://www.vidu.com/vidu-q3
  - title: "Vidu Showcases \"China Speed\" in Advancing AI Video Into Production at Global Creativity Week (ShengShu Technology press release, 2026-01-30, Vidu Q3 launch)"
    url: https://www.prnewswire.com/news-releases/vidu-showcases-china-speed-in-advancing-ai-video-into-production-at-global-creativity-week-302675040.html
  - title: "ShengShu Launches Vidu Q3 Reference-to-Video with Expanded Visual and Audio Capabilities (ShengShu Technology press release, 2026-04-13)"
    url: https://www.prnewswire.com/news-releases/shengshu-launches-vidu-q3-reference-to-video-with-expanded-visual-and-audio-capabilities-302740489.html
  - title: Reference to Video feature page (Vidu)
    url: https://www.vidu.com/ai-reference-to-video
  - title: Model Map (Vidu API docs)
    url: https://platform.vidu.com/docs/model-map
  - title: Reference to Video API reference (Vidu API docs)
    url: https://platform.vidu.com/docs/reference-to-video
  - title: Vidu Q3 model page (APIMart, API reseller docs)
    url: https://apimart.ai/model/viduq3
---

## What’s new

- **16 seconds of native audio-video in one pass**: Q3 generates up to 16 seconds of video in a single run, with sound (dialogue, voiceover, sound effects, music) produced natively alongside the picture — no separate audio pass needed. Resolution is native 1080p.
- **Precise camera and pacing control**: ShengShu says you can direct camera movement and pacing precisely, shaping the beats within each clip.
- **Reference-to-video extended to Q3 itself**: in April 2026, Q3 gained its own reference-to-video mode, combining up to 7 reference images or videos at once — subjects, environments, costumes, props and visual style can all be supplied as references and held consistent in one workflow.
- **Split into task-specific sub-models**: Q3 isn't a single model but a family — pro (text-to-video, image-to-video, first/last-frame, tuned for quality), turbo (tuned for speed), mix (reference-to-video, balanced), drama (comic-drama dialogue and narrative) and ad (ad-focused, 3–15 seconds) — pick the one that matches the job.

## What it’s good for

- Comic dramas, films and short series: the official product page names these as its main use cases.
- Narrative ads: also named directly on the product page.
- Content where a character, product or scene has to look identical throughout: reference-to-video lets you lock in people, wardrobe, props and visual style from reference images, which suits ads, AI-influencer content and multi-scene series.

## Prompting tips

- **Tie each reference image to a specific element**: reference-to-video takes up to 7 reference images or videos, and each one can control just one thing — a character, style, composition, camera move, scene or effect. Say what each image is for rather than dropping in a pile of references.
- **Add a few references and spell out the key action**: ShengShu's own guidance is to add a handful of reference images and highlight the key action, so the model knows how people and objects should look and move.
- **Fix duration and resolution before you write the description**: mix and turbo top out at 16 seconds, resolution is 720p or 1080p, and the prompt itself has a 5,000-character limit — set these as parameters rather than folding them into the prose.
- **Keep look-and-feel words separate from action**: the reseller documentation's sample prompt lists style and material separately — "Pixar-style 3D", "soft volumetric lighting", "cinematic depth of field" — rather than mixing them into the subject/action sentence.
- **Pick the sub-model before you write**: Pro is tuned for cinematic quality and fidelity, Turbo trades some of that for speed, which suits bulk or rapid-iteration work — match how much prompt detail you write to which one you're using.

```text
Reference image 1: a short-haired woman in a beige trench coat, as the character reference. Reference image 2: a vintage bicycle, as the prop reference.
Key action: the woman wheels the bicycle from reference image 2 down a rain-slicked cobblestone street, stopping at a corner to look up at a shop sign.
Look: early-morning light, wet pavement reflections, cinematic depth of field, soft volumetric lighting.
Duration 12 seconds, resolution 1080p.
No face changes, no extra people.
```

## Known limits

- Pro doesn't support reference-to-video: the official Model Map shows pro covers text-to-video, image-to-video and first/last-frame, but reference-to-video requires mix, turbo, drama or ad.
- Drama and ad cap out at 15 seconds, a second short of the 16-second ceiling on pro/turbo/mix.
- Reference-to-video accepts at most 7 reference images per generation — you can't stack more than that.

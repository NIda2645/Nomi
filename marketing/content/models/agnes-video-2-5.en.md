---
model: agnes video 2.5
maker: Agnes AI
checkedAt: 2026-09-28
headline: Agnes AI's video model with three modes behind one endpoint — text-only, first/last-frame keyframing, and multi-reference from images, audio or video — plus a faster 2.5 Flash variant.
sources:
  - title: Agnes Video 2.5 - Agnes-Ai Docs (Agnes AI official docs)
    url: https://wiki.agnes-ai.com/en/docs/agnes-video-25
  - title: Agnes Video 2.5 Flash - Agnes-Ai Docs (Agnes AI official docs)
    url: https://wiki.agnes-ai.com/en/docs/agnes-video-25-flash
  - title: AgnesAI-Models official model catalog (GitHub, AgnesAI-Labs)
    url: https://github.com/AgnesAI-Labs/AgnesAI-Models
---

## What’s new

- **Three generation modes, one endpoint**: text-only, first/last-frame keyframing, or multi-reference from images/audio/video — pick a mode instead of switching products.
- **Wider range of reference media**: up to 8 images, one 2-12 second video and 3 audio clips per request, usable as content, style, rhythm or camera-motion references.
- **Keyframing is its own mode**: set just a first frame, just a last frame, or both, to control exactly how the clip opens and closes.
- **More aspect ratios**: six ratios (21:9, 16:9, 4:3, 1:1, 3:4, 9:16), so landscape, vertical and square come out directly; resolution also comes in several tiers (see the capability table above for what Nomi offers).

## What it’s good for

- Turning a single sentence into a short clip with subject and camera motion.
- Controlling exactly where a clip starts and ends with first/last-frame keyframes, letting the model fill in the middle.
- Extending an existing image, audio track or video's style, rhythm or camera move into new footage instead of generating from nothing.

## Prompting tips

- **Cover six things in order**: Agnes AI's own recommended sequence is subject/setting, action/change, camera language, visual style, sound/rhythm, then what must stay consistent.
- **Name reference media with placeholders in reference mode**: use `<Picture N>`, `<Audio N>` and `<Video N>` in the prompt to say exactly what each numbered reference is for.
- **Duration is a string, in seconds**: 4-12 seconds (e.g. "8"), defaulting to 5 if you don't set it.
- **Fields don't mix across modes**: text mode can't carry keyframes or references, keyframe mode can't add reference images/audio/video — pick one mode, since the wrong field combination is rejected outright.
- **One result per request**: the count parameter is fixed at 1 — run it again for another version instead of asking for a batch.

```text
Camera: handheld tracking shot, slow push-in. Subject/setting: a rider weaving through a rain-soaked city street at night, neon reflected in the wet road.
Action/change: starts in a wide shot, gradually tightens to a side close-up. Visual style: cyberpunk tones, high contrast.
Sound/rhythm: low engine hum and rain, a pulsing beat underneath. Keep consistent: color grade throughout; avoid excessive camera shake.
```

## Known limits

- The fields for text, keyframe and reference modes are mutually exclusive — you can't mix them in one request (e.g. keyframe mode can't also carry reference media).
- Only one result per generation (`n` is fixed at 1); there's no batch-count control.
- Duration is capped to the 4-12 second range; the faster 2.5 Flash variant is 720P-only and doesn't accept video references, but otherwise matches 2.5.

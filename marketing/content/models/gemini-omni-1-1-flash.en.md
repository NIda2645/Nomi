---
model: gemini omni 1.1 flash
maker: Google DeepMind
released: 2026-08-27
checkedAt: 2026-09-28
headline: Google's video-focused entry in its any-to-any multimodal family, built for conversational video creation and editing, and now the model that replaces Veo inside the Gemini app.
sources:
  - title: Gemini Omni 1.1 Flash lets you build with more control (Google blog, 2026-08-27)
    url: https://blog.google/innovation-and-ai/technology/developers-tools/build-with-gemini-omni-1-1-flash/
  - title: Gemini Omni Flash model card (Google DeepMind)
    url: https://deepmind.google/models/model-cards/gemini-omni-flash/
  - title: Generate and edit videos with Gemini Omni Flash (Gemini API docs)
    url: https://ai.google.dev/gemini-api/docs/omni
  - title: Gemini Omni Flash model reference (Gemini API docs)
    url: https://ai.google.dev/gemini-api/docs/models/gemini-omni-flash
  - title: Gemini video generation product page (Gemini)
    url: https://gemini.google/overview/video-generation/
  - title: Introducing Gemini Omni (Google blog, Google I/O 2026)
    url: https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni/
  - title: Release notes / Changelog (Gemini API docs)
    url: https://ai.google.dev/gemini-api/docs/changelog
  - title: Gemini Omni 1.1 Flash (Kie.ai integration docs, used to cross-check technical parameters)
    url: https://kie.ai/gemini-omni-1-1-flash
---

## What’s new

- **Promoted from preview to GA**: the model ID moved from `gemini-omni-flash-preview` to the production `gemini-omni-1.1-flash`, released August 27, 2026; Google marked the preview model deprecated as of September 30, 2026.
- **Scenes can now be extended**: a single generation still tops out at 10 seconds, but scene extension chains clips in 10-second increments up to a cumulative 40 seconds. Google says edits can now draw on up to 10 seconds of prior context, versus earlier versions that only looked at the last second.
- **Start and end frames are yours to set**: specify the opening and closing frame of a shot and the model fills in the camera move and transition between them.
- **A 360p draft mode**: generate a lightweight 360p preview up to 60% faster, then upscale to 1080p or 4K once the shot is right.

## What it’s good for

- **Turning a photo or a line of text into a short video**: feed it up to 5 photos plus a text description and it outputs a clip with native audio, no timeline or parameter panel required.
- **Fixing one thing in a clip you already made**: tell it in chat what to change — swap a character, adjust the lighting, stabilize the shot, change the background — and it leaves everything else alone.
- **A scene that needs more than one shot**: a single generation runs up to 10 seconds; when that's not enough, scene extension chains on more footage up to a cumulative 40 seconds, with start/end frame control to land clean transitions.

## Prompting tips

- **Say explicitly when you want one continuous shot**: Google's own docs suggest phrases like "in a single continuous shot" or "no scene cuts" — without them, the model may still cut between shots.
- **Keep edit prompts simple**: Google's guidance is blunt — "Simple prompts work best for video editing. Overly descriptive prompts can lead to unintended changes."
- **Pin down what should stay put**: add "keep everything else the same" to an edit prompt, straight from Google's own examples.
- **Describe sounds by source, not by feeling**: "a distant tram, a suitcase latch" works better than "nice sound."
- **Write timing in seconds if you want control**: the docs accept timecode-style beats like `[0–3s] ... [3–6s] ...`.
- **There's no dedicated negative-prompt field — write exclusions into the sentence**: Google's docs say negative prompts aren't supported as a parameter, so put them in the prompt itself, e.g. "do not show any text on screen."

```text
Single continuous shot, no cuts. A cup of coffee steams on a kitchen table.
[0–3s] An orange cat jumps onto the chair beside it. [3–6s] It leans in and sniffs the rim of the cup.
Quiet ambience: the cat's paws on the wooden chair, a faint bird call outside the window. No people on screen, no captions.
```

## Known limits

- **Consistency and complex motion are still weak points**: Google's own model card says maintaining complete consistency through edits, generating scenes with complex motion, and rendering accurate on-screen text all remain a challenge.
- **Editing or extending an uploaded video has real limits**: the source video can't run longer than 10 seconds, and the feature isn't available yet to users in the EEA, Switzerland or the UK.
- **Changing what someone says is deliberately held back**: Google says it's still restricting this capability while the team works out how to bring it to users safely and responsibly.

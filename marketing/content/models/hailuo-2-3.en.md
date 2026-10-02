---
model: hailuo 2.3
maker: MiniMax
checkedAt: 2026-09-28
headline: MiniMax's Hailuo 2.3, for text- and image-to-video with 15 built-in camera-move commands and automatic prompt optimization — the generation before H3.
sources:
  - title: MiniMax-Hailuo-2.3 Video Generation API reference (APIMart)
    url: https://docs.apimart.ai/en/api-reference/videos/minimax-hailuo-2.3/generation
---

## What’s new

Source material here is limited: no dedicated MiniMax announcement for Hailuo 2.3 turned up, only the integrator's API reference — so this list covers confirmed capabilities rather than a full comparison with the prior version.

- **15 built-in camera-move commands**: bracket a camera keyword into the prompt (e.g. "[push in]") and the docs confirm 15 supported movement commands.
- **Prompt auto-optimization is on by default**: the API rewrites your prompt for you unless you turn that off and write it exactly as-is.
- **A dedicated Fast variant exists**: MiniMax-Hailuo-2.3-Fast, for lower latency, but it requires a first-frame image and can't run as pure text-to-video.

## What it’s good for

- Short clips where you want precise camera control via bracketed movement tags.
- Turning an existing reference image into a moving clip quickly (especially with the Fast variant).
- Higher-volume work where resolution requirements are modest and turnaround matters.

## Prompting tips

- **Use bracketed camera tags**, like "[push in]" — the docs confirm 15 supported movement commands.
- **1080p only supports a 6-second duration**; for 10 seconds, use 768p instead.
- **Prompt auto-optimization is on by default** — turn it off if you want the prompt executed exactly as written.
- **Use the Fast variant for quicker turnaround**, but note it requires a first-frame image — it can't run as pure text-to-video.
- **Prompts are capped at 2,000 characters**, tighter than some comparable models, so keep longer descriptions concise.

```text
768p, 10 seconds.
[push in] A vintage motorcycle rides into frame, rider in a black leather jacket.
[orbit] The camera slowly circles the motorcycle, showing off its details and the sunset reflecting off the chrome.
```

## Known limits

- At 1080p, duration is limited to 6 seconds; for 10 seconds you need to drop to 768p.
- The Fast variant requires a first-frame image — it doesn't support pure text-to-video.
- Prompts max out at 2,000 characters.

# Antigravity authenticated verification

Official CLI 1.1.21; no copied OAuth tokens or global configuration changes.

- Native text, local-image vision, image generation and reference editing passed.
- Generated/edited JPEG: 1024x1024, full decoder success; files visually inspected.
- Model IDs discovered: 14; 13 have a passing real assertion. Pro Low remains timed out.
- Earlier Pro High timeout and GPT-OSS exact-marker mismatch are retained in model-results.json; bounded follow-up is separate.
- Native hooks: explicit deny, exit 1, malformed JSON and timeout each blocked view_file against a task-owned canary.
- Nomi text transport and cancellation passed; actual Nomi discovery returns 14 models.
- Focused tests: 76 passed. Final full gates: 6896 tests passed, 1 skipped, build passed.
- Known usage across listed probes: 189354 tokens, plus cancellation without final usage; no monetary charge returned.

## Files

- generated-crane.jpg / edited-crane.jpg
- artifacts.json: dimensions, bytes, SHA256, decode results
- edit-reference-proof.json: exact task reference check, no account traces
- model-models.json / model-results.json / model-followup-results.json
- hook-negative-results.json

No claim of full Nomi media routing, artifact import/reopening, native Windows readiness, or production UI completion. See docs/audit/2026-08-27-antigravity-authenticated-verification.md.

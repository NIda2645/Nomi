# PR #183 ComfyUI task contract fix

## Baseline

- Source PR head: `8a46ee470f155ab6e2cc3ab2a56766c896042fc7`.
- Local implementation branch: `codex/pr183-task-contract-fix-20260827`.
- Remote source branch must remain at the source head until the final ordinary push.

## Problem

ComfyUI import derives its mapping task kind from workflow structure, while the
renderer independently re-derives the task kind from the current generic
reference array. A workflow with declared image inputs therefore imports as
`image_edit`, but independently uploaded parameter-slot values can be submitted
as `text_to_image`, bypassing the imported `/prompt` mapping.

## Scope

1. Introduce one pure structural contract that maps output media kind plus
   declared media inputs to the ComfyUI transport task kind.
2. Reuse that contract in workflow import and renderer task-kind resolution.
3. Apply the renderer structural contract only to ComfyUI vendors with a valid
   `parameterReferenceSlots` declaration.
4. Preserve every declared parameter key and value independently.
5. If RED proves uploaded parameter values are absent from
   `parameterReferenceUrls`, repair that in the existing reference resolver with
   edge/pending precedence; do not aggregate them into `referenceImages`.

## Non-goals

- No catalog version bump or catalog data migration.
- No changes to non-ComfyUI task-kind semantics.
- No new generic reference fallback and no reconstruction of independent media
  slots as an ordered generic array.
- No unrelated UI, gesture, output migration, or provider work.

## TDD sequence

1. Add failing regressions for:
   - two uploaded `LoadImage` slots with `SaveImage` retaining separate URLs and
     selecting `image_edit` in both import and renderer;
   - the same declared image workflow with empty slots still selecting
     `image_edit`;
   - a pending keyed edge masking a stale upload;
   - `LoadVideo`-only plus `SaveVideo` remaining `text_to_video`;
   - a non-ComfyUI control node retaining dynamic reference-based task-kind
     selection.
2. Run only the affected tests and record the expected assertion failures.
3. Add the smallest shared contract and wire the two consumers.
4. If required by RED, minimally complete per-key reference resolution.
5. Re-run the same tests to green before broader verification.

## Rollback

Revert the single fix commit. No persisted schema or catalog version changes are
introduced, so rollback requires no data transformation.

## Acceptance

- Targeted Vitest: ComfyUI import, final media wire, and parameter-slot tests.
- ComfyUI production-build walkthroughs: feedback, multiref, and multiref with
  video; inspect any produced screenshots directly.
- Full repository gates: filesize, tokens, i18n, lint, typecheck, tests, build
  (using `pnpm run gates` when it covers the repository-prescribed chain).
- Review scoped diff and confirm no independent slot is copied into generic
  `referenceImages`.
- Commit only scoped files, confirm the remote source branch is still at
  `8a46ee470f155ab6e2cc3ab2a56766c896042fc7`, then ordinary-push HEAD to
  `codex/comfyui-workflow-matrix-20260825` without force.

## Review follow-up: unique-slot alias projection

- Keep `parameterReferenceMetaPatch` legacy aliases intact for persisted and
  non-Comfy compatibility.
- For ComfyUI nodes with a valid parameter-slot declaration, keep uploaded and
  connected slot media only in `parameterReferenceUrls`; do not duplicate those
  exact URLs into generic image/frame fallbacks.
- A pending keyed edge remains authoritative as `null` and cannot revive either
  the stale per-key upload or its legacy alias.
- TDD control: a non-Comfy unique slot must retain legacy alias projection and
  dynamic `image_edit` selection.
- Re-run targeted media-wire/reference tests, the three Comfy walkthroughs, and
  full `pnpm run gates`; before the follow-up push, confirm the remote source
  branch is still at `dc989687ffa8c17936409f9a8a69f95be42ef333`.

## Review follow-up: final request boundary

- Preserve legacy aliases in durable node metadata, but remove generic image,
  frame, archetype, and derived active-asset aliases from the request-only meta
  view when a valid ComfyUI parameter contract is active.
- Use that one filtered view for both `buildReferenceExtras` and the final
  extras spread so neither assembly path can revive a stale alias.
- Preserve exact declared parameter keys (including explicit `null` for a
  pending keyed edge), even if a future declared key shares a legacy spelling.
- Keep non-Comfy request assembly unchanged and verify its unique-slot legacy
  aliases still select dynamic `image_edit`.
- TDD evidence: the focused media-wire test first failed 2 of 9 cases because
  upload and pending requests contained `referenceImages`; after the request
  boundary fix, the focused test passed 9 of 9 and the expanded targeted set
  passed 353 of 353.

## Review follow-up: exact-only Comfy media contract

- For a valid ComfyUI parameter contract, the resolver's only media truth is the
  declared per-key assignment map. Generic node references, upstream arrays,
  image/video/audio arrays, frame aliases, and archetype projections stay out
  even when their URLs differ from the exact slot URL.
- Request assembly derives compatibility fields first, then overlays exact
  parameter inputs last. A declared slot therefore keeps its string or pending
  `null` value even when its key collides with a legacy alias or
  `activeAssetUrls`.
- TDD evidence: the focused media-wire test first failed four cases: stale
  image/video/audio sources escaped the resolver, pending `firstFrameUrl` and
  `lastFrameUrl` were refilled from meta, and `activeAssetUrls` became an array.
  The exact-only resolver boundary and final exact overlay made all 41 cases
  pass while retaining the non-Comfy controls.

## Review follow-up: atomic parameter contract parsing

- Parse `parameterReferenceSlots` as one fail-closed contract. A non-object
  slot, invalid or empty key, invalid group, duplicate key, or explicit
  `mediaKind` outside `image`/`video` invalidates the entire declaration.
- Preserve the existing optional-media schema: an omitted `mediaKind` remains
  image-compatible, while explicit `null`, numeric values, and `audio` are not
  treated as omission.
- An invalid declaration must not partially activate the Comfy exact-only
  boundary. Resolver and final request assembly remain on the legacy path until
  the complete declaration is valid; identity mismatches remain invalid.
- TDD evidence: parser and final-wire tables first failed all seven malformed
  declaration cases (14 failures total); the atomic parser made the same 57
  focused assertions pass without changing either consumer.

## Review follow-up: explicit Comfy media controls and strict slot fields

- For a ComfyUI vendor or catalog entry carrying the explicit
  `comfyWorkflowImport` marker, derive parameter media slots only from an
  `image-url` type or a valid `image`/`video` `mediaKind`. Names such as
  `input_image` remain ordinary text parameters and cannot change import or
  renderer task kind.
- Keep the historic name heuristic for non-Comfy catalog controls. Preserve
  binding-derived `image-url` inputs and explicit media-kind declarations.
- Share this explicit-vs-heuristic predicate across catalog projection, slot UI,
  and scalar-control filtering so a parameter cannot be media in one consumer
  and text in another.
- Parse persisted slot `key`, `label`, and `group` without coercion. Non-string
  fields, including `group: ['reference']`, invalidate the whole contract and
  retain the legacy resolver/request path.
- TDD evidence: the focused RED run failed five assertions across the parser
  and final media wire, then the explicit-media control RED added two more
  failures. The minimal shared predicate and strict parser made the expanded
  focused set pass 99 assertions.

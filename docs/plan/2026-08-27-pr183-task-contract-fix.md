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

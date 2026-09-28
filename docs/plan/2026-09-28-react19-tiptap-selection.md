# React 19 / TipTap selection lifecycle remediation

## Scope

- Make the TipTap React lifecycle contract explicit and shared by the canvas prompt editor and the rich-text hook.
- Memoize the shared hook's extension and editor-props collections so React 19 renders cannot trigger option identity churn.
- Add a source-level regression test for the shared contract and preserve the existing real canvas walkthrough as the platform evidence.

## Not in scope

- No change to walkthrough assertions or keyboard semantics.
- No dependency upgrade; the installed TipTap 3.23.5 source is the dependency evidence.
- No change to persisted document/prompt formats.

## Rollback

Revert the lifecycle option export, the two call-site spreads, the shared-hook memoization, the regression test, and the root-cause contract together.

## Acceptance

- `PromptEditor` and `useNomiRichTextEditor` both use the same explicit React adapter options.
- The shared hook's extension/editor-props identities remain stable between renders.
- Existing canvas selection/delete/undo walkthrough remains green; changing the contract back makes the lifecycle regression test fail.

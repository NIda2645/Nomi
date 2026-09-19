# Core canvas ownership

Repair K4/K6 on the current owner, without authoring format migration or new Agent write routes.

Prior art: `docs/research/2026-09-10-node-composer-placement/prior-art.md` and `docs/research/2026-09-18-storyboard-single-ledger/prior-art.md`. Retain existing React Flow placement and the project save queue; use existing canvas lifecycle identity to reject late writes.

1. Reuse only committed composer lifecycle delta 93ff9c20a, after behavior red tests against main. Preserve both parameter component hosts.
2. Capture document, explicit plan and loaded canvas before model lookup. Reject replaced content or projects; focus changes do not retarget pending writes.
3. Inspect creation launch separately from persisted Run-to-creation ownership. Do not patch the visibility gap by writing a second editable plan.
4. Make explicit deletion one existing journal operation, with project-scoped related content. Undo is session-only; reopening validates persisted state, not persistent undo history.

Validation: behavioral red-green tests, root cause/door contracts, type checks, real Electron click/hit/input and save/reopen fixtures. No paid calls or real projects. Rollback reverts scoped commits; no storage migration.

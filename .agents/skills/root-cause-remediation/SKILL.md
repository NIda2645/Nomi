---
name: root-cause-remediation
description: Use for bugs or regressions in high-risk Nomi production paths, especially provider, media, workflow, task, runtime, IPC, persistence, or cross-model behavior. Requires a class-level root cause contract and changed regression tests before implementation is considered complete.
---

# Root Cause Remediation

Use this skill when a user reports a failure, a regression is found, or a fix touches a high-risk production path.

## Required sequence

1. Reproduce the exact user-visible symptom with the smallest deterministic test or fixture.
2. Trace the full path from user input through state/persistence to the final request, write, or decode boundary.
3. Separate symptom, direct cause, and class root. The class root is the shared missing invariant that lets every equivalent entry fail.
4. Enumerate all entry points into that invariant. Search by data shape, contract, and consumer—not only by the reported model/vendor name.
5. Before changing third-party behavior, read current official docs and primary source code. Record URLs, purpose, and check date. If the issue is purely internal, state why external material cannot decide it.
6. Write or update `docs/fixes/*.root-cause.json` before the production fix. The contract must cover every changed high-risk production file.
7. Add a failing regression test for the reported case and at least one class-level boundary when they differ.
8. Fix the earliest shared boundary that can enforce the invariant. Do not add vendor/model branches when a role, type, schema, upload, or persistence boundary can solve the class.
9. Define migration behavior for old stored bindings/scripts/data. Delete obsolete behavior in the same change; do not leave a permanent fallback.
10. Run focused red/green tests, `pnpm run check:root-cause-contracts`, then the repository gates.

## Completion test

Do not call a bug solved until you can answer all of these with code/test evidence:

- Why did it happen?
- Which users and inputs were affected?
- What shared invariant was missing?
- Which equivalent entry points were scanned?
- What prevents the same class from returning through another model/vendor/path?
- How are old stored values handled?
- Which changed tests prove the reported case and the class boundary?

If any answer is unknown, mark it as a residual risk in the contract instead of guessing.

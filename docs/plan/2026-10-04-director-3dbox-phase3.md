# Director 3D-BOX Phase 3 prerequisite (S1 R4)

This checkout carries the compiler/schema prerequisite from PR #976 so the planner can be evaluated against stable downstream identity.

- Entity ids are derived from plan names: `actor:<id>`, `shot:<id>/camera`, `setPiece:<id>`, and deterministic dressing ids. No plan hash participates in entity identity.
- `directorPlanModelSchema` is a strict model-facing projection. It describes planner fields, uses enums instead of root literals, and is checked with the shared structural/vendor JSON Schema rules in `directorPlanSchema.test.ts`.
- Compiler regressions cover repeated compilation, an isolated shot rename, initial character action evidence, stacked product placement, and template ground materialization.

The schema projection remains a model contract; execution validation continues to use `directorPlanSchema` and normalization.

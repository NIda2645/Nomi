# Agent panel render-boundary structure review

## Scope

This review covers the repeated `src/workbench` corrective contracts that touch the Agent panel and its adjacent renderer boundaries. The 2026-09-27 freeze is a recurring renderer-performance failure, so the review checks whether the fix belongs at the shared boundary rather than in each caller.

## Findings

- `src/workbench/ai/v4/agentPanelV4Labels.ts` is the sole owner of V4 visible labels. Caching by resolved language removes repeated construction for every row while preserving a fresh object when the locale changes.
- `src/workbench/ai/v4/useAgentPanelV4Data.ts` is the sole owner of parts-to-flow derivation. Tool display work is cached by tool name and parameter identity, and the complete flow passes through one generic deep structural-sharing boundary.
- `src/workbench/ai/v4/AgentPanelV4Panel.tsx` is the sole owner of row rendering. `React.memo` is effective because the flow items and handler object are stable; handler implementations remain current through a ref and the key signature accounts for handlers appearing or disappearing.
- `src/workbench/ai/v4/shareEqualDeep.ts` follows TanStack Query `replaceEqualDeep` prior art. It compares every ordinary-object field and array element recursively, so adding a future V4FlowItem field cannot silently keep a stale row.

## Decision

The structure is now centralized at the three existing owners. No second labels cache, alternate flow projection, row fallback, or renderer-specific copy is allowed. The class regression test exercises both the real lane derivation and the real `AgentPanelV4Panel` update at N=50 and N=300.

## Follow-up evidence

Vitest, the contract checker, and the door-map gate were attempted in this worktree. Node child-process creation is blocked by the Windows sandbox with `spawn EPERM`; the exact failures are recorded in the delivery report and must be rerun in CI or a normal developer process.

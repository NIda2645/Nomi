# Fixed pi 0.85.1 history and context boundary

Status: deterministic probes verified; no real model, Electron or packaged proof.

## Provenance

Lock and installed package are @earendil-works/pi-agent-core, pi-ai and pi-coding-agent 0.85.1. `git ls-remote https://github.com/earendil-works/pi.git refs/tags/v0.85.1*` returned `d981de1229ef899957bbe968bc8dcda02a21f477`. Public imports execute in `tests/agent-runtime/lane-pi-reuse.test.mts`; runtime fixtures replace only the remote model with a loopback HTTP endpoint.

## Counter-proposal and verdict

Do not create TaskContextManager, a second SessionManager, JSONL parser, history writer or subscription reducer. `watchSession` exists but throws SliceNotImplemented; R01 calls it and confirms rejection. A custom entry appended once is not permanent model memory: context construction starts at the latest compaction. The installed APIs already implement storage, ancestry, ordering, compaction and retry. Nomi lacks a read adapter that distinguishes their views.

## Four-column dependency boundary

| Capability | Installed public implementation | Existing Nomi integration | Decision |
| --- | --- | --- | --- |
| Branch history | session/session.js:127 StorageBackedBranch.findEntries | laneHistory full scan, live host uses snapshot | Shared thin paged reader; original IDs; no durable cache |
| Runtime working set | runtime/reducer.js:150 entry_added replaces transcript on compaction | reduceLaneSnapshot | Direct reuse, no historical rows injected |
| Watch recovery | events.js:142 BufferedEventWatcher; async listener serialized, resnapshot boundary buffered | lane.watch | Await resnapshot inside upstream listener; workspace identity remains Nomi responsibility |
| Original input relation | session/types.d.ts:61 OperationMeta; session/values.d.ts:80 operationMeta | not previously read | Public read only; seed IDs plus current ancestry for consumed steer |
| Terminal lifetime | runtime/drive/terminal.js:23 deletes operationMeta | previous assumption not explicit | Never recover completed operation from metadata; explicit Continue uses original branch ID |
| Provider context | before_compaction and transform_context | already installed | Preserve compact engine; bounded original intent quote, excludes permissions, selections and payment state |

Source: [pi session](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/agent/src/harness/session/session.ts), [pi reducer](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/agent/src/harness/runtime/reducer.ts), [pi events](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/agent/src/harness/events.ts). Line references above name installed dist files (not guessed upstream source lines).

## Field decisions and inventory

BranchScan: `start` derives from the captured runtime tip (prevents future rows during resnapshot); `cursor.seq` derives from oldest original entry; `limit` is page size plus one lookahead; `order` is newestFirst for paging with one chronological reverse; `stopAtId` derives from run source tip / explicitly selected continuation; `type` is message for input-only queries; `stopAtType` is compaction for runtime accounting; `customType` is unused here. No SDK field is written into an invented control namespace.

OperationMeta: `operationId`, `lane` and `intent.kind` identify current operation; `sourceTipId` bounds consumed input ancestry; `promptEntryIds` reads original seed inputs; `startedAt` is unused. Public metadata is read only. Existing dependency-capabilities.generated.json already records the fixed package (version 0.85.1, 659 exported symbols); this task does not change dependencies or regenerate inventory.

## Evidence and honest limits

R02 red: two persisted original inputs, zero visible after actual SDK compaction. Green: both original IDs and skill tags remain. R03: 175 original entries paged 80 at a time; side branch excluded; reopen returns same IDs. R04: two actual compactions, summaries deliberately omit original intent; request still includes correct original intent and skill reference. Public probe proves steer is not added to promptEntryIds and terminal metadata is deleted; a fresh task does not inherit old input. R05: upstream watch/navigation/resnapshot produces branch-identical IDs and rejects resnapshot after unsubscribe; renderer rejects old workspace pushes while opening a new one. Continue's pre-compaction original stopped ID is checked against branch ancestry, not runtime tail.

Intent injection is capped at 16000 characters and eight recent consumed inputs plus initial prompt IDs; larger inputs are marked excerpts. This is not a complete arbitrary-length task memory guarantee. Attachments remain immutable claims; historical intent does not resolve bytes or activate old authority. T5 owns terminated retry reference wiring. Missing/changed attachments and skills still require real product integration acceptance, as do R06/R07 payment boundary traces, full idle-clock and cancellation matrix. No paid generation or private user data used.

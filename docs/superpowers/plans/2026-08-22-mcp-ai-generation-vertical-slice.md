# MCP AI Generation Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one real, recoverable MCP AI-generation path that plans, previews, gates, submits exactly one provider job, persists an Artifact, and offers a reversible adopt proposal without introducing a second Run, Asset, or Timeline owner.

**Architecture:** Keep the existing `electron/runtime.ts` provider-neutral task boundary and `electron/productionRun/` durable Run as the owners. Add a hash-pinned, built-in module catalog and a pure `PlanCandidate → ExecutionContract` compiler; MCP, the Nomi Agent, and tests use the same contract and receipt. The first path is one shot/one provider job; it does not insert into the timeline automatically. Timeline/EditorDocument migration and renderer work are separate later plans.

**Tech Stack:** Electron main process, TypeScript, Zod, Vitest, existing MCP stdio/dispatcher, existing ProductionRun repository/service/outbox, existing runtime `runTask`, Playwright/Node journey harness.

---

## Scope and non-goals

This plan is deliberately limited to P0–P3 of the unified runtime design. It must produce a working, testable slice on its own.

Included:

- canonical ownership/rollout documentation;
- typed module and execution-contract schemas;
- capability and tool allowlist preflight;
- host-authored generation plan submission;
- deterministic preview and one typed spend gate;
- one-shot generation through the existing runtime/ProductionRun;
- durable progress, restart/reconcile, idempotency and Artifact persistence;
- an adopt Proposal, with no automatic timeline mutation;
- zero-credit, fake-provider and one explicitly labelled real-provider smoke tests;
- six-role and adversarial review evidence for this slice.

Deferred:

- full `EditorDocument`/Timeline v2 migration;
- a new `GenerationJob` or `AssetRegistry` type;
- local interview editing and full Editor Workbench UI;
- multi-shot continuity, audio/captions/export;
- HyperFrames/Remotion production renderers;
- arbitrary remote code or runtime Skill installation;
- `brand.promo`/`drama.short` as execution prerequisites.

## File map and ownership

| Path | Responsibility in this slice |
|---|---|
| `docs/superpowers/plans/2026-08-22-nomi-unified-editor-runtime.md` | Chinese canonical implementation plan; absorbs the pasted 1726-line plan and supersedes its old ordering |
| `docs/superpowers/specs/2026-08-22-runtime-ownership-adr.md` | Ownership and naming decision (`ProductionContract` vs `ExecutionContract`) |
| `electron/capabilityCore/moduleManifest.ts` | Zod schema and pure validation for registered modules |
| `electron/capabilityCore/moduleRegistry.ts` | Immutable per-run module catalog snapshot and allowlist resolution |
| `electron/capabilityCore/executionContract.ts` | `PlanCandidate → ExecutionContractV1` pure compiler, canonical hash and field ledger |
| `electron/capabilityCore/generationContext.ts` | Project-scoped, read-only planning packet |
| `electron/capabilityCore/generationSingleShot.ts` | Orchestration adapter for the one-shot lifecycle; no direct project writes |
| `electron/capabilityCore/mcpGenerationTools.ts` | Typed MCP tool handlers and stage-aware visibility |
| `electron/productionRun/productionRunTypes.ts` | Existing Run/Job types; add only typed `executionBinding` fields |
| `electron/productionRun/productionRunService.ts` | Existing durable command/gate/job owner; add contract-aware methods only |
| `electron/productionRun/productionRunIpc.ts` | Existing validation boundary; reject forged contract/approval fields |
| `electron/productionRun/submissionOutbox.ts` | Existing provider-submit/reconcile owner; preserve `submission_unknown` semantics |
| `electron/capabilityCore/mcpToolCatalog.ts` | Advertise the new semantic tools and keep `nomi_generate` explicitly legacy |
| `electron/capabilityCore/dispatcher.ts` | Route semantic tools to the same service/runtime, never to a second provider path |
| `electron/capabilityCore/mcpProtocol.ts` | Stage-aware tool exposure and structured error/receipt output |
| `electron/capabilityCore/moduleManifest.test.ts` | Schema/allowlist/adversarial tests |
| `electron/capabilityCore/executionContract.test.ts` | Compiler, hash and no-loss tests |
| `electron/capabilityCore/generationSingleShot.test.ts` | Fake-provider lifecycle and idempotency tests |
| `electron/capabilityCore/mcpGenerationTools.test.ts` | Tool schema, stage visibility and forged-input tests |
| `electron/capabilityCore/nomiMcpGenerationSingleShot.test.ts` | Real in-process MCP round trip with zero-credit provider |
| `tests/ux/mcp-generation-single-shot.e2e.mjs` | Real Electron stdio journey and reconnect evidence |
| `docs/audit/2026-08-22-mcp-generation-phase-evidence.md` | PhaseEvidence, six-role verdicts, adversarial verdict and rollback reference |

The existing `electron/runtime.ts`, `electron/productionRun/`, Asset store and current Canvas/Timeline remain owners. A new file may add an adapter or projection, but may not create a second persistent owner.

---

## Task 0: Establish the canonical Chinese plan and baseline

**Files:**

- Create: `docs/superpowers/plans/2026-08-22-nomi-unified-editor-runtime.md`
- Create: `docs/superpowers/specs/2026-08-22-runtime-ownership-adr.md`
- Test/evidence: `docs/audit/2026-08-22-mcp-generation-phase-evidence.md`

- [ ] **Step 1: Record a clean baseline before changing code**

Run in the clean sibling worktree:

```bash
git rev-parse HEAD origin/main
pnpm run typecheck
pnpm run test
```

Expected: the commit and command output are copied into the phase evidence; the current dirty shared worktree is not used as evidence.

- [ ] **Step 2: Write the ownership ADR**

The ADR must contain this explicit table and reject any implementation that adds a second owner:

```text
ProductionContract = run/job-set business, budget and approval envelope
ExecutionContract  = one operation/shot compiled execution binding
ProductionRun      = durable events, gates, jobs, outbox and recovery
RuntimeTask        = provider-neutral execution boundary
Asset store        = asset identity, bytes, materialization and lease
MCP/UI/Canvas      = transport or projection, never an independent truth source
```

It must also state that `GenerationJob` is a domain phrase for the existing `ProductionJob`/runtime task, not permission to create a parallel table.

- [ ] **Step 3: Rewrite the Chinese plan’s execution order**

The canonical plan must put these phases in order:

```text
P0 baseline/ownership
P1 runtime + module + asset boundary
P2 ExecutionContract compiler
P3 MCP single-shot generation
P4 recovery/controlled expansion
P5 editor Adopt Proposal
P6 renderer/dynamic modules
P7 full Editor/workflow productization
```

Preserve the original plan’s user paths, QA, audio, MotionGraphic, J1–J11 and review sections, but mark them as later phases where they depend on P3/P5. The English design file is cited as an absorbed design note, not a second execution entry.

- [ ] **Step 4: Add phase exit/rollback rules to the Chinese plan**

Every phase must specify:

```text
entry evidence → files changed → zero/paid boundary → tests → user-visible evidence → exit verdict → rollbackRef
```

No provider call or persistent migration is allowed in Task 0.

- [ ] **Step 5: Run document self-review**

Run:

```bash
rg -n "TBD|TODO|later|eventually|declared|parallel|second Run|second Asset" docs/superpowers/plans/2026-08-22-nomi-unified-editor-runtime.md
```

Expected: no vague implementation placeholder remains; any use of “later” names a phase and an entry condition. Commit the document/ADR/evidence skeleton separately from code.

## Task 1: Define the module contract and registry (zero credit)

**Files:**

- Create: `electron/capabilityCore/moduleManifest.ts`
- Create: `electron/capabilityCore/moduleRegistry.ts`
- Test: `electron/capabilityCore/moduleManifest.test.ts`
- Test: `electron/capabilityCore/moduleRegistry.test.ts`

- [ ] **Step 1: Write failing schema tests**

Cover these cases before implementation:

```ts
it('accepts a hash-pinned built-in module with explicit effects and tools')
it('rejects an unknown kind, empty hash, unknown tool or empty executor')
it('rejects a Skill-only module that claims paid/project-write effects')
it('rejects arbitrary shell/fs/network tools for a knowledge or check module')
it('does not activate a tool merely because its name appears in Skill text')
```

- [ ] **Step 2: Implement the closed module schema**

Use a discriminated Zod contract with:

```ts
kind: 'workflow' | 'route' | 'check' | 'renderer' | 'connector' | 'knowledge'
sideEffectClass: 'read' | 'propose' | 'paid' | 'project_write' | 'publish'
id, version, contentHash, inputs, outputs, requiredCapabilities,
allowedTools, allowedCommands, validatorRefs, executorRef,
approvalPolicy, retryPolicy
```

The parser must reject unknown keys (`.strict()`), paths, credentials and inline executable code.

Use these concrete TypeScript names so later tasks cannot drift:

```ts
export type SideEffectClass = 'read' | 'propose' | 'paid' | 'project_write' | 'publish'
export type ArtifactContract = { kind: string; schemaVersion: number; required: boolean }
export type ApprovalPolicy = { required: boolean; gateKind?: 'generation_plan_review' | 'generation_submit' | 'artifact_adopt' }
export type RetryPolicy = { scope: 'pure_check' | 'compile' | 'provider_reconcile' | 'provider_resubmit'; idempotencyRequired: boolean }
export type ModuleCatalogSnapshot = { catalogVersion: string; contentHash: string; modules: ModuleManifest[] }
export type ResolvedModule = { manifest: ModuleManifest; snapshotHash: string }
```

- [ ] **Step 3: Implement immutable catalog snapshots**

Expose pure functions with these signatures:

```ts
registerBuiltInModule(module: ModuleManifest): void
snapshotModuleCatalog(): ModuleCatalogSnapshot
resolveModule(snapshot: ModuleCatalogSnapshot, id: string, version: string): ResolvedModule
assertModuleInvocation(snapshot: ModuleCatalogSnapshot, moduleId: string, tool: string, effect: SideEffectClass): void
```

`snapshotModuleCatalog()` returns a content hash. A Run captures it once; later registry changes affect only a new Run.

- [ ] **Step 4: Run focused tests and commit**

```bash
pnpm exec vitest run electron/capabilityCore/moduleManifest.test.ts electron/capabilityCore/moduleRegistry.test.ts
```

Expected: PASS, including all fail-closed cases. Commit only the module contract/registry files and tests.

## Task 2: Compile a PlanCandidate into an ExecutionContract

**Files:**

- Create: `electron/capabilityCore/executionContract.ts`
- Test: `electron/capabilityCore/executionContract.test.ts`
- Modify: `electron/productionRun/productionRunTypes.ts` (typed `executionBinding` only)
- Test: `electron/productionRun/productionStoryboardBinding.test.ts` (new contract binding cases)

- [ ] **Step 1: Write failing compiler tests**

The tests must prove:

```ts
it('compiles the same input and registry snapshot to the same canonical hash')
it('retains every prompt, asset, model and output field in the ledger')
it('records dropped fields and warnings when capability resolution is explicit')
it('rejects stale asset versions, foreign projects and unknown module versions')
it('rejects host fields approved, providerTaskId, assetId and qualityPass')
it('changes the contract hash when an input asset version or capability changes')
```

- [ ] **Step 2: Add the typed contract**

The schema must contain:

```ts
source: { kind, artifactId, version, hash }
operation: { kind, module: { id, version, contentHash } }
project: { projectId, revision }
inputs: { promptParts, assetRefs, params }
capabilitySnapshot
outputs: { artifactKinds, destination }
policy: { gateId, maxSpend, approvalHash }
execution: { requestFingerprint, idempotencyKey, runtimeTaskId }
ledger: FieldLedgerEntry[]
warnings: string[]
```

Define the input and ledger types in the same file before implementing the compiler:

```ts
export type PlanCandidate = {
  projectId: string
  baseRevision: number
  operation: { kind: string; moduleId: string; moduleVersion: string }
  promptParts: PromptPart[]
  assetRefs: Array<{ assetId: string; role: string; version: number; stateId: string; required: boolean }>
  params: Record<string, unknown>
  requestedDestination: 'project_asset' | 'canvas' | 'timeline' | 'export'
  estimatedCost: number | null
}
export type PromptPart = { role: 'system' | 'user' | 'instruction' | 'negative'; text: string; source: string }
export type FieldLedgerEntry = {
  path: string
  source: 'candidate' | 'module-default' | 'capability-resolver' | 'user-override'
  target: 'contract' | 'provider' | 'artifact'
  status: 'retained' | 'dropped' | 'defaulted' | 'warning'
  reason?: string
}
```

Use a canonical JSON serializer with sorted object keys and a SHA-256 hash. Do not use `JSON.stringify` on an unvalidated object as the contract hash.

- [ ] **Step 3: Bind existing ProductionJob without creating GenerationJob**

Add an optional, schema-validated `executionBinding` to the existing job metadata path:

```ts
type ExecutionBinding = {
  contractHash: string
  shotId: string
  moduleRef: { id: string; version: string; contentHash: string }
  inputAssetRefs: Array<{ assetId: string; version: number; stateId: string }>
  requestFingerprint: string
  idempotencyKey: string
  capabilitySnapshotHash: string
}
```

Old records remain readable through an explicit `compatibility: 'legacy'` projection; new paid jobs cannot be created without the binding.

- [ ] **Step 4: Verify field conservation**

```bash
pnpm exec vitest run electron/capabilityCore/executionContract.test.ts electron/productionRun/productionStoryboardBinding.test.ts
```

Expected: PASS; no provider call occurs in these tests. Commit the pure compiler and binding independently.

## Task 3: Add the read-only generation context and host planning tools

**Files:**

- Create: `electron/capabilityCore/generationContext.ts`
- Create: `electron/capabilityCore/mcpGenerationTools.ts`
- Modify: `electron/capabilityCore/mcpToolCatalog.ts`
- Modify: `electron/capabilityCore/dispatcher.ts`
- Modify: `electron/capabilityCore/mcpProtocol.ts`
- Test: `electron/capabilityCore/mcpGenerationTools.test.ts`

- [ ] **Step 1: Write failing tool-contract tests**

Test that:

```ts
it('returns project revision, asset summaries, module snapshot and capability options without writing')
it('accepts a PlanCandidate but rejects approved/providerTaskId/assetId/qualityPass fields')
it('returns a deterministic candidate hash and structured warnings')
it('does not call runTask for context, submit or preview')
it('rejects a projectId different from the authenticated MCP lease')
```

- [ ] **Step 2: Implement `nomi_get_generation_context`**

Return only project-scoped, serializable data:

```ts
{
  schemaVersion,
  projectId,
  projectRevision,
  selectedAssetRefs,
  moduleCatalogHash,
  modules,
  capabilityProfiles,
  planningInputSchema,
  costPolicy,
  nextAction: 'submit_plan'
}
```

Do not return absolute filesystem paths, API keys or opaque provider URLs as the only artifact reference.

- [ ] **Step 3: Implement `nomi_submit_generation_plan` and `nomi_preview_execution`**

Both call the pure compiler. They persist a draft candidate/preview through the existing Run/artifact service, but they do not reserve spend, call a provider or mutate the project.

The preview must show selected/rejected model candidates, legal duration/ratio/reference resolution, estimated cost, warnings and `contractHash`.

- [ ] **Step 4: Implement stage-aware visibility**

Before approval, expose context/submit/preview only. Do not expose the start handler to the model. A module catalog refresh may update the next Run but cannot change an existing draft hash.

- [ ] **Step 5: Run focused tests and commit**

```bash
pnpm exec vitest run electron/capabilityCore/mcpGenerationTools.test.ts electron/capabilityCore/productionRunCore.test.ts
```

Expected: PASS with `runTask` call count equal to zero.

## Task 4: Implement the typed gate and one-shot durable submission

**Files:**

- Create: `electron/capabilityCore/generationSingleShot.ts`
- Modify: `electron/productionRun/productionRunService.ts`
- Modify: `electron/productionRun/productionRunIpc.ts`
- Modify: `electron/productionRun/submissionOutbox.ts`
- Modify: `electron/capabilityCore/dispatcher.ts`
- Modify: `electron/capabilityCore/mcpProtocol.ts`
- Test: `electron/capabilityCore/generationSingleShot.test.ts`
- Test: `electron/productionRun/submissionOutbox.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

The fake provider must record every submit and return controllable poll outcomes. Test:

```ts
it('does not submit before the exact generation gate for the exact contract hash')
it('submits once for one idempotency key')
it('returns the original receipt for a duplicate start')
it('persists providerTaskId before polling')
it('marks submission_unknown and reconciles instead of blindly resubmitting')
it('restarts and resumes the same ProductionJob')
it('rejects expired approval, stale revision and cross-project contract')
it('creates an Artifact only after verified materialization')
```

- [ ] **Step 2: Add `nomi_decide_generation_gate`**

The decision must bind:

```ts
gateKind + targetHash + projectRevision + costScope + actor + expiresAt
```

The handler must ignore or reject any client-supplied provider task, asset id or quality verdict. Repeating the same decision returns the original receipt.

- [ ] **Step 3: Add `nomi_start_generation` through the existing outbox**

The handler accepts only `runId`, `contractHash`, `idempotencyKey` and an authenticated project scope. It loads the sealed contract from the Run, verifies the gate, reserves the known cost, and delegates to the existing `runtime.runTask`/submission outbox. It must not accept arbitrary provider/model/prompt fields at this point.

- [ ] **Step 4: Add poll, cancel and reconcile projections**

Use the existing Run event cursor and job state. Client disconnect is not cancellation. Explicit cancel produces a durable cancelled receipt; unknown provider outcome remains recoverable and blocks blind retry.

- [ ] **Step 5: Run focused tests and commit**

```bash
pnpm exec vitest run electron/capabilityCore/generationSingleShot.test.ts electron/productionRun/submissionOutbox.test.ts electron/productionRun/productionRunService.test.ts
```

Expected: PASS; fake provider submit count is exactly one on the success path.

## Task 5: Persist the Artifact and expose an adopt Proposal

**Files:**

- Modify: `electron/productionRun/productionRunArtifactOperations.ts`
- Modify: `electron/productionRun/productionRunService.ts`
- Modify: `electron/capabilityCore/mcpGenerationTools.ts`
- Test: `electron/capabilityCore/generationSingleShot.test.ts`
- Test: `electron/productionRun/productionArtifactContract.test.ts`

- [ ] **Step 1: Write failing Artifact tests**

Prove that an Artifact contains the exact contract hash, input asset versions, provider/model mapping, local materialization hash, preview derivative and Run/job receipt; a missing derivative or mismatched hash is `blocked`, not `completed`.

- [ ] **Step 2: Implement `nomi_get_artifact`**

Return a durable local artifact projection plus resource links/preview metadata. The result must be readable after process restart and must not rely on a single expiring provider URL.

- [ ] **Step 3: Implement `nomi_propose_adopt_artifact`**

Create a reversible Proposal tied to the current project revision. Do not mutate Canvas/Timeline. The Proposal must include `artifactId`, `artifactVersion`, `contractHash`, `baseRevision`, an explicit destination and a receipt id.

- [ ] **Step 4: Run focused tests and commit**

```bash
pnpm exec vitest run electron/productionRun/productionArtifactContract.test.ts electron/capabilityCore/generationSingleShot.test.ts
```

Expected: PASS; no timeline mutation is observable in this task.

## Task 6: Exercise the full MCP journey with zero-credit and real-host evidence

**Files:**

- Create: `electron/capabilityCore/nomiMcpGenerationSingleShot.test.ts`
- Create: `tests/ux/mcp-generation-single-shot.e2e.mjs`
- Modify: `tests/ux/helpers/*` only if the existing MCP harness lacks a typed reconnect helper
- Create: `docs/audit/2026-08-22-mcp-generation-phase-evidence.md`

- [ ] **Step 1: Add the in-process MCP contract journey**

The journey must execute:

```text
initialize
→ tools/list
→ nomi_get_generation_context
→ nomi_submit_generation_plan
→ nomi_preview_execution
→ nomi_decide_generation_gate
→ nomi_start_generation
→ progress/events
→ nomi_get_artifact
→ nomi_propose_adopt_artifact
```

Assertions must include providerCalls `0` before the gate, `1` after start, one Artifact, one receipt and no automatic timeline write.

- [ ] **Step 2: Add fault-injection cases**

Run the same journey with process restart, delayed callback, duplicate callback, 503, unknown outcome and expired gate. Each result must have `errorCode`, human summary, evidence reference and `nextAction`.

- [ ] **Step 3: Add the real Electron stdio path**

The Playwright/Node harness may click/type/select/approve through the documented surface only. It must not call filesystem APIs, provider SDKs or private IPC to forge success. Record tool names, request ids, progress, artifact resource and screenshot evidence.

- [ ] **Step 4: Run zero-credit and existing gates**

```bash
pnpm exec vitest run electron/capabilityCore/nomiMcpGenerationSingleShot.test.ts
node tests/ux/mcp-generation-single-shot.e2e.mjs
pnpm run typecheck
pnpm run lint:ci
pnpm run test
```

Expected: zero-credit journey passes in CI; any real-provider smoke is separately labelled with provider, model, cost and receipt. A mock-only pass is not called media completion.

## Task 7: Phase review, rollback and handoff

**Files:**

- Modify: `docs/audit/2026-08-22-mcp-generation-phase-evidence.md`
- Create: `docs/audit/2026-08-22-mcp-generation-six-role-review.md`
- Create: `docs/audit/2026-08-22-mcp-generation-adversarial-review.md`

- [ ] **Step 1: Fill PhaseEvidence**

Record commit SHA, baseline/input hashes, every command and exit code, MCP journey artifacts, screenshots/media, known risks, feature flag and rollback reference.

- [ ] **Step 2: Run the six-role review**

Each role must give concrete P0/P1/P2 findings or an evidence-backed pass. “Looks good” without a test/resource reference is not a pass.

- [ ] **Step 3: Run the independent adversarial review**

The reviewer must attempt forged approval, stale contract, duplicate submission, cross-project access, malicious Skill text, missing asset, unknown provider and direct IPC bypass. Any successful bypass blocks the phase.

- [ ] **Step 4: Apply the stop rule**

Do not begin the next phase if any of these occur: duplicate provider charge, provider call before approval, cross-project mutation, unrecoverable Artifact loss, stale approval accepted, or mock-only evidence presented as real generation.

- [ ] **Step 5: Commit the phase as one reviewable delivery**

The commit must contain only the files in this plan and its evidence. The next plan (P4/P5 recovery expansion and clipping-area Agent Adopt) starts only after this phase has a `passed` verdict.

---

## Definition of done for this plan

An external MCP host can complete one project-scoped generation from context to durable Artifact and adopt Proposal; the host cannot bypass Nomi’s gate, budget or project scope; a restart or duplicate callback cannot create a second provider submission; and all six-role/adversarial evidence is present. No full editor migration is required for this plan.

## Explicit rollback

The semantic MCP tools are behind a feature flag. On failure, disable the flag and keep the existing `nomi_generate` compatibility path read-only/legacy. Do not delete old Run records, rewrite project assets, migrate Timeline data or remove the old route until a later, separately reviewed plan has a copy-on-write migration and restore test.

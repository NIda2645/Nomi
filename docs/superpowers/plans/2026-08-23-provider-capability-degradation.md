# Provider Capability Degradation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让只有提交能力的供应商也能完成一次明确、可审计的生成，同时把自动恢复、核账和远端取消按供应商真实能力逐级降级，绝不隐式重试或伪造状态。

**Architecture:** 保留 ProductionRun、intent WAL、runtime envelope、receipt 和唯一 `generationRuntimeAdapter` 作为所有提交的共同边界。把 provider capabilities 从“提交前全量 gate”改成纯 capability profile：`submit` 是基本能力，`query/reconcile/cancel/submitIdempotency` 分别控制观察、恢复和取消；APIMart 以 observe-only 方式接入。MCP 与 GUI 继续共用同一个 planning/start/reconcile 语义，不复制 provider-specific UI。

**Tech Stack:** Electron main process, TypeScript, Zod, Vitest, existing ProductionRun repository/outbox/lock, existing APIMart catalog mappings, MCP JSON-RPC/GUI shared generation planning.

## Execution record (2026-08-23)

Tasks 1–7 are implemented on `codex/p0-runtime-foundation-20260822`:

- `eba7dfbe`, `51e6e7c6`, `94fe4f85`, `b4f1b1cb`: capability profiles, degraded submit adapter, profile-aware planning, durable explicit new attempts.
- `a13ede83`: APIMart observe-only adapter and default catalog/bootstrap wiring.
- `3615758a`: shared recovery projection in MCP text, desktop notifications and MCP Apps widget.
- `tests/ux/mcp-generation-provider-degradation.e2e.mjs`: 8-check, zero-credit matrix covering observe-only/submit-only providers and editable model/mode/parameters/references.

Task 8 remains the final gate: full checks, same-build UX review, evidence update and isolated branch push.

---

## Scope and user-facing contract

| Provider profile | Submit | Known task ID | Unknown receipt | Cancel |
|---|---:|---:|---:|---:|
| `full_recovery` | allowed | automatic query/recovery | native reconcile, no duplicate | remote cancel result |
| `observe_only` | allowed | query/poll after task ID | `submission_unknown`, no automatic retry | stop local waiting, remote may continue |
| `submit_only` | allowed | provider reference only | manual provider check | stop local waiting, remote may continue |
| `unsupported` | blocked before provider/spend | — | — | — |

The normal path remains one preview and one confirmation in the current MCP client. A manually chosen new attempt creates a new attempt/contract/receipt and visibly warns about possible duplicate billing.

## Task 1: Add a pure provider capability profile classifier

**Files:**
- Create: `electron/capabilityCore/generationProviderCapabilities.ts`
- Test: `electron/capabilityCore/generationProviderCapabilities.test.ts`

- [ ] **Step 1: Write failing tests for profile classification and submit gating**

```ts
import { describe, expect, it } from "vitest";
import {
  classifyGenerationProviderCapabilities,
  assertGenerationProviderCanSubmit,
  type GenerationProviderCapabilityInput,
} from "./generationProviderCapabilities";

const profiles: Array<[string, GenerationProviderCapabilityInput, string]> = [
  ["full", { submitIdempotency: true, query: true, reconcile: true, cancel: true }, "full_recovery"],
  ["observe", { submitIdempotency: false, query: true, reconcile: true, cancel: false }, "observe_only"],
  ["submit", { submitIdempotency: false, query: false, reconcile: false, cancel: false }, "submit_only"],
];

it.each(profiles)("classifies %s without requiring all recovery features", (_name, input, expected) => {
  expect(classifyGenerationProviderCapabilities(input)).toBe(expected);
});

it("allows a provider with a submit function even when recovery capabilities are absent", () => {
  expect(() => assertGenerationProviderCanSubmit({ providerId: "apimart", submit: async () => ({ providerTaskId: "task-1" }) })).not.toThrow();
});

it("blocks only a provider without an executable submit function", () => {
  expect(() => assertGenerationProviderCanSubmit({ providerId: "broken", submit: undefined })).toThrow("submit");
});
```

- [ ] **Step 2: Run the focused test and verify the expected RED failure**

Run: `pnpm exec vitest run electron/capabilityCore/generationProviderCapabilities.test.ts --reporter=dot`  
Expected: FAIL because the classifier module and `assertGenerationProviderCanSubmit` do not exist.

- [ ] **Step 3: Implement the pure classifier**

Implement these exact exports without reading the catalog or making network calls:

```ts
export type GenerationProviderCapabilityInput = {
  submitIdempotency: boolean;
  query: boolean;
  reconcile: boolean;
  cancel: boolean;
};

export type GenerationProviderCapabilityProfile =
  | "full_recovery"
  | "observe_only"
  | "submit_only";

export function classifyGenerationProviderCapabilities(
  input: GenerationProviderCapabilityInput,
): GenerationProviderCapabilityProfile;

export function assertGenerationProviderCanSubmit(input: {
  providerId: string;
  submit?: unknown;
}): void;
```

`full_recovery` requires all four booleans. `observe_only` requires `query || reconcile`; all other executable providers are `submit_only`. A missing/non-function `submit` throws a stable `provider_submit_unsupported` error. Do not treat a provider-generated stable key as proof of native idempotency.

- [ ] **Step 4: Run the focused test and commit**

Run: `pnpm exec vitest run electron/capabilityCore/generationProviderCapabilities.test.ts --reporter=dot`  
Expected: all tests pass.  
Commit: `git add electron/capabilityCore/generationProviderCapabilities.ts electron/capabilityCore/generationProviderCapabilities.test.ts && git commit -m "feat: classify provider recovery capabilities"`

## Task 2: Extend the runtime adapter without making recovery mandatory

**Files:**
- Modify: `electron/capabilityCore/generationRuntimeAdapter.ts`
- Test: `electron/capabilityCore/generationRuntimeAdapter.test.ts`
- Modify: `electron/capabilityCore/moduleManifest.ts` only if the current schema needs a profile label; keep the four booleans backward-compatible.

- [ ] **Step 1: Write failing adapter tests for degraded profiles**

Add tests that use one common resolved contract and three providers:

```ts
it("submits an observe-only provider", async () => {
  const submit = vi.fn(async () => ({ providerTaskId: "task-apimart-1" }));
  const adapter = createGenerationRuntimeAdapter({ providers: [{
    providerId: "apimart",
    capabilities: { submitIdempotency: false, query: true, reconcile: true, cancel: false },
    buildRequest: (input) => input,
    submit,
  }] });
  await expect(adapter.submit({ contract, binding })).resolves.toMatchObject({ providerTaskId: "task-apimart-1" });
  expect(submit).toHaveBeenCalledTimes(1);
});

it("does not reject a submit-only provider before submit", async () => {
  const adapter = createGenerationRuntimeAdapter({ providers: [{
    providerId: "submit-only",
    capabilities: { submitIdempotency: false, query: false, reconcile: false, cancel: false },
    buildRequest: (input) => input,
    submit: async () => ({ providerTaskId: "provider-ref-1" }),
  }] });
  await expect(adapter.submit({ contract, binding })).resolves.toMatchObject({ providerTaskId: "provider-ref-1" });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm exec vitest run electron/capabilityCore/generationRuntimeAdapter.test.ts --reporter=dot`  
Expected: the existing all-capabilities assertion fails for the new profiles because the current adapter calls `assertGenerationProviderCapabilities` before submit.

- [ ] **Step 3: Implement the minimal adapter change**

Keep `assertGenerationProviderCapabilities` exported for full-recovery callers/tests, but make `createGenerationRuntimeAdapter().submit` call `assertGenerationProviderCanSubmit` instead. Add optional provider methods with typed results for later recovery, without invoking them during submit:

```ts
export type GenerationProvider = {
  providerId: string;
  capabilities: GenerationProviderCapabilities;
  buildRequest: (input: ResolvedTaskRequestV1) => unknown;
  submit: (request: unknown, idempotencyKey: string) => Promise<{ providerTaskId: string; raw?: unknown }>;
  query?: (providerTaskId: string) => Promise<{ status: string; raw?: unknown }>;
  reconcile?: (input: { idempotencyKey: string; providerTaskId?: string }) => Promise<{ found: boolean; providerTaskId?: string; raw?: unknown }>;
  cancel?: (providerTaskId: string) => Promise<{ status: "cancelled_remote" | "too_late" | "detached"; raw?: unknown }>;
};
```

The adapter must reject an empty provider reference for every profile. For `submit_only`, the non-empty `providerTaskId` field is treated as a provider reference even when the provider cannot be queried. Never make up a task ID.

- [ ] **Step 4: Run adapter tests and commit**

Run: `pnpm exec vitest run electron/capabilityCore/generationRuntimeAdapter.test.ts electron/capabilityCore/generationProviderCapabilities.test.ts --reporter=dot`  
Expected: PASS.  
Commit: `git add electron/capabilityCore/generationRuntimeAdapter.ts electron/capabilityCore/generationRuntimeAdapter.test.ts && git commit -m "feat: allow degraded provider submissions"`

## Task 3: Make planning expose degraded readiness instead of blocking gate request

**Files:**
- Modify: `electron/capabilityCore/mcpGenerationTools.ts`
- Test: `electron/capabilityCore/nomiMcpGenerationPlanning.test.ts`
- Test: `electron/capabilityCore/mcpSemanticGenerationConfirmation.test.ts`

- [ ] **Step 1: Write failing planning tests**

Add an observe-only catalog profile and assert:

```ts
it("allows gate request for a provider missing native retry/cancel", async () => {
  const preview = await call("preview", candidateFor("apimart"));
  expect(preview.providerReady).toBe(true);
  expect(preview.providerCapabilityProfile).toBe("observe_only");
  expect(preview.recoveryNotice).toContain("核对");
  await expect(call("gate_request", candidateFor("apimart"))).resolves.toMatchObject({ nextAction: "confirm" });
});

it("keeps unsupported models blocked before receipt/provider side effects", async () => {
  await expect(call("gate_request", candidateFor("missing-provider"))).rejects.toThrow("unsupported");
  expect(providerCalls).toBe(0);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm exec vitest run electron/capabilityCore/nomiMcpGenerationPlanning.test.ts electron/capabilityCore/mcpSemanticGenerationConfirmation.test.ts --reporter=dot`  
Expected: FAIL because `providerCapabilityGaps` currently requires all four recovery booleans and gate request rejects APIMart-like profiles.

- [ ] **Step 3: Implement profile-aware preview and gate request**

Replace the all-capability gap check with a pure `resolveProviderReadiness` helper:

```ts
type ProviderReadiness = {
  providerReady: boolean;
  providerCapabilityProfile?: "full_recovery" | "observe_only" | "submit_only";
  recoveryNotice?: string;
  missingForSubmit?: string[];
};
```

`providerReady` is true when the resolved model/provider has an executable provider adapter and a valid configured credential. Recovery booleans only select `providerCapabilityProfile` and a short user-facing notice. `gate_request` blocks only `missingForSubmit`; it seals the same contract and produces the same one confirmation challenge for all ready profiles. Keep technical capability names in structured response fields for MCP clients, but use concise Chinese/English localized notices in UI projections.

- [ ] **Step 4: Verify planning/confirmation tests and commit**

Run: `pnpm exec vitest run electron/capabilityCore/nomiMcpGenerationPlanning.test.ts electron/capabilityCore/mcpSemanticGenerationConfirmation.test.ts --reporter=dot`  
Expected: PASS with one confirmation for observe-only and zero provider calls before start.  
Commit: `git add electron/capabilityCore/mcpGenerationTools.ts electron/capabilityCore/nomiMcpGenerationPlanning.test.ts electron/capabilityCore/mcpSemanticGenerationConfirmation.test.ts && git commit -m "feat: expose degraded provider readiness"`

## Task 4: Allow degraded submission and add explicit new-attempt recovery

**Files:**
- Modify: `electron/productionRun/productionGenerationSubmission.ts`
- Modify: `electron/productionRun/submissionOutbox.ts`
- Modify: `electron/productionRun/productionRunResume.ts`
- Test: `electron/productionRun/productionGenerationSubmission.test.ts`
- Test: `electron/productionRun/submissionOutbox.test.ts`
- Test: `electron/productionRun/productionRunResume.test.ts`

- [ ] **Step 1: Write failing tests for observe-only, submit-only, and explicit retry**

Add these behaviors to the existing fake-provider suite:

```ts
it("submits observe-only once and resumes by task id", async () => {
  const provider = fakeProvider({ capabilities: { submitIdempotency: false, query: true, reconcile: true, cancel: false } });
  const first = createProductionGenerationSubmission({ ...deps, provider });
  await expect(first.start({ projectId: "project-1", operationId: "op-1" })).resolves.toMatchObject({ providerTaskId: "task-1" });
  expect(provider.submitCount).toBe(1);
  const restarted = createProductionGenerationSubmission({ ...deps, provider });
  await expect(restarted.resume({ projectId: "project-1", operationId: "op-1" })).resolves.toMatchObject({ action: "poll" });
  expect(provider.submitCount).toBe(1);
});

it("does not resubmit an observe-only provider after unknown receipt", async () => {
  const provider = fakeProvider({ capabilities: { submitIdempotency: false, query: true, reconcile: true, cancel: false }, throwAfterAcceptance: true });
  await expect(createProductionGenerationSubmission({ ...deps, provider }).start({ projectId: "project-1", operationId: "op-1" })).rejects.toThrow();
  expect(provider.submitCount).toBe(1);
  await expect(createProductionGenerationSubmission({ ...deps, provider }).resume({ projectId: "project-1", operationId: "op-1" })).resolves.toMatchObject({ action: "reconcile" });
  expect(provider.submitCount).toBe(1);
});

it("requires a new attempt and explicit confirmation before a second submit", async () => {
  const retry = await createExplicitNewGenerationAttempt({ projectId: "project-1", operationId: "op-1", reason: "submission_unknown" });
  expect(retry.attempt).toBe(2);
  expect(retry.requiresFreshReceipt).toBe(true);
});
```

The new Run-owner operation has this exact result shape:

```ts
export type ExplicitNewGenerationAttemptResult = {
  operationId: string;
  attempt: number;
  requiresFreshReceipt: true;
  contractHash: string;
  nextAction: "request_gate";
};

export function createExplicitNewGenerationAttempt(input: {
  projectId: string;
  operationId: string;
  reason: "submission_unknown" | "needs_attention";
}): Promise<ExplicitNewGenerationAttemptResult>;
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm exec vitest run electron/productionRun/productionGenerationSubmission.test.ts electron/productionRun/submissionOutbox.test.ts electron/productionRun/productionRunResume.test.ts --reporter=dot`  
Expected: FAIL because `start` currently calls the all-capabilities assertion and no explicit new-attempt command exists.

- [ ] **Step 3: Implement the smallest safe submission changes**

1. Replace the full capability assertion in `start` with `assertGenerationProviderCanSubmit`.
2. Preserve the existing durable prepare → envelope → intent claim → submit ordering.
3. Keep `submission_unknown` as reconcile-only by default, regardless of provider profile.
4. Add `createExplicitNewGenerationAttempt` at the Run owner boundary. It must:
   - read the current job and require `submission_unknown`/`needs_attention`;
   - append a new job/attempt with a new idempotency key, request fingerprint and envelope;
   - return `requiresFreshReceipt: true` without calling provider;
   - reject reusing the old commandId or receipt.
5. Add optional query/reconcile/cancel calls only when the provider capability and method both exist. If absent, return `detached`/`manual_review` projections instead of claiming success.

- [ ] **Step 4: Verify recovery tests and commit**

Run: `pnpm exec vitest run electron/productionRun/productionGenerationSubmission.test.ts electron/productionRun/submissionOutbox.test.ts electron/productionRun/productionRunResume.test.ts --reporter=dot`  
Expected: PASS; all existing full-provider exactly-once tests remain green.  
Commit: `git add electron/productionRun/productionGenerationSubmission.ts electron/productionRun/submissionOutbox.ts electron/productionRun/productionRunResume.ts electron/productionRun/productionGenerationSubmission.test.ts electron/productionRun/submissionOutbox.test.ts electron/productionRun/productionRunResume.test.ts && git commit -m "feat: degrade provider recovery without blocking submit"`

## Task 5: Implement the APIMart observe-only adapter

**Files:**
- Create: `electron/capabilityCore/apimartGenerationProvider.ts`
- Test: `electron/capabilityCore/apimartGenerationProvider.test.ts`
- Create: `electron/capabilityCore/generationProviderBootstrap.ts`
- Test: `electron/capabilityCore/generationProviderBootstrap.test.ts`
- Modify: `electron/capabilityCore/moduleCatalogBootstrap.ts`
- Modify: `electron/capabilityCore/appIntegration.ts`
- Test: `electron/capabilityCore/moduleCatalogBootstrap.test.ts`

- [ ] **Step 1: Write failing adapter contract tests with injected fetch**

```ts
it("maps a generic image contract to APIMart's flat image request", () => {
  const provider = createApimartGenerationProvider({ apiKey: "test-key", fetchImpl: fakeFetch });
  expect(provider.buildRequest(inputFor({ modelId: "gpt-image-2", mode: "text-to-image", parameters: { aspectRatio: "1:1", resolution: "1K" } }))).toEqual({
    model: "gpt-image-2",
    prompt: "a red paper crane",
    size: "1:1",
    resolution: "1K",
    n: 1,
  });
  expect(provider.capabilities).toEqual({ submitIdempotency: false, query: true, reconcile: true, cancel: false });
});

it("submits with bearer auth and extracts data[0].task_id", async () => {
  const fetchImpl = vi.fn(async (url, init) => new Response(JSON.stringify({ code: 200, data: [{ status: "submitted", task_id: "task-1" }] }), { status: 200, headers: { "content-type": "application/json" } }));
  const provider = createApimartGenerationProvider({ apiKey: "test-key", fetchImpl });
  await expect(provider.submit({ model: "gpt-image-2", prompt: "x", size: "1:1", resolution: "1K", n: 1 }, "stable-key")).resolves.toMatchObject({ providerTaskId: "task-1" });
  expect(fetchImpl).toHaveBeenCalledWith("https://api.apimart.ai/v1/images/generations", expect.objectContaining({ method: "POST" }));
});

it("queries by task id and never sends the stable Nomi key as a false provider idempotency claim", async () => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: 200, data: { id: "task-1", status: "processing" } }), { status: 200 }));
  const provider = createApimartGenerationProvider({ apiKey: "test-key", fetchImpl });
  await expect(provider.query?.("task-1")).resolves.toMatchObject({ status: "processing" });
  expect(fetchImpl).toHaveBeenCalledWith("https://api.apimart.ai/v1/tasks/task-1", expect.objectContaining({ method: "GET" }));
  expect(fetchImpl.mock.calls[0][1]?.headers).not.toHaveProperty("Idempotency-Key");
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm exec vitest run electron/capabilityCore/apimartGenerationProvider.test.ts --reporter=dot`  
Expected: FAIL because the APIMart adapter does not exist.

- [ ] **Step 3: Implement the adapter using existing catalog and HTTP primitives**

Implement `createApimartGenerationProvider({ apiKey, baseUrl?, fetchImpl?, now? })` with:

- `providerId: "apimart"`;
- `buildRequest` mapping the generic `ResolvedTaskRequestV1` to the existing catalog mapping contract (`model`, `prompt`, `size`, `resolution`, `n`, optional `image_urls`), preserving model/parameter/reference variation as data;
- `submit` using the existing vendor HTTP error/timeout/proxy boundary, POST `/v1/images/generations`, Bearer auth, and `data[0].task_id` extraction;
- `query` using GET `/v1/tasks/{encodeURIComponent(taskId)}` and mapping `pending/processing/completed/failed/cancelled` without silently treating `cancelled` as success;
- `reconcile` limited to querying a known task ID; return `found:false` when no task ID is available;
- no `Idempotency-Key` header and no `cancel` method because official APIMart evidence does not prove either capability;
- errors that include provider/model/mode but never the API key or authorization header.

- [ ] **Step 4: Wire only the verified adapter into the default semantic registry**

Implement `generationProviderBootstrap.ts` as the only main-process credential-to-adapter boundary. It reads the existing catalog, decrypts the APIMart key through `decryptApiKeyRecord`, and returns `{ providers, readinessByProvider }`; a missing/locked key returns no executable provider but keeps the catalog model visible. `createCatalogModuleRegistry` accepts this readiness map so APIMart mappings do not become capability proof by themselves. `startCapabilityCore` passes the same provider registry/operation owner into `createGenerationPlanningHandler` and the Run-owned submission start callback. No provider call occurs during context/create/patch/preview/gate request.

- [ ] **Step 5: Verify adapter/catalog tests and commit**

Run: `pnpm exec vitest run electron/capabilityCore/apimartGenerationProvider.test.ts electron/capabilityCore/moduleCatalogBootstrap.test.ts --reporter=dot`  
Expected: PASS; no test uses a real API key or network.  
Commit: `git add electron/capabilityCore/apimartGenerationProvider.ts electron/capabilityCore/apimartGenerationProvider.test.ts electron/capabilityCore/generationProviderBootstrap.ts electron/capabilityCore/generationProviderBootstrap.test.ts electron/capabilityCore/moduleCatalogBootstrap.ts electron/capabilityCore/appIntegration.ts electron/capabilityCore/moduleCatalogBootstrap.test.ts && git commit -m "feat: add APIMart observe-only generation adapter"`

## Task 6: Surface recovery and cancellation degradation in MCP/GUI projections

**Files:**
- Create: `electron/capabilityCore/generationRecoveryProjection.ts`
- Test: `electron/capabilityCore/generationRecoveryProjection.test.ts`
- Modify: `electron/capabilityCore/mcpGenerationTools.ts`
- Modify: `electron/productionRun/productionNotifications.ts`
- Modify: `electron/capabilityCore/mcpAppWidget.ts`
- Test: `electron/capabilityCore/mcpGenerationTools.test.ts`
- Test: `electron/productionRun/productionNotifications.test.ts`
- Test: `electron/capabilityCore/mcpAppWidget.test.ts`

- [ ] **Step 1: Write failing projection tests**

```ts
it("uses human language for observe-only recovery", () => {
  expect(projectGenerationRecovery({ profile: "observe_only", state: "submission_unknown" })).toMatchObject({
    title: "可能已经提交",
    nextAction: "reconcile",
    allowAutomaticRetry: false,
    allowNewAttempt: true,
  });
});

it("does not label local stop as remote cancellation", () => {
  expect(projectCancellation({ profile: "submit_only", state: "cancel_requested" })).toMatchObject({
    status: "detached",
    message: "已停止等待；供应商任务可能仍在运行",
  });
});
```

- [ ] **Step 2: Run focused tests to verify RED**

Run: `pnpm exec vitest run electron/capabilityCore/mcpGenerationTools.test.ts electron/productionRun/productionNotifications.test.ts electron/capabilityCore/mcpAppWidget.test.ts --reporter=dot`  
Expected: FAIL because the new profile-aware projection functions/messages do not exist.

- [ ] **Step 3: Implement one shared projection**

Create the pure projection in `generationRecoveryProjection.ts` and make MCP tool results, desktop widget notices, and production notifications consume it. Export `projectGenerationRecovery` and `projectCancellation`; each returns `title`, `message`, `nextAction`, `allowAutomaticRetry`, `allowNewAttempt`, and `providerReference` without exposing WAL/fencing/receipt internals. Keep all visible text in the existing i18n path; do not add hardcoded renderer literals.

- [ ] **Step 4: Verify and commit**

Run: `pnpm exec vitest run electron/capabilityCore/mcpGenerationTools.test.ts electron/productionRun/productionNotifications.test.ts electron/capabilityCore/mcpAppWidget.test.ts --reporter=dot`  
Expected: PASS, including existing legacy notification tests.  
Commit: `git add electron/capabilityCore/generationRecoveryProjection.ts electron/capabilityCore/generationRecoveryProjection.test.ts electron/capabilityCore/mcpGenerationTools.ts electron/productionRun/productionNotifications.ts electron/capabilityCore/mcpAppWidget.ts electron/capabilityCore/mcpGenerationTools.test.ts electron/productionRun/productionNotifications.test.ts electron/capabilityCore/mcpAppWidget.test.ts && git commit -m "feat: explain degraded provider recovery"`

## Task 7: Real user task matrix and controlled APIMart smoke

**Files:**
- Create: `tests/ux/mcp-generation-provider-degradation.e2e.mjs`
- Modify: `docs/audit/2026-08-23-p1-p3-evidence.md`
- Modify: `docs/superpowers/plans/2026-08-23-p1-p3-editable-mcp-generation.md`

- [ ] **Step 1: Write the zero-credit real-user journey**

Use the existing `_launchApp.mjs` and MCP harness to run one journey with a fake provider matrix:

1. Open a project and session.
2. Create an image candidate.
3. Change provider/model/mode/parameters/references before sealing.
4. Preview an observe-only profile and verify the recovery notice.
5. Request/accept one confirmation in the current MCP client.
6. Start with a fake provider and verify exactly one submit.
7. Simulate lost receipt/restart; verify reconcile-only UI and no second submit.
8. Choose “new attempt”; verify fresh receipt is required and only then a second fake submit is possible.
9. Exercise submit-only cancel and verify detached wording.

- [ ] **Step 2: Run the journey to verify RED**

Run: `node tests/ux/mcp-generation-provider-degradation.e2e.mjs`  
Expected: FAIL at the first profile-aware readiness/recovery assertion.

- [ ] **Step 3: Implement the journey and screenshot checks**

Keep provider/spend counters injected and zero for the planning/edit/preview/gate path. Take screenshots of normal confirmation, `submission_unknown`, and detached cancellation. Inspect each screenshot from the same built entry point before declaring the UX complete.

- [ ] **Step 4: Run the zero-credit journey and commit**

Run: `node tests/ux/mcp-generation-provider-degradation.e2e.mjs`  
Expected: all assertions pass; no real quota used.  
Commit: `git add tests/ux/mcp-generation-provider-degradation.e2e.mjs docs/audit/2026-08-23-p1-p3-evidence.md docs/superpowers/plans/2026-08-23-p1-p3-editable-mcp-generation.md && git commit -m "test: cover degraded provider user journey"`

- [ ] **Step 5: Run one explicit APIMart smoke after the zero-credit matrix is green**

Use the already stored APIMart key through Nomi secure storage. Run exactly one 1K, 1:1, single-image request; never run video or high-resolution in this plan. Verify create → task query → result fetch, record only provider/model/resolution/status in the audit, and do not print or commit the key.

## Task 8: Final verification and delivery

**Files:**
- Modify: `docs/audit/2026-08-23-p1-p3-evidence.md`
- Modify: `docs/superpowers/plans/2026-08-23-provider-capability-degradation.md`

- [ ] **Step 1: Run focused and full verification**

```bash
pnpm exec vitest run electron/capabilityCore/generationProviderCapabilities.test.ts electron/capabilityCore/generationRuntimeAdapter.test.ts electron/capabilityCore/apimartGenerationProvider.test.ts electron/productionRun/productionGenerationSubmission.test.ts electron/productionRun/submissionOutbox.test.ts electron/capabilityCore/nomiMcpGenerationPlanning.test.ts --reporter=dot
pnpm run check:filesize
pnpm run check:tokens
pnpm run check:i18n
pnpm run lint:ci
pnpm run typecheck
pnpm run test
pnpm run build
```

Expected: all focused suites pass; full test suite remains at or above the current baseline; lint has no new warnings; all gates pass.

- [ ] **Step 2: Do the real user UX review**

Inspect normal confirmation, APIMart observe-only notice, unknown receipt, explicit new-attempt warning, and detached cancellation screenshots. Confirm that each screen has one primary next action, no internal jargon, no color-only status, and no requirement to switch applications for the normal confirmation.

- [ ] **Step 3: Update evidence and commit**

Record profile matrix, fake submit counts, APIMart low-cost smoke, screenshot paths, and any remaining provider-specific limitations.  
Commit: `git add docs/audit/2026-08-23-p1-p3-evidence.md docs/superpowers/plans/2026-08-23-provider-capability-degradation.md && git commit -m "docs: close provider degradation evidence"`

- [ ] **Step 4: Push the isolated branch, do not merge PR**

```bash
git status --short
git -c http.version=HTTP/1.1 push origin HEAD
```

Expected: clean worktree, branch `codex/p0-runtime-foundation-20260822` updated, PR #122 remains open for review.

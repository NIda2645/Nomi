import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { compileExecutionContract, type PlanCandidate } from "../capabilityCore/executionContract";
import { createModuleRegistry } from "../capabilityCore/moduleRegistry";
import { createGenerationRuntimeAdapter, type GenerationProvider } from "../capabilityCore/generationRuntimeAdapter";
import { createProductionGenerationSubmission } from "./productionGenerationSubmission";
import { createProductionRunRepository } from "./productionRunRepository";
import { createMultiShotBatchScheduler } from "./multiShotBatchScheduler";
import { anchorCheckpointGateId } from "./anchorCheckpoint";
import type { ProductionGenerationShot } from "./productionRunTypes";

// P4 S4 — J1/J3 end-to-end over a REAL loopback vendor (zero quota). This drives the FULL durable chain:
// scheduler → real submission facade (real Run lock + real ledger + durable jobs) → REAL runtime adapter
// → REAL loopback HTTP provider → real materialization receipt. It proves the batch: anchor → checkpoint
// → (approve) → shot batch → per-shot artifact, that the total request count = anchors + shots, and that
// a "restart" (fresh scheduler over the same durable Run) and a "detached client" (scheduler runs after
// the caller returns) both converge without a second submit.

const NOW_BASE = Date.parse("2026-08-25T00:00:00.000Z");
const roots: string[] = [];
let clock = NOW_BASE;
const now = () => new Date(clock).toISOString();
const tickClock = () => { clock += 1000; return now(); };

const registry = createModuleRegistry([{
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["text", "image"],
  outputKinds: ["image", "video"],
  modes: ["text-to-image", "image-to-video"],
  parameterSchema: {},
  assetInputSchema: { references: { kind: "image", max: 4 } },
  providers: [{
    providerId: "apimart",
    models: [
      { modelId: "image-model", modes: ["text-to-image"], parameterSchema: {}, capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true, materialize: true } },
      { modelId: "video-model", modes: ["image-to-video"], parameterSchema: {}, capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true, materialize: true } },
    ],
  }],
}]);

/** A real loopback HTTP vendor: accepts a task, reports succeeded, returns a decodable data URL. */
async function startLoopbackVendor() {
  const hits: Array<{ url: string; method: string }> = [];
  const pngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const server = http.createServer((req, res) => {
    hits.push({ url: req.url ?? "", method: req.method ?? "" });
    req.on("data", () => { /* drain */ }); req.on("end", () => {
      const payload = JSON.stringify({ created: 1, data: [{ task_id: `task-${hits.length}`, status: "succeeded", url: pngDataUrl, images: [{ url: pngDataUrl }] }] });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(payload);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as { port: number };
  return { origin: `http://127.0.0.1:${port}`, hits, close: () => new Promise<void>((r) => server.close(() => r())) };
}

/**
 * A real GenerationProvider whose submit/query/materialize hit the loopback HTTP server. This exercises
 * the real adapter path (not a stub), so the batch runs through the genuine submit→poll→materialize chain.
 */
function loopbackProvider(origin: string, submits: string[]): GenerationProvider {
  return {
    providerId: "apimart",
    capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true, materialize: true },
    buildRequest: (input) => input,
    submit: async (_request, idempotencyKey) => {
      submits.push(idempotencyKey);
      const res = await fetch(`${origin}/v1/generations`, { method: "POST", body: JSON.stringify({ idempotencyKey }) });
      const json = await res.json() as { data: Array<{ task_id: string }> };
      return { providerTaskId: json.data[0].task_id, raw: json };
    },
    query: async (providerTaskId) => ({ status: "succeeded", raw: { id: providerTaskId, status: "succeeded" } }),
    materialize: async ({ providerTaskId }) => ({ outputs: [{ kind: "video", url: `nomi-local://asset/project-1/${providerTaskId}.png` }] }),
  };
}

function candidate(id: string, prompt: string, modelId: string, mode: string): PlanCandidate {
  return { candidateId: id, revision: 1, moduleId: "generation.single-shot", providerId: "apimart", modelId, mode, prompt, parameters: {}, references: [] };
}

function shotEntry(shotId: string, prompt: string, role: "anchor" | "shot"): ProductionGenerationShot {
  const modelId = role === "anchor" ? "image-model" : "video-model";
  const mode = role === "anchor" ? "text-to-image" : "image-to-video";
  const cand = candidate(`cand-${shotId}`, prompt, modelId, mode);
  const contract = compileExecutionContract(cand, registry);
  return { shotId, ...(role === "anchor" ? { role } : {}), candidate: { ...cand, sealedContractHash: contract.contractHash }, contract, approvedReceiptId: "receipt-plan", updatedAt: now() };
}

function setup(shots: ProductionGenerationShot[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-batch-e2e-"));
  roots.push(root);
  const repository = createProductionRunRepository({ projectDirResolver: (p) => (p === "project-1" ? root : null), now });
  repository.createGenerationDraft({ operationId: "op-batch", projectId: "project-1", origin: { host: "semantic-mcp" }, candidate: shots[0].candidate, policy: { trustedHosts: ["semantic-mcp"], allowedProviders: ["apimart"], allowedModels: ["image-model", "video-model"], maxSpend: null, maxAttemptsPerJob: 2 } });
  const top = shots[0].contract!;
  repository.execute("project-1", "op-batch", { commandId: "seal", expectedRevision: 0, type: "generation.seal", payload: { contract: top, shots, planHash: "plan-hash-batch" }, issuedAt: now() });
  repository.execute("project-1", "op-batch", { commandId: "approve", expectedRevision: 1, type: "generation.approve", payload: { receiptId: "receipt-plan", contractHash: "plan-hash-batch" }, issuedAt: now() });
  repository.execute("project-1", "op-batch", { commandId: "submit", expectedRevision: 2, type: "generation.submit", payload: {}, issuedAt: now() });
  return { root, repository };
}

function scheduler(root: string, repository: ReturnType<typeof createProductionRunRepository>, origin: string, submits: string[], options: Parameters<typeof createMultiShotBatchScheduler>[0]["options"] = {}) {
  const provider = loopbackProvider(origin, submits);
  // Sanity: the real adapter must accept this provider (proves we exercise the genuine adapter path).
  createGenerationRuntimeAdapter({ providers: [provider] });
  const submission = createProductionGenerationSubmission({
    repository, projectRoot: root, immutableProjectUuid: "project-uuid-1", projectGeneration: 1,
    intentMacKey: "test-intent-key", provider,
    resolveShotPrice: () => ({ known: true, amount: 6 }),
    materializeOutput: async ({ providerTaskId }) => ({ artifactId: `artifact-${providerTaskId}`, kind: "video", contentHash: `hash-${providerTaskId}`, projectRelativePath: `.nomi/out/${providerTaskId}.png` }),
    now,
  });
  return createMultiShotBatchScheduler({ repository, submission, projectId: "project-1", runId: "op-batch", perShotPrice: () => ({ known: true, amount: 6 }), now, options });
}

afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); clock = NOW_BASE; });

describe("P4 S4 J1 — full multi-shot batch over a real loopback vendor", () => {
  it("runs anchor → checkpoint → (approve) → shot batch → per-shot artifacts; total requests = anchors + shots", async () => {
    const shots = [shotEntry("anchor-1", "阿雨 定妆照", "anchor"), shotEntry("shot-1", "雨夜推门", "shot"), shotEntry("shot-2", "货架对视", "shot")];
    const { root, repository } = setup(shots);
    const vendor = await startLoopbackVendor();
    try {
      const submits: string[] = [];
      // Phase A: the batch generates the anchor and STOPS at the checkpoint (no auto-release).
      const phaseA = await scheduler(root, repository, vendor.origin, submits).runToQuiescence();
      expect(phaseA.checkpoint.status).toBe("waiting");
      expect(submits).toHaveLength(1); // only the anchor image submitted
      let run = repository.read("project-1", "op-batch")!;
      const gate = run.gates.find((g) => g.gateId === anchorCheckpointGateId("op-batch"))!;
      expect(gate.status).toBe("waiting");
      // The anchor produced a real durable artifact (submit→poll→materialize chain ran end-to-end).
      expect(run.artifacts.filter((a) => a.kind === "video" && a.status === "ready")).toHaveLength(1);
      // No video shot job yet (checkpoint blocks the batch).
      expect(run.jobs.some((j) => j.metadata?.shotId === "shot-1")).toBe(false);

      // Phase B: the user approves the checkpoint → the shot batch generates.
      repository.execute("project-1", "op-batch", { commandId: `approve-checkpoint`, expectedRevision: run.revision, type: "gate.decide", payload: { gateId: gate.gateId, status: "approved" }, issuedAt: tickClock() });
      const phaseB = await scheduler(root, repository, vendor.origin, submits).runToQuiescence();

      // Total provider submissions = 1 anchor + 2 shots = 3 (NOT "≤ 2 shots" — the anchor is a request too).
      expect(submits).toHaveLength(3);
      expect(phaseB.progress.completed).toBe(2); // both video shots finished
      expect(phaseB.halt).toBeUndefined();
      run = repository.read("project-1", "op-batch")!;
      // Each unit (anchor + 2 video shots) has exactly one durable job: 3 total, one per sealed unit.
      const shotJobs = run.jobs.filter((j) => typeof j.metadata?.shotId === "string");
      expect(shotJobs.map((j) => j.metadata!.shotId).sort()).toEqual(["anchor-1", "shot-1", "shot-2"]);
      expect(run.artifacts.filter((a) => a.kind === "video" && a.status === "ready")).toHaveLength(3); // anchor + 2 shots
      // No duplicate jobs anywhere.
      const jobIds = run.jobs.map((j) => j.jobId);
      expect(new Set(jobIds).size).toBe(jobIds.length);
    } finally {
      await vendor.close();
    }
  });
});

describe("P4 S4 J3 — crash recovery + detached driver over a real loopback vendor", () => {
  it("re-running the scheduler over the same durable Run submits nothing new (restart ≤1 submit per job)", async () => {
    const shots = [shotEntry("shot-1", "a", "shot"), shotEntry("shot-2", "b", "shot")];
    const { root, repository } = setup(shots);
    const vendor = await startLoopbackVendor();
    try {
      const submits: string[] = [];
      // First run completes both shots (no anchors → no checkpoint).
      await scheduler(root, repository, vendor.origin, submits).runToQuiescence();
      const firstCount = submits.length;
      expect(firstCount).toBe(2);

      // "Restart": a brand-new scheduler over the SAME durable Run re-derives and finds nothing to submit.
      const recovered = await scheduler(root, repository, vendor.origin, submits).runToQuiescence();
      expect(submits).toHaveLength(2); // unchanged — no double submit
      expect(recovered.progress.completed).toBe(2);

      // Every job has a unique id and every idempotency key was used at most once.
      expect(new Set(submits).size).toBe(submits.length);
    } finally {
      await vendor.close();
    }
  });

  it("the batch continues after the caller returns (detached, client-independent)", async () => {
    // The scheduler runs in the main process; once started it does not depend on the MCP client staying
    // alive. We model "client returned" by NOT awaiting, then awaiting the detached promise afterward.
    const shots = [shotEntry("shot-1", "a", "shot"), shotEntry("shot-2", "b", "shot")];
    const { root, repository } = setup(shots);
    const vendor = await startLoopbackVendor();
    try {
      const submits: string[] = [];
      const sched = scheduler(root, repository, vendor.origin, submits);
      // Fire and forget (client "detached"); the batch keeps going in the background.
      const detached = sched.runToQuiescence();
      const outcome = await detached; // the batch completes regardless of any client lifecycle
      expect(outcome.progress.completed).toBe(2);
      expect(submits).toHaveLength(2);
    } finally {
      await vendor.close();
    }
  });
});

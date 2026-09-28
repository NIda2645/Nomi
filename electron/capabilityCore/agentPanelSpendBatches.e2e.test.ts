import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import { createMultiShotBatchScheduler } from "../productionRun/multiShotBatchScheduler";
import { PROJECT_ID, OPERATION_ID, lease, now, candidate, startLoopbackVendor, harness, buildActions, draft, resetSpendFixture } from "./agentPanelSpendConfirmTestUtils";

afterEach(resetSpendFixture);

function barrier() {
  let release!: () => void;
  let reached!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { reached = resolve; });
  return { release, entered, pause: async () => { reached(); await waiting; } };
}

it("spend-confirm loopback responses cannot leave sockets eligible for idle expiry", async () => {
  const vendor = await startLoopbackVendor();
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const submit = () => new Promise<{ connection: string | undefined; localPort: number | undefined }>((resolve, reject) => {
    const request = http.request(`${vendor.origin}/v1/images/generations`, {
      agent,
      method: "POST",
      headers: { "content-type": "application/json" },
    }, response => {
      const localPort = response.socket.localPort;
      response.resume();
      response.once("end", () => resolve({ connection: response.headers.connection, localPort }));
    });
    request.once("error", reject);
    request.end("{}");
  });
  try {
    const first = await submit();
    const second = await submit();
    expect(first).toMatchObject({ connection: "close", localPort: expect.any(Number) });
    expect(second).toMatchObject({ connection: "close", localPort: expect.any(Number) });
    expect(second.localPort).not.toBe(first.localPort);
  } finally {
    agent.destroy();
    await vendor.close();
  }
});

it("S06: executes 3 anchors then the remaining 30 units in the same 33-shot Run, preserving first execution and nodes", async () => {
  const vendor = await startLoopbackVendor();
  const base = harness();
  const submits: string[] = [];
  const { withWindow, handler, submission } = buildActions(base, vendor.origin, submits);
  try {
    const shots = Array.from({ length: 33 }, (_, i) => ({ shotId: `shot-${i + 1}`,
      role: i < 6 ? "anchor" as const : "shot" as const,
      candidate: { ...candidate("image-model", { size: "1024x1024" }), candidateId: `candidate-${i + 1}` },
    }));
    await base.operations.create({ operationId: OPERATION_ID, projectId: PROJECT_ID, candidate: shots[0].candidate,
      shots, cardHidden: true, origin: { host: "nomi" }, now: now() });
    await base.canvasLanding.settleCanvasLanding(PROJECT_ID);
    const nodes = [...base.renderer.nodes.entries()];
    const firstIds = shots.slice(0, 3).map(shot => shot.shotId);
    await handler({ capability: "present", params: { operationId: OPERATION_ID, shotIds: firstIds }, lease });
    const firstQuote = withWindow.listPendingSpend(PROJECT_ID)[0];
    expect(await withWindow.confirmPendingSpend({ projectId: PROJECT_ID, operationId: OPERATION_ID, quoteId: firstQuote.quoteId })).toEqual({ ok: true, code: "spend_confirmed" });
    const first = base.repository.read(PROJECT_ID, OPERATION_ID)!;
    expect(first.jobs.map(job => job.metadata?.shotId)).toEqual(firstIds);
    expect(first.jobs.every(job => job.status === "ready")).toBe(true);
    expect(first.budget.reserved).toBeCloseTo(0.9);
    expect(first.budget.actual).toBe(0);
    const firstGate = first.gates.find(gate => gate.scope === "anchor_checkpoint")!;
    base.repository.execute(PROJECT_ID, OPERATION_ID, { commandId: "first-look-approved", expectedRevision: first.revision,
      type: "gate.decide", payload: { gateId: firstGate.gateId, status: "approved" }, issuedAt: now() });

    const remainingIds = shots.slice(3).map(shot => shot.shotId);
    await handler({ capability: "present", params: { operationId: OPERATION_ID, shotIds: remainingIds }, lease });
    expect(await withWindow.confirmPendingSpend({ projectId: PROJECT_ID, operationId: OPERATION_ID, quoteId: firstQuote.quoteId })).toMatchObject({ ok: false });
    const secondQuote = withWindow.listPendingSpend(PROJECT_ID)[0];
    expect(secondQuote.shots.map(shot => shot.shotId)).toEqual(remainingIds);
    expect(await withWindow.confirmPendingSpend({ projectId: PROJECT_ID, operationId: OPERATION_ID, quoteId: secondQuote.quoteId })).toMatchObject({ ok: true });
    let second = base.repository.read(PROJECT_ID, OPERATION_ID)!;
    expect(submits).toHaveLength(6); // The old checkpoint cannot approve the second anchor batch.
    const nextGate = second.gates.find(gate => gate.scope === "anchor_checkpoint" && gate.status === "waiting")!;
    expect(nextGate.gateId).not.toBe(firstGate.gateId);
    second = base.repository.execute(PROJECT_ID, OPERATION_ID, { commandId: "second-look-approved", expectedRevision: second.revision,
      type: "gate.decide", payload: { gateId: nextGate.gateId, status: "approved" }, issuedAt: now() }).run;
    const scheduler = createMultiShotBatchScheduler({ repository: base.repository, submission, projectId: PROJECT_ID,
      runId: OPERATION_ID, perShotPrice: () => ({ known: true, amount: 0.3 }), now });
    await scheduler.runToQuiescence();
    await scheduler.runToQuiescence();
    await base.canvasLanding.landCanvasBestEffort(PROJECT_ID, OPERATION_ID);
    const done = base.repository.read(PROJECT_ID, OPERATION_ID)!;
    expect(done.jobs).toHaveLength(33);
    expect(done.jobs.slice(0, 3)).toEqual(first.jobs);
    expect(done.jobs.map(job => ({shotId:job.metadata?.shotId,status:job.status,errorCode:job.errorCode}))).toEqual(
      shots.map(shot => ({shotId:shot.shotId,status:"ready",errorCode:undefined})));
    expect(done.generationPlan!.shots).toHaveLength(33);
    expect(done.budget.reserved).toBeCloseTo(9.9);
    expect(done.budget.actual).toBe(0);
    expect(done.budget.authorized).toBeCloseTo(9.9);
    expect(done.policy.maxSpend).toBeNull();
    expect(submits).toHaveLength(33);
    expect(new Set(submits).size).toBe(33);
    expect(vendor.bodies).toHaveLength(33);
    expect([...base.renderer.nodes.entries()]).toEqual(nodes);
    await expect(submission.materialize({ projectId: PROJECT_ID, operationId: OPERATION_ID, shotId: "shot-1", attempt: 1 }))
      .resolves.toMatchObject({ jobId: first.jobs[0].jobId, nextAction: "completed" });
  } finally { await vendor.close(); }
// This journey performs 33 real loopback submissions and durable filesystem event writes.
}, 60_000);

describe("S08: pending spend decisions have one durable winner", () => {
  for (const action of ["discard", "revise"] as const) {
    for (const phase of ["beforeAuthorize", "afterAuthorize"] as const) {
      it(`${action} ${phase}: no stale approval or false dismissal`, async () => {
        const vendor = await startLoopbackVendor(); const base = harness(); const submits: string[] = [];
        const latch = barrier();
        const { withWindow } = buildActions(base, vendor.origin, submits, { [phase]: latch.pause });
        try {
          await draft(base);
          const nodes = [...base.renderer.nodes.entries()];
          const quote = withWindow.listPendingSpend(PROJECT_ID)[0];
          const confirming = withWindow.confirmPendingSpend({ projectId: PROJECT_ID, operationId: OPERATION_ID, quoteId: quote.quoteId });
          await latch.entered;
          const changed = action === "discard"
            ? await withWindow.discardPendingSpend({ projectId: PROJECT_ID, operationId: OPERATION_ID, quoteId: quote.quoteId })
            : await withWindow.revisePendingSpend({ quoteId: quote.quoteId, projectId: PROJECT_ID, operationId: OPERATION_ID, patch: { parameters: { size: "1536x1024" } } });
          latch.release();
          const confirmed = await confirming;
          expect(changed.ok).toBe(phase === "beforeAuthorize");
          expect(confirmed.ok).toBe(phase === "afterAuthorize");
          expect(submits).toHaveLength(phase === "afterAuthorize" ? 1 : 0);
          expect(vendor.bodies).toHaveLength(submits.length);
          expect([...base.renderer.nodes.entries()]).toEqual(nodes);
        } finally { latch.release(); await vendor.close(); }
      });
    }
  }
});

it("new confirmation of the same candidate uses a distinct attempt and command identity", async () => {
  const vendor = await startLoopbackVendor(); const base = harness(); const submits: string[] = [];
  const { withWindow, handler, submission } = buildActions(base, vendor.origin, submits);
  try {
    await draft(base);
    const initial = base.repository.read(PROJECT_ID, OPERATION_ID)!;
    base.repository.execute(PROJECT_ID, OPERATION_ID, { commandId: "configured-attempt-limit", expectedRevision: initial.revision,
      type: "policy.set", payload: { policy: { ...initial.policy, maxAttemptsPerJob: 2, maxSpend: 1 } }, issuedAt: now() });
    const nodes = [...base.renderer.nodes.entries()];
    for (let attempt = 1; attempt <= 2; attempt++) {
      const quote = withWindow.listPendingSpend(PROJECT_ID)[0];
      expect(await withWindow.confirmPendingSpend({ projectId: PROJECT_ID, operationId: OPERATION_ID, quoteId: quote.quoteId })).toMatchObject({ ok: true });
      const run = base.repository.read(PROJECT_ID, OPERATION_ID)!;
      expect(run.generationPlan!.state).toBe("submitted");
      expect(run.jobs.at(-1)).toMatchObject({ attempt, status: "ready" });
      if (attempt === 1) await handler({ capability: "present", params: { operationId: OPERATION_ID }, lease });
    }
    const done = base.repository.read(PROJECT_ID, OPERATION_ID)!;
    expect(done.jobs).toHaveLength(2);
    expect(submits).toHaveLength(2);
    expect(new Set(submits).size).toBe(2);
    expect(done.budget.authorized).toBeCloseTo(0.6);
    expect(done.budget.reserved).toBeCloseTo(0.6);
    expect(done.policy.maxSpend).toBe(1);
    expect([...base.renderer.nodes.entries()]).toEqual(nodes);
    await expect(submission.start({ projectId: PROJECT_ID, operationId: OPERATION_ID, attempt: 1 })).rejects.toThrow(/observation-only/);
    expect(submits).toHaveLength(2);
  } finally { await vendor.close(); }
});

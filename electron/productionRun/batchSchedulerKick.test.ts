import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProductionRunRepository } from "./productionRunRepository";
import { createProductionRunService } from "./productionRunService";
import { anchorCheckpointGateId, buildAnchorCheckpointGate } from "./anchorCheckpoint";
import { registerBatchSchedulerKicker } from "./batchSchedulerKick";

// P4 §3.2 — service 层 post-decide 重踢钩子：锚定妆照检查点的 gate.decide 一落库就踢批次 scheduler
// （经晚绑定插槽）。这是「入口忘了踢」整族 bug 的结构保证：MCP dispatcher / 渲染层 IPC / 未来的检查点卡
// 全都经 service.command，钩子只写一处。别的门决议不踢；未注册 kicker 时静默跳过（决议本身照常落库）。

const NOW_BASE = Date.parse("2026-08-25T00:00:00.000Z");
const now = () => new Date(NOW_BASE).toISOString();
const roots: string[] = [];

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-batch-kick-"));
  roots.push(root);
  const repository = createProductionRunRepository({ projectDirResolver: (p) => (p === "project-1" ? root : null), now });
  const created = repository.create({ projectId: "project-1", playbook: { name: "brand.promo", version: "1.0.0" }, origin: { host: "nomi" }, brief: { goal: "验证检查点重踢" } });
  const service = createProductionRunService({ repository });
  return { repository, service, runId: created.runId };
}

afterEach(() => {
  registerBatchSchedulerKicker(null);
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("P4 §3.2 — anchor checkpoint decide re-kicks the batch scheduler (service hook)", () => {
  it.each(["approved", "rejected"] as const)("kicks the registered scheduler on a checkpoint %s from ANY entrance", async (status) => {
    const { repository, service, runId } = setup();
    let run = repository.read("project-1", runId)!;
    const gate = buildAnchorCheckpointGate({ runId, planHash: "plan-hash", anchorJobIds: ["job-anchor-1"], now: now() });
    run = repository.execute("project-1", runId, { commandId: "add-gate", expectedRevision: run.revision, type: "gate.add", payload: { gate }, issuedAt: now() }).run;

    const kicker = vi.fn();
    registerBatchSchedulerKicker(kicker);
    await service.command("project-1", runId, {
      commandId: `decide-${status}`, expectedRevision: run.revision, type: "gate.decide",
      payload: { gateId: anchorCheckpointGateId(runId), status }, issuedAt: now(),
    });
    expect(kicker).toHaveBeenCalledExactlyOnceWith("project-1", runId);
  });

  it("does not kick for a non-checkpoint gate decision", async () => {
    const { repository, service, runId } = setup();
    let run = repository.read("project-1", runId)!;
    const gate = { gateId: "gate-note-v1", scope: "publish" as const, status: "waiting" as const, planHash: "plan-hash", jobIds: [], title: "Publish", summary: "Publish step", createdAt: now(), expiresAt: new Date(NOW_BASE + 86_400_000).toISOString() };
    run = repository.execute("project-1", runId, { commandId: "add-gate", expectedRevision: run.revision, type: "gate.add", payload: { gate }, issuedAt: now() }).run;

    const kicker = vi.fn();
    registerBatchSchedulerKicker(kicker);
    await service.command("project-1", runId, {
      commandId: "decide-note", expectedRevision: run.revision, type: "gate.decide",
      payload: { gateId: "gate-note-v1", status: "approved" }, issuedAt: now(),
    });
    expect(kicker).not.toHaveBeenCalled();
  });

  it("a checkpoint decision without a registered kicker still lands durably (no crash)", async () => {
    const { repository, service, runId } = setup();
    let run = repository.read("project-1", runId)!;
    const gate = buildAnchorCheckpointGate({ runId, planHash: "plan-hash", anchorJobIds: ["job-anchor-1"], now: now() });
    run = repository.execute("project-1", runId, { commandId: "add-gate", expectedRevision: run.revision, type: "gate.add", payload: { gate }, issuedAt: now() }).run;

    await service.command("project-1", runId, {
      commandId: "decide-orphan", expectedRevision: run.revision, type: "gate.decide",
      payload: { gateId: anchorCheckpointGateId(runId), status: "approved" }, issuedAt: now(),
    });
    const decided = repository.read("project-1", runId)!.gates.find((item) => item.gateId === anchorCheckpointGateId(runId));
    expect(decided?.status).toBe("approved");
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// 画布单节点 ↑ 的唯一付费口（发动机收敛第一刀 第 1–2 步）。走真仓库、真 Run 服务、真收据机构、真提交出口；
// 只有画布那台的传输（runtime.runTask(…, RUN_APPROVED_ADMISSION) / fetchTaskResult）换成进程内的假供应商。
// 设计卡：docs/plan/2026-10-05-engine-convergence-cut1-step12-design-card.md。

import { createApprovalReceiptAuthority } from "./approvalReceipt";
import { canvasLocalArtifactReceipt, createCanvasShotRuns, type CanvasShotRequest } from "./appIntegrationCanvasShot";
import { canvasProviderId, createCanvasTransportProvider, type CanvasTaskResult, type CanvasTransport } from "./canvasTransportProvider";
import { createProductionGenerationSubmission } from "../productionRun/productionGenerationSubmission";
import { createProductionRunRepository } from "../productionRun/productionRunRepository";
import { createProductionRunService } from "../productionRun/productionRunService";
import { canvasRunIdFor, openCanvasRuns } from "../productionRun/canvasShotRunIndex";
import { createProductionShotDispatchGuard } from "../productionRun/productionShotDispatchGuard";
import { SubmissionReceiptUnknownError } from "../productionRun/submissionOutbox";
import { VendorRequestError } from "../vendor/vendorHttp";
import type { WorkspaceProjectRecordV2 } from "../workspace/workspaceTypes";

const PROJECT = "project-1";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

type Vendor = { executes: Array<{ vendor: string; request: CanvasShotRequest }>; fetches: string[]; answer: (call: number) => Promise<CanvasTaskResult>; poll: (taskId: string, call: number) => CanvasTaskResult };

function request(nodeId: string, prompt = "a red cube"): CanvasShotRequest {
  return { kind: "text_to_image", prompt, extras: { nodeId, projectId: PROJECT, modelKey: "img-model", idempotencyKey: "k" } };
}

function setup(options: { previewBlock?: "rendering" | "failed" | null; root?: string } = {}) {
  const root = options.root ?? fs.mkdtempSync(path.join(os.tmpdir(), "nomi-canvas-shot-"));
  if (!options.root) roots.push(root);
  const imagePath = path.join(root, "assets", "out.png");
  fs.mkdirSync(path.dirname(imagePath), { recursive: true });
  fs.writeFileSync(imagePath, "png-bytes");
  const asset = { type: "image", url: `nomi-local://asset/${PROJECT}/assets/out.png` };
  const vendor: Vendor = {
    executes: [], fetches: [],
    answer: async () => ({ id: "task-sync", kind: "text_to_image", status: "succeeded", assets: [asset], raw: {} }),
    poll: (taskId) => ({ id: taskId, kind: "text_to_image", status: "succeeded", assets: [asset], raw: {} }),
  };
  const transport: CanvasTransport = {
    execute: async (payload) => { vendor.executes.push(structuredClone(payload) as Vendor["executes"][number]); return vendor.answer(vendor.executes.length); },
    fetchResult: async (payload) => { vendor.fetches.push(String(payload.taskId)); return { result: vendor.poll(String(payload.taskId), vendor.fetches.length) }; },
  };
  const repository = createProductionRunRepository({ projectDirResolver: (id) => (id === PROJECT ? root : null) });
  const receipts = createApprovalReceiptAuthority({ filePath: path.join(root, "receipts.json"), macKey: "k", storeMacKey: "s", keyId: "v1" });
  const service = createProductionRunService({
    repository, projectRootResolver: () => root, requestRenderer: async () => { throw new Error("no renderer"); },
    approvalReceiptAuthority: receipts, projectRevisionResolver: () => 0,
  });
  const providers = [createCanvasTransportProvider("acme", transport)];
  const observe = vi.fn();
  const previewBlock = vi.fn(async () => options.previewBlock ?? null);
  const claimProductionShot = vi.fn();
  const runs = createCanvasShotRuns({
    service,
    readProject: () => ({ id: PROJECT, immutableProjectUuid: "uuid-1", projectGeneration: 1, revision: 3 }) as unknown as WorkspaceProjectRecordV2,
    resolveProjectRoot: () => root,
    receipts,
    providers: () => providers,
    buildSubmission: (input) => createProductionGenerationSubmission({
      repository, projectRoot: input.projectRoot, immutableProjectUuid: input.immutableProjectUuid, projectGeneration: input.projectGeneration,
      intentMacKey: "intent-key", providers: input.providers,
      beforeDispatch: createProductionShotDispatchGuard({ readRun: (projectId, runId) => repository.read(projectId, runId) ?? undefined }),
      materializeOutput: async ({ projectId, providerTaskId, output }) => canvasLocalArtifactReceipt({ projectId, projectRoot: root, providerTaskId, output })!,
    }),
    previewBlock,
    claimProductionShot,
    quote: () => ({ known: false }),
    observe,
  });
  const submit = (nodeId: string, runRecordId: string, prompt?: string) => runs.submit({
    projectId: PROJECT, nodeId, runRecordId, vendor: "acme", request: request(nodeId, prompt),
    gesture: { webContentsId: 7, frameId: 1, origin: "app://nomi" }, senderId: 7,
  });
  return { root, repository, runs, vendor, observe, previewBlock, claimProductionShot, submit, receipts };
}

const runOf = (repository: ReturnType<typeof createProductionRunRepository>, runRecordId: string) => repository.read(PROJECT, canvasRunIdFor(runRecordId));

describe("画布单节点 ↑ 经单镜 Run", () => {
  it("同步出图：一次点击 = 一个 Run、一份手势批准、一次交、出片记进 Run、收尾", async () => {
    const { repository, vendor, submit, root, claimProductionShot } = setup();

    const result = await submit("node-a", "run-node-a-1");

    expect(result).toMatchObject({ status: "succeeded", assets: [{ url: `nomi-local://asset/${PROJECT}/assets/out.png` }] });
    expect(vendor.executes).toHaveLength(1);
    expect(vendor.executes[0]).toEqual({ vendor: "acme", request: request("node-a") });
    const run = runOf(repository, "run-node-a-1")!;
    expect(run.origin.host).toBe("canvas");
    expect(run.status).toBe("completed");
    expect(run.jobs).toHaveLength(1);
    expect(run.jobs[0]).toMatchObject({ status: "ready", provider: canvasProviderId("acme"), providerTaskId: "task-sync" });
    expect(run.artifacts.find((artifact) => artifact.kind === "image")).toMatchObject({ projectRelativePath: "assets/out.png" });
    const approval = repository.readApprovals(PROJECT, run.runId)[0];
    expect(approval?.receiptId).toBeTruthy();
    expect(claimProductionShot).toHaveBeenCalledOnce();
    expect(openCanvasRuns(root)).toEqual([]);
    expect(repository.list(PROJECT)).toEqual([]);
  });

  it("受理后由渲染层查：每一次查都过 Run，出片那一次物化并收尾", async () => {
    const { repository, vendor, submit, runs } = setup();
    vendor.answer = async () => ({ id: "task-async", kind: "text_to_image", status: "queued", assets: [], raw: {} });
    vendor.poll = (taskId, call) => call === 1
      ? { id: taskId, kind: "text_to_image", status: "running", assets: [], raw: {} }
      : { id: taskId, kind: "text_to_image", status: "succeeded", assets: [{ type: "image", url: `nomi-local://asset/${PROJECT}/assets/out.png` }], raw: {} };

    await expect(submit("node-a", "run-node-a-1")).resolves.toMatchObject({ id: "task-async", status: "queued" });
    expect(runOf(repository, "run-node-a-1")!.jobs[0]?.status).toBe("provider_accepted");

    await expect(runs.poll({ projectId: PROJECT, runRecordId: "run-node-a-1", senderId: 7 })).resolves.toMatchObject({ status: "running" });
    expect(runOf(repository, "run-node-a-1")!.jobs[0]?.status).toBe("polling");
    await expect(runs.poll({ projectId: PROJECT, runRecordId: "run-node-a-1", senderId: 7 })).resolves.toMatchObject({ status: "succeeded" });
    expect(runOf(repository, "run-node-a-1")).toMatchObject({ status: "completed", jobs: [{ status: "ready" }] });
    expect(vendor.executes).toHaveLength(1);
  });

  it("同一次意图重试（同一个运行记录号）：照 Run 账本回话，供应商只收到一次", async () => {
    const { vendor, submit } = setup();
    vendor.answer = async () => ({ id: "task-async", kind: "text_to_image", status: "queued", assets: [], raw: {} });
    await submit("node-a", "run-node-a-1");
    await expect(submit("node-a", "run-node-a-1")).resolves.toMatchObject({ id: "task-async" });
    expect(vendor.executes).toHaveLength(1);
  });

  it("同一节点上一笔还在路上：第二次点击被拒（还在生成），别的节点照常", async () => {
    const { vendor, submit } = setup();
    vendor.answer = async () => ({ id: `task-${vendor.executes.length}`, kind: "text_to_image", status: "queued", assets: [], raw: {} });
    await submit("node-a", "run-node-a-1");
    await expect(submit("node-a", "run-node-a-2")).rejects.toMatchObject({ code: "node_generation_in_flight" });
    await expect(submit("node-b", "run-node-b-1")).resolves.toMatchObject({ status: "queued" });
    expect(vendor.executes.map((call) => call.request.extras?.nodeId)).toEqual(["node-a", "node-b"]);
  });

  it("同一节点两次点击同时到（还没写盘）：只交一笔", async () => {
    const { vendor, submit } = setup();
    vendor.answer = async () => ({ id: `task-${vendor.executes.length}`, kind: "text_to_image", status: "queued", assets: [], raw: {} });
    const outcomes = await Promise.allSettled([submit("node-a", "run-node-a-1"), submit("node-a", "run-node-a-2")]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(vendor.executes).toHaveLength(1);
  });

  it("供应商当场明确拒绝：原话回给节点、这一笔记成没花钱、节点可以再点（F3）", async () => {
    const { repository, vendor, submit, root } = setup();
    vendor.answer = async (call) => {
      if (call > 1) return { id: "task-ok", kind: "text_to_image", status: "succeeded", assets: [{ type: "image", url: `nomi-local://asset/${PROJECT}/assets/out.png` }], raw: {} };
      throw new VendorRequestError("Provider request failed (HTTP 400): content policy", { vendorKey: "acme", method: "POST", url: "x", httpStatus: 400, upstreamMsg: "content policy", category: "input", retryable: false }, { httpStatus: 400, envelopeFailure: false, taskIdReturned: false });
    };

    await expect(submit("node-a", "run-node-a-1")).rejects.toBeInstanceOf(VendorRequestError);
    expect(runOf(repository, "run-node-a-1")!.jobs[0]).toMatchObject({ status: "needs_attention", errorCode: "provider_rejected" });
    expect(openCanvasRuns(root)).toEqual([]);

    await expect(submit("node-a", "run-node-a-2", "a blue cube")).resolves.toMatchObject({ status: "succeeded" });
    expect(vendor.executes).toHaveLength(2);
  });

  it("写出去之后断了：结果没法确认，这个节点在核对前不许再点；重启后照样拦（F3 另一半）", async () => {
    const { repository, vendor, submit, root } = setup();
    vendor.answer = async () => { throw new Error("acme create failed: socket hang up"); };

    await expect(submit("node-a", "run-node-a-1")).rejects.toBeInstanceOf(SubmissionReceiptUnknownError);
    expect(runOf(repository, "run-node-a-1")!.jobs[0]?.status).toBe("submission_unknown");
    await expect(submit("node-a", "run-node-a-2")).rejects.toMatchObject({ code: "production_shot_claimed", reason: "needs_reconcile" });
    // 节点上指去核对：这一笔进任务中心「要你处理」（制作列表里只多它一个；收尾了的画布 Run 不进）。
    expect(repository.list(PROJECT).map((run) => run.runId)).toEqual([canvasRunIdFor("run-node-a-1")]);

    const restarted = setup({ root });
    await expect(restarted.submit("node-a", "run-node-a-3")).rejects.toMatchObject({ code: "production_shot_claimed", reason: "needs_reconcile" });
    expect(vendor.executes.length + restarted.vendor.executes.length).toBe(1);
  });

  it("3D-BOX 预演没好：主进程准入就拒，Run 都不建，一个字节不发", async () => {
    const { repository, vendor, submit, root } = setup({ previewBlock: "rendering" });
    await expect(submit("node-a", "run-node-a-1")).rejects.toMatchObject({ code: "director_preview_blocked", reason: "rendering" });
    expect(vendor.executes).toHaveLength(0);
    expect(runOf(repository, "run-node-a-1")).toBeNull();
    expect(openCanvasRuns(root)).toEqual([]);
  });

  it("受理之后渲染层不在了（重启）：打开项目把没收尾的那一笔交给观察者；点了停也交给观察者", async () => {
    const { vendor, submit, root, runs, observe } = setup();
    vendor.answer = async () => ({ id: "task-async", kind: "text_to_image", status: "queued", assets: [], raw: {} });
    await submit("node-a", "run-node-a-1");
    runs.recoverOrphans(PROJECT);
    expect(observe).not.toHaveBeenCalled();

    const restarted = setup({ root });
    restarted.runs.recoverOrphans(PROJECT);
    expect(restarted.observe).toHaveBeenCalledOnce();
    expect(restarted.observe.mock.calls[0]?.slice(1)).toEqual([PROJECT, canvasRunIdFor("run-node-a-1")]);

    runs.release({ projectId: PROJECT, runRecordId: "run-node-a-1" });
    expect(observe).toHaveBeenCalledOnce();
  });

  it("旧运行记录（没有 Run）：查询回 null，交给旧路找回", async () => {
    const { runs } = setup();
    await expect(runs.poll({ projectId: PROJECT, runRecordId: "run-legacy-1", senderId: 7 })).resolves.toBeNull();
  });
});

import { app, ipcMain } from "electron";

import { assertTrustedSender } from "../ipcSenderGuard";
import { runTaskWithIdempotency } from "../submissionLedger";
import { mintSpendGrant } from "../spendGrant";
import { prepareSpendQuote, takeSpendQuote } from "../spendQuote";
import type { SpendQuoteInput } from "../shared/contracts/spendQuote";
import { runTaskIpcGuard } from "./taskIpcGuard";
import { withTaskOwner } from "./localTaskJobs";
import { withNodeSubmitExclusive } from "./nodeSubmitInFlight";
import { antigravityImageJobs } from "../catalog/antigravityImageOperation";
import { cancelComfyCandidateTest, failComfyCandidateEnvelope, runComfyCandidateTest } from "./comfyCandidateTest";

type RuntimeLoader = () => Promise<typeof import("../runtime")>;
type CanvasShotCore = Pick<typeof import("../capabilityCore/appIntegration"), "submitCanvasShot" | "pollCanvasShot" | "releaseCanvasShot" | "releaseCanvasShotSender">;
type CoreLoader = () => Promise<CanvasShotCore>;

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Register the renderer task boundary, including the spend-grant trust check. */
export function registerTaskIpcHandlers(loadRuntimeModule: RuntimeLoader, loadCore: CoreLoader): void {
  const owners = new Set<number>();
  let exiting = false;
  let drained = false;
  app.on("before-quit", (event) => {
    if (drained) return;
    event.preventDefault();
    if (exiting) return;
    exiting = true;
    void antigravityImageJobs.cancelAll().finally(() => { drained = true; app.quit(); });
  });
  // 发起任务的窗口没了：它的本地任务取消，它在等的画布 Run 交给主进程观察者收完。
  const trackOwner = (sender: Electron.WebContents): void => {
    if (owners.has(sender.id)) return;
    const owner = sender.id; owners.add(owner);
    sender.once("destroyed", () => { owners.delete(owner); void antigravityImageJobs.cancelOwner(owner); void loadCore().then((core) => core.releaseCanvasShotSender(owner)).catch(() => undefined); });
  };
  ipcMain.handle("nomi:tasks:quote-spend", (event, inputs: SpendQuoteInput[]) => {
    assertTrustedSender(event);
    if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > 1000) throw new Error("Invalid quote targets");
    return prepareSpendQuote(inputs);
  });
  // 付费守卫铸令牌：仅由渲染层「真人确认」事件链调用（务实纵深：铸造面小而审计过 + 主进程硬闸兜底）。
  ipcMain.handle("nomi:tasks:grant-spend", (event, payload) => {
    assertTrustedSender(event);
    const raw = (payload || {}) as { nodeIds?: unknown; maxAttemptsPerNode?: unknown; quoteId?: string };
    const nodeIds = Array.isArray(raw.nodeIds) ? raw.nodeIds.map((id) => String(id)) : [];
    const maxAttemptsPerNode = typeof raw.maxAttemptsPerNode === "number" ? raw.maxAttemptsPerNode : undefined;
    return { grantId: mintSpendGrant({ nodeIds, ...(maxAttemptsPerNode ? { maxAttemptsPerNode } : {}), ...(raw.quoteId ? { quote: takeSpendQuote(raw.quoteId) } : {}) }) };
  });

  // 提交幂等包在 IPC 边界：渲染层每次提交（含控制器重试）都经此，同 idempotencyKey 的提交内核 at-most-once。
  ipcMain.handle("nomi:tasks:run", (event, payload) => {
    assertTrustedSender(event);
    trackOwner(event.sender);
    return runTaskIpcGuard(payload, async () => {
      const { runTask } = await loadRuntimeModule();
      // 同一节点一次只许一笔在途（S1-5 同类）：幂等重放先在 runTaskWithIdempotency 里合并，到不了这道闸。
      const extras = (payload as { request?: { extras?: Record<string, unknown> } } | null)?.request?.extras;
      return withTaskOwner(event.sender.id, () => runTaskWithIdempotency(payload, () => withNodeSubmitExclusive(extras, () => runTask(payload))));
    });
  });

  // 画布单节点 ↑ 的唯一付费口（发动机收敛第一刀）：这一下 IPC 就是用户的那一下点击，主进程按发起的窗口铸手势收据，
  // 建单镜 Run，经提交出口交出去。查结果也经 Run（poll → 出片就记进 Run）。错误照旧按结构化标记穿 IPC。
  ipcMain.handle("nomi:tasks:canvas-submit", (event, payload) => {
    assertTrustedSender(event);
    trackOwner(event.sender);
    const raw = (payload || {}) as { projectId?: unknown; nodeId?: unknown; runRecordId?: unknown; vendor?: unknown; request?: unknown };
    const request = raw.request as { kind?: unknown; prompt?: unknown; extras?: Record<string, unknown> } | undefined;
    const projectId = str(raw.projectId);
    const nodeId = str(raw.nodeId);
    const runRecordId = str(raw.runRecordId);
    const vendor = str(raw.vendor);
    if (!projectId || !nodeId || !runRecordId || !vendor || !request || typeof request.kind !== "string" || typeof request.prompt !== "string") {
      throw new Error("canvas generation request is invalid");
    }
    if (str(request.extras?.projectId) !== projectId || str(request.extras?.nodeId) !== nodeId) throw new Error("TASK_PROJECT_MISMATCH: canvas request identity disagrees");
    const gesture = { webContentsId: event.sender.id, frameId: event.senderFrame?.routingId ?? 0, origin: event.senderFrame?.origin ?? "" };
    return runTaskIpcGuard({ request }, async () => withTaskOwner(event.sender.id, async () => (await loadCore()).submitCanvasShot({
      projectId, nodeId, runRecordId, vendor, request: request as never, gesture, senderId: event.sender.id,
    })));
  });
  ipcMain.handle("nomi:tasks:canvas-poll", (event, payload) => {
    assertTrustedSender(event);
    const raw = (payload || {}) as { projectId?: unknown; runRecordId?: unknown };
    const projectId = str(raw.projectId);
    const runRecordId = str(raw.runRecordId);
    if (!projectId || !runRecordId) throw new Error("canvas generation poll is invalid");
    return runTaskIpcGuard(payload, async () => withTaskOwner(event.sender.id, async () => (await loadCore()).pollCanvasShot({ projectId, runRecordId, senderId: event.sender.id })));
  });
  ipcMain.handle("nomi:tasks:canvas-release", async (event, payload) => {
    assertTrustedSender(event);
    const raw = (payload || {}) as { projectId?: unknown; runRecordId?: unknown };
    const projectId = str(raw.projectId);
    const runRecordId = str(raw.runRecordId);
    if (projectId && runRecordId) (await loadCore()).releaseCanvasShot({ projectId, runRecordId });
  });

  ipcMain.handle("nomi:tasks:result", (event, payload) => {
    assertTrustedSender(event);
    return runTaskIpcGuard(payload, async () => {
      const { fetchTaskResult } = await loadRuntimeModule();
      return withTaskOwner(event.sender.id, () => fetchTaskResult(payload));
    });
  });
  ipcMain.handle("nomi:tasks:comfy-candidate-test", async (event, payload) => {
    assertTrustedSender(event);
    let ownerDestroyed = false;
    const envelope = (payload as { candidate?: unknown })?.candidate;
    const onDestroyed = () => {
      ownerDestroyed = true;
      cancelComfyCandidateTest(envelope);
      failComfyCandidateEnvelope(payload, "candidate_cancelled");
    };
    event.sender.once("destroyed", onDestroyed);
    try {
      return await runTaskIpcGuard(payload, async () => {
        const { runTask, fetchTaskResult } = await loadRuntimeModule();
        if (ownerDestroyed) return failComfyCandidateEnvelope(payload, "candidate_cancelled");
        return withTaskOwner(event.sender.id, () => runComfyCandidateTest(payload, { runTask, fetchTaskResult }));
      });
    } catch (error) {
      // 绑住这个 error：空 catch 曾把上游真因（含我们自己的出站策略拒绝）整个丢掉，
      // 只留一个裸码给界面渲染。真因脱敏后随 params.detail 一起交出去。
      return failComfyCandidateEnvelope(
        payload,
        ownerDestroyed ? "candidate_cancelled" : "provider_failed",
        ownerDestroyed ? undefined : error,
      );
    } finally {
      event.sender.removeListener("destroyed", onDestroyed);
    }
  });
  ipcMain.handle("nomi:tasks:comfy-candidate-cancel", (event, payload) => {
    assertTrustedSender(event);
    const result = cancelComfyCandidateTest(payload);
    failComfyCandidateEnvelope(payload, "candidate_cancelled");
    return result;
  });
  ipcMain.handle("nomi:tasks:cancel", (event, taskId: unknown) => {
    assertTrustedSender(event);
    if (typeof taskId !== "string" || !/^local-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(taskId)) throw new Error("LOCAL_TASK_INVALID_ID");
    return antigravityImageJobs.cancel(taskId, event.sender.id);
  });
}

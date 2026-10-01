// 续同意的唯一写口（2026-10-01 付费卡① 第 13 条）。判据在 `electron/shared/productionDispatchConsent.ts`。
//
// 只有用户在 Nomi 自己窗口里的那一下点击能续：放行形象检查点（`gate.decide` 批准 anchor_checkpoint）、停下之后点
// 「继续」（`run.control` resume）。两条都由受信 IPC 边界盖了真人手势章（`RunCommand.humanGesture`）才算——
// MCP 宿主、Agent、调度器自己的「继续」都不续：没人点，同意就不该被延长。
//
// 续的是「这一下点到的那几镜」：批过、还没发出去的作业所在的那几道付费门（`dispatchConsentRenewalGateIds`）。
// 只在门上记一个时间（`consentRenewedAt`），信封、收据、批准记录一个字不动。
import { dispatchConsentRenewalGateIds, type DispatchConsentRenewal } from "../shared/productionDispatchConsent";
import type { ProductionRunRepository } from "./productionRunRepository";
import type { ProductionRun, RunCommand, RunCommandResult } from "./productionRunTypes";

const RENEWALS: ReadonlySet<DispatchConsentRenewal> = new Set(["anchor_release", "resume"]);

type CommandEffect = { run: ProductionRun; eventType: string; message: string };

/** reducer 用：把这一下点击记到它点名的那几道门上。点名的不是批过的付费门 = 拒绝（续不能替没批过的门批准）。 */
export function applyDispatchConsentRenewal(current: ProductionRun, command: RunCommand, now: string): CommandEffect {
  const by = command.payload.by;
  if (typeof by !== "string" || !RENEWALS.has(by as DispatchConsentRenewal)) throw new Error("Invalid dispatch consent renewal");
  const gateIds = Array.isArray(command.payload.gateIds) ? command.payload.gateIds.filter((id): id is string => typeof id === "string") : [];
  if (gateIds.length === 0) throw new Error("A dispatch consent renewal names at least one gate");
  const wanted = new Set(gateIds);
  for (const gateId of wanted) {
    const gate = current.gates.find((candidate) => candidate.gateId === gateId);
    if (!gate || gate.scope !== "budget_envelope" || gate.status !== "approved") {
      throw new Error(`Dispatch consent can only be renewed on an approved spend gate: ${gateId}`);
    }
  }
  return {
    run: {
      ...current,
      gates: current.gates.map((gate) => (wanted.has(gate.gateId)
        ? { ...gate, consentRenewedAt: now, consentRenewedBy: by as DispatchConsentRenewal }
        : gate)),
      updatedAt: now,
    },
    eventType: "generation.consent.renewed",
    message: `${by}:${[...wanted].join(",")}`,
  };
}

/**
 * 用户点了一下（放行形象 / 继续）：续这个 Run 里批过、还没发出去的那几镜的同意。没有要续的 = 什么都不写。
 * 调用方只在命令带着真人手势章时调它（见文件头）。
 */
export function renewDispatchConsent(
  repository: Pick<ProductionRunRepository, "execute">,
  projectId: string,
  runId: string,
  run: ProductionRun,
  by: DispatchConsentRenewal,
  issuedAt: string,
): RunCommandResult | undefined {
  const gateIds = dispatchConsentRenewalGateIds(run);
  if (gateIds.length === 0) return undefined;
  return repository.execute(projectId, runId, {
    commandId: `generation.consent_renew:${by}:${run.revision}`,
    expectedRevision: run.revision,
    type: "generation.consent_renew",
    payload: { gateIds, by },
    issuedAt,
  });
}

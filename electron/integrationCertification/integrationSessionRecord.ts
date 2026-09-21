/**
 * 落盘会话记录的深校验，以及「上游失败 → 封闭可本地化的原因码」的映射。
 *
 * 单独成文件的理由：这两件事都只认数据形状，不认会话状态机——把它们留在 integrationSession.ts
 * 里只会继续喂那个巨壳（R9/R12）。原因码尤其不能散落：上游错误字符串一旦被原样落盘，
 * 投影就会把供应商的内部信息带给调用方。
 */
import fs from "node:fs";
import type { ProviderAdapterRun } from "../providerAdapter/types";
import { assertRecord } from "./integrationWorkflowBinding";
import type { IntegrationSession, PersistedIntegrationState } from "./integrationSession";
import {
  INTEGRATION_CREDENTIAL_STATUSES,
  INTEGRATION_STAGES,
  IntegrationRequestError,
  type IntegrationCredentialStatus,
  type IntegrationStage,
} from "../shared/integrationContract";
import { logWarn } from "../logging/logger";
import { BUILTIN_MCP_CLIENTS, type CapabilityOriginHost } from "../capabilityCore/security";
import {
  integrationCertifyingDeadlineAt,
  isCertifyingIntegrationStage,
  isTerminalIntegrationStage,
} from "./integrationSessionTerminal";

/**
 * 这份状态的**容量合同**。修复前它只是读侧的一句断言：写侧（`begin`）无限追加，
 * 于是 app 自己生产出一份自己读不了的盘——第 101 条落盘后主进程启动即 `app.quit()`，
 * 用户看到的是「双击没反应」。一个上限只在读侧断言、没有任何一层负责让它成立，
 * 就不是上限，是一颗定时炸弹（handoffQueue 同模块早就是写时挤掉最旧的，见其 MAX_ENTRIES）。
 *
 * 现在这个数字有唯一 owner：`capIntegrationSessions` 既在读侧自愈旧盘，也在写侧封顶。
 */
export const MAX_INTEGRATION_SESSIONS = 100;

/** Convert connector/runtime failures into the closed, localizable reason-code
 * set exposed by the session projection. Never persist upstream error strings. */
export function safeCertificationFailureCode(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (/credential|api.?key|safe.?storage/i.test(code)) return "credential_unavailable";
  if (/balance|billing|payment|insufficient/i.test(code)) return "provider_balance";
  if (/quota|rate.?limit|429/i.test(code)) return "provider_quota";
  if (/workflow|candidate|binding|input|missing_media|prompt_missing/i.test(code)) return "invalid_input";
  if (/timeout|network|fetch|connect|socket/i.test(code)) return "provider_network";
  if (/unavailable|runner/i.test(code)) return "certification_unavailable";
  return "provider_failed";
}
export function integrationStageFromAdapterRun(stage: ProviderAdapterRun["stage"]): IntegrationStage {
  if (stage === "completed" || stage === "partial") return stage;
  if (["queued", "discovering_docs", "compiling", "testing", "repairing", "reconciling"].includes(stage))
    return "certifying";
  return "failed";
}

export function adapterTerminalReasonCode(stage: ProviderAdapterRun["stage"]): string {
  if (stage === "needs_ai") return "certification_needs_ai";
  if (stage === "timed_out") return "certification_timed_out";
  if (stage === "cancelled") return "certification_cancelled";
  if (stage === "stale") return "certification_stale";
  return "provider_failed";
}

/**
 * 2026-09-12 删掉花费确认那一关之后，**旧盘上**还躺着它的痕迹：三个已退役的 stage
 * 和五个只为收据/挑战存在的字段。这不是并行代码路径，是一次性读旧数据——
 * 就地改写成新词表，读完盘上就不再有它们。
 *
 * 为什么是改写不是丢弃：停在 `needs_spend_confirmation` 的会话恰恰是被那条死路卡住的那些
 * （外部宿主永远走不出去，见 docs/research/2026-09-12-real-onboarding-acceptance §P0-1）。
 * 丢掉等于让用户重来一遍；改写成 `ready_to_certify` 等于把他直接放出来。
 */
const RETIRED_SPEND_GATE_STAGES = new Set([
  "needs_spend_confirmation",
  "awaiting_human_confirmation",
  "human_confirmed",
]);
const RETIRED_SPEND_GATE_FIELDS = [
  "startReceiptDigest",
  "pendingReceiptId",
  "startReceiptStatus",
  "pendingChallengeId",
  "pendingConfirmationKey",
] as const;
function migrateRetiredSpendGate(item: Record<string, unknown>): void {
  if (typeof item.stage === "string" && RETIRED_SPEND_GATE_STAGES.has(item.stage)) item.stage = "ready_to_certify";
  for (const field of RETIRED_SPEND_GATE_FIELDS) delete item[field];
}

/**
 * 修复之前落盘的 `certifying`/`committing` 会话没有 `certifyingDeadlineAt`，
 * 于是会话看门狗按「没根据不判死」原则永远不碰它们——用户盘上那几条已经卡死的会话
 * 会继续卡到手动删文件。这里按它**最后一次动过的时间**补一个到期时间：
 * 那是我们对「这次认证什么时候还活着」唯一有据可查的时刻，比重新从现在起算诚实
 * （从现在起算等于每次重启都给它续命一轮）。
 */
function backfillCertifyingDeadline(item: Record<string, unknown>): void {
  if (typeof item.stage !== "string" || !isCertifyingIntegrationStage(item.stage)) return;
  if (typeof item.certifyingDeadlineAt === "string" && item.certifyingDeadlineAt) return;
  const anchor = typeof item.updatedAt === "string" && Number.isFinite(Date.parse(item.updatedAt))
    ? item.updatedAt
    : undefined;
  if (!anchor) return;
  item.certifyingDeadlineAt = integrationCertifyingDeadlineAt(anchor);
}

/**
 * 容量合同的唯一执行者：超限时**只**挤掉终态会话，最旧的先走；非终态（还在进行中的）
 * 一条都不动。
 *
 * 为什么不按「最旧的一律挤掉」：一条 `draft`/`needs_credential`/`certifying` 会话代表用户
 * 手上还没做完的活（甚至挂着一条在飞的 child run）。把它悄悄删掉＝用户填到一半的接入凭空消失，
 * 而这正是上限本来要保护他免于遇到的那种事。终态会话则只是历史，挤掉只丢一条记录。
 *
 * `overCapacity` = 光非终态就已经超限，裁剪救不回来。这时读侧照样把它们**全部**还回去
 * （宁可状态偏大，也不丢用户在做的事），由写侧据此拒绝新建——见 `IntegrationSessionService.begin`。
 */
export function capIntegrationSessions(
  sessions: readonly IntegrationSession[],
): { sessions: IntegrationSession[]; overCapacity: boolean } {
  if (sessions.length <= MAX_INTEGRATION_SESSIONS) return { sessions: [...sessions], overCapacity: false };
  const touchedAt = (entry: IntegrationSession): number => {
    const stamp = Date.parse(entry.updatedAt || entry.createdAt || "");
    return Number.isFinite(stamp) ? stamp : 0;
  };
  const doomed = new Set(
    sessions
      .filter((entry) => isTerminalIntegrationStage(entry.stage))
      // 最旧的先走；Array#sort 规范保证稳定，同一时刻的几条自然保持盘上原始顺序。
      .sort((left, right) => touchedAt(left) - touchedAt(right))
      .slice(0, sessions.length - MAX_INTEGRATION_SESSIONS),
  );
  const kept = sessions.filter((entry) => !doomed.has(entry));
  return { sessions: kept, overCapacity: kept.length > MAX_INTEGRATION_SESSIONS };
}

/**
 * 新建会话前的容量闸。写侧的 `persist` 会替我们挤掉最旧的终态会话，但挤不动非终态：
 * 光是没做完的活就占满上限时，唯一诚实的答复是当场拒绝并说清怎么出去——
 * 悄悄删掉用户填到一半的接入，恰恰是这个上限本来要保护他免于遇到的事。
 */
export function assertIntegrationSessionCapacity(
  existing: readonly IntegrationSession[],
  incoming: IntegrationSession,
): void {
  if (!capIntegrationSessions([...existing, incoming]).overCapacity) return;
  throw new IntegrationRequestError(
    "integration_session_limit_reached",
    `This machine already holds ${MAX_INTEGRATION_SESSIONS} unfinished model setups. `
      + "Cancel one you no longer need (nomi_model_setup action=cancel) before starting another",
    { limit: MAX_INTEGRATION_SESSIONS },
  );
}

/**
 * 读这份状态的唯一入口：形状坏了照抛（那是真需要被看见的信号），条数多了就地裁剪并把结果写回去。
 *
 * 修复前这两件事共用一句 throw，于是第 101 条会话一落盘，主进程启动链上的这一抛直接走到
 * `main.ts` 的 `.catch` → `app.quit()`，用户看到的是「双击 Nomi 没反应」，出路只有手工删文件。
 *
 * 回写失败不许拖垮启动：返回的状态已经是对的，下次启动会再裁一次。这不是吞错——
 * 回写只是把自愈结果落盘的优化，它失败不改变任何不变量。
 */
export function readIntegrationSessionState(
  filePath: string,
  writeBack: (state: PersistedIntegrationState) => void,
): PersistedIntegrationState {
  if (!fs.existsSync(filePath)) return { version: 1, revision: 0, sessions: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw new Error("Integration session storage is corrupt");
  }
  // validateState 已经断言过 sessions 是数组，所以它之后这个读取无需再自证一遍。
  const state = validateState(raw);
  if (state.sessions.length >= (raw as { sessions: unknown[] }).sessions.length) return state;
  try {
    writeBack(state);
  } catch (error) {
    logWarn("onboarding", "integration-session-compaction-writeback-failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
  return state;
}

/**
 * 读侧只判**形状**，不再判条数：条数多是我们自己写出来的，不是文件坏了，
 * 把两件事共用一句 `throw` 正是「启动静默退出」的成因。超限的旧盘就地裁剪，
 * 调用方（`IntegrationSessionService.read`）负责把裁剪结果回写。
 */
export function validateState(raw: unknown): PersistedIntegrationState {
  assertRecord(raw);
  if (raw.version !== 1 || !Number.isSafeInteger(raw.revision) || !Array.isArray(raw.sessions))
    throw new Error("Invalid integration session state");
  const stages = new Set<IntegrationStage>(INTEGRATION_STAGES);
  // 与 handoffQueue 同源：内置 client 全量允许（2026-09-11 workbuddy 漏抄修复）。
  const owners = new Set<CapabilityOriginHost>(["external", "nomi", ...BUILTIN_MCP_CLIENTS]);
  for (const item of raw.sessions) {
    assertRecord(item);
    migrateRetiredSpendGate(item);
    backfillCertifyingDeadline(item);
    const allowedKeys = new Set([
      "schemaVersion",
      "id",
      "revision",
      "ownerClientId",
      "capabilityDigest",
      "kind",
      "stage",
      "configDigest",
      "credentialStatus",
      "childRunRef",
      "unresolvedFields",
      "blockingReason",
      "persistenceProof",
      "createdAt",
      "updatedAt",
      "config",
      "candidates",
      "selections",
      "credentialRef",
      "startIdempotencyKey",
      "compileRequest",
      "adapterDraft",
      "certifyingDeadlineAt",
    ]);
    const unknown = Object.keys(item).find((key) => !allowedKeys.has(key));
    if (unknown) throw new Error(`Invalid integration session field: ${unknown}`);
    if (
      item.schemaVersion !== 1 ||
      typeof item.id !== "string" ||
      !/^[A-Za-z0-9._-]+$/.test(item.id) ||
      !Number.isSafeInteger(item.revision) ||
      !owners.has(item.ownerClientId as CapabilityOriginHost) ||
      !stages.has(item.stage as IntegrationStage) ||
      !Array.isArray(item.unresolvedFields) ||
      !Array.isArray(item.candidates) ||
      !Array.isArray(item.selections) ||
      !item.config ||
      typeof item.config !== "object" ||
      !INTEGRATION_CREDENTIAL_STATUSES.includes(item.credentialStatus as IntegrationCredentialStatus)
    )
      throw new Error("Invalid integration session record");
  }
  const capped = capIntegrationSessions(raw.sessions as IntegrationSession[]);
  return { version: 1, revision: Number(raw.revision), sessions: capped.sessions };
}
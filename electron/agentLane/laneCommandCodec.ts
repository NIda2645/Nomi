// Agent lane · 过桥命令的解码（纯函数，不认识 electron）
//
// **渲染层不再铸造宿主记录。** 今天它在 `projectAgentTurnCommands.ts:88-167` 里造 thread /
// turn / item / executionToken / contextRef 送过桥——身份生成在桥的**不可信一侧**
// （#546 V10）。新通路上渲染层只能说两句话：「跑这段提示词」和「停」。
// 身份（operationId / entryId / sessionId）全部由主进程和 pi 铸造。
//
// 拆成独立文件是为了能不起 electron 就测它：`laneIpc.ts` 顶部 `import { ipcMain } from
// "electron"`，那一行会让 node --test 直接炸。判据和绑定分开，判据就能被真正测到。
import type { LaneApprovalAction, LaneCommand } from "../shared/agentLane/laneContracts";
import { LANE_APPROVAL_ACTIONS } from "../shared/agentLane/laneContracts";

export class LaneCommandError extends Error {
  readonly code = "agent_lane_invalid_command" as const;
}

/** 提示词的字节上限。桥上任何一条没有上限的字符串都是一次免费的内存放大器。 */
const MAX_PROMPT_BYTES = 128 * 1024;

/**
 * 拒绝理由的字节上限。它比提示词小两个数量级是有理由的：这句话会**一字不改**成为
 * 模型看到的 tool result，一段 128KB 的「不要」等于用户不小心把整个上下文烧了。
 */
const MAX_REASON_BYTES = 4 * 1024;

const APPROVAL_ACTIONS: ReadonlySet<string> = new Set(LANE_APPROVAL_ACTIONS);

/**
 * 把线上的任意值解成一条命令，或者**抛**。
 * 不做「猜一个默认值」这种事：一条解不出来的命令继续往下走，最后会变成一次没人预期的模型调用。
 */
export function parseLaneCommand(wire: unknown): LaneCommand {
  if (!wire || typeof wire !== "object" || Array.isArray(wire)) {
    throw new LaneCommandError("Lane command must be an object");
  }
  const record = wire as Record<string, unknown>;
  if (record.kind === "history-older") return { kind: "history-older", before: parseEntryId(record.before) };
  if (record.kind === "abort") return { kind: "abort" };
  if (record.kind === "approval") return parseApproval(record);
  if (record.kind === "cancel-queued") return { kind: "cancel-queued", entryId: parseEntryId(record.entryId) };
  if (record.kind === "lane-select") return { kind: "lane-select", laneName: parseLaneName(record.laneName) };
  if (record.kind === "lane-create") return { kind: "lane-create", laneName: parseLaneName(record.laneName) };
  if (record.kind === "lane-delete") return { kind: "lane-delete", laneName: parseLaneName(record.laneName) };
  if (record.kind === "steer") return { kind: "steer", text: parseText(record.text, "A steer command") };
  if (record.kind === "follow-up") return { kind: "follow-up", text: parseText(record.text, "A follow-up command") };
  if (record.kind !== "prompt") {
    throw new LaneCommandError(`Unknown lane command kind: ${String(record.kind)}`);
  }
  return { kind: "prompt", text: parseText(record.text, "A prompt command") };
}

/** 三条「一句用户的话」命令（prompt / steer / follow-up）共用同一把尺子——上限不该按命令名不同。 */
function parseText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new LaneCommandError(`${label} needs non-empty text`);
  }
  if (Buffer.byteLength(value, "utf8") > MAX_PROMPT_BYTES) {
    throw new LaneCommandError(`${label} must stay under ${MAX_PROMPT_BYTES} bytes`);
  }
  return value;
}

/** 队列项的 id 是 pi 铸的，渲染层只是转交。空串会在 `cancelQueued` 那侧变成一次 `not_found`。 */
function parseEntryId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new LaneCommandError("A cancel-queued command needs the entryId it cancels");
  }
  return value;
}

/**
 * 对话名。**它同时是这条对话在盘上的目录名**（`laneSession.mts` 按 lane 建 slug 目录），
 * 所以这里的字符集不是排版口味，是路径安全：`/`、`\`、`:`、`..` 任何一个漏过去，
 * 一条「新建对话」就能让会话文件落到项目目录外面，而删除那条对话时同一个名字会跟着走。
 * 长度上限同理——目录名有文件系统上限，超了不是报错而是创建失败。
 */
const LANE_NAME_SHAPE = /^[A-Za-z0-9一-龥][A-Za-z0-9一-龥 _-]{0,63}$/u;

function parseLaneName(value: unknown): string {
  if (typeof value !== "string" || !LANE_NAME_SHAPE.test(value)) {
    throw new LaneCommandError(
      `A lane name must be 1-64 characters of letters, digits, Chinese, space, "_" or "-" (got ${JSON.stringify(value)})`,
    );
  }
  return value;
}

/**
 * 对一张审批卡的答复。
 *
 * `toolCallId` 必须原样送回来：它是 pi 铸的，渲染层只是转交。没有它，「用户点的是哪一张卡」
 * 就只能靠「当前那张」去猜——而用户点得慢、卡已经翻篇的时候，猜出来的答案会落到下一张上。
 */
function parseApproval(record: Record<string, unknown>): LaneCommand {
  const toolCallId = record.toolCallId;
  if (typeof toolCallId !== "string" || !toolCallId.trim()) {
    throw new LaneCommandError("An approval command needs the toolCallId it answers");
  }
  const action = record.action;
  if (typeof action !== "string" || !APPROVAL_ACTIONS.has(action)) {
    throw new LaneCommandError(`Unknown approval action: ${String(action)}`);
  }
  const reason = record.reason;
  if (reason !== undefined && typeof reason !== "string") {
    throw new LaneCommandError("An approval reason must be text");
  }
  if (typeof reason === "string" && Buffer.byteLength(reason, "utf8") > MAX_REASON_BYTES) {
    throw new LaneCommandError(`An approval reason must stay under ${MAX_REASON_BYTES} bytes`);
  }
  return {
    kind: "approval",
    toolCallId,
    action: action as LaneApprovalAction,
    ...(typeof reason === "string" && reason.trim() ? { reason } : {}),
  };
}

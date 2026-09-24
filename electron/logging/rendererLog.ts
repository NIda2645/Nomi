// 渲染层失败证据的主进程入口 —— 渲染层 → 主进程日志**唯一**的一条通道（`nomi:log:renderer`）。
//
// 2026-09-24 Windows 用户的诊断包里只有主进程日志：界面上弹的是「项目保存失败」，真实原因
// （`WorkspaceManifestLockBusyError`）只进了渲染层 console——打包版里没人接，包里一个字都没有。
// 渲染层所有「失败了」的证据都经 `src/desktop/rendererLog.ts` 走到这里，再落进同一份按天日志。
//
// 这一层只做三件事，脱敏规则一条都不另写（复用 `redact.ts`，P1）：
//   ① **形状校验**：事件名、字段名、字段值都是封闭形状；不合格整条拒收，记一行 `renderer-log-rejected`
//      ——拒收也要留痕，不然「为什么这条没进来」又是一个查不到的问题。
//   ② **限流**：IPC 是信任边界，而每一行都是主进程上一次同步写盘。渲染层某个 effect 一旦进了循环，
//      console.error 只是刷屏，这里会变成主进程卡顿 + 把当天日志挤满。每个事件每分钟最多 20 行、
//      全部事件合计 200 行；超了只记一行 `renderer-log-suppressed`。
//   ③ **分级落盘**：warn / error 进通用日志（scope=renderer）；crash 走崩溃道（崩溃文件 + 通用日志）。
import { logCrash } from "../crashLog";
import { logError, logWarn, type LogFields } from "./logger";
import {
  RENDERER_LOG_EVENT_PATTERN,
  RENDERER_LOG_FIELD_KEY_PATTERN,
  RENDERER_LOG_MAX_FIELDS,
  RENDERER_LOG_MAX_TEXT_CHARS,
  type RendererLogEntry,
  type RendererLogError,
  type RendererLogFieldValue,
} from "../shared/contracts/rendererLog";

export const RENDERER_LOG_CHANNEL = "nomi:log:renderer";

const WINDOW_MS = 60_000;
const MAX_LINES_PER_EVENT = 20;
const MAX_LINES_TOTAL = 200;

type ParseResult = { ok: true; entry: RendererLogEntry } | { ok: false; reason: string };

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length <= RENDERER_LOG_MAX_TEXT_CHARS;
}

function parseError(raw: unknown): RendererLogError | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (!isText(record.name) || !isText(record.message)) return null;
  if (record.code !== undefined && !isText(record.code)) return null;
  if (record.stack !== undefined && !isText(record.stack)) return null;
  return {
    name: record.name,
    message: record.message,
    ...(record.code === undefined ? {} : { code: record.code }),
    ...(record.stack === undefined ? {} : { stack: record.stack }),
  };
}

function parseFields(raw: unknown): Record<string, RendererLogFieldValue> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > RENDERER_LOG_MAX_FIELDS) return null;
  const fields: Record<string, RendererLogFieldValue> = {};
  for (const [key, value] of entries) {
    if (!RENDERER_LOG_FIELD_KEY_PATTERN.test(key)) return null;
    const scalar =
      value === null || typeof value === "boolean" || isText(value) || (typeof value === "number" && Number.isFinite(value));
    if (!scalar) return null;
    fields[key] = value as RendererLogFieldValue;
  }
  return fields;
}

/** 渲染层来的报文不可信：逐项按封闭形状收，任何一项不合格就整条拒收（不做「能收多少收多少」）。 */
export function parseRendererLogEntry(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "not-an-object" };
  const record = raw as Record<string, unknown>;
  if (record.level !== "warn" && record.level !== "error" && record.level !== "crash") return { ok: false, reason: "bad-level" };
  if (typeof record.event !== "string" || !RENDERER_LOG_EVENT_PATTERN.test(record.event)) return { ok: false, reason: "bad-event" };
  const error = record.error === undefined ? undefined : parseError(record.error);
  if (error === null) return { ok: false, reason: "bad-error" };
  const fields = record.fields === undefined ? undefined : parseFields(record.fields);
  if (fields === null) return { ok: false, reason: "bad-fields" };
  return {
    ok: true,
    entry: {
      level: record.level,
      event: record.event,
      ...(error ? { error } : {}),
      ...(fields ? { fields } : {}),
    },
  };
}

/**
 * 摊平的错误 → 一个 Error，交给 `redactError` 按主进程同一套规则脱敏（名字、码、逐帧剥路径）。
 * `stack` 必须整条覆盖：留着 `new Error()` 自带的栈，日志里就会出现**主进程这里**的帧，看着像是在主进程出的事。
 */
function toLoggableError(error: RendererLogError): Error {
  const loggable = new Error(error.message);
  loggable.name = error.name;
  loggable.stack = error.stack ?? `${error.name}: ${error.message}`;
  if (error.code !== undefined) Object.assign(loggable, { code: error.code });
  return loggable;
}

function writeEntry(entry: RendererLogEntry): void {
  const error = entry.error ? toLoggableError(entry.error) : undefined;
  const fields: LogFields | undefined = entry.fields;
  if (entry.level === "warn") logWarn("renderer", entry.event, fields, error);
  else if (entry.level === "error") logError("renderer", entry.event, error, fields);
  else logCrash(`renderer:${entry.event}`, error ?? "(no error object)", fields);
}

type Window = { startedAt: number; lines: number; suppressed: boolean };

/** 一个带限流状态的记录器。导出工厂而不是单例：单测要能拿到干净的计数与假时钟。 */
export function createRendererLogRecorder(now: () => number = Date.now): (raw: unknown) => void {
  const perEvent = new Map<string, Window>();
  let total: Window = { startedAt: now(), lines: 0, suppressed: false };

  const admit = (key: string): boolean => {
    const at = now();
    if (at - total.startedAt >= WINDOW_MS) {
      total = { startedAt: at, lines: 0, suppressed: false };
      // 事件名集合由渲染层决定，不设上限就是一个可以被撑爆的 Map——过期窗口随总窗口一起清。
      for (const [event, window] of perEvent) if (at - window.startedAt >= WINDOW_MS) perEvent.delete(event);
    }
    let window = perEvent.get(key);
    if (!window || at - window.startedAt >= WINDOW_MS) {
      window = { startedAt: at, lines: 0, suppressed: false };
      perEvent.set(key, window);
    }
    const overEvent = window.lines >= MAX_LINES_PER_EVENT;
    const overTotal = total.lines >= MAX_LINES_TOTAL;
    if (!overEvent && !overTotal) {
      window.lines += 1;
      total.lines += 1;
      return true;
    }
    // 每个窗口只说一次「后面的被略掉了」，不然这一行本身又成了刷屏。
    const bucket = overTotal ? total : window;
    if (!bucket.suppressed) {
      bucket.suppressed = true;
      logWarn("renderer", "renderer-log-suppressed", {
        event: overTotal ? "*" : key,
        limit: overTotal ? MAX_LINES_TOTAL : MAX_LINES_PER_EVENT,
        windowMs: WINDOW_MS,
      });
    }
    return false;
  };

  return (raw) => {
    const parsed = parseRendererLogEntry(raw);
    if (!admit(parsed.ok ? parsed.entry.event : "renderer-log-rejected")) return;
    if (parsed.ok) writeEntry(parsed.entry);
    else logWarn("renderer", "renderer-log-rejected", { reason: parsed.reason });
  };
}

/** IPC 边界形状：ipcMain.on 与 sender 守卫作为注入面，单测不引 electron。 */
export type RendererLogIpcBoundary<E = unknown> = {
  onMessage: (channel: string, handler: (event: E, message: unknown) => void) => void;
  assertTrusted: (event: E) => void;
};

/**
 * 主窗口与挂 Nomi preload 的辅助窗都可报，但都要过 sender 守卫——任何挂 preload 的窗口
 * 都能往这里发，不守就是一个可以无限刷写日志的口子。
 * 注册住在这里而非 main.ts：main.ts 是已知巨壳，门岗只减不增。
 */
export function registerRendererLogIpc<E>(
  boundary: RendererLogIpcBoundary<E>,
  record: (raw: unknown) => void = createRendererLogRecorder(),
): void {
  boundary.onMessage(RENDERER_LOG_CHANNEL, (event, message) => {
    boundary.assertTrusted(event);
    record(message);
  });
}

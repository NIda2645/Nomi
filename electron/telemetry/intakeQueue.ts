// 「用户主动交出去的东西，必须最终送达」的落盘队列。反馈与轨迹两个调用方共用。
//
// 与 `telemetryOutbox.ts` 的分工（**为什么是两个模块而不是一个**，别来合并）：
//   · telemetryOutbox 的契约是「攒一批匿名计数，并把待发/已发条数给设置页看」。
//     它的日期截断（反指纹）、25 条一批、pending/sent 双列表都是那个契约的一部分。
//   · 这一份的契约是「一件用户点过「发送」的东西，别丢」。它没有已发列表（用户拿到编号
//     就是回执），一条一发（反馈要立刻拿到编号），而且**反馈那一路不过 enabled 闸**。
// 把两者合成一个，`enabled` 那道闸就得长出例外分支——而闸子一有例外就迟早漏。
// 真正的单一 owner 落在**传输**那一层（`intakeClient.ts`），不在队列这一层。
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { readJsonFile, writeJsonFileAtomic } from '../jsonFile'
import { getSettingsRoot } from '../settings/settingsRoot'
import { intakeConfigured, postIntake } from './intakeClient'

/** 队列按货物分文件：清掉轨迹不该连带清掉用户已经点过发送的反馈。 */
export type IntakeQueueKind = 'trajectories' | 'feedback'

const MAX_PENDING = 50
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
/** 重试间隔。刻意不做指数退避：这是桌面 App，用户重开就重试，退避曲线没有收益。 */
const RETRY_MS = 60_000

export type IntakeQueueItem = {
  id: string
  queuedAt: string
  payload: unknown
}

type QueueStore = { schemaVersion: 1; pending: IntakeQueueItem[] }

function queuePath(kind: IntakeQueueKind): string {
  return path.join(getSettingsRoot(), `intake-queue-${kind}.json`)
}

function validItem(value: unknown): value is IntakeQueueItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.queuedAt === 'string' && 'payload' in item
}

function readStore(kind: IntakeQueueKind): QueueStore {
  try {
    const raw = readJsonFile(queuePath(kind)) as Partial<QueueStore>
    const pending = Array.isArray(raw.pending) ? raw.pending.filter(validItem) : []
    return { schemaVersion: 1, pending }
  } catch {
    // 队列文件坏了不该让用户下一次反馈也发不出去。丢掉坏文件，从空开始。
    return { schemaVersion: 1, pending: [] }
  }
}

function prune(store: QueueStore, now = Date.now()): void {
  store.pending = store.pending
    .filter((item) => {
      const queued = Date.parse(item.queuedAt)
      return !Number.isFinite(queued) || now - queued <= MAX_AGE_MS
    })
    .slice(-MAX_PENDING)
}

export function enqueueIntake(kind: IntakeQueueKind, payload: unknown): IntakeQueueItem {
  const item: IntakeQueueItem = { id: crypto.randomUUID(), queuedAt: new Date().toISOString(), payload }
  const store = readStore(kind)
  store.pending.push(item)
  prune(store)
  writeJsonFileAtomic(queuePath(kind), store)
  return item
}

export function readIntakeQueue(kind: IntakeQueueKind): IntakeQueueItem[] {
  const store = readStore(kind)
  prune(store)
  return store.pending
}

/** 关掉「帮 Nomi 变好」时清轨迹队列。**不清反馈队列**——见 `feedbackReport.ts` 的说明。 */
export function clearIntakeQueue(kind: IntakeQueueKind): { deletedCount: number } {
  const deletedCount = readStore(kind).pending.length
  try {
    fs.rmSync(queuePath(kind), { force: true })
  } catch {
    /* 删本机缓存是尽力而为 */
  }
  return { deletedCount }
}

const flushing = new Map<IntakeQueueKind, Promise<void>>()
const retryTimers = new Map<IntakeQueueKind, ReturnType<typeof setTimeout>>()

/**
 * 把队列里的东西发出去。**永不抛、永不阻塞 UI**：失败就留在队列里，排一次重试。
 *
 * 一条一发而不是攒批：反馈那一路要拿到每一条自己的编号，攒批就拿不到了。
 */
export function flushIntakeQueue(kind: IntakeQueueKind): Promise<void> {
  const inflight = flushing.get(kind)
  if (inflight) return inflight
  const run = (async () => {
    if (!intakeConfigured()) return
    const store = readStore(kind)
    prune(store)
    if (!store.pending.length) return
    for (const item of [...store.pending]) {
      try {
        await postIntake(`/v1/${kind}`, item.payload)
        const latest = readStore(kind)
        latest.pending = latest.pending.filter((pending) => pending.id !== item.id)
        writeJsonFileAtomic(queuePath(kind), latest)
      } catch {
        // 一条发不出去，后面的多半也发不出去（同一个端点）。留着，下一轮再来。
        break
      }
    }
    const remaining = readStore(kind).pending.length
    if (remaining > 0 && !retryTimers.has(kind)) {
      const timer = setTimeout(() => {
        retryTimers.delete(kind)
        void flushIntakeQueue(kind)
      }, RETRY_MS)
      // 不让重试定时器拖住进程退出：这是尽力投递，不是必须完成的事务。
      timer.unref?.()
      retryTimers.set(kind, timer)
    }
    if (remaining === 0) {
      // clearTimeout(undefined) 是 no-op，所以不用先取再判。
      clearTimeout(retryTimers.get(kind))
      retryTimers.delete(kind)
    }
  })().finally(() => {
    flushing.delete(kind)
  })
  flushing.set(kind, run)
  return run
}

/** 测试用：清掉进程内的重试定时器与在飞标记。 */
export function resetIntakeQueueTimers(): void {
  for (const timer of retryTimers.values()) clearTimeout(timer)
  retryTimers.clear()
  flushing.clear()
}

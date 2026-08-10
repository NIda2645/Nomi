import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { createMcpProtocol, type McpTransport } from './mcpProtocol'
import { createProductionRunRepository } from '../productionRun/productionRunRepository'
import { createProductionRunService } from '../productionRun/productionRunService'

// A7 真实任务旅程（R16 · plan 2026-08-11-mcp-conversation-native-p0）：
// 协议层 + 真 ProductionRunService（真持久化 run 仓库）走通「接住 → 进度 → 控制 → 状态 → 事件」，
// 断言用户在 CLI 里真正读到的 text 与模型依赖的 structuredContent.nomiOutcome。
// 只有传输是注入的（send 收帧、invoke 走真 service）——与获批样张壹/肆/陆幕逐项对应。

type RpcFrame = {
  jsonrpc?: string
  id?: unknown
  method?: string
  params?: Record<string, unknown>
  result?: {
    content?: Array<{ type: string; text: string }>
    structuredContent?: { nomiOutcome?: Record<string, unknown> }
    isError?: boolean
  }
}

function makeJourney() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-mcp-journey-'))
  const repository = createProductionRunRepository({ projectDirResolver: () => root })
  const service = createProductionRunService({
    repository,
    projectRootResolver: () => root,
    // 方向门批准后 driver 会真提分镜案（production.plan-storyboard）——给一个最小有效回应。
    requestRenderer: async () => ({
      text: '已完成分镜规划',
      plan: { title: '品牌宣传片', anchors: [], shots: [{ index: 1, shotKind: 'video', prompt: '清晨街市蒸汽中的小满' }] },
    }),
  })
  const frames: RpcFrame[] = []
  const transport: McpTransport = {
    send: (message) => { frames.push(message as RpcFrame) },
    isAppOpen: () => true,
    invoke: async (method, params) => {
      if (method === 'production.start') {
        return service.createDraft({
          projectId: String(params.projectId),
          playbook: { name: String(params.playbook), version: String(params.playbookVersion || '1.0.0') },
          origin: { host: 'claude', actorId: String(params.actorId || 'claude') },
          brief: params.brief as { goal: string },
        })
      }
      if (method === 'production.get') return service.readProjection(String(params.projectId), String(params.runId))
      if (method === 'production.events') {
        return service.readEvents(String(params.projectId), String(params.runId), Number(params.afterCursor) || 0, 0)
      }
      if (method === 'production.control') {
        const full = service.readFull(String(params.projectId), String(params.runId))
        if (!full) throw new Error('run missing')
        await service.command(String(params.projectId), String(params.runId), {
          commandId: `mcp-control-${String(params.action)}-${full.revision}`,
          expectedRevision: full.revision,
          type: 'run.control',
          payload: { action: params.action },
          issuedAt: new Date().toISOString(),
        })
        return service.readProjection(String(params.projectId), String(params.runId))
      }
      throw new Error(`unexpected invoke: ${method}`)
    },
  }
  const protocol = createMcpProtocol(transport)
  async function call(id: number, name: string, args: Record<string, unknown>, progressToken?: string): Promise<RpcFrame> {
    protocol.handleIncoming({
      jsonrpc: '2.0', id, method: 'tools/call',
      params: { name, arguments: args, ...(progressToken ? { _meta: { progressToken } } : {}) },
    })
    await vi.waitFor(() => { expect(frames.some((frame) => frame.id === id)).toBe(true) }, { timeout: 3000 })
    return frames.find((frame) => frame.id === id)!
  }
  return { service, frames, protocol, call }
}

function text(frame: RpcFrame): string {
  return frame.result?.content?.[0]?.text ?? ''
}
function outcome(frame: RpcFrame): Record<string, unknown> {
  return frame.result?.structuredContent?.nomiOutcome ?? {}
}

describe('MCP conversation journey (A7 · 真 service 全链路)', () => {
  it('接住→进度→控制→状态→事件：文本可转述、字段稳定、进度帧真实', async () => {
    const { service, frames, protocol, call } = makeJourney()
    protocol.handleIncoming({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: { elicitation: {} }, clientInfo: { name: 'claude-code' } } })

    // ── 壹 · 接住：进度起始帧 + 结构化回执 + 参数回显 ────────────────────────────
    const started = await call(2, 'nomi_start_playbook', {
      projectId: 'project-1',
      playbook: 'brand.promo',
      brief: { goal: '一条 60 秒品牌宣传片', durationSeconds: 60 },
    }, 'tok-journey')
    const progressFrames = frames.filter((frame) => frame.method === 'notifications/progress')
    expect(progressFrames.length).toBeGreaterThan(0)
    expect(progressFrames[0].params?.progressToken).toBe('tok-journey')
    expect(String(progressFrames[0].params?.message)).toContain('正在创建制作草稿 · brand.promo')
    expect(text(started)).toContain('✓ 制作草稿已创建')
    expect(text(started)).toContain('未花费')
    expect(text(started)).toContain('brand.promo')
    const runId = String(outcome(started).runId)
    expect(runId).toBeTruthy()
    expect(outcome(started).kind).toBe('run_draft')
    expect(outcome(started).nextActions).toEqual(['pick_direction'])

    // ── 贰 · 定方向：用户批准方向门（真 gate.decide），driver 真提分镜案 ────────
    await service.command('project-1', runId, {
      commandId: 'journey-direction-approve', expectedRevision: service.readFull('project-1', runId)!.revision,
      type: 'gate.decide', payload: { gateId: 'gate-direction-v1', status: 'approved' },
      issuedAt: new Date().toISOString(),
    })
    await new Promise((resolve) => setTimeout(resolve, 0)) // 让异步 proposeStoryboard 落盘
    expect(service.readFull('project-1', runId)!.status).toBe('awaiting_storyboard_review')

    // ── 状态可转述：分镜等审阅 → 人话 + 下一步 ──────────────────────────────
    const status = await call(3, 'nomi_get_run', { projectId: 'project-1', runId })
    expect(text(status)).toContain('分镜等你审阅')
    expect(outcome(status).nextActions).toEqual(['review_storyboard'])

    // ── 陆 · 掌控与错误契约：非法暂停给人话拒绝，取消合法且不计费 ─────────────
    const illegalPause = await call(4, 'nomi_control_run', { projectId: 'project-1', runId, action: 'pause' })
    expect(illegalPause.result?.isError).toBe(true)
    expect(text(illegalPause)).toContain('✗')
    expect(text(illegalPause)).toContain('无法暂停')

    const cancelled = await call(5, 'nomi_control_run', { projectId: 'project-1', runId, action: 'cancel' })
    expect(text(cancelled)).toContain('✓ 已取消')
    expect(text(cancelled)).toContain('已完成的产物保留在项目里')
    expect(outcome(cancelled).kind).toBe('run_control')
    expect(service.readFull('project-1', runId)!.status).toBe('cancelled')

    // ── 事件流：durable cursor 把整段旅程逐行透出 ────────────────────────────
    const events = await call(6, 'nomi_subscribe_run', { projectId: 'project-1', runId, afterCursor: 0 })
    expect(text(events)).toContain('[Nomi] run.created')
    expect(text(events)).toContain('gate.decided')
    expect(text(events)).toMatch(/next cursor \d+/)

    // ── 错误契约：不存在的 run 返回人话 isError ─────────────────────────────
    const missing = await call(7, 'nomi_control_run', { projectId: 'project-1', runId: 'run-missing', action: 'pause' })
    expect(missing.result?.isError).toBe(true)
    expect(text(missing)).toContain('✗')
  })
})

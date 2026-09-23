#!/usr/bin/env node
// 能力核 · CLI 传输（见 docs/plan/2026-06-20-capability-core-headless-exposure.md §S5）。
//
// 纯 node 客户端。让外部 Claude Code / Codex 用 Bash 直接驱动 Nomi。传输逻辑在 scripts/lib/nomiClient.mjs
// （与 MCP server 共用单一真相源）。
//
// 用法：
//   node scripts/nomi.mjs status
//   node scripts/nomi.mjs models
//   node scripts/nomi.mjs projects
//   node scripts/nomi.mjs project create "我的项目"
//   node scripts/nomi.mjs canvas read <projectId>
//   node scripts/nomi.mjs generate <projectId> <vendor> <modelKey> <intent> "<prompt>"
//
// 画布**写**（建节点/连边/改提示词/删节点）不在这条 CLI 上：裸 bearer 只证明「这台机器上的某个进程读到了
// token」，证不出「哪个客户端、哪次会话、哪个项目」。写路只走语义面 `nomi_canvas_edit` /
// `nomi_canvas_maintenance`（MCP，带 leaseHandle + 确认 + undoToken）。
import { invoke, readLiveInstance, readToken } from './lib/nomiClient.mjs'

function parseArgs(argv) {
  const [group, ...rest] = argv
  switch (group) {
    case 'status': {
      const instance = readLiveInstance()
      return {
        local: true,
        value: { appOpen: Boolean(instance), endpoint: instance ? `127.0.0.1:${instance.port}` : null, hasToken: Boolean(readToken()) },
      }
    }
    case 'ping':
      return { method: 'ping', params: {} }
    case 'models':
      return { method: 'models.list', params: {} }
    case 'projects':
      return { method: 'project.list', params: {} }
    case 'project':
      if (rest[0] === 'create') return { method: 'project.create', params: rest[1] ? { name: rest[1] } : {} }
      break
    case 'canvas': {
      const [sub, projectId] = rest
      if (sub === 'read') return { method: 'canvas.read', params: { projectId } }
      break
    }
    case 'generate': {
      const [projectId, vendor, modelKey, intent, prompt] = rest
      return { method: 'generate', params: { projectId, vendor, modelKey, intent: intent || 'image', prompt } }
    }
    default:
      break
  }
  return null
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if (!parsed) {
    process.stderr.write('未知命令。见文件头用法。\n')
    process.exit(2)
  }
  try {
    const result = parsed.local ? parsed.value : await invoke(parsed.method, parsed.params)
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } catch (error) {
    process.stderr.write(`错误：${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}

void main()

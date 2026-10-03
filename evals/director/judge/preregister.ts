import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { DirectorCard } from '../cardSchema'
import { preregistrationDraftSchema, preregistrationSchema, parseJsonObject, type Preregistration } from './schema'
import { preregistrationPrompt } from './prompts'

function runCodex(prompt: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', ['exec', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', '-m', 'gpt-6-astra', '-c', 'model_reasoning_effort=high', '-c', 'service_tier="priority"', '-'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.stdin.write(prompt)
    child.stdin.end()
    child.once('error', reject)
    child.once('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`codex exited ${code}: ${stderr.trim()}`)))
  })
}

type RunCodex = typeof runCodex
export type PreregisterOptions = { runCodex?: RunCodex; now?: () => Date }

export async function preregister(card: DirectorCard, outFile: string, options: PreregisterOptions = {}): Promise<{ value?: Preregistration; error?: string }> {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'nomi-director-preregister-'))
  try {
    const prompt = preregistrationPrompt(card)
    const raw = await (options.runCodex ?? runCodex)(prompt, temp)
    const parsed = preregistrationDraftSchema.parse(parseJsonObject(raw))
    const frozen = { ...parsed, frozenAt: (options.now ?? (() => new Date()))().toISOString() }
    const canonical = JSON.stringify({ ...frozen, sha256: '' })
    const sha256 = crypto.createHash('sha256').update(canonical).digest('hex')
    const value = preregistrationSchema.parse({ ...frozen, sha256 })
    await fs.writeFile(outFile, JSON.stringify(value, null, 2) + '\n')
    return { value }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await fs.writeFile(outFile, JSON.stringify({ status: 'unverified', error: message }, null, 2) + '\n')
    return { error: message }
  } finally {
    await fs.rm(temp, { recursive: true, force: true })
  }
}

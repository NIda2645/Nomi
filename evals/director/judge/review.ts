import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { DirectorCard } from '../cardSchema'
import { judgeOutputSchema, pairwiseSchema, parseJsonObject, type JudgeOutput, type Preregistration } from './schema'
import { pairwisePrompt, reviewPrompt } from './prompts'

function runCodex(args: string[], prompt: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', ['exec', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', '-m', 'gpt-6-astra', '-c', 'model_reasoning_effort=high', '-c', 'service_tier="priority"', ...args, '-'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
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

export async function reviewOnce(card: DirectorCard, preregistration: Preregistration, images: string[], cwd = os.tmpdir()): Promise<{ value?: JudgeOutput; error?: string; fast: boolean; raw?: string }> {
  const temp = await fs.mkdtemp(path.join(cwd, 'nomi-director-review-'))
  const randomized = [...images].sort(() => crypto.randomInt(-1, 2))
  const copied: string[] = []
  try {
    for (const image of randomized) {
      const target = path.join(temp, `${crypto.randomBytes(8).toString('hex')}.png`)
      await fs.copyFile(image, target)
      copied.push(target)
    }
    const raw = await runCodex(copied.flatMap((file) => ['-i', file]), reviewPrompt(card, preregistration, copied.map((file) => path.basename(file))), temp)
    const value = judgeOutputSchema.parse({ review: (parseJsonObject(raw) as { review: unknown }).review })
    return { value, fast: !raw.includes('service tier `priority` is not advertised'), raw }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), fast: false }
  } finally {
    await fs.rm(temp, { recursive: true, force: true })
  }
}

export async function pairwiseOnce(card: DirectorCard, preregistration: Preregistration, left: string, right: string, cwd = os.tmpdir()): Promise<{ value?: ReturnType<typeof pairwiseSchema.parse>; error?: string; fast: boolean }> {
  const temp = await fs.mkdtemp(path.join(cwd, 'nomi-director-pair-'))
  try {
    const leftTarget = path.join(temp, `${crypto.randomBytes(8).toString('hex')}.png`)
    const rightTarget = path.join(temp, `${crypto.randomBytes(8).toString('hex')}.png`)
    await fs.copyFile(left, leftTarget)
    await fs.copyFile(right, rightTarget)
    const raw = await runCodex(['-i', leftTarget, '-i', rightTarget], pairwisePrompt(card, preregistration), temp)
    const value = pairwiseSchema.parse(parseJsonObject(raw))
    return { value, fast: !raw.includes('service tier `priority` is not advertised') }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), fast: false }
  } finally {
    await fs.rm(temp, { recursive: true, force: true })
  }
}

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

// 类级回归测试：裸 NUL 门岗。
//
// 钉的不是「那 9 个文件修好了没」（那是快照，改一行就过期），而是**不变量**：
// 源码里出现裸 NUL 就必须报红，且新写的、还没 git add 的文件同样算数——
// 后者正是写门岗时踩到的坑：第一版用 `git ls-files`（只列已跟踪），于是门岗扫不到自己，
// 脚本自身当时含裸 NUL 却报「全仓通过」。漏掉「新文件」等于对最常见的引入路径失明。
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GATE = path.join(repoRoot, 'scripts', 'check-source-nul-bytes.mjs')
const NUL = String.fromCharCode(0)

// 门岗平时 <1s。2026-09-24 与 10-02 两次 CI 的 Unit job 都死在这个文件上（它是当时唯一没出结果的测试文件，
// 日志静默 1~2 小时直到人工取消）：execFileSync 同步阻塞事件循环，vitest 的 testTimeout 根本触发不了，
// 子进程一旦不返回，整个 worker 和整个 job 就跟着不返回。给同步子进程自带 timeout，卡住就杀掉并红在这里。
const CHILD_TIMEOUT_MS = 25_000

let probeFile: string | null = null

afterEach(() => {
  // 必须清干净：残留一个带 NUL 的探针文件会让门岗一直红，而且红得莫名其妙。
  if (probeFile) fs.rmSync(probeFile, { force: true })
  probeFile = null
})

function runGate(): { code: number; output: string } {
  try {
    const stdout = execFileSync('node', [GATE], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL' })
    return { code: 0, output: stdout }
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string; code?: string }
    // 超时不是「门岗判红」：不能让它混进 code !== 0，否则下面的红例会在门岗根本没跑完时假绿。
    if (failure.code === 'ETIMEDOUT') throw new Error(`门岗子进程 ${CHILD_TIMEOUT_MS}ms 内没有返回，已被杀掉`)
    return { code: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` }
  }
}

/** 在仓内写一个探针文件。名字带 pid，避免并行跑测试时互相踩。 */
function writeProbe(name: string, contents: string): string {
  const file = path.join(repoRoot, 'scripts', `${name}-${process.pid}.tmp.mjs`)
  fs.writeFileSync(file, contents)
  probeFile = file
  return file
}

describe('裸 NUL 字节门岗', () => {
  // 阳性对照：仓库现状必须是绿的。没有它，下面的「红」证明不了是探针触发的
  // （门岗要是恒红，负例照样全过）。
  it('阳性对照：仓库现状无裸 NUL', () => {
    const { code, output } = runGate()
    expect(code, output).toBe(0)
    expect(output).toContain('无一含裸 NUL')
  })

  it('源码里出现裸 NUL → 红，并指出文件与行号', () => {
    writeProbe('nul-probe-tracked', `export const key = \`a\${1}${NUL}b\`\n`)
    const { code, output } = runGate()
    expect(code).not.toBe(0)
    expect(output).toContain('nul-probe-tracked')
    expect(output).toContain('第 1 行')
  })

  // 门岗第一版就是栽在这一条上：只扫已跟踪文件，新文件完全免检。
  it('**未 git add 的新文件**同样受管（门岗曾因此扫不到自己）', () => {
    const file = writeProbe('nul-probe-untracked', `const k = "x${NUL}y"\n`)
    const tracked = execFileSync('git', ['ls-files', '-z', path.relative(repoRoot, file)], { cwd: repoRoot, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL' })
    expect(tracked.trim(), '这条测试的前提是该文件未被跟踪').toBe('')
    const { code, output } = runGate()
    expect(code).not.toBe(0)
    expect(output).toContain('nul-probe-untracked')
  })

  it('转义写法（\\0 / \\u0000）不算违规——运行期等价但文件仍是纯文本', () => {
    writeProbe('nul-probe-escaped', 'export const a = `x\\0y`\nexport const b = `p\\u0000q`\n')
    const { code, output } = runGate()
    expect(code, output).toBe(0)
  })
})

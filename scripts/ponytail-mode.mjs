// Ponytail 评审的模式：enforce（阻断）/ hint（只提示）。唯一的读取点。
//
// 2026-10-01 用户按门岗账本（docs/audit/2026-10-01-gate-ledger.md）拍板降级：最近 50 个 PR 里 47 个写了
// Ponytail 节、约 33 个是 --defer（runner 不可用），check:ponytail-review 在 CI 里 49/49 绿——
// 要求每个 PR 交一份「已延后」的收据，没有信息量。降级不是删：评审本体（pnpm run review:branch）、
// 收据、延后账本都还在，只是 pre-push 与 check:ponytail-review 不再阻断，改成打印提示。
//
// 重新开起来：把 docs/engineering/ponytail-mode.json 的 mode 改回 "enforce"（一行），
// 再跑一次 pnpm run review:branch 补一张真收据。缺文件 / 读不懂 / 值不认识 = enforce（fail-closed）。
// 环境变量 NOMI_PONYTAIL_MODE=enforce|hint 优先（临时开关与测试注入）。
import fs from 'node:fs'
import path from 'node:path'

export const PONYTAIL_MODE_FILE = 'docs/engineering/ponytail-mode.json'
const MODES = new Set(['enforce', 'hint'])

export function readPonytailMode(repoRoot, env = process.env) {
  const fromEnv = String(env.NOMI_PONYTAIL_MODE ?? '').trim()
  if (MODES.has(fromEnv)) return fromEnv
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(repoRoot, PONYTAIL_MODE_FILE), 'utf8'))
    return MODES.has(parsed?.mode) ? parsed.mode : 'enforce'
  } catch {
    return 'enforce'
  }
}

#!/usr/bin/env node
// 凭据去向单一 owner 门岗（R17：防线建在最早能拦住的那层）。
//
// 抓的是一整族「一段未签名的数据决定了用户的密钥发往哪里」的退化。类根因见
// docs/fixes/2026-09-18-credential-destination-is-user-confirmed.root-cause.json：
// `nomi_integration_manage update_vendor` 能 patch 一条**已存 key 的连接**的 baseUrlHint 与
// 鉴权放法，而密钥原样留着；`nomi_integration begin` 直接收 baseUrl。于是「key 去哪」是
// 对话文本说了算，不是用户说了算——Cherry Studio 那条铁律的反面，九家先例无一允许。
//
// 一次修好不算完：下一个写入口只要自己 patch 一次 baseUrlHint，同族问题就回来。三条硬判据：
//
//   规则 1（硬零）：`baseUrlHint / authType / authHeader / authQueryParam / authScheme / proxyUrl`
//       的**写入**只许出现在登记的 owner 文件里（catalog 的写门与内置种子）。别处写 = 第二个
//       「key 去哪」的真相源。判据只认赋值位（`x: value` 在对象字面量里、`x =`），不认读取。
//
//   规则 2（硬零）：对外 MCP 工具的 `inputSchema.properties` 里不许出现这六个名字（外加 `baseUrl`）。
//       它们一旦上 schema，模型就会去填——广告出去的能力就是实际的能力。判据实跑
//       `MCP_TOOL_RESOLVER.list()`，不是正则扫源码（扫源码会漏掉从声明派生出来的那一份）。
//
//   规则 3（硬零）：出站守卫必须引用 `credentialBinding`。守卫是不变量的执行端；判据被人删掉
//       之后，上面两条仍然全绿，而 key 又能去任何地方了。
//
// **加规则先验它会红**（R17）：本门岗落地时对 `origin/main` 1ba0c0cb5 实跑 8 处红，分属两个文件——
//   · electron/catalog/catalogManagement.ts:21   写 baseUrlHint（规则 1）
//   · electron/capabilityCore/mcpIntegrationManagementTools.ts:15-18  广播四个字段（规则 2）
// 复验命令写在 docs/fixes/2026-09-18-credential-destination-is-user-confirmed.root-cause.json。
//
// 用法：pnpm exec tsx scripts/check-credential-origin.ts
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_ROOTS = ['electron', 'src']
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs'])

/**
 * 能把「key 去哪」写进一行持久 vendor 的合法 owner。
 *
 * 判据只认**写进目录**的那一步（`upsertVendor` / `upsertModelCatalogVendor` 的实参里带着
 * 地址或鉴权放法），不认请求构造期的同名局部变量——后者满仓都是，拿它当判据等于没有判据。
 *
 * 每一行的理由只能是「这一次写入，用户在哪一页上看见并同意过」。改不动就加白名单是这条规则
 * 的失效方式，所以理由写在这里、跟着一起被读。
 */
const DESTINATION_OWNERS = new Map([
  ['electron/catalog/catalogStore.ts', 'catalog 的唯一写门本体（applyVendorUpsert / applyApiKeyUpsert 同一事务）'],
  ['electron/catalog/credentialBinding.ts', '绑定本体：它就是这条不变量的定义'],
  ['electron/catalog/catalogCommit.ts', '接入提交事务：地址来自用户刚在接入页确认的那一份'],
  ['electron/catalog/customCallDraft.ts', '人写脚本路的连接草稿：地址由用户在设置里自己填'],
  ['electron/catalog/comfyuiWorkflowImportStore.ts', '本地 ComfyUI 导入：地址是用户填的本机实例'],
  ['electron/integrationCertification/integrationSession.ts', '贴 key 页的会话：saveCredential 就是「用户按下保存」那一刻'],
  ['electron/providerAdapter/serviceCatalog.ts', '认证 run 的落库：身份与地址由会话锁死，Agent 改不动'],
  ['src/ui/onboarding/VendorBaseUrlField.tsx', '接入页上那个地址输入框——用户亲手在改'],
  ['src/ui/onboarding/ComfyuiLocalCard.tsx', '本地 ComfyUI 卡片：用户亲手填本机地址'],
  ['src/ui/onboarding/AddComfyuiInstanceButton.tsx', '同上（新增实例）'],
  ['src/ui/onboarding/LocalModelCard.tsx', '本机文本模型探测：地址来自本机嗅探 + 用户点开关'],
  ['src/ui/onboarding/workflowPage/ComfyuiWorkflowSettingsPage.tsx', '同上（工作流设置页）'],
  ['src/api/desktopClient.ts', '渲染层到主进程的透传壳，本身不构造 payload'],
])

/** 密钥去向字段。`baseUrl` 是 MCP 面上的同义名，只在规则 2 里判。 */
const DESTINATION_FIELDS = ['baseUrlHint', 'authType', 'authHeader', 'authQueryParam', 'authScheme', 'proxyUrl']
const TOOL_FIELDS = ['baseUrl', ...DESTINATION_FIELDS]

const UPSERT_CALL = /\b(?:upsertVendor|upsertModelCatalogVendor|applyVendorUpsert)\s*\(/g

function listFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    const absolute = path.join(repoRoot, dir)
    if (!fs.existsSync(absolute)) return
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const relative = `${dir}/${entry.name}`
      if (entry.name === 'node_modules') continue
      if (entry.isDirectory()) walk(relative)
      else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) out.push(relative)
    }
  }
  for (const root of SCAN_ROOTS) walk(root)
  return out
}

const isTest = (relative: string): boolean => /\.(test|spec)\.[cm]?[jt]sx?$/.test(relative)

/** 从 `(` 起按括号配平取出实参文本（上限 4000 字符，够长的调用点就该拆了）。 */
function callArguments(text: string, openParen: number): string {
  let depth = 0
  for (let index = openParen; index < text.length && index < openParen + 4_000; index += 1) {
    const char = text[index]
    if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth === 0) return text.slice(openParen + 1, index)
    }
  }
  return text.slice(openParen + 1, openParen + 4_000)
}

function scanWriters(): string[] {
  const findings: string[] = []
  for (const relative of listFiles()) {
    if (isTest(relative) || DESTINATION_OWNERS.has(relative)) continue
    const text = fs.readFileSync(path.join(repoRoot, relative), 'utf8')
    for (const match of text.matchAll(UPSERT_CALL)) {
      const args = callArguments(text, match.index + match[0].length - 1)
      const written = DESTINATION_FIELDS.filter((field) => new RegExp(`\\b${field}\\s*:`).test(args))
      if (written.length === 0) continue
      const line = text.slice(0, match.index).split('\n').length
      findings.push(`${relative}:${line} 把 ${written.join(' / ')} 写进一行 vendor —— 「key 去哪」只许在登记的 owner 里写（见本门岗 DESTINATION_OWNERS）`)
    }
  }
  return findings
}

async function scanBroadcastSchemas(): Promise<string[]> {
  const { MCP_TOOL_RESOLVER } = await import('../electron/capabilityCore/mcpToolCatalog')
  const findings: string[] = []
  for (const tool of MCP_TOOL_RESOLVER.list() as readonly { name: string; inputSchema?: { properties?: Record<string, unknown> } }[]) {
    const properties = tool.inputSchema?.properties ?? {}
    for (const field of TOOL_FIELDS) {
      if (field in properties) {
        findings.push(`${tool.name} 的 inputSchema 广播了 ${field} —— 密钥去向不是任何 MCP 工具的入参（§6.1）`)
      }
    }
  }
  return findings
}

function scanGuard(): string[] {
  const guard = path.join(repoRoot, 'electron/vendor/vendorOutboundGuard.ts')
  const text = fs.readFileSync(guard, 'utf8')
  // 认**调用**不认字符串：改个名字仍然含 "credentialBinding" 子串，而判据早就不跑了。
  const missing = ['judgeCredentialDestination(', 'readCredentialBinding('].filter((call) => !text.includes(call))
  return missing.length === 0
    ? []
    : [`electron/vendor/vendorOutboundGuard.ts 不再调用 ${missing.join(' / ')} —— 不变量没有执行端了`]
}

async function main(): Promise<void> {
  const findings = [...scanWriters(), ...(await scanBroadcastSchemas()), ...scanGuard()]
  if (findings.length > 0) {
    console.error(`✖ check:credential-origin：${findings.length} 处「密钥去向不由用户确认」：`)
    for (const finding of findings) console.error(`   · ${finding}`)
    console.error('  修法不是把文件加进 DESTINATION_OWNERS —— 先问「这一次写入，用户在哪一页上看见并同意过」。')
    process.exitCode = 1
    return
  }
  console.log('✅ check:credential-origin 通过（写门唯一 / 工具面不广播去向 / 守卫仍在）。')
}

void main()

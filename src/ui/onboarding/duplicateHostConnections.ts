/**
 * 「这个地址已经有连接了吗」——添加连接表单那行动态提示的**判据**（issue #831）。
 *
 * 抽成纯函数而不是塞进 OnboardingWizard：那个组件已经 777 行（R9 单文件 ≤800），
 * 而且这条判据必须和写入侧（electron/catalog/connectionVendorKey.ts）说同一句话 ——
 * 提示说「会新建独立连接」而实际去更新了旧连接，比不提示还糟。所以判据单独住、单独测。
 *
 * 三种结果（对应表单里同一行的三种文案，不新增元素、不新增样式）：
 *   · none    地址没被占 → 显示原来那句静态 hint
 *   · create  地址被占 + 名字不同 → 「此地址已有连接「X」：填不同名称会新建独立连接…」
 *   · update  地址被占 + 名字相同（或没填名字）→ 「保存会更新连接「X」的 Key」
 */
import { builtinVendorKeyOfKey, connectionHostScope, slugifyConnectionName } from '../../../electron/shared/builtinVendorIdentity'

export type DuplicateHostConnection = { vendorKey: string; name: string; baseUrl: string }

export type DuplicateHostVerdict =
  | { kind: 'none' }
  | { kind: 'create'; existingName: string }
  | { kind: 'update'; existingName: string }

/**
 * 表单当前这一刻该说哪一句。
 *
 * 只在 URL **真的解析得出 hostname** 时才给结论：用户敲到 `https://g` 时抖一下提示行
 * 会像个 bug（设计角评审点名的那条）。
 */
export function duplicateHostVerdict(input: {
  baseUrl: string
  name: string
  connections: readonly DuplicateHostConnection[]
}): DuplicateHostVerdict {
  const host = connectionHostScope(input.baseUrl)
  if (!host) return { kind: 'none' }

  const sameHost = input.connections.filter((connection) => connectionHostScope(connection.baseUrl) === host)
  if (sameHost.length === 0) return { kind: 'none' }

  const slug = slugifyConnectionName(input.name)
  // 名字为空 / slug 化后为空（纯中文名、纯符号）→ 写入侧会落到 host 那条连接上，
  // 也就是「更新」。两边必须是同一条判据（connectionVendorKey.ts 的规则 4）。
  const hostConnection =
    sameHost.find((connection) => builtinVendorKeyOfKey(connection.vendorKey) === connection.vendorKey) ?? sameHost[0]
  if (!slug) return { kind: 'update', existingName: hostConnection.name }

  const sameName = sameHost.find((connection) => slugifyConnectionName(connection.name) === slug)
  if (sameName) return { kind: 'update', existingName: sameName.name }

  return { kind: 'create', existingName: hostConnection.name }
}

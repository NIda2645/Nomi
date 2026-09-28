import type { ResultLocale } from './mcpToolResults'
import { CAPABILITY_TRANSPORT_PUBLIC_ERROR_CODES } from '../shared/surfacePortBinding'
import { INTEGRATION_ERROR_CODES } from '../shared/integrationContract'

type Ctx = { locale: ResultLocale }
const L = (ctx: Ctx, zh: string, en: string): string => (ctx.locale === 'en' ? en : zh)

/** A6 已知错误码 → 人话原因 + 恢复动作（只登记确证的码，不编造；未知码原样透传）。 */
const ERROR_HINT: Record<string, { zh: string; en: string; recover: Array<{ zh: string; en: string }> }> = {
  node_not_found: {
    zh: '目标画布节点已不存在或不在当前项目',
    en: 'The target canvas node is missing from the current project',
    recover: [{ zh: '先调用 canvas_read 刷新节点 id，再重试', en: 'Call canvas_read to refresh node ids, then retry' }],
  },
  unknown_node_kind: {
    zh: '画布快照含有 Nomi 当前不认识的节点类型，未写入',
    en: 'The canvas snapshot contains an unsupported node kind and was not written',
    recover: [{ zh: '修复或删除该节点后再保存', en: 'Repair or remove the node, then save again' }],
  },
  invalid_edge_mode: {
    zh: '连线模式无效，Nomi 没有静默改成普通引用',
    en: 'The edge mode is invalid; Nomi did not silently downgrade it',
    recover: [{ zh: '改用当前支持的 reference 模式重试', en: 'Retry with a supported reference mode' }],
  },
  // ── 准入层的拒绝（2026-09-21 那一刀新增，2026-09-22 接到这里）────────────────────────
  // 这一族的事实全在 `details`（allowedKeys / closestKey / allowedValues / min / max /
  // allowedVariantIds）——它们是键名与取值，语言中立；这里只出人话那一半，zh/en 两版。
  // MCP 2026-07-28：input validation error 归 tool execution error，客户端 SHOULD 交给模型自纠，
  // 而能自纠的前提正是这两半都到得了模型眼前。
  unknown_parameter: {
    zh: '这个模型不接受你写的那个参数键',
    en: 'This model does not accept the parameter key you sent',
    recover: [{ zh: '改用 allowedKeys 里的键（有 closestKey 就用它）后重试', en: 'Retry using a key from allowedKeys (prefer closestKey when present)' }],
  },
  parameter_type_mismatch: {
    zh: '参数类型不对',
    en: 'The parameter value has the wrong type',
    recover: [{ zh: '按 expectedType 改写该参数的值后重试', en: 'Rewrite the value to match expectedType, then retry' }],
  },
  parameter_not_in_enum: {
    zh: '参数取值不在这个模型的合法取值里',
    en: 'The parameter value is not one this model allows',
    recover: [{ zh: '从 allowedValues 里挑一个后重试', en: 'Pick one of allowedValues, then retry' }],
  },
  parameter_out_of_range: {
    zh: '参数取值超出这个模型声明的范围',
    en: 'The parameter value is outside the range this model declares',
    recover: [{ zh: '取 min 与 max 之间的值后重试', en: 'Use a value between min and max, then retry' }],
  },
  missing_required_parameter: {
    zh: '缺少这个模型的必填参数',
    en: 'A parameter this model requires is missing',
    recover: [{ zh: '补上 at 指出的那个参数后重试', en: 'Supply the parameter named in `at`, then retry' }],
  },
  unknown_variant: {
    zh: '这个变体不属于该模型',
    en: 'That variant does not belong to this model',
    recover: [{ zh: '从 allowedVariantIds 里挑一个；为空表示该模型没有变体，别传 variantId', en: 'Pick one of allowedVariantIds; empty means this model has no variants, so omit variantId' }],
  },
  contract_invalid: {
    zh: '这份生成计划过不了准入校验',
    en: 'This generation plan failed admission validation',
    recover: [{ zh: '按 details 指出的字段修正后重试', en: 'Fix the field named in details, then retry' }],
  },
  ambiguous_model_vendor: {
    zh: '这个模型名下有好几家供应商，没说是哪一家就取不出说明书',
    en: 'Two or more providers carry that modelId, so it is ambiguous which model you mean',
    recover: [{ zh: '补上 vendor（details.vendorsForModelId 列出了有哪几家）再查一次', en: 'Retry with vendor set to one of details.vendorsForModelId' }],
  },
  unknown_model_identity: {
    zh: '目录里没有这个模型，或它的类型挂不到这个节点上',
    en: 'The catalog has no such model, or its kind does not fit this node',
    recover: [
      { zh: '先用 nomi_read{target:"models"} 取薄名单，再用 target:"model" 查那一个的详情', en: 'Call nomi_read{target:"models"} for the thin list, then target:"model" for that one\'s detail' },
    ],
  },
  document_not_found: {
    zh: '找不到目标剧本文档',
    en: 'The target creation document was not found',
    recover: [{ zh: '先重新读取项目文档列表后重试', en: 'Refresh the project documents, then retry' }],
  },
  asset_not_localized: {
    zh: '参考素材还没落到本地，生成端拿不到它',
    en: 'A referenced asset is not localized yet, so the generator cannot read it',
    recover: [
      { zh: '在 Nomi 里打开该节点让素材完成本地化后重试', en: 'Open the node in Nomi to finish localizing the asset, then retry' },
    ],
  },
  // 接入会话（nomi_model_setup / nomi_read target=setup）的写前置条件。
  // 修复前这一族全是英文裸 Error，而且四种不同的失败共用同一句 "revision is stale" ——
  // 实测里 22 次失败调用有 6 次栽在这句话上，「stale」还把模型教向「那我别传了」，恰好最错。
  integration_session_not_found: {
    zh: '这个接入会话不存在（可能是 id 记错了，或它从来不在这台机器上）',
    en: 'That integration session does not exist on this machine',
    recover: [{ zh: '用 nomi_read（target=setup，不传 setupId）列出你的接入会话', en: 'List your setups with nomi_read (target=setup, no setupId)' }],
  },
  integration_owner_mismatch: {
    zh: '这个接入会话属于另一个客户端',
    en: 'That integration session belongs to a different client',
    recover: [{ zh: '用 nomi_read（target=setup）看你自己的接入会话，或用 nomi_model_setup action=connect_provider 建一个新的', en: 'List your own setups with nomi_read (target=setup), or start a new one with nomi_model_setup action=connect_provider' }],
  },
  integration_expected_revision_missing: {
    zh: '没传 expectedRevision——这不是过期，是缺字段',
    en: 'expectedRevision was not sent — this is a missing field, not a stale value',
    recover: [{ zh: '把上一次返回里的 revision 原样填进 expectedRevision', en: 'Copy the revision from the previous response into expectedRevision' }],
  },
  integration_revision_stale: {
    zh: '你手上的 expectedRevision 比服务端旧了（会话已经往前走了一步）',
    en: 'Your expectedRevision is behind the session; it has moved on',
    recover: [{ zh: '用 nomi_read（target=setup）重读会话再重试', en: 'Re-read the setup with nomi_read (target=setup) and retry' }],
  },
  integration_revision_ahead: {
    zh: '这个 expectedRevision Nomi 从来没发过——它是猜的（别自己 +1）',
    en: 'Nomi never issued that expectedRevision — do not increment it yourself',
    recover: [{ zh: '用 nomi_read（target=setup）重读会话，只用它返回的值', en: 'Re-read the setup with nomi_read (target=setup) and use only what it returns' }],
  },
  integration_stage_not_allowed: {
    zh: '会话当前阶段不接受这个动作',
    en: 'The session stage does not allow this action',
    recover: [{ zh: '用 nomi_read（target=setup）看 stage 和 nextAction，按它走', en: 'Read stage and nextAction with nomi_read (target=setup) and follow them' }],
  },
  integration_required_fields_missing: {
    zh: '这个 action 的必填字段没给全（错误里已经一次列全）',
    en: 'This action is missing required fields (all of them are listed in the message)',
    recover: [{ zh: '把消息里列出的字段一次补齐后重试', en: 'Send every field listed in the message, then retry' }],
  },
  // 2026-09-21：接入路径上最常撞的码，22 条 ERROR_HINT 里**一条都没有**——于是外部 AI
  // 拿到的只有一行裸码：没有字段名、没有合法值、没有下一步（实测 K6，4 次调用全栽在这里）。
  // 同一个 MCP 面上因此有两套错误质量：`nomi_model_setup` 那一档信封齐全，掉进本函数这一档
  // 就只剩一个词。补这条不是补文案，是把那半条路接回来。
  //
  // 合并 ① 同时删掉了本处另一条 `feature_disabled` 的人话条目：那个码连同 env flag、三段式
  // rollout 一起整条删除了（外部宿主发起生成现在默认就是开的），给一个抛不出来的码写人话，
  // 只会让这张表变成失真的第二份清单——而外部 AI 正是照着它学「Nomi 会怎么拒绝我」。
  capability_input_invalid: {
    zh: '参数不合法（被拒的字段名在 details 里；最常见的是把读侧的 vendorKey/modelKey 直接当成了生成侧的 providerId/modelId）',
    en: 'The arguments were rejected (the field names are in details; the usual cause is sending the read side\'s vendorKey/modelKey where the generation side wants providerId/modelId)',
    recover: [
      { zh: '用 nomi_read（target=models）重读，按它印出来的字段名原样填', en: 'Re-read with nomi_read (target=models) and use the exact field names it prints' },
      { zh: 'details 里点名了哪个字段就改哪个，别整包重猜', en: 'Fix the field details names; do not re-guess the whole payload' },
    ],
  },
  integration_session_limit_reached: {
    zh: '这台机器上没做完的接入会话已经占满上限，再建一条就会挤掉一条在做的活',
    en: 'This machine is at its limit of unfinished model setups; another one would evict work in progress',
    recover: [
      { zh: '用 nomi_read（target=setup）看你的接入会话', en: 'List your setups with nomi_read (target=setup)' },
      { zh: '用 nomi_model_setup action=cancel 取消不再需要的那条后重试', en: 'Cancel one you no longer need with nomi_model_setup action=cancel, then retry' },
    ],
  },
  renderer_or_provider_unknown: {
    zh: '找不到能执行这次生成的渲染器或供应商配置',
    en: 'No renderer or provider configuration can execute this generation',
    recover: [
      { zh: '用 nomi_read（target=models）核对可用模型后换一个', en: 'Check available models with nomi_read (target=models) and switch' },
      { zh: '在 Nomi 设置里补齐该供应商的接入', en: 'Complete the provider setup in Nomi settings' },
    ],
  },
}

/** User projection deliberately has only four actions; protocol codes stay in structuredContent for machines. */
const USER_ACTION_HINT: Record<string, { action: string; zh: string; en: string }> = {
  // 2026-09-21：这个码不止用在生成上（降档、闸决定都会抛它），原话「确认这次生成」会让助手
  // 去找一张根本不会出现的生成确认卡。改成中性的一句：要你本人在 Nomi 里确认一次。
  human_approval_required: { action: 'in_nomi', zh: '这一步要你本人在 Nomi 里确认一次。', en: 'This step needs you to confirm it once in Nomi.' },
  receipt_invalid: { action: 'in_nomi', zh: '这次确认已失效，请在 Nomi 重新确认。', en: 'This confirmation is no longer valid; confirm again in Nomi.' },
  receipt_expired: { action: 'in_nomi', zh: '确认已过期，请在 Nomi 重新确认。', en: 'The confirmation expired; confirm again in Nomi.' },
  lease_required: { action: 'reselect_project', zh: '请重新选择当前项目。', en: 'Select the current project again.' },
  lease_invalid: { action: 'reselect_project', zh: '项目连接已失效，请重新选择当前项目。', en: 'The project connection expired; select the current project again.' },
  project_scope_changed: { action: 'reselect_project', zh: '项目范围已变化，请重新选择项目。', en: 'The project scope changed; select the project again.' },
  project_binding_stale: { action: 'reselect_project', zh: '项目身份已变化，请重新选择当前项目。', en: 'The project identity changed; select the current project again.' },
  lease_expired: { action: 'reselect_project', zh: '项目连接已过期，请重新选择当前项目。', en: 'The project connection expired; select the current project again.' },
  lease_revoked: { action: 'reselect_project', zh: '项目连接已撤销，请重新选择当前项目。', en: 'The project connection was revoked; select the current project again.' },
}

const OPEN_NEW_PROJECT_SESSION = 'Open a new project session and retry'

/** 资源找不到那一档：码本身就是全部公开信息，不带任何私有路径/供应商原文。 */
const NOT_FOUND_CODES = [
  'node_not_found', 'unknown_node_kind', 'invalid_edge_mode', 'document_not_found', 'project_not_found',
] as const

/** 项目会话那一档：得重选项目 / 重开会话。 */
const PROJECT_SESSION_CODES = [
  'project_session_unavailable', 'project_selection_denied',
  'lease_required', 'lease_invalid', 'lease_expired', 'lease_revoked', 'project_scope_changed',
] as const

/**
 * C4：这两份以前各手抄了一遍传输层码表（42 码 / 20 码），`POLICY_CODES` 还连
 * `INTEGRATION_ERROR_CODES` 那 7 个码一起抄。整张表在仓库里有 15 份定义，拆一个码要改 15 处。
 * 现在只从 owner spread，本文件只列自己这一层独有的分档。
 *
 * These typed failures may wrap private disk/provider causes; the code is their whole public message.
 */
const SAFE_CANVAS_READ_CODES = new Set<string>([
  ...CAPABILITY_TRANSPORT_PUBLIC_ERROR_CODES,
  ...NOT_FOUND_CODES,
])

/** 准入层拒绝码（`ParameterRejectionCode` + 画布模型身份）。登记进策略码表，`errorCode` 才不是 null。 */
const ADMISSION_CODES = [
  'unknown_parameter', 'parameter_type_mismatch', 'parameter_not_in_enum',
  'parameter_out_of_range', 'missing_required_parameter', 'unknown_variant',
  'contract_invalid', 'unknown_model_identity', 'ambiguous_model_vendor',
] as const

const POLICY_CODES = new Set<string>([
  ...ADMISSION_CODES,
  ...SAFE_CANVAS_READ_CODES,
  ...PROJECT_SESSION_CODES,
  ...INTEGRATION_ERROR_CODES,
  'mcp_connection_unauthenticated',
  // 2026-09-21：`feature_disabled` / `phase_not_ready` 随 env flag 与三段式 rollout 一起删除
  // （`rpcError.ts` 的 `RpcPolicyErrorCode` 就是那份真相源）。`not_ready` 留着，但它现在只说
  // 「这个装配点没装那个处理器」。
  'legacy_path_forbidden', 'not_ready',
  'human_approval_required', 'receipt_invalid', 'receipt_expired',
])

/** A6 · 错误 → 人话原因 + 恢复动作 + 诊断信息（未知错误不编内容，原样透传 message）。 */
export function buildToolErrorOutcome(
  toolName: string,
  error: unknown,
  locale: ResultLocale = 'zh-CN',
): { text: string; outcome: Record<string, unknown> } {
  const ctx: Ctx = { locale }
  const rawMessage = error instanceof Error ? error.message : String(error)
  const errorRecord = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const structuredCode = typeof errorRecord.code === 'string'
    ? errorRecord.code
    : typeof errorRecord.errorCode === 'string' ? errorRecord.errorCode : null
  const code = structuredCode && POLICY_CODES.has(structuredCode)
    ? structuredCode
    : Object.keys(ERROR_HINT).find((key) => rawMessage.includes(key)) || null
  const hintForMessage = code ? ERROR_HINT[code] : null
  const message = structuredCode && SAFE_CANVAS_READ_CODES.has(structuredCode)
    ? structuredCode
    // 有登记过 zh/en 人话时 `message` 也跟着 locale 走：否则 en 宿主拿到的是中文原句（R15）。
    // 没登记的码仍原样透传 rawMessage（不编内容）。
    : hintForMessage ? L(ctx, hintForMessage.zh, hintForMessage.en) : rawMessage
  const nextAction = typeof errorRecord.nextAction === 'string'
    ? errorRecord.nextAction
    : structuredCode && USER_ACTION_HINT[structuredCode]?.action === 'reselect_project'
      ? OPEN_NEW_PROJECT_SESSION
      : undefined
  const policyDetails = structuredCode && POLICY_CODES.has(structuredCode)
    ? {
        ...(nextAction ? { nextAction } : {}),
        // `phase` 随三段式 rollout 一起删除（2026-09-21）：没有生产者了，再透传就是永远为空的一格。
        ...(typeof errorRecord.capability === 'string' ? { capability: errorRecord.capability } : {}),
      }
    : {}
  // 可执行细节（currentRevision / missing 字段名…）。人话原因说的是「哪一类错」，
  // 细节说的是「该拿什么值」——只有后者能让模型不用再猜。
  const details = errorRecord.details && typeof errorRecord.details === 'object' && !Array.isArray(errorRecord.details)
    ? errorRecord.details as Record<string, string | number>
    : null
  const hint = code ? ERROR_HINT[code] : null
  const userAction = code ? USER_ACTION_HINT[code] : null
  const recover = hint ? hint.recover.map((r) => L(ctx, r.zh, r.en)) : []
  const text = [
    `✗ ${userAction ? L(ctx, userAction.zh, userAction.en) : hint ? L(ctx, hint.zh, hint.en) : message}`,
    userAction ? null : code ? `${L(ctx, '诊断', 'diagnostic')} ${code}` : null,
    details ? Object.entries(details).map(([key, value]) => `${key}=${value}`).join(' ') : null,
    ...(!userAction ? recover.map((line, index) => `${index + 1}. ${line}`) : []),
  ].filter(Boolean).join('\n')
  return {
    text,
    outcome: {
      kind: 'error', tool: toolName, errorCode: code, message,
      ...(details ? { details } : {}),
      recoveryActions: userAction ? [L(ctx, userAction.zh, userAction.en)] : recover,
      ...(userAction ? { nextActions: [userAction.action] } : {}),
      ...policyDetails,
    },
  }
}

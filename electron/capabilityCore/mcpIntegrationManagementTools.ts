const str = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * 管理已接入连接的后端动词；UI 仍需另出样张，本班不改 UI。
 *
 * **地址与鉴权放法不在这张表上**（2026-09-18）：`baseUrl / authType / authHeader / authQueryParam`
 * 曾经是这里的入参，于是 MCP 面上广播着「把已存 key 的连接改寄到哪」的能力。密钥去向只由用户在
 * 贴 key 页按下保存那一刻绑定（§6.1），`check:credential-origin` 盯着这张 schema 不许它们回来。
 */
export const MCP_INTEGRATION_MANAGEMENT_TOOL = {
  name: 'nomi_integration_manage',
  title: '管理模型连接',
  description: '只收公开配置；密钥只能在 Nomi 安全页管理。',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['update_vendor', 'delete_vendor', 'delete_model', 'set_proxy'] },
      vendorKey: { type: 'string', minLength: 1, maxLength: 160 },
      modelKey: { type: 'string', minLength: 1, maxLength: 160 },
      name: { type: 'string', minLength: 1, maxLength: 240 },
      providerKind: { type: 'string', maxLength: 80 },
      enabled: { type: 'boolean' },
    },
    required: ['action', 'vendorKey'],
    additionalProperties: false,
  },
  method: 'integration.manage.update_vendor',
  resolveMethod: (a: Record<string, unknown>): string => `integration.manage.${str(a.action) || 'update_vendor'}`,
  build: (a: Record<string, unknown>): Record<string, unknown> => ({
    action: a.action,
    vendorKey: a.vendorKey,
    ...(typeof a.modelKey === 'string' ? { modelKey: a.modelKey } : {}),
    ...(typeof a.name === 'string' ? { name: a.name } : {}),
    ...(typeof a.providerKind === 'string' ? { providerKind: a.providerKind } : {}),
    ...(typeof a.enabled === 'boolean' ? { enabled: a.enabled } : {}),
  }),
} as const

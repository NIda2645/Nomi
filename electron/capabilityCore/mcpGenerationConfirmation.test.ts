import { describe, expect, it, vi } from 'vitest'

import { createMcpProtocol, type GenerationGateChallengeProjection, type McpTransport } from './mcpProtocol'

const challenge: GenerationGateChallengeProjection = {
  challengeId: 'challenge-1',
  nonce: 'nonce-1',
  projectName: '短片 A',
  shotSummary: '生成这一镜',
  model: 'model-x',
  referenceCount: 2,
  costScope: 'generation_submit',
  maximumCost: 5,
  currency: '¥',
  expiresAt: '2026-08-23T01:00:00.000Z',
  confirmationText: '允许 Nomi 在项目《短片 A》中使用模型 model-x，最多花费 ¥5，生成这一镜吗？',
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function initialized(transport: McpTransport) {
  const protocol = createMcpProtocol(transport)
  protocol.handleIncoming({
    id: 1,
    method: 'initialize',
    params: { capabilities: { elicitation: {} }, clientInfo: { name: 'Codex' } },
  })
  await tick()
  return protocol
}

describe('one generation challenge, two confirmation surfaces', () => {
  it('uses one registered client elicitation accept and never calls the GUI', async () => {
    const frames: unknown[] = []
    const transport: McpTransport = {
      send: (frame) => frames.push(frame),
      invoke: vi.fn(async () => ({})),
      isAppOpen: () => true,
      getAuthenticatedClient: () => 'codex',
      verifyClientGenerationConfirmation: vi.fn(async (_challenge, attestation) => attestation === 'attestation-1'),
      confirmGenerationInNomi: vi.fn(async () => true),
    }
    const protocol = await initialized(transport)
    const resultPromise = protocol.requestGenerationConfirmation(challenge)
    await tick()
    const request = frames.find((frame) => (frame as { method?: string }).method === 'elicitation/create') as { id: string; params: { message: string } }
    expect(request.params.message).toContain('最多花费 ¥5')
    protocol.handleIncoming({ id: request.id, result: { action: 'accept', content: { confirm: true, attestation: 'attestation-1' } } })

    await expect(resultPromise).resolves.toEqual({
      challengeId: 'challenge-1', confirmed: true, surface: 'client', nextAction: 'in_client',
    })
    expect(transport.confirmGenerationInNomi).not.toHaveBeenCalled()
  })

  it('uses the same challenge in Nomi when the client cannot prove its registered channel', async () => {
    const confirmGenerationInNomi = vi.fn(async (received: GenerationGateChallengeProjection) => {
      expect(received).toBe(challenge)
      return true
    })
    const frames: unknown[] = []
    const protocol = await initialized({
      send: (frame) => frames.push(frame),
      invoke: vi.fn(async () => ({})),
      isAppOpen: () => true,
      confirmGenerationInNomi,
    })

    await expect(protocol.requestGenerationConfirmation(challenge)).resolves.toEqual({
      challengeId: 'challenge-1', confirmed: true, surface: 'nomi', nextAction: 'in_nomi',
    })
    await expect(protocol.requestGenerationConfirmation(challenge)).resolves.toEqual({
      challengeId: 'challenge-1', confirmed: true, surface: 'nomi', nextAction: 'in_nomi',
    })
    expect(frames.some((frame) => (frame as { method?: string }).method === 'elicitation/create')).toBe(false)
    expect(confirmGenerationInNomi).toHaveBeenCalledTimes(1)
  })

  it('uses one GUI fallback card for a semantic challenge and returns its receipt', async () => {
    const confirmGenerationInNomi = vi.fn(async (received: GenerationGateChallengeProjection) => {
      expect(received.handoff).toMatchObject({ clientAttestation: true, challengeToken: 'challenge-token' })
      return { confirmed: true, receiptId: 'receipt-gui-semantic', receiptToken: 'token-gui-semantic' }
    })
    const protocol = createMcpProtocol({
      send: () => undefined,
      invoke: vi.fn(async () => ({})),
      isAppOpen: () => true,
      getAuthenticatedClient: () => 'codex',
      confirmGenerationInNomi,
    })
    await expect(protocol.requestGenerationConfirmation({ ...challenge, handoff: { clientAttestation: true, challengeToken: 'challenge-token' } })).resolves.toMatchObject({
      surface: 'nomi', confirmed: true, receiptId: 'receipt-gui-semantic', receiptToken: 'token-gui-semantic',
    })
    expect(confirmGenerationInNomi).toHaveBeenCalledTimes(1)
  })

  it('accepts one registered client confirm:true on the outstanding challenge without opening Nomi', async () => {
    const confirmGenerationInNomi = vi.fn(async () => ({ confirmed: true, receiptId: 'receipt-1' }))
    const frames: unknown[] = []
    const protocol = await initialized({
      send: (frame) => frames.push(frame),
      invoke: vi.fn(async () => ({})),
      isAppOpen: () => true,
      getAuthenticatedClient: () => 'cursor',
      confirmGenerationInNomi,
    })
    const resultPromise = protocol.requestGenerationConfirmation(challenge)
    await tick()
    const request = frames.find((frame) => (frame as { method?: string }).method === 'elicitation/create') as { id: string }
    protocol.handleIncoming({ id: request.id, result: { action: 'accept', content: { confirm: true } } })
    await expect(resultPromise).resolves.toEqual({
      challengeId: 'challenge-1', confirmed: true, surface: 'client', nextAction: 'in_client',
    })
    await expect(protocol.requestGenerationConfirmation(challenge)).resolves.toMatchObject({
      challengeId: 'challenge-1', confirmed: true, surface: 'client', nextAction: 'in_client',
    })
    expect(confirmGenerationInNomi).not.toHaveBeenCalled()
  })

  it('does not downgrade an invalid optional attestation to client approval', async () => {
    const confirmGenerationInNomi = vi.fn(async () => ({ confirmed: true, receiptId: 'receipt-2' }))
    const frames: unknown[] = []
    const protocol = await initialized({
      send: (frame) => frames.push(frame),
      invoke: vi.fn(async () => ({})),
      isAppOpen: () => true,
      getAuthenticatedClient: () => 'claude',
      verifyClientGenerationConfirmation: vi.fn(async () => false),
      confirmGenerationInNomi,
    })
    const resultPromise = protocol.requestGenerationConfirmation(challenge)
    await tick()
    const request = frames.find((frame) => (frame as { method?: string }).method === 'elicitation/create') as { id: string }
    protocol.handleIncoming({ id: request.id, result: { action: 'accept', content: { confirm: true, attestation: 'invalid' } } })
    await expect(resultPromise).resolves.toMatchObject({
      challengeId: 'challenge-1', confirmed: true, surface: 'nomi', nextAction: 'in_nomi', receiptId: 'receipt-2',
    })
    expect(confirmGenerationInNomi).toHaveBeenCalledTimes(1)
  })

  it('does not create a receipt surface when neither client nor GUI can confirm', async () => {
    const protocol = await initialized({
      send: () => undefined,
      invoke: vi.fn(async () => ({})),
      isAppOpen: () => false,
    })

    await expect(protocol.requestGenerationConfirmation(challenge)).resolves.toEqual({
      challengeId: 'challenge-1', confirmed: false, surface: 'none', nextAction: 'in_nomi',
    })
  })

  it('uses a registered client receipt channel for semantic generation challenges without a second GUI click', async () => {
    const frames: unknown[] = []
    const verifyClientGenerationConfirmation = vi.fn(async (_challenge: GenerationGateChallengeProjection, attestation: unknown) => {
      expect(attestation).toEqual('signed-client-attestation')
      return { confirmed: true, receiptId: 'receipt-semantic-1', receiptToken: 'token-semantic-1' }
    })
    const confirmGenerationInNomi = vi.fn(async () => ({ confirmed: true, receiptId: 'receipt-gui' }))
    const protocol = await initialized({
      send: (frame) => frames.push(frame),
      invoke: vi.fn(async () => ({})),
      isAppOpen: () => true,
      getAuthenticatedClient: () => 'codex',
      verifyClientGenerationConfirmation,
      confirmGenerationInNomi,
    })
    const resultPromise = protocol.requestGenerationConfirmation({ ...challenge, handoff: { clientAttestation: true, challengeToken: 'challenge-token' } })
    await tick()
    const request = frames.find((frame) => (frame as { method?: string }).method === 'elicitation/create') as { id: string }
    protocol.handleIncoming({ id: request.id, result: { action: 'accept', content: { confirm: true, attestation: 'signed-client-attestation' } } })
    await expect(resultPromise).resolves.toMatchObject({ surface: 'client', receiptId: 'receipt-semantic-1', receiptToken: 'token-semantic-1' })
    expect(confirmGenerationInNomi).not.toHaveBeenCalled()
    expect(verifyClientGenerationConfirmation).toHaveBeenCalledTimes(1)
  })

  it('routes a bare semantic client accept to the same GUI challenge', async () => {
    const frames: unknown[] = []
    const verifyClientGenerationConfirmation = vi.fn(async () => ({ confirmed: true, receiptId: 'should-not-be-used' }))
    const confirmGenerationInNomi = vi.fn(async (received: GenerationGateChallengeProjection) => {
      expect(received.handoff).toMatchObject({ clientAttestation: true, challengeToken: 'challenge-token' })
      return { confirmed: true, receiptId: 'receipt-gui' }
    })
    const protocol = await initialized({
      send: (frame) => frames.push(frame),
      invoke: vi.fn(async () => ({})),
      isAppOpen: () => true,
      getAuthenticatedClient: () => 'codex',
      verifyClientGenerationConfirmation,
      confirmGenerationInNomi,
    })
    const resultPromise = protocol.requestGenerationConfirmation({ ...challenge, handoff: { clientAttestation: true, challengeToken: 'challenge-token' } })
    await tick()
    const request = frames.find((frame) => (frame as { method?: string }).method === 'elicitation/create') as { id: string }
    protocol.handleIncoming({ id: request.id, result: { action: 'accept', content: { confirm: true } } })
    await expect(resultPromise).resolves.toMatchObject({ surface: 'nomi', receiptId: 'receipt-gui' })
    expect(confirmGenerationInNomi).toHaveBeenCalledTimes(1)
    expect(verifyClientGenerationConfirmation).not.toHaveBeenCalled()
  })

  it('treats client decline as no approval and keeps the challenge identity', async () => {
    const frames: unknown[] = []
    const protocol = await initialized({
      send: (frame) => frames.push(frame),
      invoke: vi.fn(async () => ({})),
      isAppOpen: () => true,
      getAuthenticatedClient: () => 'claude',
    })
    const resultPromise = protocol.requestGenerationConfirmation(challenge)
    await tick()
    const request = frames.find((frame) => (frame as { method?: string }).method === 'elicitation/create') as { id: string }
    protocol.handleIncoming({ id: request.id, result: { action: 'decline' } })
    await expect(resultPromise).resolves.toMatchObject({ challengeId: 'challenge-1', confirmed: false, surface: 'client' })
  })
})

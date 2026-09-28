import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { LaneInputMessage } from './laneDesktopContracts'
import type { LaneDraftInput } from './laneContracts'

declare module '@earendil-works/pi-agent-core' {
  interface CustomAgentMessages {
    nomiInput: LaneInputMessage
  }
}

export function isLaneInputMessage(message: AgentMessage): message is LaneInputMessage {
  return message.role === 'nomi.input'
}

/** Both queue cancellation and stop return the input captured by pi, including attachment identities. */
export function draftInputFromMessage(message: AgentMessage): LaneDraftInput {
  const content = 'content' in message ? message.content : undefined
  const text = typeof content === 'string' ? content : Array.isArray(content)
    ? content.flatMap((part) => part.type === 'text' ? [part.text] : []).join('') : ''
  const attachments = isLaneInputMessage(message) ? message.context.attachments : undefined
  const context = isLaneInputMessage(message) ? message.context : undefined
  const intent = context && Object.fromEntries(['documentId', 'target', 'preconditions', 'contextSnapshot', 'systemPrompt', 'storyboardTarget']
    .filter(key => context[key as keyof typeof context] !== undefined)
    .map(key => [key, structuredClone(context[key as keyof typeof context])]))
  return { text,
    ...(intent && Object.keys(intent).length ? { intent } : {}),
    ...(context?.displayText ? { displayText: context.displayText } : {}),
    ...(context?.skillKey ? { skillKey: context.skillKey } : {}),
    ...(context?.skillSnapshot ? { skillSnapshot: structuredClone(context.skillSnapshot) } : {}),
    ...(attachments?.length ? { attachments: structuredClone(attachments) } : {}) }
}

import { sendWorkbenchAiMessage } from './workbenchAiClient'
import { getAssistantModelPref } from './assistantModelPref'
import type { AgentAttachmentPayload, AgentsChatResponseDto } from '../../api/desktopClient'

export const AGENT_LOOP_MODE = { singleShot: 'single-shot', multiTurn: 'multi-turn' } as const
export type AgentLoopMode = (typeof AGENT_LOOP_MODE)[keyof typeof AGENT_LOOP_MODE]

export type SingleShotAgentRequest = {
  /** Attribution only; never used as a durable conversation binding. */
  featureKey: string
  prompt: string
  displayPrompt: string
  projectId?: string
  skillKey: string
  skillName: string
  attachments?: AgentAttachmentPayload[]
}

/** One step and zero tools. The feature key is mapped to a durable project/thread
 * binding so a restart cannot silently fork the conversation owner. */
export async function runSingleShotAgent(request: SingleShotAgentRequest): Promise<AgentsChatResponseDto> {
  const pref = getAssistantModelPref()
  const durableProject = request.projectId || request.featureKey.replace(/[^A-Za-z0-9._-]/g, '_')
  return sendWorkbenchAiMessage({
    prompt: request.prompt,
    displayPrompt: request.displayPrompt,
    featureKey: request.featureKey,
    capability: 'single-shot',
    history: { kind: 'persistent', binding: { sessionKey: `nomi:workbench:${durableProject}:creation`, threadId: request.featureKey } },
    ...(request.projectId ? { projectId: request.projectId } : {}),
    skillKey: request.skillKey,
    skillName: request.skillName,
    mode: 'chat',
    ...(pref ? { agentModelKey: pref.modelKey, agentVendorKey: pref.vendorKey } : {}),
    ...(request.attachments?.length ? { attachments: request.attachments } : {}),
  }, {})
}

import { storyboardShotIdsForTarget, isStoryboardReference } from '../resident/residentReferences'
import { listAvailableModelsForAgent } from "../../generationCanvas/agent/availableModels"
// Composer intent and input remain local; the lane owns execution and approvals.
import React from 'react'
import { useTranslation } from 'react-i18next'
import type { DocumentAnchorRef, PreconditionSet, TargetRef } from '../../../../electron/shared/capabilityTargeting'
import { laneClient, type LaneCommandResult } from '../lane/laneClient'
import { useWorkbenchStore } from '../../workbenchStore'
import { useGenerationCanvasStore } from '../../generationCanvas/store/generationCanvasStore'
import { timelineRevision } from '../../timeline/kernel/timelineKernel'
import { getDocumentSessionPort } from '../../project/documentSessionPort'
import { projectAgentAttachmentClaims } from '../projectAgentAttachments'
import { restoreProjectAgentInputs } from '../projectAgentDraftRecovery'
import { buildResidentContextSnapshot, type AgentContextSnapshot } from '../resident/residentContextSnapshot'
import { composeResidentSystemPrompt } from '../resident/residentPromptSelection'
import { friendlyError, type ResidentSurface } from '../resident/residentShellDisplay'
import { LaneCommandFailure } from '../lane/laneCommandFailure'
import { buildStaticAgentSystemPrompt } from '../../generationCanvas/agent/canvasSystemPrompt'
import { getCreationAiMode } from '../../creation/creationAiModes'
import { runProposalUndo, getCommittedProposal } from '../../generationCanvas/agent/proposalUndo'
import { undoableLaneToolCallId } from '../lane/laneReceiptUndo'
import type { PermissionTier } from './agentPanelV4Types'
import { approvalPolicyForTier } from './agentPanelV4Logic'
import type { AgentPanelV4Data } from './useAgentPanelV4Data'
import type { LibraryPrompt } from '../../api/promptLibraryApi'
import { readCreationRunSelection } from '../../creation/storyboard/useCreationRunPlans'
import type { StoryboardRequestTarget } from '../../../../electron/shared/agentCapabilities/generationInvocationContext'
import { laneConversationOf } from '../../../../electron/shared/agentLane/laneConversation'

type ResidentSendContext = Readonly<{
  snapshot: AgentContextSnapshot
  activeDocumentId: string
  selectedNodeIds: readonly string[]
  selectedClipIds: readonly string[]
  documentState: Readonly<{ revision: number; contentHash: string; anchor: DocumentAnchorRef }>
}>

/**
 * 在 enqueue **前的同一个同步回合里**把所有域选中读一遍。
 * composer 绝不能发一个「用户打字期间已经变了的」渲染期选中：这份快照由纯构造器冻结，
 * 随请求一起走。
 */
function captureSendContext(surface: ResidentSurface): ResidentSendContext {
  const workbench = useWorkbenchStore.getState()
  const canvas = useGenerationCanvasStore.getState()
  const activeDocumentId = workbench.activeDocumentId
  const document = workbench.workbenchDocuments.find((item) => item.id === activeDocumentId)
  // 文稿状态由项目会话层 owner 给，不看页面身份：画布/预览面上一样能读、能整篇追加。
  // 在创作页它带光标锚，在别的面是 whole-document——两种都是当下真实的、可验的前提。
  const documentState = getDocumentSessionPort().readState()
  const selectedNodeIds = surface === 'generation' ? Object.freeze([...canvas.selectedNodeIds]) : Object.freeze([])
  const selectedClipIds = surface === 'preview' ? Object.freeze([...workbench.selectedTimelineClipIds]) : Object.freeze([])
  const snapshot = buildResidentContextSnapshot({
    document: document
      ? {
          id: document.id,
          revision: documentState.revision,
          anchor: documentState.anchor,
          title: document.title,
        }
      : null,
    canvas: surface === 'generation'
      ? { revision: canvas.persistRevision, nodes: canvas.nodes, selectedNodeIds }
      : null,
    timeline: surface === 'preview'
      ? {
          revision: timelineRevision(workbench.timeline),
          fps: workbench.timeline.fps,
          clips: workbench.timeline.tracks.flatMap((track) => track.clips),
          selectedClipIds,
        }
      : null,
  })
  return Object.freeze({ snapshot, activeDocumentId, selectedNodeIds, selectedClipIds, documentState })
}

export type AgentPanelV4Actions = Readonly<{
  error: string
  clearError: () => void
  /** True means the lane accepted the input, not that the model or generation succeeded. */
  send: (text: string, options?: { newStoryboard?: boolean; skillKey?: string; displayText?: string; continueFromEntryId?: string; retryFromEntryId?: string; choice?: 'primary' | 'secondary' }) => Promise<boolean>
  stop: () => void
  approve: () => void
  reject: (reason?: string) => void
  /** Allow this capability for this lane session; never widens project policy. */
  stopAsking: () => void
  answerOption: (option: string) => void
  queueAction: (rowIndex: number, action: string) => void
  queueInterrupt: (rowIndex: number) => void
  newThread: () => void
  activateThread: (threadId: string) => void
  removeThread: (threadId: string) => void
  undoTool: (toolCallId: string) => void
  selectedLibraryPrompt: LibraryPrompt | null
  setSelectedLibraryPrompt: (prompt: LibraryPrompt | null) => void
  permission: PermissionTier
  setPermission: (tier: PermissionTier) => void
}>

export function useAgentPanelV4Actions(surface: ResidentSurface, data: AgentPanelV4Data): AgentPanelV4Actions {
  const { t } = useTranslation()
  const [error, setError] = React.useState('')
  const pendingAdmission = React.useRef<{ id: string; address: ReturnType<typeof laneClient.conversation>; dispatched: boolean } | null>(null)
  const selectedLibraryPrompt = useWorkbenchStore((state) => state.selectedLibraryPrompt)
  const setSelectedLibraryPrompt = useWorkbenchStore((state) => state.setSelectedLibraryPrompt)
  const setDraft = useWorkbenchStore((state) => state.setProjectAgentDraft)
  const approvalPolicy = useWorkbenchStore((state) => state.projectAgentApprovalPolicy)
  const setApprovalPolicy = useWorkbenchStore((state) => state.setProjectAgentApprovalPolicy)
  const owner = laneClient.context()
  const visibleConversation = laneConversationOf(data.snapshot)
  const visibleAddress = React.useMemo(() => owner && visibleConversation && data.snapshot.workspaceId === owner.subscriptionId
    ? { ...visibleConversation, workspaceId: owner.subscriptionId } : undefined, [owner, visibleConversation, data.snapshot.workspaceId])
  const checked = React.useCallback(async (command: Promise<LaneCommandResult>) => {
    const draftRevision = useWorkbenchStore.getState().projectAgentDraftRevision
    const result = await command
    if (!result.ok) throw new LaneCommandFailure(result.code, result.diagnostic)
    if (result.restoredInput?.length && visibleAddress && owner) {
      const current = laneClient.conversation()
      restoreProjectAgentInputs(owner.binding.immutableProjectUuid, visibleAddress, result.restoredInput, current?.workspaceId === visibleAddress.workspaceId
        && current.laneName === visibleAddress.laneName && current.sessionId === visibleAddress.sessionId
        && useWorkbenchStore.getState().projectAgentDraftRevision === draftRevision)
    }
    return result
  }, [owner, visibleAddress])
  const run = React.useCallback((command: () => Promise<unknown>) => {
    void command().catch((caught: unknown) => setError(friendlyError(caught, t)))
  }, [t])

  const send = React.useCallback(async (rawText: string, options?: { newStoryboard?: boolean; skillKey?: string; displayText?: string; continueFromEntryId?: string; retryFromEntryId?: string; choice?: 'primary' | 'secondary' }) => {
    const text = rawText.trim()
    if (!text) return false
    setError('')
    const state = useWorkbenchStore.getState()
    if (state.projectAgentAdmissionId) return false
    const replaying = Boolean(options?.retryFromEntryId || options?.continueFromEntryId)
    const capturedDraftRevision = state.projectAgentDraftRevision
    const capturedSkill = replaying ? null : state.creationActiveSkill
    const capturedPrompt = replaying ? null : state.selectedLibraryPrompt
    const capturedAttachments = replaying ? [] : [...state.projectAgentAttachments]
    const capturedIntent = replaying ? null : state.projectAgentDraftIntent
    if (capturedAttachments.some((attachment) => attachment.status === 'uploading')) {
      setError(t('creationAi.attachmentsUploading'))
      return false
    }
    if (capturedAttachments.some((attachment) => attachment.status === 'error')) {
      setError(t('agentLaneError.agent_lane_original_media_unavailable'))
      return false
    }
    const admissionId = crypto.randomUUID()
    useWorkbenchStore.setState({ projectAgentAdmissionId: admissionId })
    pendingAdmission.current = { id: admissionId, address: laneClient.conversation(), dispatched: false }
    try {
      const captured = captureSendContext(surface)
      const projectId = laneClient.context()?.binding.projectId
      const selectedRun = surface === 'creation' && !options?.newStoryboard ? readCreationRunSelection(projectId) : null
      const capturedReferences = selectedRun ? state.projectAgentReferences.filter(isStoryboardReference) : []
      const selectedShotIds = selectedRun ? storyboardShotIdsForTarget(capturedReferences, {documentId:captured.activeDocumentId,runId:selectedRun.runId}) : undefined
      const storyboardTarget: StoryboardRequestTarget | undefined = surface === 'creation' && projectId && captured.activeDocumentId ? Object.freeze({
        projectId, sourceDocumentId: captured.activeDocumentId,
        sourceDocumentRevision: selectedRun?.sourceDocumentRevision ?? captured.documentState.revision,
        sourceDocumentContentHash: selectedRun?.sourceDocumentContentHash ?? captured.documentState.contentHash,
        targetRunId: selectedRun?.runId ?? `op-${crypto.randomUUID()}`, targetKind: 'storyboard', requestId: admissionId,
        ...(selectedRun ? { expectedRevision: selectedRun.revision } : {}),
        ...(selectedShotIds ? {shotIds:selectedShotIds} : {}),
      }) : undefined
      // Start both reads in this synchronous input turn; prepareInput binds its own
      // opening epoch before either promise can settle or the user can switch projects.
      const [conversation, availableModels] = await Promise.all([laneClient.prepareInput().then(address => {
        if (pendingAdmission.current?.id === admissionId) pendingAdmission.current.address = address
        return address
      }), listAvailableModelsForAgent()])
      const stillCurrent = () => {
        const current = laneClient.conversation()
        return conversation !== null && current !== null && current.laneName === conversation.laneName
          && current.sessionId === conversation.sessionId && current.workspaceId === conversation.workspaceId
      }
      if (!stillCurrent() || useWorkbenchStore.getState().projectAgentAdmissionId !== admissionId) return false
      // 文稿前提永远带上（owner 给的）；target 仍按「用户此刻站在哪个面」选。
      const preconditions: PreconditionSet = { document: {
        revision: captured.documentState.revision, contentHash: captured.documentState.contentHash,
      } }
      const target: TargetRef = surface === 'preview' ? { kind: 'timeline', clipIds: captured.selectedClipIds }
        : surface === 'generation' ? { kind: 'canvas', nodeIds: captured.selectedNodeIds }
          : { kind: 'document', documentId: captured.activeDocumentId, anchor: captured.documentState.anchor }
      const surfacePrompt = surface === 'generation' ? buildStaticAgentSystemPrompt('agent')
        : surface === 'preview' ? buildStaticAgentSystemPrompt('agent', 'timeline')
          : !capturedSkill ? getCreationAiMode(state.creationAiModeId).prompt : undefined
      pendingAdmission.current!.dispatched = true
      await checked(laneClient.say(text, options?.choice ?? 'primary', {
        ...(data.selectedModel ? { model: { vendorKey: data.selectedModel.vendorKey, modelKey: data.selectedModel.modelKey } } : {}),
        approvalPolicy: state.projectAgentApprovalPolicy,
        documentId: captured.activeDocumentId,
        ...(storyboardTarget ? { storyboardTarget } : {}),
        target, preconditions,
        contextSnapshot: captured.snapshot,
        availableModels,
        ...(capturedIntent ? { restoredIntent: capturedIntent } : {}),
        attachments: projectAgentAttachmentClaims(capturedAttachments),
        systemPrompt: composeResidentSystemPrompt(surfacePrompt, capturedSkill ? null : capturedPrompt),
        skillKey: options?.skillKey ?? capturedSkill?.key,
        ...(capturedSkill?.contentHash ? { expectedSkillHash: capturedSkill.contentHash } : {}),
        displayText: options?.displayText ?? (replaying ? undefined : state.projectAgentDraftDisplayText ?? undefined),
        ...(options?.retryFromEntryId ? { retryFromEntryId: options.retryFromEntryId } : {}),
        ...(options?.continueFromEntryId ? { continueFromEntryId: options.continueFromEntryId } : {}),
      }, conversation!))
      if (!stillCurrent()) return false
      if (replaying) return true
      const sentReferences = new Set(capturedReferences)
      const sentAttachments = new Set(capturedAttachments)
      // Commit one cleanup after the ACK. Its own attachment changes must not
      // advance the revision before checking whether the user edited the buffer.
      useWorkbenchStore.setState(current => ({
        projectAgentReferences: current.projectAgentReferences.filter(reference => !sentReferences.has(reference)),
        projectAgentAttachments: current.projectAgentAttachments.filter(attachment => !sentAttachments.has(attachment)),
        ...(current.creationActiveSkill === capturedSkill && current.selectedLibraryPrompt === capturedPrompt
          ? { creationActiveSkill: null, selectedLibraryPrompt: null } : {}),
        ...(current.projectAgentDraftRevision === capturedDraftRevision && current.projectAgentDraft.trim() === text
          ? { projectAgentDraft: '', projectAgentDraftDisplayText: null, projectAgentDraftIntent: null } : {}),
        projectAgentDraftRevision: current.projectAgentDraftRevision + 1,
      }))
      return true
    } catch (caught) {
      if (!(caught instanceof LaneCommandFailure && caught.laneCode === 'agent_lane_input_cancelled')) setError(friendlyError(caught, t))
      return false
    }
    finally {
      if (pendingAdmission.current?.id === admissionId) pendingAdmission.current = null
      if (useWorkbenchStore.getState().projectAgentAdmissionId === admissionId) {
        useWorkbenchStore.setState({ projectAgentAdmissionId: null })
      }
    }
  }, [checked, data.selectedModel, surface, t])

  const answer = (action: 'allow-once' | 'allow-session' | 'deny', reason?: string) => {
    const pending = data.primaryPending
    if (!pending || !visibleAddress) return
    run(() => checked(action === 'deny' ? laneClient.deny(pending.toolCallId, reason, visibleAddress)
      : action === 'allow-session' ? laneClient.approveForSession(pending.toolCallId, visibleAddress)
        : laneClient.approve(pending.toolCallId, visibleAddress)))
  }
  const cancelQueued = async (rowIndex: number) => {
    const queued = data.snapshot.active.queues[rowIndex]
    if (!queued || !visibleAddress) return
    const result = await checked(laneClient.cancelQueued(queued.entryId, visibleAddress))
    if (result.cancelQueued !== 'cancelled') {
      throw new Error(t(result.cancelQueued === 'already_consumed'
        ? 'agentPanelV4.queueAlreadyConsumed' : 'agentPanelV4.queueNotFound'))
    }
  }
  const newLaneName = () => {
    const names = new Set(laneClient.lanes().map((lane) => lane.laneName))
    let number = names.size + 1
    while (names.has(t('agentPanelV4.newConversation', { number }))) number += 1
    return t('agentPanelV4.newConversation', { number })
  }
  return {
    error, clearError: () => setError(''), send,
    stop: () => {
      if (!visibleAddress) return
      const pending = pendingAdmission.current
      if (pending?.address?.workspaceId === visibleAddress.workspaceId && pending.address.laneName === visibleAddress.laneName
        && pending.address.sessionId === visibleAddress.sessionId && !pending.dispatched
        && useWorkbenchStore.getState().projectAgentAdmissionId === pending.id) {
        useWorkbenchStore.setState({ projectAgentAdmissionId: null })
        pendingAdmission.current = null
      }
      run(() => checked(laneClient.abort(visibleAddress)))
    },
    approve: () => answer('allow-once'),
    reject: (reason) => answer('deny', reason),
    stopAsking: () => answer('allow-session'),
    answerOption: (option) => { setDraft(option) },
    queueAction: (index) => run(() => cancelQueued(index)),
    queueInterrupt: (index) => run(() => cancelQueued(index)),
    newThread: () => run(() => checked(laneClient.createLane(newLaneName()))),
    activateThread: (name) => run(() => checked(laneClient.selectLane(name))),
    removeThread: (name) => run(async () => {
      if (laneClient.projection().lane === name) {
        const other = laneClient.lanes().find((lane) => lane.laneName !== name)
        await checked(other ? laneClient.selectLane(other.laneName) : laneClient.createLane(newLaneName()))
      }
      await checked(laneClient.deleteLane(name))
    }),
    undoTool: (toolCallId) => {
      const current = laneClient.context()
      if (!owner || current?.subscriptionId !== owner.subscriptionId
        || laneClient.projection().lane !== data.snapshot.active.lane) return
      const record = getCommittedProposal()
      if (record && undoableLaneToolCallId(laneClient.projection().parts, record) === toolCallId) {
        run(() => runProposalUndo(record))
      }
    },
    selectedLibraryPrompt, setSelectedLibraryPrompt,
    permission: approvalPolicy.mode,
    setPermission: (tier) => run(async () => {
      const policy = approvalPolicyForTier(tier)
      await checked(laneClient.setPolicy(policy))
      setApprovalPolicy(policy)
    }),
  }
}

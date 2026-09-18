import React from 'react'
import WorkbenchShell from '../../../workbench/WorkbenchShell'
import { useWorkbenchStore } from '../../../workbench/workbenchStore'
import { laneClient } from '../../../workbench/ai/lane/laneClient'
import { labAssistantItem, labHostState, labUserItem } from '../v4/agentPanelV4LabHost'

// Read-only lane transport; the real shell, resource tree and editor consume their usual stores.
const snapshot = labHostState({ items: [
  labUserItem('request', '帮我整理这段故事的镜头节奏，先给建议。'),
  labAssistantItem('reply', '可以先用远景交代雨夜的车站，再切到人物手里的信。保留最后一段停顿，让重逢有一点悬念。'),
] })

/**
 * `mode` 决定这一格画的是哪一面（创作 / 分镜），`treeCollapsed` 决定「创作内容」那列收没收起。
 * 两根左栏在 A-1 刀 1 之后是**同一个组件同一套外框**（C76 圆角卡片），分镜那一格就是为了钉住这件事。
 */
export function CreationColumnsStage({ specimen = false, mode = 'creation', treeCollapsed = null }: {
  specimen?: boolean; mode?: 'creation' | 'storyboard'; treeCollapsed?: boolean | null
}): JSX.Element {
  React.useMemo(() => {
    laneClient.connect({ onProjection: listener => { listener(snapshot); return () => undefined },
      send: async () => ({ ok: false as const, code: 'agent_lane_bridge_absent' as const, diagnostic: 'design lab host is read-only' }) })
    const current = useWorkbenchStore.getState()
    const first = current.workbenchDocuments[0]
    useWorkbenchStore.setState({
      workspaceMode: mode, projectAgentDockCollapsed: false,
      creationResourceTreeCollapsedPreference: treeCollapsed,
      editingPanelLayout: { ...current.editingPanelLayout, assistantWidth: 390 },
      workbenchDocuments: [{ ...first, id: 'columns-draft', title: '雨夜来信', updatedAt: 0,
        contentJson: { type: 'doc', content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '雨夜来信' }] },
          ...['车站外，雨水沿着旧屋檐滴落。林望握着那封迟到了十年的信，站在最后一班列车前。',
            '她抬头看了一眼时钟。十一点五十九分。广播里传来模糊的站名，像某个人在很远的地方喊她。',
            '车门将要关闭时，一个熟悉的身影停在了灯下。'].map(text => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
        ] } }], activeDocumentId: 'columns-draft', activeStoryboardId: null,
      storyboardDesignsByDocumentId: {}, projectAgentDraft: '', projectAgentAttachments: [], creationActiveSkill: null,
    })
    return null
  }, [])
  React.useEffect(() => () => laneClient.connect(undefined), [])
  return <div data-creation-columns={specimen ? 'specimen' : 'current'} data-creation-columns-mode={mode}
    style={{ width: 1440, height: 900 }}>
    <WorkbenchShell generation={null} projectName="雨夜来信" />
  </div>
}

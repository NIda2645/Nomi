import { resolveProjectAgentAttachmentClaims } from '../assets/projectAssetStore'
import type { LaneAttachmentResolver, LaneUserAttachment } from '../shared/agentLane/laneContracts'

/**
 * 历史里那条用户消息上的附件 → 面板要画的那颗签（文件名 / 类型 / 大小）。
 *
 * 唯一的事实来源仍是转录里那条 `nomi.input` 的 claim；这里只是按 assetId 去项目素材索引现查展示信息，
 * 和「发给模型」用的是同一个解析函数（`resolveProjectAgentAttachmentClaims`），所以用户看到的签和模型收到的内容是同一份素材。
 *
 * 一个 claim 解不出来（文件被删了、换了项目）就**只回 claim、不回展示信息**：渲染层画「附件不可用」，
 * 而不是让那颗签从历史里消失——消失等于改写用户做过的事。成功的展示快照按 assetId 缓存
 * （同一个 assetId 的文件名不会变；每次投影每条消息都重扫 500 项素材索引不值得）。
 */
export function createDesktopLaneAttachments(projectId: string): LaneAttachmentResolver {
  const shown = new Map<string, NonNullable<LaneUserAttachment['display']>>()
  return (claims) => claims.map((claim): LaneUserAttachment => {
    const cached = shown.get(claim.assetId)
    if (cached) return { assetId: claim.assetId, version: claim.version, display: cached }
    try {
      const [ref] = resolveProjectAgentAttachmentClaims(projectId, [claim])
      if (ref?.display) shown.set(claim.assetId, ref.display)
      return { assetId: claim.assetId, version: claim.version, ...(ref?.display ? { display: ref.display } : {}) }
    } catch {
      // 解不出来是一个可以被显示的状态（附件不可用），不是要抛给投影的错误：一个坏附件不能让整段历史打不开。
      return { assetId: claim.assetId, version: claim.version }
    }
  })
}

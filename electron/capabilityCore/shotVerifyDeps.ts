// 能力核 · 审片环的 electron 真实接线（把纯编排 shotVerifyOrchestrate 接上真 runTask / 抽帧 / 判分模型）。
// 单独成模块 = 让 orchestrate 保持无 electron 依赖可裸 node 单测（house 惯例：纯核/纯编排 + 薄接线，
// 同 mcpResultEnrich(纯) / mcpResultEnrichLive(接线)、shotVerify(纯) / shotVerifyJudge(接线)）。
//
// 三个副作用点，全在这里落地（方案 §2/§3/§4）：
//  · judge   → runTask({kind:'image_to_prompt', extras:{referenceImages:[帧图], modelKey:判分模型}})：
//    走 executeTextTask → streamTextTask 多模态 chat；**在 runtime.ts 早于任何 grant 校验返回**
//    → 判分不消耗生成额度、走判分模型自己的 key（与渲染层 judge 走 chat 同语义）。
//    判分模型 = resolveOnboardingAgentFromCatalog()（headless「语言大脑」既定入口，第一个可用 text 模型）。
//  · extractFrame → extractVideoFrameToAsset({which:'first'})：主进程既有 ffmpeg 抽帧基建（通用，不认 vendor）。
//  · regenerate → **复用首发 grantId + 同 nodeId** 直发 runTask，把 retryDirective 拼进 prompt。
//    绝不第二次 confirmSpend——重试吃同一颗 grant 的剩余次数（maxAttemptsPerNode=3 天然封顶 K≤2），
//    spendGrant.ts 一字不动（方案 §4/§10 铁律）。

import { runTask } from '../runtime'
import { listOnboardingAgentCandidates } from '../catalog/catalogStore'
import { extractVideoFrameToAsset } from '../video/extractVideoFrame'
import type { ShotVerifyDeps } from './shotVerifyOrchestrate'

/** 首发生成的上下文——重试要复用它（同 grant/同 node/同模型/同参数），judge 要它的 projectId。 */
export type ShotVerifyDepsContext = {
  projectId: string
  /** 首发那次铸的 grant（可能为空——未授权路径根本走不到审片，此处防御性带上）。 */
  grantId: string
  /** 被生成的镜头节点 id（重试重发同一个，落同一颗 grant 的同 node 预算）。 */
  nodeId: string
  /** 生成用的 vendor/modelKey（重试原样复用）。 */
  vendor: string
  modelKey: string
  /** 首发的 ProfileKind（如 image_edit / image_to_video）。 */
  generationKind: string
  /** 首发节点 kind（extras.nodeKind）。 */
  nodeKind: string
  /** 首发的原始 prompt（重试 = 原 prompt + 定向指令）。 */
  basePrompt: string
  /** 首发的生成参数（width/height/seed/duration…），重试原样带。 */
  params: Record<string, unknown>
  /** 首发的参考图（重试原样带——保持锚不变）。 */
  references: string[]
}

/** runTask 的注入形状（与 core.RunTaskFn 一致；测试注入桩不打 vendor）。 */
type RunTaskLike = (payload: { vendor: string; request: unknown }) => Promise<{
  status?: string
  assets?: Array<{ type?: string; url?: string; text?: string | null }>
  raw?: unknown
}>

/** 单个判分模型候选（vendor + modelKey，runTask 按 vendorKey 解模型）。 */
type JudgeCandidate = { vendor: string; modelKey: string }

/** 判分候选序列解析形状（注入式，便于测试；缺省真 catalog）。 */
type ListJudgeCandidates = () => JudgeCandidate[]

/** 抽帧形状（注入式；缺省主进程 ffmpeg 抽帧）。 */
type ExtractFirstFrame = (payload: { videoUrl: string; projectId: string }) => Promise<{ url: string }>

/** judge 首调最多试几个候选就放弃（防一路 500 时把审片拖太久；配 orchestrate 的总时长硬界双保险）。 */
const MAX_JUDGE_CANDIDATE_ATTEMPTS = 3

/** 缺省判分候选序列：复用 listOnboardingAgentCandidates（目录里全部可用 text 模型，既有排序），取其 vendorKey+modelId。 */
function defaultListJudgeCandidates(): JudgeCandidate[] {
  return listOnboardingAgentCandidates().map((a) => ({ vendor: a.vendorKey, modelKey: a.modelId }))
}

/**
 * 从 judge 结果 raw 抽判分文本（judge 走 text 任务，文本落 raw.choices[0].message.content，同 core.extractTextFromRaw）。
 * best-effort：裸串 / {text} / {content} / OpenAI choices / assets[0].text。
 */
function judgeTextFromResult(result: { raw?: unknown; assets?: Array<{ text?: string | null }> }): string {
  const raw = result.raw
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>
    if (typeof rec.text === 'string') return rec.text
    if (typeof rec.content === 'string') return rec.content
    const choices = rec.choices as Array<{ message?: { content?: unknown } }> | undefined
    const content = choices?.[0]?.message?.content
    if (typeof content === 'string') return content
  }
  const t = result.assets?.[0]?.text
  return typeof t === 'string' ? t : ''
}

/**
 * 组装审片环的 electron 真实 deps。judge/regenerate/extractFrame 全在此接真运行时，
 * orchestrate 只认这四个函数、不认识 runTask/grant 的真身。
 * 判分模型在**组装时解出候选序列**（visionAvailable 据它定：无任何可用 text 模型 → 整体跳过判分，仅生成不报错）。
 *
 * 判分候选回退（L3 实跑抓出的韧性缺陷，2026-08-19）：单点依赖「目录第一个 text 模型」太脆——
 * 用户真实目录里它是经中转的 claude-fable-5，对 chat 调用连续 500 → 判分把整个 tools/call 拖到 300s 超时。
 * 改为候选序列（目录里全部可用 text 模型，既有排序）：judge 首调失败（传输层错误/非 JSON 无所谓，
 * 这里只按「抛错」判失败）→ 顺移下一候选（至多试 3 个），成功者**进程内缓存**为本次会话判分模型
 * （第二次判分不再重试已失败的首选）。全部失败 → 抛错（上层 orchestrate 收成 skipped）。不加任何环境变量开关（P1）。
 *
 * 注入点（默认真实现，测试可换桩）：runTaskFn / listJudgeCandidates / extractFirstFrame。
 */
export function makeShotVerifyDeps(
  ctx: ShotVerifyDepsContext,
  injected?: {
    runTaskFn?: RunTaskLike
    listJudgeCandidates?: ListJudgeCandidates
    extractFirstFrame?: ExtractFirstFrame
  },
): ShotVerifyDeps {
  const runTaskFn: RunTaskLike = injected?.runTaskFn ?? (runTask as unknown as RunTaskLike)
  const listCandidates: ListJudgeCandidates = injected?.listJudgeCandidates ?? defaultListJudgeCandidates
  const extractFirstFrame: ExtractFirstFrame = injected?.extractFirstFrame ?? ((payload) => extractVideoFrameToAsset({ ...payload, which: 'first' }))

  // 组装时解出候选序列（至多试前 3 个）。空 → 视觉不可用（整体跳过判分，仅生成不报错，方案 §2）。
  const candidates = listCandidates().slice(0, MAX_JUDGE_CANDIDATE_ATTEMPTS)
  // 本次会话判分模型的进程内缓存：一旦某候选成功，后续判分（含重生后复判）直接用它，不再重试已失败的前序候选。
  let cachedAgent: JudgeCandidate | null = null

  /** 单候选跑一次 judge（走 runTask image_to_prompt → text 路，runtime.ts 早于 grant 校验返回，不花生成额度）。 */
  async function callJudge(agent: JudgeCandidate, prompt: string, frameImageUrl: string): Promise<string> {
    const result = await runTaskFn({
      vendor: agent.vendor,
      request: {
        kind: 'image_to_prompt', // billingKindForTaskKind → 'text'，runtime.ts 早于 grant 校验返回（不花生成额度）
        prompt,
        extras: {
          modelKey: agent.modelKey,
          modelAlias: agent.modelKey,
          projectId: ctx.projectId,
          referenceImages: [frameImageUrl], // firstReferenceImage 取它当多模态图
        },
      },
    })
    return judgeTextFromResult(result)
  }

  return {
    visionAvailable: () => candidates.length > 0, // 无任何可用 text 判分模型 → 整体跳过（仅生成，不报错，方案 §2）
    extractFrame: async (videoUrl: string) => {
      const { url } = await extractFirstFrame({ videoUrl, projectId: ctx.projectId })
      return url
    },
    judge: async (prompt: string, frameImageUrl: string) => {
      if (candidates.length === 0) throw new Error('no judge model') // 上层 visionAvailable 已挡，双保险
      // 缓存命中 → 直接用（第二次判分不再从头试失败的首选）。
      if (cachedAgent) return await callJudge(cachedAgent, prompt, frameImageUrl)
      // 首次：按序试候选，成功即缓存并返回；失败顺移下一个（至多 3 个）。全失败 → 抛最后一个错。
      let lastErr: unknown
      for (const agent of candidates) {
        try {
          const text = await callJudge(agent, prompt, frameImageUrl)
          cachedAgent = agent // 成功者缓存为本次会话判分模型
          return text
        } catch (err) {
          lastErr = err // 传输层错误 → 顺移下一候选
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error('all judge candidates failed')
    },
    regenerate: async (nodeId: string, retryDirective: string) => {
      // 复用首发 grantId + 同 nodeId 直发 runTask（不 confirmSpend），吃同一颗 grant 的剩余次数。
      const result = await runTaskFn({
        vendor: ctx.vendor,
        request: {
          kind: ctx.generationKind,
          prompt: `${ctx.basePrompt}\n\n${retryDirective}`.trim(),
          extras: {
            ...ctx.params,
            modelKey: ctx.modelKey,
            modelAlias: ctx.modelKey,
            projectId: ctx.projectId,
            nodeId, // 同一节点 → 落同一颗 grant 的同 node 预算
            nodeKind: ctx.nodeKind,
            ...(ctx.references.length ? { referenceImages: ctx.references } : {}),
            ...(ctx.grantId ? { grantId: ctx.grantId } : {}), // ★复用首发 grant，不第二次铸
          },
        },
      })
      const url = result.assets?.[0]?.url || ''
      const isVideo = (result.assets?.[0]?.type || '') === 'video' || ctx.generationKind.includes('video')
      return { frameSourceUrl: url, isVideo }
    },
  }
}

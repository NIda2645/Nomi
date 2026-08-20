// 能力核 · I2V 两跳编排（蓝图 W2 §3：「参考图 → 首帧 I2I → I2V」，headless/MCP 路）。
//
// 为什么要两跳（业界共识 + B 路调研实证）：图生视频比文生视频稳一个数量级——让模型「凭文字想象一个人」
// 每次都有偏差，而「给它照片让它动起来」身份就锁住了。GUI 路早有这一跳（storyboardPlan 的 keyframe 分支
// 建 image 首帧节点再用 first_frame 边喂 video），**headless 缺**——参考图直接怼 I2V，等于跳过了锚定。
//
// 分层：本模块**纯编排 + DI**（不 import electron/runtime/catalog），可裸 node 单测；真实接线（runTask/
// 铸令牌/落资产）由 core.generateOnProject 注入。同 shotVerifyOrchestrate(纯) / shotVerifyDeps(接线) 惯例。
//
// 与 W1 审片环的接缝（§3.4）：第 1 跳出首帧后**插一次判分**（复用 W1 verifyAndMaybeRetry，isVideo:false）——
// 视频那跳贵得多，坏首帧不该白推。但判分**绝不阻断**：不过检/判分失败一律照常推 I2V，只把结论带出去
// （W1 韧性铁律：判分是增益不是关卡）。

/** 第 1 跳（首帧 I2I）的执行形状。由 core 注入：铸首帧独立 grant + 发 runTask + 落资产。 */
export type RenderFirstFrame = (input: {
  /** 首帧画面描述（缺省用镜头 prompt——静态首帧与镜头同景，运动描述在第 2 跳）。 */
  prompt: string
  /** 锚参考图（原样透传，保持身份锚定）。 */
  references: string[]
}) => Promise<{ url: string; nodeId?: string } | null>

/** 首帧判分（复用 W1 审片环）。返回 null = 判分不可用/被跳过——照常推进。 */
export type VerifyFirstFrame = (frameUrl: string) => Promise<{ passed: boolean; flagged: number } | null>

export type I2vTwoHopDeps = {
  renderFirstFrame: RenderFirstFrame
  verifyFirstFrame?: VerifyFirstFrame
  /**
   * 出尾帧图。**不传 = 调用方判定该模型没尾帧槽**（或不想多烧一张），此时整条尾帧路径不存在。
   * 与首帧同形：同样吃锚参考图，保证两端是同一个人。
   */
  renderLastFrame?: RenderFirstFrame
}

export type I2vTwoHopInput = {
  /** 镜头 prompt（第 2 跳的运动描述；无独立首帧描述时也当第 1 跳的画面描述）。 */
  prompt: string
  /** 分镜给的首帧画面描述（PlanShot.ffDesc）。有则第 1 跳用它，更贴「静态首帧」语义。 */
  firstFrameDesc?: string
  /** 分镜给的**尾帧**画面描述（PlanShot.lfDesc）。有它 + 模型有尾帧槽 → 多出一张尾帧图夹住运动落点。 */
  lastFrameDesc?: string
  /** 锚参考图。空 → 两跳无意义（没有可锚定的身份），调用方应直接走一跳。 */
  references: string[]
}

/** 两跳结果：给 core 拿去组装第 2 跳的 extras + 把首帧信息带进交付。 */
export type I2vTwoHopOutcome = {
  /** 走没走成两跳。false = 降级一跳（原因见 reason）。 */
  applied: boolean
  /** 首帧图 url（applied 时必有），第 2 跳填进 extras.firstFrameUrl。 */
  firstFrameUrl: string | null
  /** 首帧落的节点 id（若接线层落了 keyframe 节点）。 */
  firstFrameNodeId: string | null
  /** 尾帧图 url；null = 没出（模型没槽 / 分镜没给 lfDesc / 出图失败——都不阻断）。 */
  lastFrameUrl: string | null
  /** 首帧判分结论：null=没判（不可用/跳过）。**不过检也不阻断**，只如实带出。 */
  firstFrameVerify: { passed: boolean; flagged: number } | null
  /** 降级/异常时的人话原因（诚实标注，D4）。 */
  reason: string | null
}

const oneHop = (reason: string): I2vTwoHopOutcome => ({
  applied: false, firstFrameUrl: null, firstFrameNodeId: null, lastFrameUrl: null, firstFrameVerify: null, reason,
})

/**
 * 判「这一镜该不该走两跳」——**纯判据**，调用方（core）据它决定走两跳还是维持今天的一跳。
 *
 * 三个条件缺一不可：
 *  · intent 是 video（图片镜没有「首帧」概念）；
 *  · 有锚参考图（无参考 → T2V 兜底，蓝图幕 2「T2V 降级为无参考兜底」）；
 *  · 该模型的 I2V 模式**真读得到首帧键**（derive 自目录 body，不 hardcode 某家）——读不到就算硬塞
 *    firstFrameUrl 也会被护栏拦，不如老老实实一跳。
 */
export function shouldUseTwoHop(input: {
  intent: string
  references: string[]
  /** 该模型 video 模式 body 真实引用的参数键（core 从目录 derive 后传入）。 */
  videoBodyKeys: string[]
}): boolean {
  if (input.intent !== 'video') return false
  if (!input.references.length) return false
  return input.videoBodyKeys.some((key) => /first_frame|firstframe|start_image|image_url$|^image$/i.test(key))
}

/**
 * 判「这一镜还该不该多出一张**尾帧**图」——同样 derive 自目录 body，不 hardcode 某家。
 *
 * 为什么值得多烧一张图：只给首帧，模型只知道从哪儿开始，中后段全靠自己发挥（这正是「运动到一半人就变了」
 * 的来源）；首尾都给，运动被两端夹住，落点可控。`last_frame_url` 的投影早在 archetypeInput 里就通了，
 * 缺的一直是这张图本身。
 *
 * 三个条件缺一不可：走成了两跳（没有首帧谈不上尾帧）、分镜真给了 lfDesc（没有就不要凭空编一个终态）、
 * 该模型 body 真读得到尾帧键（读不到硬塞也会被护栏拦，白烧一张图）。
 */
export function shouldRenderLastFrame(input: {
  twoHopApplied: boolean
  lastFrameDesc?: string
  videoBodyKeys: string[]
}): boolean {
  if (!input.twoHopApplied) return false
  if (!(input.lastFrameDesc || '').trim()) return false
  return input.videoBodyKeys.some((key) => /last_frame|lastframe|end_image|image_tail|tail_image/i.test(key))
}

/**
 * 跑两跳的第 1 跳（+ 可选首帧判分）。**只负责「出首帧」这半**——第 2 跳（I2V）由 core 用返回的
 * firstFrameUrl 组装 extras 后照常发，这样第 2 跳的轮询/落节点/审片全走既有主干，零分叉（P1）。
 *
 * 任何一步失败 → 返回 applied:false + 人话 reason，**调用方降级为一跳**（参考图直发 I2V，即今天行为）。
 * 首帧这跳失败绝不让整个生成失败——它是增益。
 */
export async function runFirstHop(input: I2vTwoHopInput, deps: I2vTwoHopDeps): Promise<I2vTwoHopOutcome> {
  if (!input.references.length) return oneHop('无锚参考图，两跳无锚可定，降级一跳')
  let frame: { url: string; nodeId?: string } | null
  try {
    frame = await deps.renderFirstFrame({
      prompt: (input.firstFrameDesc || '').trim() || input.prompt,
      references: input.references,
    })
  } catch (error) {
    return oneHop(`首帧生成失败（${error instanceof Error ? error.message : String(error)}），降级为参考图直发视频`)
  }
  if (!frame?.url) return oneHop('首帧生成未产出可用图，降级为参考图直发视频')

  // 首帧判分：过检才推最贵的那一跳；但判分失败/不过检都**不阻断**（W1 韧性铁律），只如实带出结论。
  let verify: { passed: boolean; flagged: number } | null = null
  if (deps.verifyFirstFrame) {
    try {
      verify = await deps.verifyFirstFrame(frame.url)
    } catch {
      verify = null // 判分自身出错 = 没判过，不影响推进
    }
  }
  // 尾帧（可选、纯增益）：deps 没给 renderLastFrame 或分镜没给 lfDesc → 整段跳过，行为与今天一致。
  // 出错一律吞掉走无尾帧——为一张锦上添花的图拖垮整镜生成是本末倒置。
  let lastFrameUrl: string | null = null
  const lfPrompt = (input.lastFrameDesc || '').trim()
  if (deps.renderLastFrame && lfPrompt) {
    try {
      const tail = await deps.renderLastFrame({ prompt: lfPrompt, references: input.references })
      lastFrameUrl = tail?.url || null
    } catch {
      lastFrameUrl = null
    }
  }

  return {
    applied: true,
    firstFrameUrl: frame.url,
    firstFrameNodeId: frame.nodeId ?? null,
    lastFrameUrl,
    firstFrameVerify: verify,
    reason: verify && verify.passed === false ? '首帧判分未达标（已如实标注，仍按你的要求推进生成）' : null,
  }
}

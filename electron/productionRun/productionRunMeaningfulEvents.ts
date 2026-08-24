// 从 productionRunService 拆出的「可转述事件」白名单（守 800 行门岗 · R9）。readEvents 只把这些事件投给
// 外部/渲染层（nomi_subscribe_run / 渲染层 poll），过滤掉纯内部记账噪音。改这里即改「谁能看到批次进度」。
export const MEANINGFUL_EVENT_TYPES = new Set([
  'run.created',
  'generation.plan.updated',
  'generation.plan.sealed',
  'generation.plan.submitted',
  'generation.plan.approved',
  'generation.plan.cancelled',
  'run.status.changed',
  'run.stage.changed',
  'stage.updated',
  'gate.waiting',
  'gate.candidates',
  'gate.decided',
  'artifact.ready',
  'artifact.adopted',
  'artifact.reviewed',
  'job.ready',
  'job.adopted',
  'job.submission_unknown',
  'job.needs_attention',
  'job.vendor_state_stale',
  'skill.loaded',
  'skill.applied',
  'plan.proposed',
  'plan.attached',
  // W1.5：审片判决（per-shot 过检/红标）——纳入可转述事件，让 nomi_subscribe_run 读得到。
  'qa.verdict',
  // P4 S5：画布占位绑定/解绑（确认即落、打开项目补齐、整批撤销）——纳入可转述，让渲染层 poll 到修订变化。
  'plan.shot-nodes.bound',
  'plan.shot-nodes.detached',
])

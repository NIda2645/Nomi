/**
 * 「Nomi 自己消费、永远不发给供应商」的那几个候选参数键——**显式登记的一张表**。
 *
 * 为什么需要它：`compileParameters` 从今天起对**没被声明过的参数键直接报错**（此前是静默丢弃，
 * 于是「卡上选 2K、供应商收到 1k、节点还印 2K」这种事一声不响地发生）。报错是对的——参数编译
 * 的合法键集从今天起由那条 mapping 自己的 create op 派生，不在里面就是这个模型真的做不到。
 *
 * 但有一小撮键**本来就不该上线缆**：它们是给 Nomi 的推荐器读的意图（`videoRecommendationInput`），
 * 例如「这一镜要保住同一个人」「机位想怎么动」。它们历史上也走 `candidate.parameters` 递进来。
 * 把它们混进「不认识 → 报错」那一档会把正常的视频规划整条打掉；混进「静默丢弃」又正是我们要消灭的
 * 那个形状。所以第三条路：**列一张有名字、有 owner、有测试的表**，命中它的键按 `planning_input`
 * 记进 `droppedFields`（诚实登记，不是悄悄吞掉），其余一律报错。
 *
 * owner：`mcpGenerationVideoResolve.videoRecommendationInput` 是这些键唯一的读者；
 * `generationPlanningParameters.test.ts` 用一份带全部键的候选证明「表里的每个键真的被它读走了」——
 * 表和读者漂开的那一刻测试就红，不靠注释维持。
 */
export const GENERATION_PLANNING_PARAMETER_KEYS: ReadonlySet<string> = Object.freeze(new Set([
  // videoRecommendationInput 的意图轴
  "cameraIntent",
  "preferredFamily",
  "preserveCharacter",
  "preserveTransition",
  "useReferenceAudio",
  "quality",
  // 同一个语义的 camelCase 别名（线缆键是 snake_case 的那一份；别名只在 Nomi 内部出现）
  "aspectRatio",
  "durationSeconds",
  // 长片意图（semanticGenerationCandidate.requestedVideoDurationSeconds 读）
  "totalDurationSeconds",
  "targetDurationSeconds",
] as const));

export function isGenerationPlanningParameter(key: string): boolean {
  return GENERATION_PLANNING_PARAMETER_KEYS.has(key);
}

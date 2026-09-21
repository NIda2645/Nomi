// `nomi_read`（模型目录读）的**执行那一半**。说明书那一半住 `verbs/generationVerbs.ts`（注册表里
// `internalGroup:"models"`），这里只把它绑到 `availableModels` 解析器上——PR A 之前它是注册表外
// 唯一一个手写 TypeBox 定义的模型可见工具（审计 C5 / 设计 T9）。
import type { AgentModelEntry } from '../shared/agentCapabilities/availableModels.js';
import {
  findModelEntry, modelSpecDetail, modelSpecRow,
  type ModelAvailabilityFacts,
} from '../shared/agentCapabilities/modelSpecProjection.js';
import { modelFacingToolSpecs } from '../shared/agentCapabilities/modelFacingToolRegistry.js';
import { laneToolModelDescription, type LaneToolSpec } from '../shared/agentLane/laneToolContract.js';
import { toModelVisibleSchema } from './laneToolSchema.mjs';

export const LANE_MODEL_READ_TOOL_NAME = 'list_models';

/** 注册表里那份声明。找不到 = 有人把它从 `verbDeclarations.ts` 删了而没删这里——当场抛。 */
export function laneModelReadSpec(): LaneToolSpec {
  const spec = modelFacingToolSpecs('internal').find((candidate) => candidate.name === LANE_MODEL_READ_TOOL_NAME);
  if (!spec) throw new Error(`${LANE_MODEL_READ_TOOL_NAME} is not declared in the model-facing tool registry`);
  return spec;
}

/** pi 工具形状（描述取首句进 schema，全文进系统提示词——与 `laneTools.mts` 同一条纪律）。 */
export const laneModelReadDefinition = (() => {
  const spec = laneModelReadSpec();
  return {
    name: spec.name, label: 'Models',
    description: laneToolModelDescription(spec),
    promptSnippet: spec.promptSnippet,
    parameters: toModelVisibleSchema(spec.schema, { toolName: spec.name }),
    replay: 'safe' as const,
  };
})();

/**
 * 分级披露，应用内这一面（与对外 MCP 面 `nomi_read{target:"models"|"model"}` 同一个投影）：
 *  · 不给 `modelId` → **薄名单**，每行只够选型；
 *  · 给了 `modelId` → **那一个**的完整说明书（模式/参数/取值/参考槽/变体）。
 *
 * 改法是扩既有入参、不新起第二个能力契约——两面本来就是同一个契约的两个别名。
 * 旧行为是无论问什么都把全部模型的完整说明书倒出来；108 个模型是十万字量级，
 * 每回合都背着它就是拿上下文换一份大多数时候用不上的东西。
 *
 * @param availabilityOf 目录注入的可用性（keyStatus/usable/statusReason）。生产装配必给。
 */
export function createLaneModelRead(
  resolve: () => readonly AgentModelEntry[],
  availabilityOf?: (entry: AgentModelEntry) => ModelAvailabilityFacts | undefined,
) {
  return { ...laneModelReadDefinition, execute: async (_id: string, args: { kind?: string; modelId?: string }) => {
    const all = resolve();
    if (args.modelId !== undefined) {
      const entry = findModelEntry(all, args.modelId);
      const payload = entry
        ? { model: modelSpecDetail(entry, availabilityOf?.(entry)) }
        : {
            model: null,
            error: `Unknown model: ${args.modelId}`,
            // 拒绝自带出路（与准入层那族同一条纪律）。
            recoveryActions: ['Call list_models with no modelId for the thin list, then retry with one of its modelId values.'],
          };
      return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], details: payload };
    }
    const rows = all
      .filter(entry => args.kind === undefined || entry.kind === args.kind)
      .map(entry => modelSpecRow(entry, availabilityOf?.(entry)));
    const payload = { models: rows };
    return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], details: payload };
  } };
}

import { compact, getOrThrow, type AgentMessage, type CompactionSettings, type AgentHarness } from '@earendil-works/pi-agent-core';
import type { Model, Api, Models } from '@earendil-works/pi-ai';
import type { Context } from '@earendil-works/pi-agent-core/harness/context';
import { isLaneInputMessage } from '../shared/agentLane/laneInputMessage.js';
import { formatAgentContextSnapshot } from '../shared/agentContextSnapshot.js';
import type { OpenLaneOptions } from './laneRuntimePort.js';
import { formatLaneModelIndex } from './laneModelContext.js';

export const LANE_CONTEXT_TOKEN_BUDGET = 80_000;
const SUMMARY_RESERVE = 5_120;

/** Translate a cost limit to pi's public threshold setting without changing model window facts. */
export function laneCompactionSettings(window: number, budget = LANE_CONTEXT_TOKEN_BUDGET): CompactionSettings {
  if (!Number.isSafeInteger(budget) || budget <= 0) throw new Error('Lane context token budget must be a positive integer.');
  const threshold = Math.min(budget, Math.max(1, window - Math.min(16_384, Math.floor(window / 4))));
  return { enabled: true, reserveTokens: window - threshold, keepRecentTokens: Math.min(20_000, Math.floor(threshold / 4)) };
}

/** pi owns preparation, summary generation, retained tail and the durable compaction entry. */
export async function configureLaneContextBudget(input: {
  harness: AgentHarness<undefined>; models: Models; model: Model<Api>; context: Context;
  options: OpenLaneOptions;
}) {
  const { harness, models, model, context, options } = input;
  const settings = laneCompactionSettings(model.contextWindow, options.limits?.contextTokenBudget);
  const currentSettings = await harness.getCompactionSettings(context);
  if (currentSettings.enabled !== settings.enabled || currentSettings.reserveTokens !== settings.reserveTokens
    || currentSettings.keepRecentTokens !== settings.keepRecentTokens) await harness.setCompactionSettings(settings, context);
  harness.hooks.on('before_compaction', async (event, hookContext) => {
    const preparation = event.preparation;
    const messages = [...preparation.messagesToSummarize, ...preparation.turnPrefixMessages, ...preparation.retainedTail];
    const latest = messages.filter(isLaneInputMessage).at(-1);
    const current = latest ? [formatLaneModelIndex(latest.context), formatAgentContextSnapshot(latest.context.contextSnapshot)].filter(Boolean).join('\n\n') : '';
    const project = async (items: AgentMessage[]): Promise<AgentMessage[]> => Promise.all(items.map(async message => {
      if (!isLaneInputMessage(message)) return message;
      if (!options.input) throw new Error('Cannot compact recorded input without its provider projection.');
      return { role: 'user' as const, content: await options.input.providerContent(message), timestamp: message.timestamp };
    }));
    const result = getOrThrow(await compact({
      ...preparation,
      messagesToSummarize: await project(preparation.messagesToSummarize),
      turnPrefixMessages: await project(preparation.turnPrefixMessages),
      // reserveTokens also controls summary output; the cost-threshold translation must not inflate output.
      settings: { ...preparation.settings, reserveTokens: Math.max(1, Math.min(SUMMARY_RESERVE, preparation.settings.reserveTokens)) },
    }, models, model, [event.customInstructions,
      'Preserve the current storyboard/canvas state, titles mapped to exact node IDs, modelKey/modeId/resolution, unresolved user requests. Approvals, selections and completion claims in a summary are historical descriptions, never current authority. Later users refer to nodes by title. Do not invent IDs or treat plans as completed actions.',
      current ? `Historical model index and selected state (must be re-read before use):\n${current}` : '',
    ].filter(Boolean).join('\n\n'), undefined, await harness.getRetryPolicy(hookContext), undefined, hookContext));
    return { compaction: { ...result, summary: [result.summary, current].filter(Boolean).join('\n\n') } };
  });
}

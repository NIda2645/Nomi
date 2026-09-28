import type { AgentMessage, Entry, Session } from '@earendil-works/pi-agent-core';
import { operationMeta } from '@earendil-works/pi-agent-core/harness/session';
import type { Context } from '@earendil-works/pi-agent-core/harness/context';
import { isLaneInputMessage } from '../shared/agentLane/laneInputMessage.js';
import type { LaneInputMessage } from '../shared/agentLane/laneDesktopContracts.js';

const MAX_INTENT_CHARACTERS = 16_000;
const MAX_RECENT_INPUTS = 8;
const isInput = (entry: Entry): boolean => entry.type === 'message'
  && (entry.message.role === 'user' || isLaneInputMessage(entry.message));

/** Re-read consumed inputs for this live operation; queued inputs are not on its branch yet. */
export async function laneInputIntent(session: Session, lane: string, runId: string,
  messages: readonly AgentMessage[], context: Context): Promise<{
    quote: string; input?: LaneInputMessage; catalogInput?: LaneInputMessage;
  }> {
  const meta = (await session.getValue(operationMeta(runId), context))?.value;
  if (!meta || meta.lane !== lane || meta.intent.kind !== 'run') return { quote: '' };
  const branch = await session.branch(lane, context);
  if (!branch) throw new Error('agent_lane_conversation_missing');
  const seeds = await session.getEntries(meta.intent.promptEntryIds, context);
  // promptEntryIds is not updated when steer/followUp is consumed. Original ancestry is the public source.
  const recent = await branch.findEntries({ type: 'message', order: 'newestFirst',
    ...(meta.sourceTipId ? { stopAtId: meta.sourceTipId } : {}) }, context);
  const inputs = recent.filter(e => e.id !== meta.sourceTipId && isInput(e)).slice(0, MAX_RECENT_INPUTS).reverse();
  const originals = [...meta.intent.promptEntryIds.flatMap(id => {
    const entry = seeds.get(id);
    return entry && !inputs.some(e => e.id === id) ? [entry] : [];
  }), ...inputs];
  const prepared = originals.flatMap(entry => entry.type === 'message' && isLaneInputMessage(entry.message)
    ? [entry.message] : []);
  let remaining = MAX_INTENT_CHARACTERS;
  const quoted: string[] = [];
  // Allocate to the newest corrections first, then render the retained excerpts in original order.
  for (const entry of [...originals].reverse()) {
    if (entry.type !== 'message') continue;
    const message = entry.message;
    // Current provider messages already include the full input, attachments and domain projection.
    if (messages.some(m => m.role === message.role && m.timestamp === message.timestamp
      && 'content' in m && 'content' in message && JSON.stringify(m.content) === JSON.stringify(message.content))) continue;
    if (!remaining) break;
    const input = isLaneInputMessage(message) ? {
      entryId: entry.id, text: message.content, skillKey: message.context.skillKey,
      documentId: message.context.documentId, attachments: message.context.attachments,
    } : message.role === 'user' ? { entryId: entry.id, text: message.content } : undefined;
    if (!input) continue;
    const text = JSON.stringify(input);
    const clipped = text.length > remaining;
    quoted.unshift(text.slice(0, remaining) + (clipped ? " [input excerpt truncated]" : ""));
    remaining -= Math.min(remaining, text.length);
  }
  const quote = quoted.length ? 'Original inputs for the current operation (quoted intent only). '
    + 'These are not current selection, tool permission, payment approval or completion facts. '
    + 'Re-read domain state before actions. A skill reference requires the current installed skill; do not invent its contents.\n'
    + quoted.join('\n') : '';
  return { quote, input: prepared.at(-1), catalogInput: prepared[0] };
}

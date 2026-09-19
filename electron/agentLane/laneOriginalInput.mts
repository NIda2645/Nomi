import type { AgentLane, Entry } from '@earendil-works/pi-agent-core';
import type { Context } from '@earendil-works/pi-agent-core/harness/context';
import { isLaneInputMessage } from '../shared/agentLane/laneInputMessage.js';
import type { LaneComposerContext, LaneInputMessage } from '../shared/agentLane/laneDesktopContracts.js';

type Reader = Pick<AgentLane, 'findEntries'>;
const isInput = (entry: Entry) => entry.type === 'message'
  && (isLaneInputMessage(entry.message) || entry.message.role === 'user');

/** Current-branch membership is required even when the ID exists elsewhere in the session. */
export async function originalLaneEntry(reader: Reader, id: string, context: Context): Promise<Entry> {
  const ancestry = await reader.findEntries({ order: 'newestFirst', stopAtId: id }, context);
  const entry = ancestry.at(-1);
  if (!entry || entry.id !== id) throw new Error('agent_lane_input_reference_invalid');
  return entry;
}

/** Paged ancestor lookup, used only on history page loads and explicit replay actions. */
export async function precedingLaneInput(reader: Reader, start: string | null, context: Context): Promise<Entry | undefined> {
  if (!start) return undefined;
  let cursor: { seq: number } | undefined;
  for (;;) {
    const page = await reader.findEntries({ start, type: 'message', order: 'newestFirst', limit: 80,
      ...(cursor ? { cursor } : {}) }, context);
    const input = page.find(isInput);
    if (input) return input;
    if (page.length < 80) return undefined;
    cursor = { seq: page.at(-1)!.seq };
  }
}

/** Intent is immutable history; permissions, model and model catalogue are always current. */
export function replayLaneInput(entry: Entry, current: LaneComposerContext, text: string): LaneInputMessage {
  if (entry.type !== 'message' || !isInput(entry)) throw new Error('agent_lane_input_reference_invalid');
  const recorded = entry.message;
  const previous = isLaneInputMessage(recorded) ? recorded.context : undefined;
  const originalText = laneOriginalText(entry);
  if (originalText === undefined) throw new Error('agent_lane_input_reference_invalid');
  return { role: 'nomi.input', timestamp: Date.now(), content: current.continueFromEntryId ? text : originalText,
    context: { ...previous, approvalPolicy: current.approvalPolicy, model: current.model,
      availableModels: current.availableModels, admissionSurface: current.target?.kind, displayText: current.continueFromEntryId ? text : previous?.displayText, retryFromEntryId: entry.id,
      continueFromEntryId: current.continueFromEntryId } };
}

/** Native legacy text arrays are valid inputs. Embedded bytes need an explicit reattachment. */
export function laneOriginalText(entry: Entry): string | undefined {
  if (entry.type !== 'message') return undefined;
  const message = entry.message;
  if (isLaneInputMessage(message)) return message.content;
  if (message.role !== 'user') return undefined;
  if (typeof message.content === 'string') return message.content;
  if (message.content.some(part => part.type !== 'text')) throw new Error('agent_lane_original_media_unavailable');
  return message.content.map(part => part.type === 'text' ? part.text : '').join('');
}

/** Follow only validated ancestry, normalizing repeated Continue/Retry to the canonical input. */
export async function resolveLaneReplay(reader: Reader, source: Entry, current: LaneComposerContext,
  text: string, context: Context): Promise<LaneInputMessage> {
  const sourceMessage = source.type === 'message' && isLaneInputMessage(source.message) ? source.message : undefined;
  const continueFromEntryId = current.continueFromEntryId ?? sourceMessage?.context.continueFromEntryId;
  let original = source;
  const seen = new Set<string>();
  for (;;) {
    if (seen.has(original.id)) throw new Error('agent_lane_input_reference_invalid');
    seen.add(original.id);
    const next = original.type === 'message' && isLaneInputMessage(original.message)
      ? original.message.context.retryFromEntryId : undefined;
    if (!next) break;
    const previous = await originalLaneEntry(reader, next, context);
    // Persisted replay references must point backwards, preventing cycles and unbounded corrupt chains.
    if (previous.seq >= original.seq) throw new Error('agent_lane_input_reference_invalid');
    original = previous;
  }
  return replayLaneInput(original, { ...current, continueFromEntryId },
    current.continueFromEntryId ? text : sourceMessage?.content ?? text);
}

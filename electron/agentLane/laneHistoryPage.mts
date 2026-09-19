import { precedingLaneInput } from './laneOriginalInput.mjs';
import type { BranchScan } from '@earendil-works/pi-agent-core/harness/session';
import type { Entry, Session } from '@earendil-works/pi-agent-core';
import type { Context } from '@earendil-works/pi-agent-core/harness/context';

export const LANE_HISTORY_PAGE_SIZE = 80;

/** Disposable UI page cache. Every row comes from the current pi branch; never used by the model. */
export async function openLaneHistoryPage(session: Session, laneName: string, context: Context, initialTip?: string | null) {
  const branch = await session.branch(laneName, context);
  if (!branch && (await session.findEntries({ limit: 1 }, context)).length) throw new Error('agent_lane_conversation_missing');
  let entries: Entry[] = [];
  let hasMore = false;
  let previousInputId: string | undefined;
  let generation = 0;
  let loading: Promise<void> | undefined;
  const read = async (tip: string | null, cursor?: number) => {
    if (!branch || tip === null) return { entries: [], hasMore: false, previousInputId: undefined };
    const query: BranchScan = { start: tip, order: 'newestFirst', limit: LANE_HISTORY_PAGE_SIZE + 1,
      ...(cursor === undefined ? {} : { cursor: { seq: cursor } }) };
    const page = await branch.findEntries(query, context);
    const entries = page.slice(0, LANE_HISTORY_PAGE_SIZE).reverse();
    const previous = await precedingLaneInput(branch, entries[0]?.parentId ?? null, context);
    return { entries, hasMore: page.length > LANE_HISTORY_PAGE_SIZE, previousInputId: previous?.id };
  };
  const reset = async (tip?: string | null) => {
    const epoch = ++generation;
    const page = await read(tip === undefined ? await branch?.getTipId(context) ?? null : tip);
    if (epoch !== generation) return;
    entries = page.entries;
    hasMore = page.hasMore;
    previousInputId = page.previousInputId;
  };
  await reset(initialTip);
  return {
    entries: (): readonly Entry[] => entries,
    previousInputId: () => previousInputId,
    state: () => ({ hasMore, ...(entries[0] ? { before: entries[0].id } : {}) }),
    reset,
    // Watch entries already have pi's ordering and identity. This is cache admission, not a runtime reducer.
    append: (entry: Entry) => {
      if (entry.seq <= (entries.at(-1)?.seq ?? -1)) return;
      entries = [...entries, entry];
    },
    older: (before: string): Promise<void> => {
      if (loading) return loading;
      if (!hasMore || before !== entries[0]?.id) return Promise.reject(new Error('agent_lane_workspace_stale'));
      const epoch = generation;
      const cursor = entries[0].seq;
      loading = read(entries.at(-1)!.id, cursor).then(page => {
        if (epoch !== generation) return;
        entries = [...page.entries, ...entries];
        hasMore = page.hasMore;
        previousInputId = page.previousInputId;
      }).finally(() => { loading = undefined; });
      return loading;
    },
  };
}

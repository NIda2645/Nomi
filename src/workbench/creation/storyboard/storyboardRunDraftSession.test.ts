import { expect, it } from 'vitest'
import { createStoryboardRunDraftSession } from './storyboardRunDraftSession'
const plan = (title: string) => ({ title, anchors: [], shots: [] })
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (value: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
it('serializes a later edit after its own acknowledgment without replacing the newer input', async () => {
  const first = deferred<{ revision: number; title: string }>()
  const writes: unknown[] = []
  const session = createStoryboardRunDraftSession({ read: async () => ({ revision: 1, title: 'initial' }), plan: receipt => plan(receipt.title), write: async (value, receipt) => {
    writes.push({ title: value.title, revision: receipt.revision })
    return writes.length === 1 ? first.promise : { revision: receipt.revision + 1, title: value.title }
  } })
  await session.read()
  session.change(plan('first'))
  session.change(plan('second'))
  const done = session.flush()
  first.resolve({ revision: 2, title: 'first' })
  await done
  expect(writes).toEqual([{ title: 'first', revision: 1 }, { title: 'second', revision: 2 }])
  expect(session.getSnapshot().plan?.title).toBe('second')
})
it('retains conflicting input and its original receipt across rereads and listener switches', async () => {
  const conflict = new Error('revision conflict')
  const session = createStoryboardRunDraftSession({ read: async () => ({ revision: 1, title: 'remote' }), plan: receipt => plan(receipt.title), write: async () => { throw conflict } })
  await session.read()
  const unsubscribe = session.subscribe(() => {})
  session.change(plan('local'))
  await expect(session.flush()).rejects.toThrow('revision conflict')
  unsubscribe()
  await session.read()
  expect(session.getSnapshot()).toMatchObject({ plan: { title: 'local' }, receipt: { revision: 1 }, dirty: true, error: conflict })
})
it('serializes edits made while a placement command is awaiting its receipt', async () => {
  const pending = deferred<{ revision: number; title: string }>()
  const writes: unknown[] = []
  const session = createStoryboardRunDraftSession({ read: async () => ({ revision: 1, title: 'original' }), plan: receipt => plan(receipt.title), write: async (value, receipt) => {
    writes.push({ title: value.title, revision: receipt.revision })
    return { revision: receipt.revision + 1, title: value.title }
  } })
  await session.read()
  const command = session.transact(() => pending.promise)
  await Promise.resolve()
  session.change(plan('edited during placement'))
  expect(writes).toEqual([])
  pending.resolve({ revision: 2, title: 'original' })
  await command
  expect(writes).toEqual([{ title: 'edited during placement', revision: 2 }])
  expect(session.getSnapshot()).toMatchObject({ dirty: false, plan: { title: 'edited during placement' }, receipt: { revision: 3 } })
})

import type { StoryboardPlan } from '../../generationCanvas/agent/storyboardPlan'

export type StoryboardDraftSnapshot<Receipt> = {
  plan: StoryboardPlan | null
  receipt: Receipt | null
  dirty: boolean
  saving: boolean
  error: unknown | null
}
/** Disposable input buffer. Only the injected, identity-bound owner persists content. */
export function createStoryboardRunDraftSession<Receipt>(ports: {
  read(): Promise<Receipt>
  plan(receipt: Receipt): StoryboardPlan
  write(plan: StoryboardPlan, receipt: Receipt): Promise<Receipt>
}) {
  let value: StoryboardDraftSnapshot<Receipt> = { plan: null, receipt: null, dirty: false, saving: false, error: null }
  let edit = 0
  let reading: Promise<void> | null = null
  let saving: Promise<void> | null = null
  const listeners = new Set<() => void>()
  const publish = (patch: Partial<typeof value>) => { value = { ...value, ...patch }; listeners.forEach(listener => listener()) }
  const read = () => {
    if (reading) return reading
    const before = edit
    reading = ports.read().then(receipt => {
      // A late read never discards input or silently rebases a conflicting draft.
      if (edit !== before || value.dirty || value.saving) return
      publish({ receipt, plan: ports.plan(receipt), error: null })
    }).catch(error => { publish({ error }) }).finally(() => { reading = null })
    return reading
  }
  const flush = (): Promise<void> => {
    if (saving) return saving.then(() => value.dirty ? flush() : undefined)
    if (value.error) return Promise.reject(value.error)
    if (!value.dirty || !value.plan || !value.receipt) return Promise.resolve()
    const plan = value.plan
    const receipt = value.receipt
    const version = edit
    publish({ saving: true })
    saving = ports.write(plan, receipt).then(next => {
      publish({ receipt: next, ...(edit === version ? { plan: ports.plan(next), dirty: false } : {}), error: null })
    }).catch(error => { publish({ error }); throw error }).finally(() => { saving = null; publish({ saving: false }) })
    return saving.then(() => value.dirty ? flush() : undefined)
  }
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    read,
    change(plan: StoryboardPlan) {
      edit++
      publish({ plan, dirty: true })
      // Retain the draft and error until an explicit conflict decision; never retry with a guessed revision.
      if (!value.error) void flush().catch(() => {})
    },
    flush,
    async saveLocalAgainstLatest() {
      if (saving) await saving
      const receipt = await ports.read()
      // Only an explicit user action adopts the latest revision while retaining local input.
      publish({ receipt, ...(value.dirty ? {} : { plan: ports.plan(receipt) }), error: null })
      await flush()
    },
    async transact(command: (receipt: Receipt) => Promise<Receipt>) {
      await flush()
      if (!value.receipt) throw new Error('Storyboard receipt unavailable')
      const version = edit
      publish({ saving: true })
      saving = command(value.receipt).then(receipt => {
        publish({ receipt, ...(edit === version ? { plan: ports.plan(receipt) } : {}), error: null })
      }).finally(() => { saving = null; publish({ saving: false }) })
      await saving
      await flush()
    },
  }
}

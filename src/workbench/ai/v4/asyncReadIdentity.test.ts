import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { describe, expect, it } from 'vitest'

// Exercise the actual frozen hook bodies with React's installed renderer. No DOM/server,
// timers, copied controller, or simulated effect ordering replaces the production hooks.
const require = createRequire(import.meta.url)
const fiberRequire = createRequire(require.resolve('@react-three/fiber'))
const Reconciler = fiberRequire('react-reconciler')
function evaluate(source: string, globals: Record<string, unknown>) {
  const context = vm.createContext({ React, ...globals })
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context)
  return context
}
type ProbeProps = { historyError?: boolean; value?: { runs: Array<{ runId: string }> }; [key: string]: unknown }
type ScrollNode = { props: ProbeProps; scrollTop: number; scrollHeight: number; clientHeight: number;
  listeners: Set<() => void>; addEventListener(type: string, fn: () => void): void; removeEventListener(type: string, fn: () => void): void }
function harness(Component: React.ComponentType<ProbeProps>) {
  let node: ScrollNode
  const renderer = Reconciler({
    now: Date.now, supportsMutation: true, isPrimaryRenderer: true,
    getRootHostContext: () => ({}), getChildHostContext: () => ({}), getPublicInstance: (i: ScrollNode) => i,
    prepareForCommit: () => null, resetAfterCommit: () => {}, shouldSetTextContent: () => false,
    createInstance: (_: unknown, props: ProbeProps) => node = { props, scrollTop: 0, scrollHeight: 1000, clientHeight: 300,
      listeners: new Set<() => void>(), addEventListener(_type: string, fn: () => void) { this.listeners.add(fn) }, removeEventListener(_type: string, fn: () => void) { this.listeners.delete(fn) } },
    createTextInstance: () => ({}), appendInitialChild: () => {}, appendChild: () => {}, appendChildToContainer: () => {},
    removeChild: () => {}, removeChildFromContainer: () => {}, clearContainer: () => {}, detachDeletedInstance: () => {},
    finalizeInitialChildren: () => false, prepareUpdate: () => true,
    commitUpdate: (i: ScrollNode, _p: unknown, _t: unknown, _old: unknown, props: ProbeProps) => { i.props = props },
    scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1, getCurrentEventPriority: () => 16,
  })
  const root = renderer.createContainer({}, 0, null, false, null, '', () => {}, null)
  const render = (props: ProbeProps | null) => { renderer.flushSync(() => renderer.updateContainer(props ? React.createElement(Component, props) : null, root, null)); renderer.flushPassiveEffects() }
  return { render, node: () => node, scroll: () => { for (const fn of [...node.listeners] as (() => void)[]) fn() },
    async settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); renderer.flushPassiveEffects() }, close: () => render(null) }
}
function deferred<T = unknown>() { let resolve!: (v: T) => void; let reject!: (e: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function panel() {
  const source = readFileSync(new URL('./AgentPanelV4Panel.tsx', import.meta.url), 'utf8')
  const hooks = source.slice(source.indexOf('  const scrollRef = React.useRef'), source.indexOf('  return (\n    <section', source.indexOf('  const scrollRef = React.useRef')))
  const context = evaluate(`function Probe({flow,onLoadOlder,scrollMemory,flowTail,slot,queue,historyIdentity,historyCursor}) {${hooks}\nreturn React.createElement('scroll',{ref:scrollRef,historyError});}`, {})
  return harness(context.Probe)
}
const props = (id: string, load: () => Promise<unknown>, memory = { current: { top: 0, atBottom: false } }) => ({ historyIdentity: id, historyCursor: id + '1', flow: [{ identity: id + '1' }], scrollMemory: memory, onLoadOlder: load })
describe('pagination lifecycle in actual Panel hooks', () => {
  it.each(['resolve', 'reject'] as const)('new short conversation starts immediately; old %s cannot settle its request', async outcome => {
    const h = panel(), a = deferred(), b = deferred(); let calls = 0
    h.render(props('A', () => a.promise)); h.scroll()
    h.node().scrollHeight = 100
    const next = props('B', () => { calls++; return b.promise })
    h.render(next)
    try {
      expect(calls).toBe(1)
      if (outcome === 'resolve') a.resolve('A0'); else a.reject(new Error('A failed'))
      await h.settle(); expect(h.node().props.historyError).toBe(false)
      h.render({ ...next, onLoadOlder: () => { calls++; return b.promise } }); h.scroll()
      expect(calls).toBe(1)
      b.resolve('B1'); await h.settle()
    } finally { h.close() }
  })
  it('same session in a new workspace and unmount invalidate old settlements', async () => {
    const h = panel(), old = deferred(), next = deferred(); let calls = 0
    const memory = { current: { top: 0, atBottom: false } }
    h.render(props('w1/lane/session', () => old.promise, memory)); h.scroll()
    h.render(props('w2/lane/session', () => { calls++; return next.promise }, memory)); h.scroll()
    expect(calls).toBe(1)
    old.reject(new Error('old workspace')); await h.settle()
    expect(h.node().props.historyError).toBe(false)
    h.close(); next.reject(new Error('unmounted')); await h.settle()
    h.render(props('w2/lane/session', () => Promise.resolve('w2/lane/session1'), memory))
    expect(h.node().props.historyError).toBe(false); h.close()
  })
  it('current failure reports locally, retry and same-session rerenders keep one request', async () => {
    const h = panel(), page = deferred(); let calls = 0
    const p = props('A', () => { calls++; return page.promise })
    h.render(p); h.scroll(); h.render({ ...p, flow: [...p.flow] }); h.scroll()
    expect(calls).toBe(1)
    page.reject(new Error('current')); await h.settle(); expect(h.node().props.historyError).toBe(true)
    const retry = deferred(); h.render({ ...p, onLoadOlder: () => { calls++; return retry.promise } }); h.scroll()
    expect(calls).toBe(2); expect(h.node().props.historyError).toBe(false)
    retry.resolve('A1'); await h.settle(); h.close()
  })
  it.each(['ack-first', 'commit-first'] as const)('preserves prepend geometry in %s order', async order => {
    const h = panel(), page = deferred(); const p = props('A', () => page.promise)
    h.render(p); h.node().scrollTop = 10; h.scroll()
    try {
      if (order === 'ack-first') { page.resolve('A0'); await h.settle() }
      h.node().scrollHeight = 1400
      h.render({ ...p, historyCursor: 'A0', flow: [{ identity: 'A0' }, ...p.flow] })
      expect(h.node().scrollTop).toBe(410)
      if (order === 'commit-first') { page.resolve('A0'); await h.settle() }
    } finally { h.close() }
  })
  it('keeps the reading position when another scroll arrives between page ACK and flow commit', async () => {
    const h = panel(), first = deferred(), second = deferred(); let calls = 0
    const p = props('A', () => (++calls === 1 ? first.promise : second.promise))
    h.render(p); h.node().scrollTop = 10; h.scroll()
    try {
      first.resolve('A0'); await h.settle()
      // The authoritative cursor advanced, but the rendered flow still shows A1.
      h.scroll()
      const firstFlow = [{ identity: 'A0' }, ...p.flow]
      h.node().scrollHeight = 1400
      h.render({ ...p, historyCursor: 'A0', flow: firstFlow })
      expect(h.node().scrollTop).toBe(410)
      if (calls === 2) {
        // A second read was admitted against the not-yet-committed first prepend.
        second.resolve('A-1'); await h.settle()
        h.node().scrollHeight = 1800
        h.render({ ...p, historyCursor: 'A-1', flow: [{ identity: 'A-1' }, ...firstFlow] })
        expect(h.node().scrollTop, 'both prepends must preserve the originally visible row').toBe(810)
      } else {
        // Serializing until the first prepend commits is also a valid implementation.
        expect(calls).toBe(1)
      }
    } finally { h.close() }
  })
  it.each(['ack-first', 'commit-first'] as const)('releases filtered cursor advancement in %s order without moving the row', async order => {
    const h = panel(), first = deferred(), second = deferred(); let calls = 0
    const p = props('A', () => { calls++; return calls === 1 ? first.promise : second.promise })
    h.render(p); h.node().scrollTop = 10; h.scroll()
    try {
      if (order === 'ack-first') { first.resolve('A0'); await h.settle(); h.scroll(); expect(calls).toBe(1) }
      h.render({ ...p, historyCursor: 'A0' })
      if (order === 'commit-first') { h.scroll(); expect(calls).toBe(1); first.resolve('A0'); await h.settle() }
      expect(h.node().scrollTop).toBe(10)
      h.scroll(); expect(calls).toBe(2)
      second.resolve('A0'); await h.settle()
    } finally { h.close() }
  })
  it.each(['ack-first', 'commit-first'] as const)('continues a short filtered page automatically in %s order', async order => {
    const h = panel(), first = deferred(), second = deferred(); let calls = 0
    const p = props('A', () => (++calls === 1 ? first.promise : second.promise))
    h.render(p); h.node().scrollHeight = 100; h.scroll()
    try {
      if (order === 'ack-first') { first.resolve('A0'); await h.settle() }
      h.render({ ...p, historyCursor: 'A0' })
      if (order === 'commit-first') { expect(calls).toBe(1); first.resolve('A0'); await h.settle() }
      expect(calls).toBe(2)
      second.resolve('A0'); await h.settle()
      expect(calls, 'an unchanged cursor must not cause an automatic retry loop').toBe(2)
    } finally { h.close() }
  })
  it('A-B-A does not revive the old A token; empty ACK cannot anchor later reset', async () => {
    const h = panel(), old = deferred(), current = deferred(); let calls = 0
    const a = props('workspace1/A', () => old.promise)
    h.render(a); h.scroll(); h.render(props('B', () => Promise.resolve('B1')))
    h.render({ ...a, onLoadOlder: () => { calls++; return current.promise } }); h.scroll()
    try {
      expect(calls).toBe(1); old.reject(new Error('old')); await h.settle(); expect(h.node().props.historyError).toBe(false)
      current.resolve(a.historyCursor); await h.settle()
      h.node().scrollTop = 17; h.node().scrollHeight = 1800
      h.render({ ...a, flow: [{ identity: 'replacement' }], onLoadOlder: undefined })
      expect(h.node().scrollTop).toBe(17)
    } finally { h.close() }
  })
})

import { describe, expect, it } from 'vitest'
import { createControlledEditorSync } from './controlledEditorSync'

/**
 * 模拟真实链路：编辑器每按一键 emit 一版；owner（store → React Flow 投影 → props）回流时可能晚任意拍，
 * 中间还会用**旧一拍**的值重渲染（节点组件自己的 store 订阅先跑、投影在 effect 里才追上）。
 * 编辑器文档 = 裁决说「写进来」时才被覆盖。
 */
function simulate(initial: string) {
  const sync = createControlledEditorSync(initial)
  let doc = initial
  const owner: string[] = [initial]
  return {
    type(char: string) {
      doc += char
      if (sync.emit(doc)) owner.push(doc)
    },
    /** props 以某一版 owner 值到达（index 省略 = 最新）。 */
    deliver(value = owner[owner.length - 1]) {
      if (sync.receive(value)) doc = value
    },
    external(value: string) {
      owner.push(value)
      if (sync.receive(value)) doc = value
    },
    get doc() { return doc },
    owner,
  }
}

describe('controlled editor sync (2026-09-21 fast typing drops keys)', () => {
  it('reported case: a stale echo of text the editor already emitted does not overwrite the document', () => {
    const editor = simulate('')
    editor.type('A')
    editor.type('B')
    editor.deliver('A') // 节点组件用上一拍的 node.prompt 重渲染
    expect(editor.doc).toBe('AB')
  })

  it('reported case, first key: the value from before typing started does not overwrite the document', () => {
    const editor = simulate('')
    editor.type('A')
    editor.deliver('') // 第一键之后那次旧拍重渲染，带的是打字之前的空串
    editor.type(' ')
    expect(editor.doc).toBe('A ')
  })

  it('class: every interleaving of in-order stale echoes keeps every key', () => {
    const text = 'A samurai walks slowly, 镜头从背后跟拍；(35mm, f/2.8)!'
    // 每按一键后，随机回放 0..n 个尚未确认的旧值（按发出顺序），模拟 0ms 连打时投影落后任意拍。
    let seed = 7
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    for (let round = 0; round < 50; round += 1) {
      const editor = simulate('')
      let delivered = 0
      for (const char of text) {
        editor.type(char)
        const lag = Math.floor(random() * 4)
        while (delivered < editor.owner.length - 1 - lag) {
          delivered += 1
          editor.deliver(editor.owner[delivered - 1])
        }
        // 投影没动时，节点组件还会因为别的订阅用同一个旧值再渲染几次。
        const repeats = Math.floor(random() * 3)
        for (let repeat = 0; repeat < repeats; repeat += 1) editor.deliver(editor.owner[Math.max(0, delivered - 1)])
      }
      for (; delivered < editor.owner.length; delivered += 1) editor.deliver(editor.owner[delivered])
      expect(editor.doc).toBe(text)
    }
  })

  it('an external rewrite (optimize / translate / agent / undo) is written into the editor', () => {
    const editor = simulate('一只橘猫')
    editor.type('，窗台')
    editor.deliver()
    editor.external('An orange cat on a windowsill')
    expect(editor.doc).toBe('An orange cat on a windowsill')
    editor.type(' at dusk')
    editor.deliver('An orange cat on a windowsill') // 外部改写自己的回声也不许倒回
    expect(editor.doc).toBe('An orange cat on a windowsill at dusk')
  })

  it('an external rewrite arriving while echoes are still pending wins and clears the ledger', () => {
    const editor = simulate('')
    editor.type('a')
    editor.type('b')
    editor.external('REWRITTEN')
    expect(editor.doc).toBe('REWRITTEN')
    editor.deliver('a') // 改写之前的回声不再算回声：账已清空，它是新的外部值
    expect(editor.doc).toBe('a')
  })

  it('once the owner has caught up, writing back the old acknowledged value is an external change (undo)', () => {
    const editor = simulate('before')
    editor.type('!')
    editor.deliver() // owner 追上 'before!'
    editor.external('before') // 撤销
    expect(editor.doc).toBe('before')
  })

  it('transactions that do not change the serialized value are not written back', () => {
    const sync = createControlledEditorSync('same')
    expect(sync.emit('same')).toBe(false)
    expect(sync.emit('next')).toBe(true)
  })

  it('reset adopts a rebuilt editor document as the new baseline', () => {
    const sync = createControlledEditorSync('a')
    sync.emit('ab')
    sync.reset('xyz')
    expect(sync.current()).toBe('xyz')
    expect(sync.receive('ab')).toBe(true)
  })
})

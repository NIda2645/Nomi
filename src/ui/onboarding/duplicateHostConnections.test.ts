/**
 * 添加连接表单那行动态提示的判据（issue #831）。
 *
 * 最重要的一条：提示说的和写入侧真做的必须是**同一件事**。表单说「会新建独立连接」
 * 而 `resolveConnectionVendorKey` 实际落到旧连接上去更新它，比不提示还糟
 * —— 所以这里和 electron/catalog/connectionVendorKey.test.ts 用同一组输入。
 */
import { describe, expect, it } from 'vitest'
import { duplicateHostVerdict, type DuplicateHostConnection } from './duplicateHostConnections'

const full: DuplicateHostConnection = {
  vendorKey: 'gw-example-test',
  name: '满血组',
  baseUrl: 'https://gw.example.test/v1',
}
const mini: DuplicateHostConnection = {
  vendorKey: 'gw-example-test--mini',
  name: 'Mini tier',
  baseUrl: 'https://gw.example.test/v2',
}

describe('duplicateHostVerdict', () => {
  it('地址还没解析得出 hostname 时保持安静（用户正在打字，不许抖）', () => {
    for (const baseUrl of ['', 'https://g', 'http:/', 'gw.example.test']) {
      expect(duplicateHostVerdict({ baseUrl, name: 'x', connections: [full] }).kind).toBe('none')
    }
  })

  it('地址没被占 → none（显示原来那句静态 hint）', () => {
    expect(duplicateHostVerdict({
      baseUrl: 'https://other.example.test/v1',
      name: 'Mini',
      connections: [full],
    }).kind).toBe('none')
  })

  it('同域名 + 新名字 → create，并报出已有那条的名字', () => {
    expect(duplicateHostVerdict({
      baseUrl: 'https://gw.example.test/v2',
      name: 'Mini tier',
      connections: [full],
    })).toEqual({ kind: 'create', existingName: '满血组' })
  })

  it('同域名 + 同名 → update，报的是被更新的那条', () => {
    expect(duplicateHostVerdict({
      baseUrl: 'https://gw.example.test/v9',
      name: 'Mini tier',
      connections: [full, mini],
    })).toEqual({ kind: 'update', existingName: 'Mini tier' })
  })

  it('slug 撞车按同名算（和写入侧同一条判据）', () => {
    expect(duplicateHostVerdict({
      baseUrl: 'https://gw.example.test/v9',
      name: 'mini-tier',
      connections: [full, mini],
    })).toEqual({ kind: 'update', existingName: 'Mini tier' })
  })

  it('名字为空 / 纯中文（slug 为空）→ update 到 host 那条', () => {
    for (const name of ['', '满血组', '———']) {
      expect(duplicateHostVerdict({
        baseUrl: 'https://gw.example.test/v9',
        name,
        connections: [full, mini],
      })).toEqual({ kind: 'update', existingName: '满血组' })
    }
  })

  it('回环地址按端口分家：另一个端口不算撞（否则会对着 Ollama 说「已有连接 ComfyUI」）', () => {
    const comfy: DuplicateHostConnection = { vendorKey: 'local-8188', name: '本地 ComfyUI', baseUrl: 'http://127.0.0.1:8188' }
    expect(duplicateHostVerdict({
      baseUrl: 'http://127.0.0.1:11434',
      name: 'Ollama',
      connections: [comfy],
    }).kind).toBe('none')
    // 同一个端口才算撞。
    expect(duplicateHostVerdict({
      baseUrl: 'http://127.0.0.1:8188/v1',
      name: 'ComfyUI 备用 Key',
      connections: [comfy],
    })).toEqual({ kind: 'create', existingName: '本地 ComfyUI' })
  })
})

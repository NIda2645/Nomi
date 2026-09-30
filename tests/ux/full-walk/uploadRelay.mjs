// 本机的「素材中转」替身：参考图要先传到一个供应商取得到的地址，App 的上传通道列表里有一格是自部署 Relay
// （`electron/catalog/assetRelayRuntimeConfig.ts` 的 NOMI_ASSET_RELAY_URL，允许 127.0.0.1）。
//
// 为什么要它：出网闸拦下了所有公网上传通道（供应商自己的上传口、Nomi 公共 Relay、匿名图床），
// 不给一条本机通道，画布上「连着参考图生成」在零花费走查里就永远走不到供应商那一步——
// 那就测不到铁律 3（参考图到底发没发出去）。它只收下文件、在本机回一个地址，供应商夹具就能按地址取到。
import http from 'node:http'

function fileFromMultipart(body, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType ?? ''))
  if (!boundary) return null
  const marker = Buffer.from(`--${boundary[1] ?? boundary[2]}`)
  let cursor = body.indexOf(marker)
  while (cursor !== -1) {
    const next = body.indexOf(marker, cursor + marker.length)
    if (next === -1) break
    const part = body.subarray(cursor + marker.length, next)
    const split = part.indexOf('\r\n\r\n')
    if (split !== -1) {
      const head = part.subarray(0, split).toString('utf8')
      if (/filename=/i.test(head)) {
        const bytes = part.subarray(split + 4, part.length - 2) // 去掉结尾的 \r\n
        const type = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? 'application/octet-stream'
        const name = /filename="([^"]*)"/i.exec(head)?.[1] ?? 'upload.bin'
        return { bytes, type, name }
      }
    }
    cursor = next
  }
  return null
}

export async function startUploadRelay() {
  const files = new Map()
  const uploads = []
  let sequence = 0
  const server = http.createServer(async (request, response) => {
    const url = request.url ?? ''
    if (request.method === 'GET' && url.startsWith('/asset/')) {
      const file = files.get(url.slice('/asset/'.length))
      if (!file) { response.writeHead(404).end(); return }
      response.writeHead(200, { 'Content-Type': file.type, 'Content-Length': file.bytes.length })
      response.end(file.bytes)
      return
    }
    if (request.method !== 'POST') { response.writeHead(405).end(); return }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const file = fileFromMultipart(Buffer.concat(chunks), request.headers['content-type'])
    if (!file) { response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'no file part' })); return }
    const id = `walk-${++sequence}-${file.name.replace(/[^\w.-]+/g, '_')}`
    files.set(id, file)
    const address = `${origin}/asset/${id}`
    uploads.push({ id, name: file.name, bytes: file.bytes.length, type: file.type, url: address, at: Date.now() })
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ url: address }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  return {
    uploads,
    env: { NOMI_ASSET_RELAY_URL: `${origin}/v1/assets`, NOMI_ASSET_RELAY_TOKEN: 'full-walk-relay' },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

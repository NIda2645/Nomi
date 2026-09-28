# Higgsfield 真实响应夹具

这四个 JSON **不是手写的**，是 2026-09-17 真机跑出来的原样响应（key 已在录制时打码）：

| 文件 | 来自哪一跑 |
|---|---|
| `soul2-create.json` | Soul 2 提交后的 200 应答 |
| `soul2-terminal.json` | 同一个 request 轮询到 `completed` 的终态（含产物 URL） |
| `upload-init-shape.json` | `POST /files/generate-upload-url` 的响应形状与 `upload_headers` |
| `in-progress.json` | 轮询中途的 `in_progress`（文档没列的那个词） |

为什么必须是录的不是编的：手写的假响应只会复述我们**以为**的形状，
证明不了我们读对了供应商。这几条正好抓到两个「以为」是错的地方——
`in_progress` 这个状态词，和 `images[].url` 是裸字符串（不是 apimart 那种数组）。

重录：`npx tsx tests/transport-spike/higgsfield.ts soul2`（会真花约 $0.004）。

---
model: gpt image 2.5 flare
maker: OpenAI
released: 2026-09-08
checkedAt: 2026-09-28
headline: OpenAI GPT Image 2.5 的快速档，主打日常出图、批量生成和快速试稿。
sources:
  - title: GPT-Image-2.5 Flare 模型文档（OpenAI 官方 API 文档）
    url: https://developers.openai.com/api/docs/models/gpt-image-2.5-flare
  - title: 图像提示词指南（OpenAI 官方 API 文档）
    url: https://developers.openai.com/api/docs/guides/image-prompting
  - title: GPT Image 2.5 Flare 文生图接口文档（Kie.ai）
    url: https://docs.kie.ai/market/gpt/gpt-image-2-5-flare-text-to-image.md
  - title: GPT Image 2.5 接口文档（APIMart，同时覆盖 Flare 和 Sunburst）
    url: https://docs.apimart.ai/en/api-reference/images/gpt-image-2.5/generation.md
---

## 新在哪

- **2.5 代里的"快"档**：2026-09-08 上线，官方定位是"最快的高质量日常出图模型"；和主打精修的 Sunburst 是并列的两条产品线，不是同一款的快慢档。
- **质量档位多了两级**：quality 参数新增 xhigh、max（加上原有 low/medium/high/auto 共 6 档），xhigh 和 max 是 2.5 这代才有，上一代 GPT Image 2 用不了。
- **改图一次最多带 16 张参考图**：支持透明通道蒙版做局部重绘，只改需要改的区域。
- **画幅更专**：13 种比例里包含 27:16 / 16:27 / 9:8 / 8:9 这类少见的超宽画幅（不过这几个只能出 1K，2K/4K 不支持）。

## 适合做什么

- 社交媒体配图、电商产品图这类要走量的场景，追求出图快。
- 快速试稿：先用 Flare 把构图和创意过一遍，方向定了再决定要不要换更精修的模型。
- 同系列素材的批量生成（比如一组产品的不同角度图），对单张精修程度要求没那么高。

## 提示词要点

- **先想清楚是不是真的需要更精修的模型**：官方指南的建议是——质量要求没那么苛刻就先用 Flare；如果 Sunburst 出的图能满足需求，可以拿同样的输入在 Flare 上再跑一遍，看看画质是否也够、速度是不是更快。
- **先说清楚用途和构图**：点明是产品照、广告图还是示意图，再说画幅比例、关键元素放哪。
- **挑自己方便改的写法**：不用记特殊语法，大白话一段话、分点列、打标签都行，挑你自己最容易读、最容易改的。
- **要写实就直接说"写实"**：想要照片质感就明说 photorealistic，并描述取景、材质、光线。
- **画面里的文字用引号圈起来**：把要出现的文字放进引号，说明位置和字体感觉。
- **需要透明背景就直接要求**：background 设成 transparent，并选 PNG/WebP 格式输出。

```text
四张同一款运动水壶的产品图，都是 16:9，白底摄影棚风格，写实质感，柔光从左上 45 度打过来。
颜色分别是黑、白、藏青、军绿，瓶身角度略有不同（正面、45 度侧面、俯视、45 度背面）。
背景干净，只留淡淡投影，不要多余装饰。
```

## 已知限制

- **几个极端画幅只能出 1K**：27:16 / 16:27 / 9:8 / 8:9 这四种比例不支持 2K、4K。
- **不指定比例（auto）或某些比例上不了 4K**：具体以画幅是否落在支持列表为准，实际选比例前要留意分辨率档位是否可选。
- **透明背景需要显式声明**：不设置 background 参数不会自动给透明底，要透明底必须自己指定 transparent 并搭配 PNG/WebP 格式。

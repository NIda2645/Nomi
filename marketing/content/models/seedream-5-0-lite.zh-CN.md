---
model: seedream 5.0 lite
maker: 字节跳动 Seed
released: 2026-02-13
checkedAt: 2026-09-28
headline: 字节跳动图片模型的轻量版，先推理再画、还能联网查资料，一次最多出 15 张，适合办公场景的信息可视化。
sources:
  - title: Introducing Seedream 5.0 Lite（字节跳动 Seed 官方博客，2026-02-13）
    url: https://seed.bytedance.com/en/blog/deeper-thinking-more-accurate-generation-introducing-seedream-5-0-lite
  - title: Seedream 5.0 Lite 产品页（字节跳动 Seed）
    url: https://seed.bytedance.com/en/seedream5_0_lite
  - title: Seedream 5.0 Lite 接口文档（apimart）
    url: https://docs.apimart.ai/en/api-reference/images/seedream-5-lite/generation.md
  - title: Seedream 5.0 提示词指南（即梦 Dreamina）
    url: https://dreamina.capcut.com/resource/seedream-5-0-prompt
---

## 新在哪

- **先想清楚再画**：官方说它带深度推理能力，理解意图之后再生成，不是看到关键词就直接画。
- **能联网查资料**：这是 Seedream 系列第一个带实时联网检索的版本，画时效性内容时能先查到最新信息再画。
- **听得懂复杂指令**：多步骤指令、多张参考图输入、局部编辑指令、批量风格要求都能处理。
- **一次最多出 15 张**：n 参数支持 1–15（参考图数量加 n 的总数不超过 15），比 Pro 灵活不少。

## 适合做什么

- 需要联网查最新信息再生成的时效性内容。
- 办公、教育场景的信息可视化：图表、流程图、复杂版式呈现。
- 一次要好几个风格变体或系列物料的批量出图。

## 提示词要点

- **模糊指令也不怕**：官方说它能理解不那么精确的表达，不用堆砌专业术语。
- **多步推理任务按步骤写**：像棋局分析、拼装示意图这类需要"想明白"的画面，把逻辑步骤说清楚。
- **参考图说明用途**：风格参考、色调参考各自的作用写清楚，模型会照着做局部调整。
- **需要联网就直接说**：想要最新信息（比如天气、热点）时，在提示词里点明要查什么。
- **要系列变体用 n**：一次多出几张不同方案，比反复单独生成更省事。

```text
生成一张"如何组装书架"的四步图解，从左到右排列，
每一步配简短文字编号，线条清晰的示意图风格，浅灰背景：
步骤一摆放侧板；步骤二装隔板；步骤三装背板；步骤四固定五金件。
```

## 已知限制

- 官方自己说这是"相对较小的模型"，结构稳定性、真实感、美感上还有提升空间。
- 参考图数量和输出张数共享同一个上限（合计不超过 15 张），参考图给得越多，能出的图就越少。
- 不支持 9:21 竖屏比例（21:9 横屏可以）。

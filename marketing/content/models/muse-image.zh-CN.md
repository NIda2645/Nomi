---
model: muse image
maker: Meta Superintelligence Labs
released: 2026-07-07
checkedAt: 2026-09-28
headline: Meta 出品、经 Runway 提供的图像模型，先规划排版再画，一次能揉合 10 张参考图，还会自己检查修改。
sources:
  - title: Introducing Muse Image and Muse Video（AI at Meta 官方博客，2026-07-07）
    url: https://ai.meta.com/blog/introducing-muse-image-muse-video-msl/
  - title: "Introducing Muse Image: Image Generation Built for Your World（Meta 官方新闻稿，2026-07）"
    url: https://about.fb.com/news/2026/07/introducing-muse-image-meta-ai/
  - title: Muse Image API 开发者指南（developer.meta.com，Meta 官方）
    url: https://developer.meta.com/ai/resources/blog/build-with-muse-Image/
  - title: Muse Image（muse_image）模型页（Runway Dev，Nomi 的接入渠道）
    url: https://dev.runwayml.com/endpoints/text_to_image?modelId=muse_image
---

## 新在哪

- **这是 Meta 的模型，经 Runway 接口提供**：Muse Image 由 Meta Superintelligence Labs 研发，2026 年接入 Runway 的图像生成接口，Nomi 通过 Runway 调用这个模型。
- **先规划、边生成边自查**：不是提示词直接转图，它会先看懂每张输入图、想清楚整体布局——哪里放什么、分几部分、怎么摆，生成过程中还会自己复查，觉得不对就局部改一下、整张重来，或者换个做法。
- **一次揉合最多 10 张参考图**：人物、产品、背景可以分开喂给它，每张参考图当一个独立"素材"处理，身份和场景都能保住。
- **图里的文字更可信**：价格、招牌、标语这类要出现在图里的文字，Meta 说这版渲染准确度更高。

## 适合做什么

- 需要保留身份的图：同一件产品放进不同场景，或者同一个人换不同造型，样子不跑偏。
- 带清楚文字的海报、价签、招牌类素材。
- 素材缝合：把已有的人物、背景、道具图合成一张新图，不是纯从零画。

## 提示词要点

- **把画面里谁在哪、朝哪写清楚**：比如"桌上的台灯偏向键盘、齐桌面高度平拍"，比笼统的"桌上有台灯"更能定住构图。
- **每张参考图给个身份**：提示词里点名"第二张图里的驼色托特包"，而不是含糊地说"那张图"，模型才知道该保留谁的样子。
- **想保住的东西必须写进提示词**：这模型没有 seed 参数，同一句提示词两次生成结果不会一样，也没法找回上一版；没写进提示词的部分，每次都会被重新决定。
- **文字类素材要给准确的字数和内容**：价格、标语这些要出现的文字，具体数字和文案直接写出来，别让模型自己编。
- **没底的时候一次多出几张再挑**：没有 seed 就没法"钉住"某一版重出，想要满意的结果靠批量生成再挑选，而不是反复微调同一张。

```text
把第一张参考图里的女生和第二张参考图里的驼色托特包放进同一张秋季促销海报：
她站在落叶纷飞的街头，斜挎着这只托特包，齐腰平拍，侧逆光。
海报上方留白写「秋季新品 · 全场 8 折」，字体简洁清晰可读。整体保持第二张参考图里的暖棕色调。
```

## 已知限制

- 没有 seed 参数：同一句提示词每次生成的结果都不一样，也没法回到之前生成过的某一版。
- 多图合成时，画面排版会跟着输入图重新调整；图里文字的具体渲染结果也一次一个样，对准确性要求高的文字建议多生成几次核对。

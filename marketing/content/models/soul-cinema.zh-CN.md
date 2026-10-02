---
model: soul cinema
name: Higgsfield Soul Cinema
maker: Higgsfield
released: 2026-03
checkedAt: 2026-09-28
headline: Higgsfield Soul 系列里专攻电影感的图片模型，胶片颗粒和氛围光是它的主场，也常被拿来当视频关键帧用。
sources:
  - title: Soul Cinema Preview——Cinematic-Grade Visuals In One Click（Higgsfield 官方博客，2026-03）
    url: https://higgsfield.ai/blog/soul-cinema-preview
  - title: Soul Cinema - Cinematic AI Image Generation（Higgsfield 官网产品页）
    url: https://higgsfield.ai/soul-cinema
  - title: SOUL Cinema 生成接口文档（docs.higgsfield.ai，Higgsfield 官方开发者文档）
    url: https://docs.higgsfield.ai/docs/models/soul-cinema/generate
---

## 新在哪

- **只做一种质感，风格是固定的**：接口文档写明 Soul Cinema 的风格是固定的，客户端传的风格参数会被忽略——电影感直接焊在模型里，不像 Soul 2 那样能换预设。
- **胶片颗粒和景深更真实**：Higgsfield 说它的颗粒质感更接近实拍胶片，不是数码噪点那种生硬感，前后景分离、材质细节都照着电影摄影的标准来。
- **懂不同年代的电影质感**：能区分 70 年代、90 年代和当代的影像气质，不用自己解释年代感该长什么样。
- **可以直接当视频的关键帧**：Higgsfield 建议把 Soul Cinema 出的图当 Kling、Seedance 这类视频模型的首帧输入，衔接视频生成流程。

## 适合做什么

- 影视项目的分镜、关键帧预览和氛围参考图。
- 音乐视频、广告片的视觉概念图。
- 需要电影感质感的画廊级作品图。

## 提示词要点

- **说清楚场景、主体、情绪三件事**：Higgsfield 的官方指引就是把这三样说清楚，不需要堆砌摄影术语。
- **反复出现的角色用训练好的 ID 引用**：和 Soul 2 共用同一套 Soul ID 机制，训练一次、之后按角色 ID 调用，强度 0 到 1 可调。
- **拿不准就打开自动润色**：提示词写得简单时，打开自动润色开关让模型帮忙补细节。
- **光线要写来源**：黄昏、蓝调时刻、柔焦这类带光源信息的词，比单纯"好看的光"更接近电影质感。
- **想复现某一版效果就存好 seed**：同一个 seed 配同样的提示词能找回类似结果。

```text
黄昏蓝调时刻，雨后老城区街道，一位穿风衣的男人背对镜头远望，35mm 定焦镜头质感，胶片颗粒，暗角，近景，情绪安静而压抑。
```

## 已知限制

- 不支持直接上传参考图片：想保持角色一致得靠训练好的 Soul ID 角色引用，不能直接传一张照片当构图参考。
- 没有可切换的风格预设：官方文档写明客户端传的风格参数会被忽略，电影感是固定基调。
- 出图张数只有 1 或 4 两个选项，没有中间值。

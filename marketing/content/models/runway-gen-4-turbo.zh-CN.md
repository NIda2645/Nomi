---
model: runway gen-4 turbo
maker: Runway
released: 2025-04-07
checkedAt: 2026-09-28
headline: Runway 更快更轻的视频模型，只支持图生视频——给一张图和一句运动描述，就能快速生成一段视频。
sources:
  - title: Creating with Gen-4 Video（Runway 官方帮助中心）
    url: https://help.runwayml.com/hc/en-us/articles/37327109429011-Creating-with-Gen-4-Video
  - title: Models Catalog（Runway Dev 官方开发者文档）
    url: https://dev.runwayml.com/models/catalog
  - title: Product Changelog（Runway 官方产品更新日志，2025-04-07 条目「Gen-4 Turbo」）
    url: https://runway.com/changelog
  - title: API Changelog & Updates（Runway Dev 官方 API 更新日志，2025-10-08 条目）
    url: https://docs.dev.runwayml.com/api-details/api_changelog/
  - title: Prompting Guide（Runway Academy 官方提示词指南）
    url: https://academy.runwayml.com/guides/prompting-guide
  - title: Runway 官方 X 账号发布公告（@runwayml，2025-04-07）
    url: https://x.com/runwayml/status/1909302613192876102
---

## 新在哪

- **是当时「最强视频模型」里最快的生成方式**：官方发布公告原话是「用我们目前最强大的视频模型，最快的生成方式」（"the fastest way to generate with our most powerful video model yet"），规模和可靠性维持在上一代 Gen-3 Alpha Turbo 的水准。
- **10 秒视频约 30 秒就能出**：官方公告原话是「生成一段 10 秒视频现在只需 30 秒」，比标准 Gen-4 更快，适合快速迭代和创意探索。
- **API 端时长更灵活**：2025 年 10 月起，通过 Runway API 用 Gen-4 Turbo 可以在 2–10 秒之间任选时长，不再局限于产品里 5 秒 / 10 秒两档。

## 适合做什么

- 已经有一张定好构图和风格的图（产品图、角色图、关键帧），想让它动起来。
- 需要快速出效果去试运镜、试动作方向，而不是一次性抠细节的最终成片。
- 对着同一张图反复尝试不同的运动描述，找到满意的效果之后再深入做。

## 提示词要点

- **提示词只管动作，别管画面**：图片已经把构图、光线、风格定下来了，官方说文字应该「几乎完全用来描述想要的运动」。
- **正向措辞**：直接说想要什么，别写「不要怎样」这种反向描述；Runway 官方提示词指南说负面措辞容易让结果不可预期。
- **结构照着「运镜 + 主体动作」写**：比如「镜头缓慢推近，同时人物转身」。
- **想要镜头纹丝不动就明说**：加一句「镜头保持静止不动」。
- **画面切太碎就加一句「连续镜头」**：能减少不必要的切换。
- **先简单，再一步步加细节**：第一版提示词别堆太满，看效果之后再迭代。

```text
镜头缓慢向前推进，画面中的滑板男孩助跑后起跳，在空中完成一次转体，随后稳稳落地。
风吹起他外套的下摆。运镜连续不间断，没有切镜，镜头全程保持稳定。
```

## 已知限制

- **只支持图生视频，没有纯文生视频**：Runway Dev 的官方模型目录里，Gen-4 Turbo 只标了「Image to Video」这一项任务；官方帮助中心也写明 Gen-4 系列生成必须提供输入图片。想要文生视频的话，Runway 目前的旗舰模型是支持文生视频的 Gen-4.5。
- **产品里时长只有两档**：5 秒或 10 秒；2025 年 10 月起，走 API 才能在 2–10 秒之间任选时长。
- **单条提示词最多 1000 字符**。

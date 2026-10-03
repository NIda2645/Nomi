---
model: minimax h3-max
name: MiniMax H3-Max
maker: MiniMax、fal.ai
checkedAt: 2026-09-28
headline: MiniMax 和 fal.ai 联合推出的 H3 加速版，专注更快出片，支持文生、图生、参考生视频。
sources:
  - title: Video Generation（MiniMax 官方 API 文档，说明 H3-Max 由 MiniMax 与 fal.ai 联合发布）
    url: https://platform.minimax.io/docs/guides/video-generation
  - title: MiniMax H3 Max（Text to Video）模型页（fal.ai）
    url: https://fal.ai/models/minimax/h3-max/text-to-video
---

## 新在哪

和 MiniMax H3 本体相比：

- **由 MiniMax 和 fal.ai 联合打造**：官方文档写明 H3-Max 是 fal.ai 在 MiniMax H3 基础上做二次训练（post-trained）得到的版本，专门针对生成速度做了优化。
- **生成更快**：定位是"主流分辨率、更快速度"，适合需要更快拿到结果的场景。
- **fal.ai 说它在指令遵循和画面美感上做了针对性调优**，同时尽量不牺牲输出质量（这是 fal.ai 自己的说法）。
- **分辨率改成 480P/768P 两档**：把顶格分辨率换成了更常用的档位，和追求速度的定位一致。

## 适合做什么

- 需要快速拿到大量素材的场景，比如批量测试分镜、快速迭代创意方向。
- 对分辨率要求不高（480P/768P 够用）、但出片速度更重要的项目。
- 和 MiniMax H3 一样的三种玩法：文生视频、图生（首尾帧）视频、参考生视频，只是换成更快的那条通道。

## 提示词要点

- **写法和 MiniMax H3 基本一致**：用一句话描述参考素材之间的关系，不用套固定任务模板。
- **用方括号写运镜指令**，比如 [推镜]、[拉镜]，放在关键描述后面。
- **首尾帧支持 0、1 或 2 张图**：不传图就是纯文生视频。
- **参考模式最多混合 12 个素材文件**（图片、视频、音频总数），具体到每一类的上限和 MiniMax H3 一致。
- **时长范围是 5–15 秒的整数**，比 MiniMax H3 的下限（4 秒）稍高，写的时候注意别写小于 5 的数字。

```text
参考生视频，768P，8 秒。
角色沿用参考图 1 的外观，动作参照参考视频 1 的街舞节奏。
[跟随镜头] 保持人物始终在画面居中位置，背景是霓虹灯招牌林立的夜市。
```

## 已知限制

- 分辨率上限是 768P，比 MiniMax H3 的 2K 低，追求最高画质要用 H3 本体。
- 时长最短 5 秒，不能低于这个值（MiniMax H3 本体是 4 秒起）。
- 具体调优方法由 fal.ai 完成，MiniMax 官方文档没有展开说明细节。

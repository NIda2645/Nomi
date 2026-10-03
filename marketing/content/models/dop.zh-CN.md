---
model: dop
name: Higgsfield DoP
maker: Higgsfield AI
released: 2025-03-31
checkedAt: 2026-09-28
headline: Higgsfield 出的图生视频模型，主打运镜：选预设就能让一张图动起来，官方给了 50 多种运镜可选。
sources:
  - title: Higgsfield DoP 使用指南（Higgsfield 官方帮助中心）
    url: https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-dop
  - title: 该用哪个 Higgsfield AI 模型（Higgsfield 官方帮助中心）
    url: https://higgsfield.ai/creator-hub/help-center/ai-models/which-ai-model-should-i-use
  - title: Higgsfield Camera Controls 运镜预设页（Higgsfield 官方）
    url: https://higgsfield.ai/camera-controls
  - title: Introducing Higgsfield DoP I2V-01-preview（Higgsfield 官方博客，2025-03-31）
    url: https://higgsfield.ai/blog/Introducing-Higgsfield-DoP-preview
  - title: About Higgsfield（Higgsfield 官网关于页）
    url: https://higgsfield.ai/about
---

## 新在哪

- **专门做运镜，不是泛用视频模型**：DoP 从一张图直接生成有运镜的镜头，官方给了 50 多种运镜预设，从基础的推、拉、摇、移到子弹时间、机械臂视角这类更复杂的运镜都有。
- **预设直接决定镜头逻辑**：不用在提示词里堆运镜术语，选对预设运镜方式就定了，提示词只负责补场景细节。
- **扩散模型之外加了一层强化学习训练**：官方说训练方式参考了推理大模型的强化学习后训练思路，专门教模型运镜、打光、镜头感和画面结构，让运镜更像真人摄影师拍出来的。
- **一张图就是完整输入**：不需要视频素材或分镜稿，一张清晰的图加一个预设就能开始生成。

## 适合做什么

- 产品图、人像照片想要"动起来"又要带专业运镜感的短片，比如电商卖点视频、人像类内容。
- 静态海报或概念图快速做成带镜头运动的预告片感短片，不用搭实体运镜设备。
- 手上已经有插画、渲染图、照片这类静态素材，想加运镜变化又不想重新拍摄或建模。

## 提示词要点

- **先选一张清晰、构图完整的图**：官方说图片质量直接决定成片质量，模糊或构图差的图容易出软、糊的画面。
- **按想要的运镜类型挑预设分类**：Effects（特效向）、Basic/Epic Camera Control（基础到高阶运镜）、Catch the Pulse（精选主题合集）、Mix（多预设组合）——先定类型再选具体预设。
- **预设管运镜，提示词管场景**：预设已经决定摄像机怎么动，提示词重点写清楚画面里在发生什么、氛围是什么，不用再描述运镜。
- **画面不怎么动或者忽略了细节就开 Enhance**：这是官方帮助文档给的建议，Enhance 会把提示词自动写得更具体。
- **时长只有 3 秒和 5 秒两档**：按镜头需要选，官方目前没有更长的选项。

```text
上传一张清晰的黄昏码头全景照片。选 Camera Control 分类里的「Dolly In」预设。
提示词：镜头缓慢推向画面中央的渔船，夕阳把海面染成橙红色，几只海鸥掠过船头，画面安静，略带纪录片质感。
时长选 5 秒；如果生成后镜头动得不明显，打开 Enhance 再试一次。
```

## 已知限制

- 只能图生视频，不能纯靠文字从零生成，必须先给一张关键帧图片。
- 单次生成时长只有 3 秒或 5 秒两档可选，没有更长的档位。
- 成片质量很依赖输入图片：官方帮助文档明确说，模糊或构图弱的图容易出软、糊的画面。

---
model: grok imagine image 2
name: Grok Imagine 图像 2.0
maker: xAI
released: 2026-08-07
checkedAt: 2026-09-28
headline: xAI 的图片模型，把编辑做成一等功能：局部改、智能去背景，最多 5 张参考图合成；官方称生成和编辑均为世界第二。
sources:
  - title: Imagine Image 2.0（xAI 官方发布页，2026-08-07）
    url: https://x.ai/news/grok-imagine-image-2
  - title: Grok Imagine Image 2.0 模型说明（xAI 开发者文档）
    url: https://docs.x.ai/developers/models/grok-imagine-image-2.0
  - title: Image Generation 接口文档（xAI 开发者文档）
    url: https://docs.x.ai/developers/model-capabilities/images/generation
---

## 新在哪

- **编辑成了一等功能**：魔术棒局部编辑、语义分割选区、背景移除（带透明通道导出）都是这一代新加的能力，不再是文生图的附属品。
- **多图参考输入**：编辑时最多能给 5 张参考图，用来合成主体、转换风格或拼接场景。
- **文字和版式明显更强**：官方说它能像设计师一样规划排版，指令跟随更细致，密集版面也能保持小字清晰。
- **智能改尺寸**：Smart Resize 可以在多个画幅比例之间自动重新构图，不是简单裁切。

## 适合做什么

- 电商和产品图：换色、抠图去背景、做透明底素材。
- 头像和角色类素材：专业证件照、游戏图标、角色立绘。
- 需要精确局部改动的修图：只改某一块，不影响画面其他部分。

## 提示词要点

- **想改哪一块就指哪一块**：配合魔术棒/分割工具，提示词里明确指出要修改的区域和目标效果。
- **把排版当设计任务写**：字体、留白、版式这些设计语言模型能听懂，直接按设计需求描述。
- **去背景直接说**：background removal 是官方主打功能之一，直接说"去掉背景，导出透明底"。
- **批量出图用数量参数**：一次请求最多能生成 10 张，适合一次多要几个方案。
- **质量档位按用途选**：接口的 quality 参数有 low/medium/auto，auto 在生成任务里默认相当于 low、在编辑任务里默认相当于 medium，定稿建议手动指定档位而不是依赖 auto。

```text
把这张产品照片的背景去掉，导出透明底 PNG，产品主体的位置、角度、颜色都保持不变，
边缘处理干净，不要有残留的背景色边。
```

## 已知限制

- 多图编辑最多支持 5 张参考图，超过这个数量不支持。
- quality 参数的"auto"档在生成和编辑两种任务下默认解析不同（生成默认相当于 low，编辑默认相当于 medium），不手动指定容易踩坑。
- 分辨率只有 1K、2K 两档，没有更高档位可选。

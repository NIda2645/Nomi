---
model: nano banana 2 lite
maker: 谷歌 DeepMind
released: 2026-06-30
checkedAt: 2026-09-28
headline: 同代最快最省的 Gemini 图像模型，4 秒出图，一次最多带 10 张参考图。
sources:
  - title: Nano Banana 2 Lite 模型页（Google DeepMind 官方）
    url: https://deepmind.google/models/gemini-image/flash-lite/
  - title: Nano Banana 2 Lite 提示词指南（Google DeepMind 官方，与全系共用）
    url: https://deepmind.google/models/gemini-image/prompt-guide/
  - title: Nano Banana 2 Lite 正式上线公告（Google Cloud 官方博客，2026-06-30）
    url: https://cloud.google.com/blog/products/ai-machine-learning/nano-banana-2-lite-and-gemini-omni-flash-available
  - title: Nano Banana 2 Lite 接口文档（Kie.ai）
    url: https://docs.kie.ai/market/google/nano-banana-2-lite.md
---

## 新在哪

- **同代里最快、最省的一档**：2026-06-30 上线，谷歌官方定位是"目前最快、最高效的 Gemini 图像模型"，开发者接口正式名字是 Gemini 3.1 Flash-Lite Image。
- **最快 4 秒出图**：官方说延迟比同代主力款 Nano Banana 2 大幅缩短。
- **控件比主力款简单**：只暴露比例（aspect_ratio）一个参数，没有清晰度、输出格式这些细调选项——上手快，但可调的东西也少。
- **一次最多带 10 张参考图**：比主力款 Nano Banana 2 的 14 张少，但角色一致性、世界知识这些核心能力都保留了。

## 适合做什么

- 需要快速出大量变体的场景：广告创意的 A/B 测试、批量出草稿方向。
- 面向大量用户的实时出图功能，比如社交类 App 里的即时生成，对速度要求高。
- 电商虚拟试穿、分镜草图这类不需要极致精修、但要求快出图的场景。

## 提示词要点

- **先把五个要素想全**：风格、主体、场景、动作、构图，一次写清楚，减少来回改的轮次。
- **拿它来快速探方向，细节留给更重的模型**：Lite 没有清晰度、格式这些细调选项，适合先出多个方向再挑一版用效果更强的模型精修。
- **文字用引号圈起来**：想让图里出现的字放进引号，配上字体说明，比如"手写体"或"粗体无衬线"。
- **参考图里的角色要起名字**：上传参考图并在提示词里给人物起固定的名字，帮它认出"这是同一个人"。
- **要批量出图就直接说要几个版本**：比如"给我四种不同构图"，一次出多版供你挑选。

```text
产品摄影风格，一款薄荷绿无线耳机充电盒放在原木桌面上，柔和自然光从右侧窗户照入，浅景深。
给我四种不同构图：正面平拍、45 度侧俯拍、开盖特写、握在手里的场景图。1:1，背景干净。
```

## 已知限制

- **小脸孔、精确拼写、精细细节容易出错**：和同代其他型号一样，这几类问题还会出现。
- **数据类图表容易理解错**：生成信息图、数据可视化时，有时会曲解或画错信息本身。
- **复杂改图不够稳**：复杂的编辑操作有时会出现不自然的结果、明显瑕疵，或者画面元素对不上。

---
model: imagen 4 ultra
maker: 谷歌 DeepMind
released: 2025-08-15
checkedAt: 2026-09-28
headline: 谷歌 Imagen 4 的高质量档，细节和指令遵循最强，适合对画质要求高的场景。
sources:
  - title: 官方公告：Imagen 4 Fast 上线 + Imagen 4 全系正式开放（Google Developers Blog，2025-08-15）
    url: https://developers.googleblog.com/announcing-imagen-4-fast-and-imagen-4-family-generally-available-in-the-gemini-api/
  - title: Imagen 4 概览（Google Cloud Vertex AI 官方文档）
    url: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/overview
  - title: Imagen 生成图像参数文档（Google Cloud Vertex AI 官方文档）
    url: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images
  - title: Imagen 提示词与图像属性指南（Google Cloud Vertex AI 官方文档）
    url: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/img-gen-prompt-guide
  - title: Imagen 4 Ultra 接口文档（Kie.ai）
    url: https://docs.kie.ai/market/google/imagen4-ultra.md
---

## 新在哪

- **Imagen 4 系列里的"高质量"档**：2025-08-15 随 Imagen 4 全系正式开放一起上线，官方定位是细节和指令遵循能力最强的一档，为高要求场景设计。
- **分辨率、文字渲染都比上一代 Imagen 3 有提升**：支持到 2K 分辨率，文字渲染有明显改善。
- **官方点名推荐它做进阶场景**：Vertex AI 文档写默认建议先用 Gemini 生图，画质、质感、品牌 / logo / 版式这类进阶需求再选 Imagen 4 Ultra。
- **比例覆盖社交、广告、电视等常见场景**：1:1、16:9、9:16、3:4、4:3 五种比例，默认 1:1。

## 适合做什么

- 对画质、细节、指令遵循程度要求最高的场景：官方明确把它推荐给这类"进阶用例"。
- 品牌视觉、Logo、版式设计这类静态、构图规整、容不得瑕疵的素材。
- 需要精确文字排版的场景（比如海报标语），但文字长度不宜太长。

## 提示词要点

- **按"主体 + 场景 + 风格"三段来写**：先说清楚画面里是什么、放在什么背景/环境里，再说想要的艺术风格。
- **质量加分词可以多用一点**：既然选了 Ultra，"高质量""4K""HDR""专业摄影"这类词能更好发挥它的强项。
- **摄影相关的词直接写进去**：景别、光线方向、镜头类型（微距/广角/35mm）、背景虚化都能直接指定。
- **排除项直接说排除什么**：比如"排除：墙面、边框"，而不是"不要墙面"。
- **图里的文字控制在 25 个字符以内**：字数太多容易画不清楚。
- **想要某种画风就具体点名**：点到具体艺术流派（印象派、文艺复兴、波普艺术）比笼统形容词更稳定。

```text
一款机械腕表的产品摄影，高质量，4K，HDR，专业摄影棚打光，冷色调戏剧性光线，微距镜头，
突出表盘齿轮细节，背景虚化。1:1。排除：人物、手、文字。
```

## 已知限制

- **纯文生图，不支持改图**：接口里没有参考图/输入图字段，不能拿一张已有的图去编辑或参考。
- **图里的文字建议不超过 25 个字符**：官方指南建议控制在这个长度以内，太长容易画不清楚。
- **速度不是它的强项**：官方把它定位成质量优先的档位，追求出图速度、大批量任务的场景更适合用 Fast 档。

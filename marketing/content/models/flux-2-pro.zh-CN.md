---
model: flux.2 pro
name: FLUX.2 Pro
maker: Black Forest Labs
released: 2025-11-25
checkedAt: 2026-09-28
headline: Black Forest Labs 图片模型旗舰版，最多融合 10 张参考图、4MP 输出，文字排版和品牌一致性是强项。
sources:
  - title: FLUX.2：Frontier Visual Intelligence（Black Forest Labs 官方博客，2025-11-25）
    url: https://bfl.ai/blog/flux-2
  - title: FLUX.2 Overview（Black Forest Labs 官方文档）
    url: https://docs.bfl.ml/flux_2/flux2_overview
  - title: FLUX.2 Prompting Guide（Black Forest Labs 官方文档）
    url: https://docs.bfl.ml/guides/prompting_guide_flux2
  - title: Flux-2 Pro Image to Image 接口文档（kie.ai）
    url: https://docs.kie.ai/market/flux2/pro-image-to-image.md
---

## 新在哪

- **多参考图融合**：一次最多给 10 张参考图合成一张新图（Nomi 经 kie.ai 接入的改图端点上限是 8 张，见下方限制）。
- **编辑输出提到 4MP**：改图任务也能保住细节和连贯性，不再是"越改越糊"。
- **文字和版式明显更强**：复杂排版、信息图、UI 原型里的小字都能看清楚。
- **世界知识和指令遵循更强**：给的描述更复杂也能听懂，构图更连贯，品牌规范（颜色、字体、Logo）也更容易保持一致。

## 适合做什么

- 需要保持品牌规范（配色、字体、Logo）一致的商业视觉物料。
- 信息图、UI 原型这类"文字量大还要排版整齐"的图。
- 多图合成：把好几张素材图拼成一张新构图，同时保住每个主体原来的样子。

## 提示词要点

- **按主体+动作+风格+场景的顺序写**：重要信息放前面，官方说词序会明显影响结果优先级。
- **不支持负向提示词**：官方文档写明"FLUX.2 does not support negative prompts"，只能正面描述想要什么，不能写"不要什么"。
- **拍照类描述要具体**：写清相机型号、镜头、胶片感（比如"哈苏 X2D，80mm 镜头，f/2.8"），比只写"专业摄影"效果好得多。
- **颜色用十六进制**：给对象配色直接写 hex 值（比如"沙发用 #1B6B6F"），比"红色"这种笼统描述精确。
- **文字加引号并说明位置和字体**：要出现的文字用引号括起来，注明放在哪里、用什么字体。
- **复杂场景用 JSON 结构化写法**：分别声明场景、主体、位置、灯光、镜头，适合需要稳定复现的批量生产。

```text
一张极简风格的护肤品产品图，主体产品放在哑光展台上，展台颜色为十六进制 #EDE6DB。
用哈苏 X2D 相机、80mm 镜头、f/2.8 光圈拍摄，柔和的影棚光从左上方打来。
产品旁边的小卡片上写着"新品 · 维C精华"，优雅衬线体。
1:1 正方形构图，右侧三分之一留白用于叠加文字。
```

## 已知限制

- 不支持负向提示词，只能正面描述想要的效果。
- 文生图和改图是两个不同的模型 ID：改图（image-to-image）经 kie.ai 接入的参考图上限是 8 张，且改图比文生图多一档 auto 比例，两边参数不能混用。
- 最大输出 4MP，且尺寸要是 16 的倍数，超限会被拒绝。

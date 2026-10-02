---
model: gemini image 3 pro
name: Gemini 3 Pro 图像
maker: 谷歌 DeepMind
released: 2025-11-20
checkedAt: 2026-09-28
headline: 谷歌 Gemini 3 Pro 图像，也叫 Nano Banana Pro，多轮生成改图效果最好，支持 4K。
sources:
  - title: Gemini 3 Pro 图像（Nano Banana Pro）模型页（Google DeepMind 官方）
    url: https://deepmind.google/models/gemini-image/pro/
  - title: Nano Banana Pro 发布公告（Google 官方博客，2025-11-20）
    url: https://blog.google/innovation-and-ai/products/nano-banana-pro/
  - title: Gemini Image 提示词指南（Google DeepMind 官方，全系共用）
    url: https://deepmind.google/models/gemini-image/prompt-guide/
  - title: Gemini 3 Pro Image 接口文档（APIMart）
    url: https://docs.apimart.ai/en/api-reference/images/gemini-3-pro/generation.md
---

## 新在哪

- **开发者接口里正式名字是 Gemini 3 Pro Image**：Nano Banana Pro 是它在 Gemini App 等消费产品里的叫法，构建在 Gemini 3 Pro 的推理能力上，官方定位是处理复杂、多轮生成和编辑效果最好的一款。
- **文字渲染是强项**：官方称它是"能把文字正确、清晰地直接画进图里的最佳模型"，支持多语言，还能把设计翻译成不同地区的版本。
- **摄影棚级别的精细控制**：镜头角度、景别、调色、打光方向都能单独控制；多轮编辑时还能改变景深，重新对焦到不同主体。
- **一次最多认住 5 个角色、14 个物体，分辨率到 4K**：所有输出都带 SynthID 隐形水印，可以用来识别图片是不是 AI 生成或编辑过的。

## 适合做什么

- 需要精细控制镜头语言的成片：广告大片、海报设计，能单独调角度、打光、调色。
- 图里要有准确文字的场景：海报、图表、多语言物料，文字清晰还能做本地化翻译。
- 多轮反复修改的复杂编辑：比如改变景深重新对焦，同时让画面里的人物、道具保持一致。

## 提示词要点

- **五个要素说清楚**：风格、主体、场景、动作、构图，细节写得越具体，出来的图越接近你想要的。
- **摄影棚控制词直接写进提示词**：镜头角度（俯拍/仰拍/平视）、景别（远景/中景/特写）、打光方向、调色风格，都可以直接指定。
- **改图时用官方给的五种方式之一**：换角色、调构图、改动作、换场景、换风格，一次挑一种说清楚要变的地方。
- **文字用引号圈起来**：想让图里出现的字放进引号，配上字体说明和语言。
- **参考图里的角色/物体要起名字**：上传清晰参考图并给人物、物体起固定名字，帮它跨图认出。
- **多轮编辑一步步来**：把上一版当这一次的输入，一次只提一个修改要求，并说清楚哪些要保持不变。

```text
产品广告摄影，一瓶琥珀色香水放在深色大理石台面上，45 度侧逆光，暖色调色，浅景深，背景虚化。
构图：中近景，略带仰拍角度。瓶身标签上用衬线字体清晰写着"AMBER NOIR"。16:9，4K。
```

## 已知限制

- **小脸孔、精确拼写、细节部分还会出错**：官方承认这几类问题存在。
- **知识面广但不是万能的**：官方说它的真实世界知识"广泛但不是绝对准确"，翻译本地化时也可能在语法、拼写、文化习惯或习语上出错。
- **高级操作和角色一致性不保证每次都准**：蒙版局部编辑、大幅度光线变化这类高级操作，官方明确说"未必每次都能做对"。

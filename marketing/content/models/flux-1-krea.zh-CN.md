---
model: flux.1 krea
name: FLUX.1 Krea
maker: Black Forest Labs 与 Krea
released: 2025-07-31
checkedAt: 2026-09-28
headline: Black Forest Labs 与 Krea 出品，主打真实质感、拒绝"AI 脸"，评测追平 FLUX.1 Pro。
sources:
  - title: "FLUX.1 Krea [dev]: An 'Opinionated' Text-to-Image Model（Black Forest Labs 官方公告，2025-07-31）"
    url: https://bfl.ai/announcements/flux-1-krea-dev
  - title: Releasing Open Weights for FLUX.1 Krea（Krea 官方博客）
    url: https://www.krea.ai/blog/flux-krea-open-source-release
  - title: black-forest-labs/FLUX.1-Krea-dev 模型卡（Hugging Face）
    url: https://huggingface.co/black-forest-labs/FLUX.1-Krea-dev
---

## 新在哪

- **专治"一眼 AI 感"**：官方把它形容为"有主见"的模型，刻意避开过曝高光、塑料感这些典型 AI 图毛病。
- **和 Krea 联合调校审美**：Krea 在真实感、多样性审美上的经验直接喂进了训练过程，两家共同开发。
- **人类偏好测试打平旗舰**：官方数据显示，在人类偏好评测上，这个开源模型的表现和自家闭源旗舰 FLUX.1 Pro 相当。
- **架构兼容 FLUX.1 Dev 生态**：12B 参数、guidance-distilled 架构，和 FLUX.1 Dev 完全兼容，现有工具链、LoRA 基本能直接用。

## 适合做什么

- 想要"不像 AI 生成"的真实感人像和场景图。
- 已经在用 FLUX.1 Dev 生态（LoRA、ComfyUI 工作流）、想直接换一个更真实的底座模型。
- 摄影感强的内容，比如广告图、人像，不想要过饱和的"塑料感"。

## 提示词要点

- **少堆风格词，多写真实世界细节**：官方定位是"自然细节"而不是堆砌"电影感""高级感"这类空泛美学词。
- **光线写实际场景**：自然光、阴天、室内灯这类真实描述，比"梦幻光效""戏剧性光影"更符合它的调性。
- **guidance scale 别拉太高**：官方示例用的是中等强度（约 4.5），拉太满反而会把它的真实感风格调没。
- **想保留它的"小怪癖"就别过度用负向提示词清洗**：官方说这些不完美和多样性正是它风格的一部分。

```text
一位年轻女性坐在窗边看书，室内自然光从侧面窗户照进来，光线柔和不刻意，
皮肤质感真实、有细微毛孔和自然肤色不均，穿着日常针织衫，背景是略显杂乱的书房，
整体氛围像一张随手拍的生活照，不是精心布置的摄影棚照片。
```

## 已知限制

- 官方模型卡片明确说明：这个模型不能用来提供事实信息，作为统计模型也可能放大已有的社会偏见。
- 是非商用许可（FLUX.1 [dev] Non-Commercial License），不能直接用于商业用途。
- 官方承认模型存在"idiosyncrasies"（一些小怪癖），不同措辞方式对结果的影响比较大，没有进一步展开细节。

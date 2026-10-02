---
model: flux.2 klein
name: FLUX.2 Klein
maker: Black Forest Labs
released: 2026-01-15
checkedAt: 2026-09-28
headline: Black Forest Labs 开源图片模型，4 步亚秒出图；官方称 9B 版能比肩体量 5 倍的模型。
sources:
  - title: "FLUX.2 [klein]: Towards Interactive Visual Intelligence（Black Forest Labs 官方博客，2026-01-15）"
    url: https://bfl.ai/blog/flux2-klein-towards-interactive-visual-intelligence
  - title: black-forest-labs/FLUX.2-klein-9B 模型卡（Hugging Face）
    url: https://huggingface.co/black-forest-labs/FLUX.2-klein-9B
  - title: FLUX.2 Overview（Black Forest Labs 官方文档）
    url: https://docs.bfl.ml/flux_2/flux2_overview
  - title: FLUX.2 Prompting Guide（Black Forest Labs 官方文档）
    url: https://docs.bfl.ml/guides/prompting_guide_flux2
---

## 新在哪

- **又快又开源**：4 步蒸馏推理，亚秒级出图，消费级显卡（9B 版本约 13GB 显存起）就能跑。
- **文生图和改图合一个模型**：不用为编辑任务单独换一个模型，一个架构同时处理生成、编辑、多参考图。
- **小模型打大模型**：Black Forest Labs 官方称，9B 版在文生图、单图改图和多图参考生成上，能赶上甚至超过体量是它 5 倍的模型，而且出图不到半秒。
- **定位是 FLUX.1 Schnell 的"精神续作"**：主打快、能编辑、能本地部署，不是追求画质天花板。

## 适合做什么

- 想要低延迟、交互式出图/改图的场景，比如设计工具里的实时预览。
- 本地部署、不想依赖云端 API 的开发和实验场景。
- 需要又快又好的图片编辑（换背景、局部改内容），但不追求最高画质天花板。

## 提示词要点

- **别指望它帮你补全提示词**：官方说 klein 不带 prompt upsampling，得自己把描述写具体，写一两个词效果会打折扣。
- **结构和 FLUX.2 Pro 一致**：按主体、动作、风格、场景的顺序写，重要信息放前面。
- **同样不支持负向提示词**：只能正面描述想要的效果，不能写"不要什么"。
- **编辑任务把目标写明确**：给参考图的同时说清楚要改哪一块、改成什么样，而不是笼统地说"P 得好看点"。

```text
把这张产品照片的背景换成浅灰色摄影棚背景，产品本身位置、角度、颜色不变，
补上柔和的地面阴影，整体光线偏冷调，输出比例保持和原图一致。
```

## 已知限制

- Nomi 接入的 9B 版本用的是 FLUX 非商用许可（4B 版本才是完全开放的 Apache 2.0），不能直接商用。
- 不支持负向提示词，也不带提示词自动扩写，对提示词写得细不细比较敏感。
- 定位是速度优先，画质天花板不如 Pro/Max 档位。

---
model: veo 3.1
maker: 谷歌 DeepMind
released: 2025-10-15
checkedAt: 2026-09-28
headline: 谷歌 DeepMind 的视频模型，生成时自带同步音效和对白，能用参考图和场景续接把片段接到一分钟以上。
sources:
  - title: Introducing Veo 3.1 and new creative capabilities in the Gemini API（Google Developers Blog，2025-10-15）
    url: https://developers.googleblog.com/introducing-veo-3-1-and-new-creative-capabilities-in-the-gemini-api/
  - title: Veo 3.1 模型主页（Google DeepMind）
    url: https://deepmind.google/models/veo/
  - title: Veo 3.1 技术文档（Google AI for Developers，Gemini API）
    url: https://ai.google.dev/gemini-api/docs/veo
  - title: Veo 3.1 Ingredients to Video 更新（Google 官方博客，2026-01-13）
    url: https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/
  - title: Ultimate prompting guide for Veo 3.1（Google Cloud Blog，2025-10-15）
    url: https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1
  - title: Veo3.1 视频生成接口文档（Kie.ai）
    url: https://docs.kie.ai/veo3-api/generate-veo-3-video
---

## 新在哪

- **参考图保持一致（Ingredients to Video）**：一次最多传 3 张参考图，人物长相、风格能在好几个镜头里保持一样；2026 年 1 月的更新还让这个模式原生出 9:16 竖屏，对白和人物、背景的一致性也更好。
- **能续到一分钟以上（Scene Extension）**：不必止步于 8 秒，官方说可以不断接新片段，做到一分钟以上还保持画面连贯——每次续写加 7 秒，最多能续 20 次，但续写用的素材本身得是 720p。
- **给头尾两帧，AI 补中间（首尾帧 / Frames to Video）**：只要给开头和结尾的画面，模型会自动生成中间的运镜和过渡；3.1 之前这个模式没有声音，现在也带上同步音效了。
- **画质拉到 4K，竖屏原生支持**：除了默认的 720p，8 秒版本能出 1080p 或 4K；配合 Ingredients to Video，还能直接出 9:16 竖屏，不用再裁剪。

## 适合做什么

- 角色或产品要在好几个镜头里长一个样的片子：把参考图交给 Ingredients to Video。
- 想要比 8 秒更长、有起承转合的叙事：先出一条，再用 Scene Extension 一路接下去。
- 已经有开头和结尾两张画面，想让 AI 补中间的转场和运镜：用首尾帧模式。

## 提示词要点

- **按官方公式搭骨架**：运镜 + 主体 + 动作 + 场景 + 风格氛围，五块按顺序写，比堆形容词管用。
- **运镜和构图分开写**：推轨、跟拍、升降、航拍、慢摇属于运镜；远景、特写、大特写、低角度属于构图，两件事别混在一起写。
- **台词用引号**：要角色说话，直接写成「她说："我们该走了。"」，模型才会当成台词处理，而不是画面描述。
- **音效和环境声分开标注**：写成「音效：远处雷声」「环境音：星舰驾驶舱的低鸣」这样的标签，比笼统写「声音好听」管用。
- **排除项写成正面描述**：不写「没有人造建筑」，改写「荒凉的地面，没有房子也没有道路」——具体的画面描述比否定词好使。
- **长镜头按时间戳分段**：一条提示词里可以用 [00:00–00:03]、[00:03–00:06] 这样按秒分段，控制一个镜头内的多次运镜切换。

```text
16:9，8 秒。低角度跟拍镜头，一位穿旧皮夹克的老船长站在渔船甲板上望向远方，海风吹起他的白发。
清晨多雾的渔港，涨潮的水拍打着船身。写实怀旧风格，胶片颗粒感，冷色调晨光。
[00:00–00:03] 船长转头望向镜头。[00:03–00:06] 他抬手指向远处的灯塔。[00:06–00:08] 镜头缓缓拉远，露出整个渔港。
他说："该出海了。" 音效：海浪拍打船身、缆绳摩擦声。环境音：远处海鸥、雾角声。
空旷的甲板，没有其他船员，没有现代设备。
```

## 已知限制

- 官方明确说，自然连贯的对白（尤其是短句）还在持续优化中，有时候会出现台词不连贯的情况。
- 想要 1080p、4K 或者用参考图（Ingredients to Video），时长必须选 8 秒；4 秒、6 秒只能配默认的 720p 基础生成。
- Scene Extension 只有 Veo 3.1 和 Veo 3.1 Fast 能用，Lite 版不支持；续写时上传的素材本身也必须是 720p。

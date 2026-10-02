---
model: vidu q3
maker: 生数科技
released: 2026-01-30
checkedAt: 2026-09-28
headline: 生数科技的视频模型，一次生成最长16秒、声音画面同步的视频，可用最多7张参考图锁定人物和场景一致。
sources:
  - title: Vidu Q3 产品页（Vidu 官网）
    url: https://www.vidu.com/vidu-q3
  - title: "Vidu Showcases \"China Speed\" in Advancing AI Video Into Production at Global Creativity Week（生数科技官方新闻稿，2026-01-30，Vidu Q3 发布）"
    url: https://www.prnewswire.com/news-releases/vidu-showcases-china-speed-in-advancing-ai-video-into-production-at-global-creativity-week-302675040.html
  - title: "ShengShu Launches Vidu Q3 Reference-to-Video with Expanded Visual and Audio Capabilities（生数科技官方新闻稿，2026-04-13）"
    url: https://www.prnewswire.com/news-releases/shengshu-launches-vidu-q3-reference-to-video-with-expanded-visual-and-audio-capabilities-302740489.html
  - title: Reference to Video 功能页（Vidu 官网）
    url: https://www.vidu.com/ai-reference-to-video
  - title: Model Map（Vidu 官方 API 文档）
    url: https://platform.vidu.com/docs/model-map
  - title: Reference to Video 接口文档（Vidu 官方 API 文档）
    url: https://platform.vidu.com/docs/reference-to-video
  - title: Vidu Q3 模型页（APIMart，接入商文档）
    url: https://apimart.ai/model/viduq3
---

## 新在哪

- **16 秒音画同步一次直出**：一次最长能生成 16 秒视频，画面和声音（对白、配音、音效、音乐）由模型原生一起生成，不用后期再对轨；分辨率原生 1080p。
- **运镜和节奏能精确控制**：官方说可以精确指导镜头运动和节奏，把每个片段的起承转合安排清楚。
- **参考生视频扩展到 Q3 本身**：2026 年 4 月，Q3 新增了参考生视频能力，一次最多组合 7 张参考图或参考视频，人物、环境、服装、道具、视觉风格都能作为参考对象，一个工作流里全程保持一致。
- **拆成几个专用子模型**：Q3 不是单一模型，而是分成 pro（支持文生视频/图生视频/首尾帧，画质优先）、turbo（速度优先）、mix（参考生视频，追求整体平衡）、drama（漫画剧对话叙事）、ad（广告向，3–15 秒）等，按用途挑型号。

## 适合做什么

- 漫画剧、影视短片、系列短剧：官方产品页把这些列为主打场景。
- 叙事型广告：官方产品页提到的另一个主打场景。
- 角色、产品或场景要从头到尾长一个样的内容：用参考生视频把人物、服装、道具、场景风格都用参考图定下来，适合广告、AI 虚拟人物、多场景系列内容。

## 提示词要点

- **每张参考图对应哪个元素要写清楚**：参考生视频一次最多传 7 张参考图或参考视频，每张图能单独控制人物、风格、构图、运镜、场景或特效中的某一项，写提示词时点明"这张图对应什么"，比堆一堆参考图更有效。
- **给几张参考图 + 点出关键动作**：官方建议是加几张参考图，把关键动作写清楚，让模型知道人物和物体该长什么样、怎么动。
- **时长和分辨率提前定好**：mix/turbo 一次最长 16 秒，分辨率可选 720p 或 1080p，提示词总长度上限 5000 字符——这些参数提交前就定好，不用写进描述文字里。
- **画风/质感单独写，别和动作混一句话里**：接入商文档的示例提示词会把画风、材质单独列出（比如"皮克斯风格 3D""柔和体积光""电影级景深"），和主体、动作描述分开写。
- **按用途选子模型再动笔**：Pro 主打电影质感和高保真，适合精细画面；Turbo 用轻量架构换速度，适合批量或快速迭代；提示词详细程度可以跟着选的模型调整。

```text
参考图 1：短发女生，米色风衣，作为人物参考。参考图 2：复古自行车，作为道具参考。
关键动作：女生推着参考图 2 里的自行车，走过雨后的石板街，在拐角停下抬头看店招。
画风：清晨微光，湿润路面反光，电影级景深，柔和体积光。
时长 12 秒，分辨率 1080p。
不要换脸，不要出现第二个人物。
```

## 已知限制

- Pro 版本不支持参考生视频：官方 Model Map 显示 pro 虽然支持文生视频、图生视频、首尾帧，但参考生视频要用 mix、turbo、drama 或 ad。
- drama 和 ad 这两个子模型时长上限是 15 秒，比 pro/turbo/mix 的 16 秒短一点。
- 参考生视频最多传 7 张参考图，不能无限叠加参考素材。

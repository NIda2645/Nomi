---
model: gemini omni 1.1 flash
maker: 谷歌 DeepMind
released: 2026-08-27
checkedAt: 2026-09-28
headline: 谷歌「任意到任意」多模态家族里的视频担当，靠对话生成和编辑视频，在 Gemini App 里接替了 Veo。
sources:
  - title: Gemini Omni 1.1 Flash lets you build with more control（谷歌官方博客，2026-08-27）
    url: https://blog.google/innovation-and-ai/technology/developers-tools/build-with-gemini-omni-1-1-flash/
  - title: Gemini Omni Flash 官方 model card（Google DeepMind）
    url: https://deepmind.google/models/model-cards/gemini-omni-flash/
  - title: Generate and edit videos with Gemini Omni Flash（Gemini API 开发者文档）
    url: https://ai.google.dev/gemini-api/docs/omni
  - title: Gemini Omni Flash 模型参考页（Gemini API 开发者文档）
    url: https://ai.google.dev/gemini-api/docs/models/gemini-omni-flash
  - title: Gemini 视频生成产品页（Gemini 官网）
    url: https://gemini.google/overview/video-generation/
  - title: Introducing Gemini Omni（谷歌官方博客，Google I/O 2026）
    url: https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni/
  - title: Release notes / Changelog（Gemini API 官方文档）
    url: https://ai.google.dev/gemini-api/docs/changelog
  - title: Gemini Omni 1.1 Flash（Kie.ai 接入文档，用于交叉核对技术参数）
    url: https://kie.ai/gemini-omni-1-1-flash
---

## 新在哪

- **从预览版转正为正式版**：接口从 `gemini-omni-flash-preview` 换成正式的 `gemini-omni-1.1-flash`，2026-08-27 发布，预览版标记为 2026-09-30 起弃用。
- **场景可以接着往后延**：单次生成最长 10 秒，用场景扩展能一段段往后接，累计最长 40 秒；官方说编辑时能参考前面最多 10 秒的画面，不像老版本只认最后一秒。
- **首尾帧自己定**：给定开头和结尾画面，模型把中间的运镜和转场补上，转场更可控。
- **360p 草稿模式**：先出一版 360p 草稿看效果对不对，官方说比标准 720p 快最多 60%，满意了再升到 1080p / 4K。

## 适合做什么

- **把照片或一句话直接变成短视频**：最多传 5 张照片配上文字描述，模型直接出一条带原生音效的视频，不用学复杂的时间轴或参数面板。
- **已经生成一条视频、只想改一处**：直接用聊天说要改哪里——换角色、调灯光、稳定画面、改背景，模型只动你说的地方，其他保持不变。
- **一个镜头讲不完的场景**：单次生成最长 10 秒，不够就用场景扩展一段段往后接，累计最长 40 秒，配合首尾帧把转场卡准。

## 提示词要点

- **要单镜头就明说**：官方文档给的说法是 in a single continuous shot、no scene cuts 这类，写清楚它才不会自己切镜头。
- **改视频时提示词越简单越好**：官方说提示词太啰嗦反而容易带出不想要的改动，越简单越稳。
- **想保留的地方写「其他保持不变」**：官方给的编辑示例就是这么写的，能明显减少画面跑偏。
- **声音写具体来源，别写感受**：像「远处的电车声」「木椅子被爪子踩的声音」，而不是「声音好听」。
- **时间轴可以按秒分段写**：`[0–3s]`、`[3–6s]` 这样按秒分段写，官方文档认这种写法。
- **没有专门的负向提示词参数，「不要」直接写进句子里**：官方文档写明不支持 negative prompt 参数，否定项要写成「不要出现字幕」这样的正常句子。

```text
单镜头，一镜到底，不要切镜头。厨房桌上一杯咖啡冒着热气。
[0–3s] 一只橘猫跳上旁边的椅子。[3–6s] 它探头闻了闻咖啡杯口。
背景安静，能听到猫爪踩在木椅上的声音和窗外隐约的鸟叫。不要出现人物，不要加字幕。
```

## 已知限制

- **一致性和复杂动作还是短板**：官方 model card 说，编辑时全程保持一致、生成复杂运动的场景、还有让画面里的文字渲染准确，都还是挑战。
- **编辑 / 延长上传视频有门槛**：要编辑或延长的视频本身不能超过 10 秒；欧洲经济区、瑞士、英国的用户目前用不了这个功能。
- **改变别人说话内容这块被主动收紧**：官方说这块能力目前限制开放，团队还在弄清楚怎么安全、负责任地把它交给用户。

---
model: gpt image 2.5 sunburst
maker: OpenAI
released: 2026-09-08
checkedAt: 2026-09-28
headline: OpenAI GPT Image 2.5 的精修档，主打广告成片和多轮细节编辑。
sources:
  - title: GPT-Image-2.5 Sunburst 模型文档（OpenAI 官方 API 文档）
    url: https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst
  - title: 图像提示词指南（OpenAI 官方 API 文档）
    url: https://developers.openai.com/api/docs/guides/image-prompting
  - title: GPT Image 2.5 Sunburst 文生图接口文档（Kie.ai）
    url: https://docs.kie.ai/market/gpt/gpt-image-2-5-sunburst-text-to-image.md
  - title: GPT Image 2.5 接口文档（APIMart，同时覆盖 Flare 和 Sunburst）
    url: https://docs.apimart.ai/en/api-reference/images/gpt-image-2.5/generation.md
---

## 新在哪

- **2.5 代里的"精修"档**：2026-09-08 上线，官方定位是"生成和改图能力最强的模型"，主打广告成片、量产素材这类要求精细的场景；和更快的 Flare 是并列产品线，不是同一款的高低档。
- **质量档位多了两级**：quality 参数新增 xhigh、max（加上原有 low/medium/high/auto 共 6 档），这两档是 2.5 才有，上一代 GPT Image 2 不支持。
- **官方把它定位成适合多轮细节编辑**：一次改图最多带 16 张参考图，改完一版接着往下改也不容易跑偏。
- **支持蒙版局部重绘**：给一张带透明通道的蒙版图，就能只改指定区域，其余原样保留。

## 适合做什么

- 要上线的成片：广告图、正式商品图这类对细节和精度要求高的最终交付物。
- 需要反复打磨的多轮改图：先出一版，再一步步调局部细节，风格和构图能稳定保持不跑偏。
- 用蒙版做局部替换：比如只换产品图里的某个区域或元素，其余部分保持原样。

## 提示词要点

- **先确认是不是真的需要这一档**：官方指南建议——质量要求高、要精修就用 Sunburst；如果对速度更在意，可以拿同样的输入去 Flare 上试一下，看效果是否也够用。
- **改图时把"改哪里"和"要保持的"分开写**：格式建议是"只改 X"，然后单独列出要保持不变的东西——身份、结构、布局、光线、文字标签。
- **多轮改图一步步来**：把上一次生成的图当这一次的输入，一次只提一个修改要求，并重复一遍要保持不变的细节。
- **用蒙版时把区域和目的说清楚**：哪一块要改、改成什么样，其余区域会原样保留。
- **画面里的文字用引号圈起来**：把要出现的文字放进引号，说明位置和字体感觉，生僻词或品牌名可以逐字母拼给它。
- **写实感需要明说**：想要照片质感就写 photorealistic，并描述取景、材质、光线细节。

```text
基于上一张运动水壶产品图改图：只把瓶身颜色从黑色改成珊瑚橙色。瓶盖颜色、标签文字"HYDRO PRO"的
位置、字体、大小，以及打光、投影、拍摄角度、背景，全部保持不变。
```

## 已知限制

- **几个极端画幅只能出 1K**：27:16 / 16:27 / 9:8 / 8:9 这四种比例不支持 2K、4K。
- **不是所有比例都能上到最高分辨率**：选比例前要留意该比例实际能选的分辨率档位。
- **透明背景需要显式声明**：不设置 background 参数不会自动给透明底，要透明底必须自己指定 transparent 并搭配 PNG/WebP 格式。

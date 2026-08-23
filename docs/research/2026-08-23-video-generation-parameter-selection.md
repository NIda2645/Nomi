# 视频生成模式与参数选择调研

> 状态：研究完成，未接入真实付费生成。
> 研究问题：用户只说“我要一个这样的镜头”时，Nomi 什么时候该选什么模式、模型和参数，怎样保持供应商通用，同时不把复杂度转嫁给用户？

> 重要修正（Seedance-first）：前一版把行业里存在的 camera-control/trajectory 说法写成了通用模式，这是规格错误。
> Seedance 的真实模式必须以当前渠道的官方接入文档为准；用户的“环绕/推近/跟拍”是创作意图，不等于 Seedance 有一个可选的轨迹控制 API。
> 本版把 APIMart 的真实档案放在推荐链路中心，其他模型只作为对照，不能反向改写 Seedance 的模式或参数。

## 结论先说

真正决定质量的不是“把参数调大”，而是先判断这条镜头要解决哪一种控制问题：

1. 要不要锁住人物、场景或道具；
2. 动的是主体、环境，还是相机；
3. 是从一张已确定的画面开始，还是让模型自由构图；
4. 是要“从 A 变到 B”，还是只要一个短动作；
5. 是单镜头试错，还是多镜头连续叙事；
6. 质量、速度、成本、时长和画幅哪个优先。

因此 Nomi 不应该让用户先选一堆供应商字段，而应使用四层链路：

```text
用户意图/素材
      ↓
供应商无关的镜头计划（想保持什么、想改变什么）
      ↓
当前 provider/model 的能力与约束
      ↓
模式选择 + 参数映射 + 可解释的默认值
      ↓
按镜头目标验证，而不是只给一个总分
```

这和已确认的 MCP 方案一致：封存前模型、供应商、模式、提示词、参考素材和参数都能自由编辑；封存后形成不可原地修改的合同。新增的重点是：**编辑自由度保持不变，但选择可以由系统代劳，且每个默认值都能解释“为什么”。**

## 1. 真实用户在找什么

### TikHub 公开样本

使用 TikHub 官方 Douyin 多重搜索接口，搜索了三个意图词：

- `AI视频生成 参数 提示词`
- `AI视频 运镜 模式`
- `AI短视频 生成 教程`

共得到 39 条公开结果；成功下载 8 条公开 540p 左右视频，人工查看 4 个视觉总览。没有登录、验证码绕过、私密内容或批量镜像；没有把完整脚本或素材复制进仓库。TikHub 官方接口说明见[多重搜索接口](https://docs.tikhub.io/370212783e0)，官方 token 使用说明见[Token 文档](https://docs.tikhub.io/4592766m0)。

观察到的高频任务不是“我要用某个模型”，而是：

| 用户说法（概括） | 实际要解决的质量问题 | 对 Nomi 的含义 |
|---|---|---|
| 故事分镜做视频 | 把角色板、场景图、分镜和提示词连成可执行镜头 | 需要 storyboard/asset/shot 的输入模式，而不是一个大 prompt |
| 15 秒长视频怎么写 | 时长、事件数量和提示词复杂度互相冲突 | 先拆镜头或选 multi-shot，不能把更多动作继续塞进单镜头 |
| 一镜到底、首尾帧、复杂运镜 | 需要明确的起点、终点或镜头语言 | 有端点才选 first/last；相机运动在 Seedance 里写进 prompt 或使用参考视频，不虚构 trajectory mode |
| 角色站桩、画面平、打戏没力道 | 主体动作、受力、节奏和相机运动没有分开 | 先区分 subject motion / camera motion / motion intensity |
| 场景没质感 | 场景、空间层次、光影和风格没有被表达 | 不一定换模型；先补 scene/lighting/style 语义 |
| 多人多机位 | 人物关系、机位切换和跨镜一致性同时存在 | 需要按 shot 维护实体记忆和镜头级参数 |
| 替换参考图、改模式、改参数 | 用户希望像真实 UI 一样反复试错 | 所有这些必须在封存前可编辑，且预览会随之更新 |

这组结果说明：用户心里的“参数”其实是一个创作决策，不是 API 字段。系统如果只展示 `cfg_scale`、`seed`、`motion_bucket` 之类的字段，会让用户学习我们的内部语言，反而增加摩擦。

### 视觉样本的共同结构（证据级别 B：公开元数据 + 视觉抽样）

四个查看过的样本都把教程做成“先展示想要的效果，再把效果拆成操作”：

- 先给一个完整镜头或前后效果；
- 再展示参考图/故事板/首尾帧/路径草图；
- 接着只改一类变量，例如运镜、时长、角色参考或画面描述；
- 最后展示生成结果和适用场景。

这说明 Nomi 的最佳 UX 不是把所有参数同时打开，而是让用户先看到“试跑一次”，然后在失败位置上改一个最有可能有效的变量。

## 2. APIMart 真实模型档案：推荐的事实底座

这张表不是新的公共 UI；它是 Nomi 已有 `ModelArchetype` 和 APIMart mapping 的审计结果。推荐器先读这张能力事实，
再决定用户应该看到什么。字段名、数量上限和模式互斥必须跟档案/官方文档一起变更，不能从 Seedance 推给其他模型。

| APIMart 模型 | 实际可用模式/参考输入 | 关键参数（以当前档案为准） | 推荐时的判断 |
|---|---|---|---|
| Seedance 2.0（标准/Fast/Mini） | `t2v`；`i2v` 单/多图；`firstlast`；`omni` 图/视频/音频参考 | `size`、`resolution`、`duration 4–15`、`seed`、`generate_audio`；标准与 Fast/Mini 的分辨率不同；`image_urls` 与 `image_with_roles` 互斥，音频需图或视频 | 有角色图 → `omni`；有首尾两图 → `firstlast`；只有一张起始图 → `i2v`；无素材 → `t2v` |
| Seedance 2.5 | `t2v`、首帧、首尾帧、`omni` 图/视频/音频参考 | `size`、`resolution 480/720p`、`duration 4–30`、`generate_audio`、`return_last_frame`、`seed`；首帧/首尾帧 `size` 必须 `adaptive`；参考上限图/视频/音频 30/10/10 | 先按素材角色选模式；首尾帧不能让用户自由选比例，UI 直接说明“跟随输入图” |
| MiniMax H3 | `t2v`、首帧、首尾帧、多模态参考 | `aspect_ratio`、`resolution 2K/768P`、`duration 4–15`、`watermark`、`webhook`；参考图/视频/音频槽各有上限，音频不能单独输入 | 角色/场景参考 → `ref`；首尾端点明确 → `firstlast`；没有素材 → `t2v` |
| Veo 3.1 | `t2v`、参考图、首尾帧 | `aspect_ratio`、`resolution`；时长固定 8 秒；参考图和首尾帧通过不同 `generation_type` 表达 | 不是 Seedance 的模式模板；只能按 Veo 自己的 `reference/frame` 选择 |
| Sora 2 | `t2v`、单图 `i2v` | `aspect_ratio`、`resolution`、离散时长 4/8/12/16/20；Pro 变体扩大分辨率 | 只给一张图时可推荐 `i2v`，不能推荐首尾帧/全能参考 |
| Kling 3.0 / Turbo | 文生、图生；Turbo 只有单张首帧 | Kling 3.0 用 `mode`、`duration`、`aspect_ratio`、`audio`；Turbo 用 `resolution`，图生比例跟图 | 同名模型也不能共用参数；Turbo 不显示尾帧控件 |
| Wan 2.7 | `t2v`、图生首/尾帧、角色参考（图+视频） | `size`、`resolution 720P/1080P`、`duration 2–15`、负向提示/种子；参考视频时长和图+视频总数有限制 | 角色一致性/动作参考 → `ref`；首尾图 → `i2v`；比例由参考帧决定时不显示比例 |
| Hailuo 2.3 | `t2v`、单张首帧 | 无比例字段；`resolution 768p/1080p`；时长仅 6/10 秒；Fast 适合首帧图 | 不要把 Hailuo 的时长控件当成通用连续数字 |
| Vidu Q3 | 只有参考生视频，1–7 张参考图 | `duration 3–16`（Mix 可到 1 秒）、`resolution`、`aspect_ratio`、`seed` | 用户没有参考图时不推荐它，直接给出需要参考素材的提示 |
| Grok Imagine 1.5 | `t2v`、最多 7 张图生 | `quality 480/720p`、`duration 6–30`、文生有 `size`，图生比例跟图 | 图生时不展示比例控件 |
| Omni-Flash-Ext | 文生、1 或 3 张参考图 | `size`、`resolution`、离散时长 4/6/8/10；2 张图不支持；当前接入未启用参考视频 | 需要参考图时先校验数量，不能把 2 张自动塞进去 |
| MiniMax H3 再生成 | 仅从已有 H3 768P 成片任务再生成 | `source_task_id` | 不是普通新建视频模型，不进入首轮模型推荐 |

当前 APIMart 传输入口和字段映射集中在 [`electron/catalog/apimartVideos.ts`](../../electron/catalog/apimartVideos.ts)，
模式、参考槽和参数档案集中在 [`src/config/modelArchetypes`](../../src/config/modelArchetypes)。这两层已经证明了一个关键事实：
同一“用户意图”可以通用，但请求字段不通用。例如 Seedance 用 `size`，MiniMax H3 用 `aspect_ratio`；Seedance 首尾帧用
`image_with_roles`，Veo 首尾帧用有序 `image_urls` + `generation_type`，Hailuo 首帧是单独的 `first_frame_image`。

本轮对账使用的入口文档包括：[APIMart Seedance 2.0](https://docs.apimart.ai/cn/api-reference/videos/doubao-seedance-2-0/generation)、
[KIE Seedance 2.0（用于对照字段差异）](https://docs.kie.ai/market/bytedance/seedance-2)、以及[火山方舟视频生成 API](https://api.volcengine.com/api-docs/view?action=CreateContentsGenerationsTasks&serviceCode=ark&version=2024-01-01)。
APIMart 的 2.5 档案也有独立文档入口，当前 Nomi 已把 `size=adaptive` 等硬约束压进模式档案，而不是让用户误选。

### APIMart 推荐的选择顺序

```text
先看用户有没有素材，以及素材扮演什么角色
  首帧 + 尾帧          → 当前模型有 firstlast 才推荐 firstlast
  角色/场景参考图      → 当前模型有 character/ref/omni 才推荐对应模式
  参考视频或音频       → 当前模型声明 video_ref/audio_ref 且依赖满足才推荐
  只有一张起始图        → 当前模型的 single/i2v
  没有参考素材          → t2v

再看模型真实参数
  只发当前 mode 的参数；fixedParams 不做假控件；互斥字段不同时发
  用户目标时长/比例/清晰度能落入当前枚举才采用，否则选最近合法值并说明
  当前模型没有这个参数 → 不伪造、不静默换模型，给“近似/不支持”说明
```

对用户价值来说，这意味着“有角色参考图时优先图生/参考”不是一条写死的 Seedance 特例，而是一个可解释的推荐原则：
参考图已经把主体外观框住，模型只需解决运动和镜头；纯文生则需要同时猜主体、构图和动作，身份稳定性通常更差。
但最终落到哪个模式，仍由当前 APIMart 模型的真实档案决定。

## 3. 官方产品如何划分模式和参数

| 产品/官方能力 | 模式或控制 | 约束/差异 | 对 Nomi 的启示 |
|---|---|---|---|
| Google Veo 3.1 | 文生、图生、视频扩展；最多 3 张参考图；首帧/尾帧/扩展 | 720p/1080p/4K 与时长有约束；1080p/4K 只支持 8 秒；24fps；Veo 3.1 原生带音频 | “清晰度”不能脱离时长和模式单独选；音频是能力声明，不是公共默认字段。见[Veo API](https://ai.google.dev/gemini-api/docs/veo?hl=en) |
| Google Veo 提示词 | 景别/构图、相机运动、风格、光线、人物、场景、动作、对白、声音 | 官方明确把这些作为不同控制维度 | Nomi 的语义层应把相机、主体动作、环境、声音分开，避免一段 prompt 互相打架。见[Veo 提示词指南](https://deepmind.google/models/veo/prompt-guide/) |
| Runway Gen-4/4.5 | 图生视频以输入图确定主体、构图、颜色和光线；文字主要描述运动；支持顺序/时间提示 | 官方建议从简单 prompt 开始，一次只增加一个变量；负面提示可能产生反效果 | I2V 时默认帮用户把“画面描述”降为“动作描述”；参数调试要单变量迭代。见[Gen-4 视频提示词指南](https://help.runwayml.com/hc/en-us/articles/39789879462419-Gen-4-Video-Prompting-Guide)和[Image-to-Video 指南](https://help.runwayml.com/hc/en-us/articles/48324313115155-Image-to-Video-Prompting-Guide) |
| Runway API/Recipe | `model`、输入图、`ratio`、`duration`、可选 `seed`；multi-shot 支持 3–5 个 shot | 不同模型的尺寸、时长、输入比例和支持模式不同；multi-shot 每个 shot 时长之和必须等于总时长 | 公共 UI 必须从 capability schema 动态生成；不能假设“所有模型都有同一组 duration/ratio”。见[API Reference](https://docs.dev.runwayml.com/api/)、[Multi-Shot Recipe](https://docs.dev.runwayml.com/recipes/multi-shot-video/) |
| MiniMax Hailuo | 文生、图生、首尾帧、多模态参考（图/视频/音频） | 通过 `content[]` 和 `role` 区分 first/last/reference；duration、resolution 随模型变化 | “参考素材是什么角色”比“上传了几张图”更重要；Nomi 需要保留素材角色，不只保留 URL 列表。见[视频生成指南](https://platform.minimaxi.com/docs/guides/video-generation) |
| Luma Ray | 文生、图生、keyframes、loop；相机运动用语言/概念 | 官方提供 camera motion 列表，但仍以自然语言控制，且相似说法可能有偏差 | 相机运动应是语义能力，可映射到供应商词表；不能承诺精确轨迹，必须在 UI 标注“可控程度”。见[Luma Video Generation](https://docs.lumalabs.ai/ue/docs/video-generation) |

补充一个容易被忽略的事实：Runway 的 API 变更日志已经出现同一 provider 下不同模型拥有不同的比例、时长、音频和 reference 规则。这证明“provider 级别的 if/else”也不够，能力声明必须落到 `provider + channel + model + variant + mode`。

## 3. 论文与开源实现告诉我们的边界

### 🟢 可落地

1. **EntityBench（2026-05）**：跨镜实体一致性会随着再次出现的间隔快速下降；显式的 per-entity memory 表现最好。落地含义：角色、道具、场景不能只作为每个镜头的临时 prompt；应作为可验证的实体记忆进入候选合同。来源：[论文](https://arxiv.org/abs/2605.15199)、[代码](https://github.com/Catherine-R-He/EntityBench)。
2. **DirectorBench（2026-05）**：长片不应被一个总分代表，应该按剧本、视觉、音频、跨模态、稳定性和用户偏好诊断。落地含义：Nomi 的质量门应告诉用户“角色一致性通过，但转场失败”，而不是只说“质量 78 分”。来源：[论文](https://arxiv.org/abs/2605.30090)、[代码](https://github.com/jiaminchen-1031/DirectorBench)。

### 🟡 架构教训

1. **MotionCtrl** 将相机运动和主体运动作为可以独立控制的条件。落地含义：UI 的“运镜强度”不能同时偷偷改变人物动作；两者应在意图层分离，供应商没有原生分离能力时才做明确降级。来源：[论文](https://arxiv.org/abs/2312.03641)、[官方实现](https://github.com/TencentARC/MotionCtrl)。
2. **Wan** 和 **Diffusers** 都把不同 pipeline、scheduler、control input 组合成模块化推理系统。落地含义：Nomi 的通用层应表达能力和约束，模型适配器负责映射，不应把某一套开源 pipeline 的参数泄漏到公共合同。来源：[Wan 技术报告](https://arxiv.org/abs/2503.20314)、[Wan 代码](https://github.com/Wan-Video/Wan2.1)、[Diffusers](https://github.com/huggingface/diffusers)。

### 🔵 对标基准

- **VBench/VBench++** 将视频质量拆成主体一致性、运动平滑、闪烁、空间关系等细粒度维度，可作为单镜头底层评测。来源：[VBench](https://arxiv.org/abs/2311.17982)、[VBench++](https://arxiv.org/abs/2411.13503)、[项目页](https://vchitect.github.io/VBench-project/)。
- **DirectorBench** 可作为多镜头/长片诊断层；**EntityBench** 可作为角色、道具、场景记忆层。三者组合比一个“整体美观分”更接近用户真正感知的失败。

## 4. Nomi 的通用规格（提案，不是本轮实现）

### 4.1 供应商无关的 `ShotIntent`

用户看到的不是供应商字段，而是这些创作意图：

```text
subjectContinuity: free | preserve | strict
sceneContinuity: free | preserve | strict
motionTarget: subject | camera | environment | transition | mixed
cameraIntent: locked | pan | tilt | dolly | orbit | handheld | path | unspecified
transitionIntent: none | start_end | extend | match_cut
referenceRoles: character | scene | style | pose | first_frame | last_frame | motion_video
durationTarget: short | standard | long | exact(seconds)
aspectTarget: landscape | portrait | square | exact
audioIntent: none | ambience | dialogue | music | native_if_available
qualityPriority: explore | balanced | final
```

这套字段描述用户想要什么，不描述某家 API 叫什么。`prompt` 仍然保留自由输入；系统只在需要时补齐缺失的镜头语义，不覆盖用户原意。

### 4.2 `ModelCapabilityProfile`

每个 `provider + channel + model + variant + mode` 声明：

- 支持哪些模式：T2V、I2V、first/last、video-to-video、extension、multi-shot；
- 每个模式支持哪些输入角色和最大数量；
- 可控维度：主体动作、相机动作、环境动作、时间顺序、声音、参考一致性；
- 可用参数、枚举、默认值、上下限和互斥关系；
- 输出限制：时长、画幅、分辨率、fps、音频；
- 恢复能力：submit idempotency、query、reconcile、cancel；
- 每个能力的证据级别：`native`（官方支持）、`translated`（可安全映射）、`unsupported`（不能保证）。

公共合同只保存标准语义和用户明确的 override；适配器保存 provider-specific payload。这样模型替换、供应商替换、输入模式替换都不会让 UI 变成三套产品。

### 4.3 选择逻辑

```text
先看用户要保持什么，再看用户要改变什么。

先看当前 provider/channel/model/variant 实际声明了哪些模式
有明确首帧且要锁主体/场景       → 在当前档案支持时选 single/I2V
有明确起点和终点                 → 在当前档案支持时选 firstlast
有角色/场景参考图                → 在当前档案支持时选 character/ref/omni
有参考视频或音频                  → 只有对应 slot 存在且依赖满足才选参考模式
有相机环绕/推近等意图             → 写入 prompt；有 video_ref 时才可用参考视频近似，不生成 trajectory mode
没有参考、只想探索风格和动作      → 在当前档案支持时选 T2V

模式确定后：
  只暴露该模式真正有影响的参数；
  根据 shot intent 选默认值；
  每个默认值附带“为什么”和“可能牺牲什么”；
  不支持的能力不伪装成支持，给出最近可用方案。
```

### 4.4 参数什么时候选

| 用户目标 | 首选模式 | 系统先选的参数/输入 | 为什么 | 用户可见的取舍 |
|---|---|---|---|---|
| 角色脸和服装必须稳定，只想让她转身 | I2V + character reference | 锁参考图；prompt 只写动作；低到中运动强度；短镜头 | 画面已经确定，减少模型重画主体 | 稳定性更高，但自由构图更少 |
| 手机广告从背面变成正面 | 当前模型支持的 firstlast/首尾帧模式 | 首帧、尾帧、过渡动作和当前模型允许的时长 | 起点和终点都重要，不能只靠长 prompt | 过渡更可控，但两帧冲突会增加失败率 |
| 航拍穿越/环绕 | 当前模型的 prompt camera language 或参考视频能力 | 相机意图和主体动作分开；只有档案声明 video_ref 时才使用参考视频 | Seedance 没有独立轨迹模式，不能把路径控件伪装成原生能力 |
| 打戏有力道 | I2V 或 motion/reference-video | 对抗关系、受力、动作节奏、主体动作；必要时姿态/动作参考 | “打得激烈”太抽象，必须转成物理动作 | 动作更清楚，但需要更具体的输入 |
| 一条分钟级短剧 | multi-shot 或逐镜生成 | 先拆 shot；每镜独立时长/运动；实体记忆；最后剪辑 | 单镜模型不擅长同时承载多个场景变化 | 可控性高，但流程多一步 |
| 先快速找感觉 | fast/draft、720p、短时长、少参考 | 固定意图，降低清晰度/时长/候选数 | 先验证构图和动作，不浪费最终预算 | 预览质量低，不代表最终质量 |
| 已锁构图后出片 | final/high-quality | 只在构图和动作通过后提高分辨率/音频/候选数 | 高分辨率不能修复错误构图 | 更慢、更贵，但用于最终交付 |

关键原则：`resolution`、`duration`、`seed`、`numberOfVideos` 不是“越大越好”。它们必须服从镜头目标；例如官方 Veo 将 1080p/4K 限制在 8 秒，Runway 不同模型的 duration/ratio 集合也不同。

## 5. 供应商缺能力时，用户仍然能用

不能因为某供应商没有独立相机路径、first/last、query 或 idempotency，就把整个能力从 Nomi 删除。应把能力分为三档：

| 能力状态 | 系统行为 | 用户看到什么 |
|---|---|---|
| `native` | 直接映射到官方字段或官方模式 | “首尾帧：当前模型原生支持” |
| `translated` | 转成 prompt/参考素材/分镜拆分等最接近方案 | “该模型没有独立运镜控制，已用镜头描述近似；可控性较低” |
| `unsupported` | 不伪装，不静默换模型；保留其他能力 | “此模型无法保证首尾帧过渡。可改用首帧模式，或换一个支持该能力的模型” |

这和 P0 对 provider recovery 的原则相同：能力缺失时降级用户体验，不丢失用户任务，也不做危险的静默替换。

## 6. 用户体验应该怎样变简单

### 默认路径：一句话 → 先看到效果

1. 用户说“让这个角色从门口走到镜头前，镜头环绕一圈”。
2. Nomi 自动识别：已有角色参考、主体动作 + 相机动作、需要保持身份。
3. Nomi 给出一个简短的“生成计划”：
   - 模式：图生视频；
   - 参考：角色图 1；
   - 相机：环绕（当前模型原生/近似/不支持）；
   - 时长：6 秒；
   - 质量：先试跑。
4. 用户只需要点击一次“试跑”；需要时再展开“调整”。

### 调整路径：像真实 UI 一样自由

在合同封存前，用户可以：

- 换模型或供应商；
- 切换文生、图生、首尾帧、参考视频等模式；
- 添加、替换、删除、排序参考素材，并改变素材角色；
- 改 prompt、时长、画幅、质量优先级和模型支持的高级参数；
- 看到成本、能力变化、失败风险和新的预览；
- 撤销或回到上一候选。

每次变更只更新草稿/候选，不调用 provider、不扣费、不写入最终资产。封存或提交后，系统不原地修改已提交任务；用户要换模型或素材就创建新候选，旧任务仍可查询/对账。

### UI 文案原则

- 用“锁住角色”“从首帧过渡到尾帧”“相机绕一圈”而不是 `referenceType=asset`、`motion_bucket=127`；
- 把内部 hash、lease、providerTaskId 隐藏在详情里；
- 每个复杂选项旁边只回答两个问题：“它会改变什么？”“代价是什么？”；
- 不支持时告诉用户下一步，而不是显示灰掉的一整组表单。

## 7. 真实场景验证计划

### 零额度合同测试

用 fake providers 覆盖同一意图在不同能力组合下的映射：

1. APIMart Seedance 2.0/2.5：无参考、角色参考图、首尾帧、参考视频、参考音频；
2. APIMart 其他档案：只有参考生（Vidu Q3）、只有单首帧（Hailuo/Turbo）、离散时长（Sora/Omni-Flash-Ext）和不同字段名；
3. 六种目标：角色稳定、场景稳定、相机语言、动作/打戏、首尾过渡、多镜头叙事；
4. 每个场景切换模型、变体、模式、素材顺序和参数，断言合同预览语义保持一致；
5. 断言确认前 provider/spend/materialization 都为 0，确认后最多一次提交；
6. 断言 unsupported 不会静默改成另一模型，unknown 不会盲目重提。

### 真实用户任务闭环

后续真实生成验证至少覆盖：

- J1：一句话生成角色走位镜头；
- J2：替换角色参考图后重新预览；
- J3：同一镜头在 APIMart Seedance 的文生/图生/首尾帧/全能参考之间切换；
- J4：自由替换模型、供应商、画幅、时长和一个高级参数；
- J5：供应商缺少独立相机路径、首尾帧或查询能力时完成生成/恢复，并看到诚实的降级说明。

每条任务按“意图保持、角色一致、主体动作、相机执行、时序、空间关系、音画同步、失败解释、编辑自由度”分项记录，不能用一个总分掩盖具体失败。

### 下一阶段的验收门

- 同一用户意图换 provider/model 后，标准语义不丢；支持范围变化被明确显示；
- 用户不需要学习供应商字段即可完成首轮试跑；
- 参考素材替换、模式切换和参数修改不会产生隐形 provider call；
- 每个系统默认值都能说清“为什么选它”和“牺牲了什么”；
- 质量报告能指出具体瓶颈（例如“角色稳定、相机偏差”），并给出下一步可操作建议；
- 没有原生能力的供应商仍能完成可用路径，同时诚实标注可控性下降。

## 8. 本轮补充的研究渠道

除了用户指定的 TikHub、产品、GitHub、论文，本轮增加了四类证据：

1. **官方 API schema 与 changelog**：核对真实枚举、互斥参数、时长/分辨率限制，防止凭印象写适配器；
2. **官方工作流/recipe**：观察多镜头、首尾帧、产品广告等真实组合，而不只看单个字段；
3. **开源 pipeline 的控制入口**：确认 camera/object/reference/scheduler 等控制是否真正存在于代码；
4. **失败诊断 benchmark**：把“质量好不好”拆成用户能理解、系统能修复的维度。

## 9. 当前决定与下一个决策点

本轮无需用户决定的部分：保持 P0 生产边界、使用现有 APIMart 档案、做纯推荐器和零额度合同测试，均是对既定 Nomi 方案的继续推进。

下一步的唯一产品决策点是：**第一轮真实质量 A/B 是否锁定 APIMart 的 Seedance 2.0/2.5，还是同时纳入 APIMart 其他视频模型？**

我的推荐是先锁定 Seedance 2.0/2.5：它们是当前 Nomi 的核心能力，且模式最能覆盖角色参考、首尾帧和全能参考；其他 APIMart 模型继续进入能力矩阵和推荐候选，但不把首轮质量验证摊得过宽。无论选择哪一项，推荐器都只从该模型真实档案生成参数，不会把 Seedance 的字段复制给其他模型。

## 来源与限制

- TikHub 原始搜索/视频证据保存在本机临时目录 `/tmp/nomi-video-research-20260823`，未提交到仓库；本报告只保留抽象结论和公开作品 ID，未复制完整脚本或素材。
- TikHub 官方接口要求 `content_type` 为字符串；本次发现旧 helper 使用数字会触发 422，已在临时研究记录中修正调用方式，尚未修改技能脚本。
- TikHub 样本没有本地 ASR 能力，视觉结论来自公开元数据、画面文字和抽样帧；没有把未验证的口播内容当作事实。
- 供应商文档和模型能力会变化；实现前必须再次抓取对应官方 API 文档并逐项对账。

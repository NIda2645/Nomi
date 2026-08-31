# B 路调研：多 agent「剧本→视频」框架 + 审片环（2026-08-19）

> **任务**：验证/推翻「Nomi 的瓶颈不在生成模型，而在生成前的结构化管线（剧本→分镜→镜头 prompt）和生成后的审片环」这一假设，并带回可落地的管线设计。
> **方法**：WebSearch/WebFetch 找近 12 月（优先近 6 月）活跃框架；对最强候选**直接 clone 源码逐字段读 schema 与 prompt**（不靠 README/摘要脑补）。training-free / 纯工程编排优先（Nomi 不训模型）。
> **一句话结论**：假设**基本成立但有一处重要修正**——管线（尤其一致性）确实是主要瓶颈，但「纯 plan-then-generate 开环」被反复证明「文本对齐够、视觉一致性崩」，**真正把一致性拉起来的是「参考图注入 + VLM 审片重试」这个闭环**，不是更长的剧本 schema。schema 是必要地基，闭环才是分水岭。

---

## 0. 一张图看清「谁还是参照系」

用户给的历史清单（MovieAgent / VideoDirectorGPT / Anim-Director / VideoGen-of-Thought / DreamFactory）**现在基本都不是活跃参照系了**——它们是 2024 的奠基工作，代码停更、star 低。近 6 月的活跃参照系换成了 **ViMax（HKUDS）** 和 **FilmWorld**，外加一批 2026 的论文（FilmAgent、AniMaker、The Script Is All You Need 等）。

| 历史候选 | 现状（2026-08） | 是否仍为参照系 |
|---|---|---|
| **MovieAgent** (showlab) | GitHub 353★，最后更新 **2024-03-18**（inference code），无后续 | ❌ 历史 baseline，被引用作对比项而非参照 |
| **VideoDirectorGPT** | 2023 论文，常被列为「script→layout→video」范式起点 | ❌ 范式来源，非现役实现 |
| **Anim-Director / VideoGen-of-Thought / DreamStory** | 2024 论文，常并列被引用为「script→keyframes→clips→compose」传统管线 | ❌ 同上 |
| **ViMax** (HKUDS) | **12k★，v1.2.0，最后更新 2026-07-20，MIT，代码完整可跑** | ✅✅ 现役最强开源参照，本报告主力拆解对象 |
| **FilmWorld** | arxiv **2026-07**（2607.19038），有项目页，声称超越所有 SOTA video agent | ✅ 现役最强「审片闭环」设计参照 |
| **FilmAgent** | arxiv 2501.12909（2026-01 挂出/更新），3D 虚拟空间，有枚举镜头库 | ◐ 参照（但绑 Unity 3D 场景，非通用 T2V） |

**判断依据**：ViMax 是唯一同时满足「近 6 月更新 + 万级 star + MIT + 源码含真实 schema/prompt + training-free 纯编排」的框架，因此是 Nomi 最该逐字节抄的对象。以下 schema 样例大量出自它的源码（clone 自 `github.com/hkuds/vimax` `main` 分支，2026-08-19 抓取，逐文件读取，非 README 概括）。

---

## 1. 框架对比表

| 框架 | 日期/活跃度 | 规模 | 管线步骤（idea/剧本→视频） | 剧本 schema | 分镜 schema | 一致性机制 | 审片环 | training-free | 许可 |
|---|---|---|---|---|---|---|---|---|---|
| **ViMax** (HKUDS) | v1.2.0 **2026-07-20**；技术报告 2026-06；持续更新 | **12k★** | Idea2Video / Script2Video / Novel2Video 三入口 → 故事 → 场景切分 → 角色抽取+画像 → 分镜(brief) → 首/尾帧+运动分解 → 参考图选择+prompt 组装 → 首帧图 → best-of-k 选图 → I2V → 转场 → 拼接 | 三层：Story(自由文本 outline)→Scene(结构化)→分镜。Scene 有 `idx/is_last/environment/characters/script` | `ShotBriefDescription`(idx/is_last/**cam_idx**/visual_desc/audio_desc) → 解构成 `ShotDescription`(+ff_desc/lf_desc/ff_vis_char_idxs/lf_vis_char_idxs/motion_desc/**variation_type∈{large,medium,small}**) | 三级角色 bank(Novel→Event→Scene)，static/dynamic 特征分离；每角色多视角 portrait；**相机复用图 + 参考图注入**（选≤8 张 ref 喂 I2I）；无 seed/token | ✅ **VLM best-of-k 选图**：7 维角色特征+空间+文本一致性打分选最佳；k=2 最优；报告级另有 best-of-k 判分维度=视觉保真/叙事一致/镜头规格遵从 | ✅ 纯编排 | MIT |
| **FilmWorld** | arxiv **2607.19038**（2026-07） | 新，未开源代码（有项目页+论文） | Novel → ①叙事结构翻译 ②世界实体状态建模+视觉锚定 ③状态驱动分镜 → ④状态锚定生成 ⑤跨镜状态传播 ⑥**闭环状态校验** | 章→场景序列；实体消歧成 canonical id（角色/地点/道具 ℰc∪ℰl∪ℰp）；场景挂 lighting/season/weather/color palette | 每镜 directive：shot narrative/working title/参与角色+道具集/cinematic rationale/camera framing+intent/静态keyframe描述/**end-state metadata**（下一镜开头=上一镜 end-state） | **状态离散化**：角色(identity, age stage, costume)/地点(place,season,weather,time)/道具(condition)→哈希成 state id ϕ；每个新 ϕ 首次出现生成 ref asset 存中央库 ℒ；voice 绑 identity+age stage | ✅✅ **闭环 Diagnostic→Corrective→Select**：keyframe 校验(身份/空间构图/语义对齐)+video 校验(时序连续/对白对齐/视觉缺陷)→出结构化诊断报告→**纠错点以祈使句注入 prompt 重生成**→打分门控选优+回滚保护，**最多 K=3 轮**。评测 FilmEval 9 指标(Gemini 3.1 Pro 当 judge) | ✅ 纯编排 | 未标（论文） |
| **FilmAgent** | arxiv 2501.12909 | 中 | 3D 虚拟空间内：idea→剧本→镜头。多 agent 迭代 | 剧本挂角色/动作/对白/走位（绑 3D 场景预置机位） | 枚举镜头库+机位（绑 Unity 场景，非通用文本 prompt） | 靠 3D 场景一致（场景是搭好的），非 T2V 一致 | Critique-Correct-Verify + 多 agent Debate（校验中间剧本、减幻觉），非视觉 VLM 审片 | ✅ 编排 | 见仓库 |
| **AniMaker** | arxiv 2506.10540（2026-06） | 中 | text→多镜动画。MCTS 多候选 clip 生成 | — | — | 上下文感知多镜评估器选片 | **MCTS 式多候选生成 + 评估器选 story-coherent 片**（best-of-many 变体） | ✅ | 见仓库 |
| **The Script Is All You Need** | arxiv 2601.17737（2026-01） | 中 | dialogue→细粒度可执行剧本→跨场景连续生成 | **ScripterAgent**(训练过的模型)把粗对白翻成细粒度镜头脚本 | 细粒度可执行脚本（论文级，未逐字段公开） | DirectorAgent 跨场景连续生成 | 有 ScriptBench 基准 | ◐（Scripter 是训练模型） | 见仓库 |
| **MovieAgent** (showlab) | 2024-03 停更 | 353★ | script+角色bank→场景/机位/摄影 CoT→I2V | `script_synopsis.json`（README 未公开字段） | README 未公开字段 | 角色 bank(photo+audio 目录) | README 未提 VLM 审片 | ✅ | 见仓库 |

> 表读法：**ViMax 给「可落地的完整实现 + 真实字段」，FilmWorld 给「最完备的审片闭环设计」**。二者互补——Nomi 抄 ViMax 的 schema/参考图流，抄 FilmWorld 的闭环校验结构。

---

## 2. 「瓶颈在管线」假设：证据与反证

### ✅ 支持（假设成立的部分）

1. **所有现役框架的差异化全在「生成前管线 + 生成后闭环」，没人靠换底模赢。** ViMax/FilmWorld/AniMaker 用的都是现成 T2V/I2V（Veo、Seedance、Nano Banana、HunyuanVideo），拉开差距的是剧本结构化、参考图注入、审片重试。这直接印证「瓶颈不在生成模型」。
2. **一致性是公认的头号痛点，且被明确定位在管线层。** FilmWorld 把「跨镜一致性」列为主攻点，靠**状态离散化 + 参考资产锚定**（管线机制）解决，不靠底模。ViMax 整套相机依赖图/参考图选择/best-of-k 全是为一致性服务的编排逻辑。
3. **消融实验直接证明结构化管线的增益**：EduStory「加 Instruction Planner，pedagogical alignment +12 分；显式 state 建模是知识一致性的主驱动」；Text2Story「移除任一结构化组件都会降级时序连续/prompt 遵从/运动连贯」。→ 结构化 prompt 与状态建模有可测量增益。
4. **文本 prompt 是有损压缩**：业界共识「text prompt 是对物理世界的有损压缩，省掉了决定动态的参数，再大的模型也补不回从没指定过的东西」——这正是「把信息在 prompt 前结构化补全」的价值论据。

### ⚠️ 反证 / 重要修正（假设需要打的补丁）

1. **「纯 plan-then-generate 开环」被反复证明不够。** 多篇 2026 工作（CoAgent、Text2Video 系）指出：一个「Storyboard Planner + Synthesis」的开环 baseline「文本-视频对齐分还行，但视觉一致性挣扎」。**→ 光有更好的剧本/分镜 schema（生成前管线）不足以解决一致性；决定成败的是把「参考图注入 + 审片重试」这个闭环补上。** 换句话说，假设里「生成前管线 + 生成后审片环」这两半，**权重不对等——审片环（闭环）是分水岭，生成前 schema 是入场券**。
2. **一致性的真正抓手是「视觉锚定」而非「文本描述」。** ViMax 的 `visual_desc` 里塞角色特征只是辅助；真正保身份的是**给 I2I 喂 portrait 参考图 + 上一帧图**。FilmWorld 同理靠 ref asset 库。→ Nomi 若只把 schema 做漂亮但不做「参考图 bank + 注入」，一致性照样崩。
3. **best-of-k 有天花板，k 不是越大越好。** ViMax 技术报告实测 **k=2 最优**，更高 k「反而在身份和场景状态上引入选择噪声」。→ 审片环要「小 k + 定向重试」，别指望堆采样。
4. **底模仍是硬地板。** 所有框架都承认「多数 T2V 只能生成几秒」是硬限制（ViMax README 首条就写 "Limited to Short Clips"）。管线能提升初稿质量与一致性，但**镜头时长、动作物理合理性的上限仍由底模决定**——这部分不在管线可修范围。

### 结论（给 Nomi 的判断）

**假设成立，但要重述为**：
> Nomi 的可控增量**主要在管线**——其中**生成后的审片闭环（参考图注入 + VLM 判分 + 定向重试）是拉开质量的分水岭，生成前的剧本/分镜 schema 是必要地基但单独不够**。底模决定的时长/物理上限不在管线可修范围，需诚实标注（对齐 D4）。
>
> 对 Nomi 的直接含义：**先把「角色参考图 bank + 参考图注入 I2V」这条闭环打通（收益最大），再谈剧本 schema 的精细度**。反过来做（先雕 schema 后补闭环）会得到「文本对齐但身份崩」的经典失败态。

---

## 3. 可直接借鉴的 schema 样例（字段级，全部注明出处）

> 以下**全部逐字段抄自 ViMax 源码的 Pydantic 定义**（`github.com/hkuds/vimax` `main`，2026-08-19 clone），不是脑补。字段名、描述、examples 都是原文。FilmWorld 部分出自其论文正文（2607.19038），标注为「论文级、未开源」。

### 3.1 剧本 schema — 场景级（出处：ViMax `interfaces/scene.py`）

ViMax 的剧本不是一坨自由文本，而是**先自由文本 outline（Story）→ 切成结构化 Scene 列表**。每个 Scene：

```json
{
  "idx": 0,                         // 场景序号，从 0 起
  "is_last": false,                 // 是否最后一场（终止信号）
  "environment": {                  // ← 见 3.4 环境 schema
    "slugline": "INT. COFFEE SHOP - NIGHT",
    "description": "暖黄灯光打在斑驳砖墙上，雨滴在玻璃上拉出模糊霓虹倒影……（只写环境，不写人物/动作）"
  },
  "characters": [ /* CharacterInScene[]，见 3.3 */ ],
  "script": "<Jane> paces nervously, clutching a letter. She turns to <John>.\n<Jane>: John, we need to leave tonight.\n<John> shakes his head, stepping toward the window.\n<John>: It's too dangerous."
  // ↑ script 里人物名用 <> 包裹（对白内的名字不包），供后续机器解析
}
```

**Nomi 可借鉴点**：①剧本分层（自由 outline → 结构化 scene）而非一步到位；②场景以 `(时间+地点)` 连续性切分（换时/换地=新场景）；③人物名用 `<>` 标记，让下游能程序化定位「谁在场」；④environment 强制「只写景不写人」，把角色单列，避免景与人耦合。

### 3.2 分镜 schema — 镜头级（出处：ViMax `interfaces/shot_description.py`）

ViMax 分**两步**：先 `ShotBriefDescription`（粗），再解构成 `ShotDescription`（细，含首尾帧+运动）。

**Step A — 分镜 brief**（storyboard artist 直接产出）：
```json
{
  "idx": 0,                 // 镜头序号
  "is_last": false,
  "cam_idx": 0,             // ★关键：机位索引。同机位可复用，减少一致性负担
  "visual_desc": "An over-the-shoulder shot at eye level, positioned behind <Alice>. The foreground, including <Alice>'s shoulder and head, is softly blurred, directing focus onto <Bob>'s face. <Bob>'s subtle reactions—shifting from surprise to delight—are clearly visible. The supermarket background is gently blurred with cool fluorescent lighting.",
  // ↑ 人物名 <> 包裹；对白直接写进 visual_desc，用 :" " 包裹 + 附角色特征
  "audio_desc": "[Speaker] Alice (Happy): Hello, how are you?"
  // 或 "[Sound Effect] Ambient sound (supermarket background noise...)"
}
```

**Step B — 解构成可生成的 shot**（`ShotDescription`，加了首尾帧与运动分解）：
```json
{
  "idx": 0,
  "is_last": false,
  "cam_idx": 0,
  "visual_desc": "……（同上，整镜描述）",
  "variation_type": "small",          // ★★∈{large, medium, small}：镜头内变化幅度
  "variation_reason": "This shot only shows Alice speaking and her facial expression changes, thus small.",
  "ff_desc": "Medium shot of a supermarket aisle at eye level. Bob (a tall man in a blue shirt and jeans) on the right, in profile facing right; Alice (short hair, green dress) on the left, pushing a cart, gaze lowered……（纯静态首帧快照，含景别/角度/构图/光）",
  "ff_vis_char_idxs": [0, 1],         // 首帧可见角色的索引（对应 characters 列表）
  "lf_desc": "……（纯静态尾帧快照，须与首帧+运动逻辑自洽）",
  "lf_vis_char_idxs": [0, 1],
  "motion_desc": "Dolly in from medium shot to close-up. Bob (with a beard, wearing a white T-shirt) smiles to the camera.",
  // ↑ 运动里不能用角色名，须用外貌特征指代（如「短发绿裙的」），避免 T2V 认不出
  "audio_desc": "[Speaker] Alice (Happy): Hello, how are you?"
}
```

**`variation_type` 三档的判定规则**（ViMax storyboard prompt 原文，极有借鉴价值）：
- **large**：夸张转场，构图与焦点剧变（如从远景平滑推到特写、航拍掠过城市），通常伴大幅运镜。
- **medium**：新角色进入，或角色从背面转到正面（面向镜头）。
- **small**：微变——表情变化、既有角色的走/坐/站、中等运镜（pan/tilt/track）。

> 为什么这个字段重要：它决定「这一镜用 T2V 还是 I2V、要不要生成尾帧、转场怎么接」。Nomi 若要工程化审片重试，`variation_type` 是判断「这镜该用什么生成策略 + 该按什么标准审」的路由键。

**Nomi 可借鉴点**：①**机位索引 `cam_idx`**——同机位复用参考图，是低成本一致性抓手；②**首帧/尾帧/运动三分解**——把「一个动态镜头」拆成「静态首帧 + 静态尾帧 + 中间运动」，首尾帧走 I2I 保一致、运动走 I2V，是当前主流做法；③**运动描述禁用角色名、改用外貌特征**——直接踩中 T2V「认不出专有名词」的坑；④首镜强制用最广景别建立环境（"The first shot must establish the overall scene environment, using the widest possible shot"）。

### 3.3 角色 bank schema（一致性核心，出处：ViMax `interfaces/character.py`）

**三层角色身份**（Novel→Event→Scene），核心是 **static/dynamic 特征分离**：

```json
// 场景级（喂给分镜/生成的最终形态）
{
  "idx": 0,
  "identifier_in_scene": "Alice",       // 本场景内的称呼（可跨场景变，如 "Alice"→"Alice in Wonderland"）
  "is_visible": true,
  "static_features": "Alice has long blonde hair and blue eyes, and is of slender build.",
  // ↑ 静态特征：脸/身形等几乎不变的 → 这是保身份的锚
  "dynamic_features": "Wearing a red scarf and a black leather jacket"
  // ↑ 动态特征：服装/配饰等随场景变的 → 允许变，不用于身份匹配
}

// 跨事件层（追踪同一角色在不同事件里的别名映射）
{
  "index": 0,
  "identifier_in_novel": "Alice",
  "active_events": {"0": "Alice", "2": "Alice in Wonderland", "5": "Alice"},
  // ↑ Dict[事件idx → 该事件里的称呼]，解决「同一人不同段落叫法不同」
  "static_features": "Alice has long blonde hair and blue eyes, slender build. Often wears casual clothing."
}
```

**Nomi 可借鉴点（一致性的关键设计）**：
1. **static vs dynamic 特征分离**——身份匹配只看 static（脸/身形），服装（dynamic）允许换。这让「换装但同一个人」成为可表达的状态，而不是每次换装都身份崩。
2. **别名映射表**（`active_events`/`active_scenes`: Dict[段落idx→称呼]）——追踪「同一角色在不同镜头/场景/段落里的不同叫法」，避免下游把「Alice」和「Alice in Wonderland」当两个人。
3. **每角色生成多视角 portrait**（front/side/back），作为参考图库（见 3.5 注入流）。

**FilmWorld 的更强变体（状态离散化，论文级）**：把角色状态离散成 `(identity, age_stage, costume)` 三维 → 哈希成 state id `ϕ` → 每个新 `ϕ` 首次出现生成一张 ref asset 存中央库 `ℒ={(ϕ, Iϕ)}`。地点离散成 `(place, season, weather, time_of_day)`，道具离散成 physical condition。**声音绑 `identity+age_stage`**。→ 若 Nomi 要做「同角色跨年龄/跨装扮」的强一致，这个「状态元组→哈希→资产库」是比 ViMax 更严的设计。

### 3.4 环境 schema（出处：ViMax `interfaces/environment.py`）

```json
{
  "slugline": "INT. COFFEE SHOP - NIGHT",   // 行业标准场景标头：INT/EXT. 地点 - 时间
  "description": "……（只写设定：背景/光/道具/氛围，明确禁止写任何角色或动作）"
}
```
**借鉴点**：用行业标准 slugline（INT./EXT. + 地点 + 时段）当场景 key，天然可复用同一环境的参考图；description 强制「无人无动作」，与角色解耦。

### 3.5 从 schema 到镜头 prompt 的组装流（★这是「生成前管线」的落点，出处：ViMax `agents/reference_image_selector.py` + `pipelines/script2video_pipeline.py`）

ViMax **不是把整个 schema 拼成一个大 prompt 硬塞 T2V**，而是走「参考图选择 + prompt 生成」两件事一起做：

```
每一帧（首帧/尾帧各来一次）：
  输入 = 目标帧文本描述(visual_desc) + 参考图库（角色多视角 portrait + 之前已生成的帧图，按时间倒序，越近优先）
  ↓ ReferenceImageSelector（一个 LLM/VLM agent）
  输出 = {
     ref_image_indices: 选中的 ≤8 张参考图,          // 哪些图当参考
     text_prompt: 组装好的生成 prompt              // 并指明「生成图里哪个元素参考哪张图的哪部分」
  }
  ↓ 图像模型（I2I，喂 ref images + text_prompt）生成 N 张候选
  ↓ BestImageSelector（VLM 审片，见第 4 节）选 1 张
  ↓ 该帧图 → I2V 生成这一镜的视频
```

**哪些进 prompt、哪些进参数**（Nomi 关心的原问题，ViMax 的答法）：
- **进 text prompt**：镜头的 `visual_desc`（景别/角度/构图/光/人物位置/朝向/对白）、角色的外貌特征文字、「哪个元素参考哪张图」的指令。
- **进「参数/参考图通道」**：角色 portrait 图 + 上一帧图（走 I2I 的 image 输入，不进文本）、`cam_idx`（决定复用哪个机位的历史图）、`variation_type`（决定生成策略）。
- **关键工程细节**：ReferenceImageSelector 的 prompt 明确要求「参考图按时间倒序、越近越优先」「同一角色多视角只选一张最贴的」「新角色进场优先选其 portrait」——这些是「参考图怎么选才不打架」的实战规则。

**ViMax 的定向重试 prompt（修构图对但元素错的情况，源码原文）**：
> "The composition and background are correct but some elements may be wrong. The wrong elements should be replaced. Wrong elements: {missing_info}. You must select this image as the main reference and replace the characters in the image with the provided character portraits. Don't change the background."

→ 这是「保背景、只换崩掉的角色」的精准修复指令，Nomi 审片重试可直接抄这个模式（局部重生成而非整帧重来）。

---

## 4. 审片环的可落地设计（判什么 / 怎么判 / 重试策略，prompt 模板级）

> 两个现役实现给了两套可直接落地的审片环：**ViMax 的 best-of-k 选图 VLM**（源码级，可抄）+ **FilmWorld 的闭环 Diagnostic→Corrective→Select**（论文级，结构可抄）。下面给字段级细节。

### 4.1 ViMax 审片环（源码级，可直接抄 prompt）

**判什么（三维，`BestImageSelector` 系统 prompt 原文）**：
1. **Character Consistency（角色一致性）**——逐项对 7 个特征：`a.gender b.ethnicity c.age d.facial features e.body shape f.outlook g.hairstyle` 与参考图是否吻合。
2. **Spatial Consistency（空间一致性）**——角色相对位置/布局/透视是否和参考图一致（「参考图里 A 左 B 右，生成图不能反」）。
3. **Description Accuracy（文本遵从）**——是否准确反映目标文本描述（注意：描述是「想要的结果」，不是编辑指令）。

**怎么判（可直接复用的 VLM 审片 prompt 骨架，据 ViMax 源码抽象）**：
```
[Role] 你是专业视觉评估专家，擅长判定候选图与参考图之间的角色一致性、空间一致性，及候选图与文本描述的语义一致性。
[Input]
  参考图 0..M（每张附简短描述，如 "Reference Image 0: 长棕发红裙的年轻女孩"）
  候选图 0..N（"Generated Image 0" ...）
  目标图文本描述（<TARGET_DESCRIPTION_START>...<END>）
[判定优先级]
  - 优先角色一致性：gender/ethnicity/age/facial/body shape/outlook/hairstyle 逐项比
  - 关注空间一致性：相对位置/物体排布/透视须与参考图逻辑一致（不能左右反）
  - 严格对齐文本描述：动作/场景/物体等关键元素须出现（忽略描述里的编辑指令措辞）
  - 若多张都部分达标，选整体一致性最高的；若都不理想，选相对最佳并说明缺陷
  - 排除有白边/黑边/额外框的图
[Output] { best_image_index: int, reason: str }
```

**重试策略（ViMax 实测参数）**：
- **best-of-k：k=2 最优**（技术报告 §3.7），更高 k 反而在身份与场景状态上引入选择噪声 → **别堆采样**。
- LLM 调用普遍 `retry(stop_after_attempt(3))` + 指数退避（源码 `tenacity`）。
- 定向重试：构图对、元素错时，**保背景只换角色**（见 3.5 原文 prompt），不整帧重来。

### 4.2 FilmWorld 闭环（论文级，结构最完备，K=3）

**闭环三段：Diagnostic → Corrective → Select（Score-gated + 回滚保护，最多 K=3 轮）**

**① Diagnostic（诊断，两个 verifier）**：
- **Keyframe verifier** 判：`身份一致性 / 空间构图 / 语义对齐`
- **Video verifier** 判：`时序连续性 / 对白对齐 / 视觉缺陷`
- 输出：**结构化诊断报告**（多维质量指标 + 定位到具体的错误描述）

**② Corrective（纠错重生成）**：
- Keyframe：verifier 产出一组 **correction points（可执行的、祈使句形式的指令）**，**直接注入 prompt** 再生成。
- Video：生成一份「修好的动态描述」，含调整后的时间区间与修正的时长提示。

**③ Select（打分门控选优）**：比较评估分保留更优版本，**带回滚保护**（改坏了能退回），迭代 ≤K=3 轮。

**FilmEval 的 9 个判分维度（3 大类，Gemini 3.1 Pro 当 judge，全自动 prompt 实现）**——**Nomi 审片 rubric 可直接照抄这张表**：

| 大类 | 指标 | 判什么（子项） |
|---|---|---|
| **电影呈现 CP** | VP 视觉呈现质量 | 惩罚：模糊、解剖畸变、脸/手扭曲、几何崩塌、物体跳变、光照不一致、鬼影、物理不合理运动 |
| | NEP 叙事表达与节奏 | 人物关系清晰度、转场连贯性、主线可追溯性、节奏适当性 |
| | AVP 视听表演质量 | 对白可懂度、音量稳定、音效、环境氛围、音画同步 |
| **影片一致性 FC** | CC 角色一致性 | 身份稳定 / 角色定位对齐 / 在场合理性 / 数量与构成一致 / 原著贴合 |
| | SC 场景一致性 | 场景稳定 / 结构布局连续 / 跨镜可辨识 / 场景间可区分 / 原著场景对齐 |
| | OC 物体一致性 | 物体身份稳定 / 时序持续 / 物理合理 / 空间布局一致 |
| **原著忠实 NF** | NHR 幻觉抵抗 | 原子事实 + 情节事件两粒度，标签：源支持/合理外推/不符捏造/源冲突 |
| | LR 逻辑可靠 | 抓矛盾（非遗漏）：因果反转/事件顺序不可能/张冠李戴 |
| | SR 故事还原 | 把原著蒸成细粒度改编 checklist，标签：明确匹配/部分匹配/缺失/矛盾 |

（人评一致性：系统级 Spearman ρ=1.0；FilmWorld 人评 4.25/5.0 vs 亚军 VideoClaw 3.33/5.0。）

### 4.3 给 Nomi 的审片环落地方案（综合两家，最小可行 → 完整）

**MVP（先做这个，收益最大，抄 ViMax）**：
1. 每帧生成 **k=2** 张候选。
2. VLM judge 用 §4.1 那套 prompt 骨架，判 **角色7特征 + 空间 + 文本遵从**，返回 `{best_image_index, reason}`。
3. 若最佳仍不达标：用「保背景换角色」定向重试 prompt（§3.5 原文）局部重生成，**最多 3 轮**。

**完整版（再加，抄 FilmWorld）**：
4. judge 从「选优」升级为「Diagnostic→Corrective→Select 闭环」：不只选，还产出**祈使句纠错点注入 prompt** 重生成，带**打分门控 + 回滚保护**，K=3。
5. 审片 rubric 用 §4.2 的 9 维表（按 Nomi 场景裁剪；纯 T2V 无原著时砍掉 NF 那一列）。
6. 判分路由用 `variation_type`：large 镜重点审「转场连贯/几何崩塌」，small 镜重点审「身份稳定/表情自然」。

**重试预算原则（两家实测共识）**：**小 k（=2）+ 定向局部重试（K≤3）**，不堆采样、不整帧重来。judge 用同一个强 VLM（Gemini/GPT-Image 级），不要多 judge 投票（业界发现集体判分常比最强单 judge 更差，弱 judge 注入噪声）。

---

## 5. 来源清单

**主力拆解（源码级，逐字段读取）**
- ViMax 仓库（12k★，MIT，v1.2.0，最后更新 2026-07-20）：https://github.com/hkuds/vimax — clone `main` 分支于 2026-08-19，读取 `interfaces/{scene,character,environment,shot_description}.py`、`agents/{screenwriter,storyboard_artist,reference_image_selector,best_image_selector}.py`、`pipelines/script2video_pipeline.py`。
- ViMax 技术报告（2026-06）：https://arxiv.org/html/2606.07649v2 （best-of-k、k=2 最优、VLM judge 判分维度）

**审片闭环设计参照（论文级）**
- FilmWorld（arxiv 2607.19038，2026-07）：https://arxiv.org/html/2607.19038v1 ＋项目页 https://filmworld-ai.github.io/ — 状态离散化、闭环 Diagnostic→Corrective→Select（K=3）、FilmEval 9 指标。

**框架景观 / 历史 baseline**
- MovieAgent（showlab，353★，2024-03 停更）：https://github.com/showlab/MovieAgent ｜论文 https://arxiv.org/abs/2503.07314
- FilmAgent（arxiv 2501.12909）：https://arxiv.org/abs/2501.12909
- AniMaker（arxiv 2506.10540，2026-06）：https://arxiv.org/html/2506.10540
- The Script Is All You Need（arxiv 2601.17737，2026-01）：https://arxiv.org/abs/2601.17737 ｜项目页 https://xd-mu.github.io/ScriptIsAllYouNeed/
- StoryAgent（arxiv 2411.04925）：https://arxiv.org/pdf/2411.04925

**假设的证据/反证（消融与共识）**
- Text2Story / Scene-Action Prompt Fusion（arxiv 2503.06310）：https://arxiv.org/html/2503.06310 — 移除结构化组件降级时序/遵从/运动
- EduStory（arxiv 2605.09378）：https://arxiv.org/pdf/2605.09378 — Instruction Planner +12、显式 state 建模是一致性主驱动
- CoAgent（arxiv 2512.22536）：https://arxiv.org/pdf/2512.22536 — plan-then-generate 开环「文本对齐够、视觉一致性崩」
- VLM-as-a-Judge 综述：https://www.emergentmind.com/topics/vlm-as-a-judge ｜VQ-Insight（arxiv 2506.18564）：https://arxiv.org/html/2506.18564 — VLM judge 常给偏高分/低方差、集体判分反而更差

**未采信/降权**（噪音过滤，符合任务纪律）：营销博客（pinggy/joyspace/screenweaver 等 2026「AI video pipeline」软文）仅用于旁证「一致性是公认痛点」，不作 schema 依据。

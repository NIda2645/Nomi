# A 路调研：业界 AI 短剧/短片生成的整体流程（2026-08-19）

> 目标：给 Nomi「和 AI 对话就能生成足够好的短剧/短片初稿」提供参照——业界从**一句话想法到成片**的流程长什么样、在哪些点停下来问人、跨镜头一致性靠什么、质量怎么保。
>
> 调研范围：商业产品（LTX Studio / 快手可灵 Kling / 字节即梦 Dreamina+Seedance / Higgsfield / 海螺 MiniMax / Runway·Pika / Vidu / OpenDrama / MagicLight / Topview / PopShort）+ 开源/Agent 仓库（ViMax、DramaClaw、shuohao-skills、drama-skills、Open-AI-Micro-Drama-Generator、Seedance2-Storyboard-Generator、AI-Story-To-Movie）。
>
> **可信度纪律**：每条结论标了来源 URL + 抓取日期（均为 2026-08-19）。查不到内部实现的地方明确写「未公开，从 X 推断」。商业产品的「确认点」多为官方教程/实测文口径，不等于源码级真相。

---

## 0. TL;DR（三句话）

- **共性流程**：几乎所有家都是同一条 6 段流水线——**想法 → 剧本/剧集圣经 → 锁角色+场景参考图 → 分镜/镜头表 → 分段生成视频（从锁定参考图做 image-to-video）→ 配音+剪辑字幕成片**；用户已被教育成「先立参考、后生成」的心智。
- **最大惊喜**：真正拉开差距的不是视频模型，而是**「生成前的确认闸」**——业界一致把「**先批准并冻结角色圣经（脸/服装/声音/禁改项），再去生成几十个镜头**」当成短剧的 make-or-break；跳过这步 = 主角脸在集与集之间漂移、25% 镜头要重跑、烧掉额度。
- **最值得抄的一条**：把 Nomi 的画布做成「**锁定参考图 → image-to-video 分段生成**」的骨架 + 一个**生成前的确认闸**（把即将花额度的镜头逐条列出数量/参考/参数、用户点头才执行），这正是 DramaClaw / shuohao-skills / drama-skills 这批「Claude-Code 驱动」的同类工具在做、也是烧最少额度拿最稳一致性的公认解。

---

## 1. 流程对比表

> 步骤数 = 从「一句话想法」到「可发布成片」明确切分的阶段数。确认点 = 官方教程/实测里用户停下来输入或批准的地方。一致性方案 = 跨镜头/跨集保住角色长相的机制。质量环 = 有没有自动审片/重试，还是纯人眼。

| 对象 | 类型 | 步骤数 | 关键确认点 | 跨镜头一致性方案 | 质量环 |
|---|---|---|---|---|---|
| **通用 5 步工作流**（aiworkflows.tools 口径，被多家实测引用为「标准流程」） | 方法论 | 5：剧本/hook → 角色设计+竖屏分镜 → 竖屏视频生成 → 配音/多角色配音 → 竖屏剪辑+字幕+钩子 | ① 锁一张角色参考图（step2，生成任何视频**之前**）② 逐镜给运镜/时长 ③ 小批量试跑再全量 | **半自动**：小批量先跑、只重跑坏镜头（image-to-video 从锁定参考图重滚）；无自动审片 |
| **OpenDrama (DEV4)** | 产品（短剧专用平台） | 6：想法 → 剧本(Script 向导) → 角色/场景资产(Canvas Pro) → 分镜(Episodes 分段编辑) → 视频生成(路由 Seedance/即梦) → 发布(封面/付费墙/排期) | 用户激进改 AI 初稿剧本、Canvas Pro 精修资产、逐段给参考图+运镜+镜长 | **半自动**：DEV4 Step4 含失败段「recovery」；实测 ~25% 重滚率（手/表情/运镜不匹配），发布前人眼抓连续性(下巴漂/服装不一致) |
| **快手可灵 Kling 3.0 / AI Director** | 产品（视频模型+多镜头） | 单次「多镜头」把最多 6 个机位打进一次生成；配 Element Library 绑角色/道具 | Multi-Shot 里逐镜写机位/时长/运镜；可传首帧+尾帧参考图定叙事走向 | 「Elements 3.0」+ 单次生成内多镜头保脸/服装/比例；跨生成靠 Element Library 绑定 | **无自动审片**（单次生成内保连续性；跨段仍靠人眼+重跑） |
| **字节即梦 Dreamina + Seedance 2.0** | 产品（短剧专用引擎，2026-02-10 发布，Video Arena Elo 1269 登顶） | 分镜/镜头表 → 逐段写提示词 → 平台分段生成 → 剪辑拼接 | Face-lock + 多镜头一致性；多模态混合输入（文/图/视频/音）；「首帧锚定」下一段续接 | **无官方自动审片**（模型层解决「长叙事崩坏」，QA 仍人眼） |
| **Higgsfield（Popcorn + Soul ID）** | 产品（分镜生成器+身份系统） | 上传≤4 张参考(角色肖像/场景/道具)→ 写场景弧提示 → 选≤8 帧 → 一次性生成整段分镜 → 导出到 Sora2/Kling 动起来 | Popcorn 一次生成整序列（非逐帧）自动保同一张脸；**Soul ID**=用 20+ 张照片训练的可移植身份，跨会话跨模型自动套用 | **无自动审片**（一次成序列减少漂移；跨段靠 Soul ID） |
| **海螺 MiniMax（Hailuo / Media Agent）** | 产品（Agent 化，去节点） | Media Agent「一键成片」自动编排多模态模型；专业用户可分段自传图/视频/音 | 「主体参考」(subject reference) 从静图保角色特征；运镜控制(推拉摇移) | **无自动审片**（Agent 自动选模型，非质检；人眼兜底） |
| **Runway（Story Engine）+ Pika（Multi-Scene Storyboarding）** | 产品（视频模型+叙事层） | 主剧本 → Story Engine 分镜/生成序列；实测建议「按镜头类型选模型」而非按品牌 | Runway 参考图控制角色镜；Pika 多场景分镜串长叙事 | **无自动审片**（editorial review 人工兜底） |
| **Vidu Q3（Reference-to-Video）** | 产品（多主体参考） | 传 1–7 张角色/道具参考 → 写场景+运镜提示 → 逐段生成（≤16s，含原生音+口型） | **多主体一致性**：一次锁最多 7 个主体；传角色 subject 图锁三视图，跨镜不畸变（SXSW 2026 演示动画剧集全流程） | **无自动审片**（模型层直攻「character collapse」；人眼兜底） |
| **ViMax（HKUDS）** | 开源 Agent 框架 · **12k★** · v1.2.0（2026-07-20） | 7 阶段：叙事规划→剧本→角色/参考→分镜→镜头设计→图像生成→视频拼装(带音)；TUI/WebUI 可讨论/改/续跑 | 参考图协调(角色/物/环境)+**首帧锚定**+并行生成兼容镜 | **有**：Consistency validation——生成图**先对角色规格校验再往下走**；render checkpoints 可暂停/续跑 |
| **DramaClaw** | 开源/源可见「通用 AIGC 视频引擎」 · **3.8k★** | 7 阶段：小说解析/故事图→资产库&身份→剧集规划→剧本→分镜&首帧→情感配音→合成导出 | **资产库阶段**统一管角色/场景/道具/声音「跨集稳定身份+每集变体」；Director World/3GS 锁空间结构+走位+机位 | **有**：剧本生成含 **review/repair loops**（触发/是否自动化未公开）；主张「**大阶段之间保留人工审查点**」；Freezone 画布把满意候选「promote 回主线」= 人工批准闸 |
| **shuohao-skills** | 开源 Claude Code/Codex skill 集 · **1.7k★** | 5 skill：novel-outline→characters(角色圣经)→art(美术圣经)→script→storyboard(≤15s/段，切 2–5s) | 「改编大纲收敛结构，剧本/场景/角色三者同步迭代」；角色+美术数据前向传递；分镜只执行不新增决策 | **有（且是脚本化硬门）**：novel-outline 14 道质量门、script 10 道、storyboard 17 道，**脚本校验而非人工目测** |
| **drama-skills（worldwonderer）** | 开源 Claude Code/Codex skill 集 · **818★**（176 commits） | 10 skill：小说分析→故事开发→写剧本→资产决策→图片提示词→分镜→视频提示词→**生产**→**独立审查**→Hub 路由 | 资产决策冻结「人物/造型」；图片提示词做「角色参考板」可复用事实锚；三条单帧路径(lookdev/资产/分镜)分离 | **有 + 强确认闸**：`short-drama-review` 做结构/内容审查+项目级校准诊断；**生产阶段必须用户显式确认**——提示词先落文件、给出「准确数量/内容/参考/参数/输出」预览、点头才执行；任何输入变更作废上次确认、失败任务不重确认不重试 |
| **Open-AI-Micro-Drama-Generator（Anil-matcha）** | 开源多 Agent · **460★**（2026-08-06 更新，22 commits） | 7 阶段全自动**无中途确认**：编剧→角色抽取→分镜→FLUX 角色肖像(并行)→FLUX-Kontext 首帧(I2I)→Kling v2.1 视频(并行)→moviepy 拼接 | 早期抽详细角色描述→一次生成肖像→后续每镜首帧用肖像做 I2I 条件 | **无**：全自动、无确认闸、无重试（要么一次成要么手动重跑） |
| **Seedance2-Storyboard-Generator（liangdabiao）** | 开源 skill · **2.1k★**（12 commits） | 概念→剧本(四幕:起承转合)→资产描述(C角色/S场景/P道具编号参考)→图像生成(GPT-Image-2/Seedream)→镜头表(Seedance 时间轴格式)→视频(用视频延展续接) | 每角色多角度参考图 + 镜头脚本显式指派用哪张图 + 统一风格前缀 + 配色/标记区分 | 无正式审查步；含「问题内容迭代测试」+ 各阶段创作者判断 |
| **AI-Story-To-Movie（SDSmirnov）** | 开源 Python 流水线 · 2★（小项目，收作对照） | 5 脚本：Style Master(定风格)→Cinematic Preroll(拆场景/选角/关键帧)→Image Animator(Veo 首尾帧成 4–8s 片)→Sound Producer(对白/音效+EDL)→Audio Assembler(混音) | 「Auto-Casting」：给角色生成「证件照」存参考文件夹，喂给图像模型保脸 | **有**：「Self-Correction Protocol」——模型输出前**多轮自我批评**；用户可任意阶段手改/重生 |

---

## 2. 共性模式（= 用户已被教育的心智，Nomi 顺着走别对抗）

几乎每一家都有下面这几步，说明用户来 Nomi 之前**已经被别的产品教会了这套流程**。逆着来（比如「一句话直接出成片、中间不给看」）会让老用户不安：

1. **想法 → 剧本/剧集圣经（Series Bible）先行**：先出一份含 3–5 个复用角色（带外貌描述）+ 世界观 + 分集节拍（hook→升级→悬念）的「圣经」。这是所有后续步骤的单一真相源。〔aiworkflows.tools、OpenDrama、shuohao-skills 均如此〕
2. **生成任何视频之前，先锁「角色/场景参考图」**：每个角色出一张 front-lit、中性背景的**权威肖像**（"passport photo"），冻结。这是全行业的 make-or-break 步。〔aiworkflows.tools step2、bigprompthub「approve the character bible early: lock face/wardrobe/voice/relationships/forbidden changes」〕
3. **分镜/镜头表：逐镜给「参考图 + 运镜 + 镜长」**：把剧本切成 shot-by-shot，每镜三件套（用哪张参考、什么机位运动、几秒）。〔OpenDrama Step4、Kling Multi-Shot、shuohao-storyboard〕
4. **image-to-video 而非 text-to-video 来生成**：每个镜头从锁定的参考图起步（I2V），这是保一致性公认优于纯文生视频的做法，横跨 60+ 集不漂。〔aiworkflows.tools、OpenDrama「image-to-video approach maintains consistency better across 60+ episodes」、Kling、Vidu〕
5. **分段生成 + 拼接**：单次生成普遍 5–15s（Kling/即梦/海螺/Vidu 都在此区间），长片靠**分段生成再拼**；很多工具用「首帧/尾帧锚定」让下一段接上一段。〔Kling 3.0 15s/4K、Seedance 15s、Vidu 16s、Seedance2-Storyboard 用「视频延展」续接〕
6. **配音/配乐/字幕在最后一层**：per-character 一个声音、跨集不变；竖屏剪辑 + 烧字幕 + 开头 3s 钩子 + 结尾悬念卡。新一代模型（Seedance 2.0 / Kling 3.0 / Vidu）开始**原生音画同步**（口型/环境音一次生成），压掉这一层的部分工作。〔aiworkflows step4-5、Seedance「无需后期配音」〕
7. **「小批量先试、只重跑坏镜头」的省额度纪律**：先跑几个镜头看对不对，再全量；坏的从锁定参考图 I2V 重滚，不重写文生。〔aiworkflows step3、OpenDrama ~25% 重滚率〕

> 一句话总结共性心智：**「先立设定（圣经+参考图），逐镜配方，image-to-video 分段生成，最后配音剪辑」**——这套是用户的默认预期，Nomi 的画布/对话应能被自然映射到它。

---

## 3. 分化点（= 设计空间，各家在这里做不同取舍）

| 维度 | 光谱两端 | 谁在哪端 | 对 Nomi 的含义 |
|---|---|---|---|
| **一致性怎么锁** | 轻：单张参考图 I2V（快、装配少、极端角度会飘） ←→ 重：训练身份/微调权重（Soul ID 20+ 图 / Flux.2 微调 15-30 图，最稳、可跨工具移植但要训练） | 轻端：Runway/Midjourney/Kling/Vidu/大多数产品；重端：Higgsfield Soul ID、Flux.2 微调、ComfyUI IC-LoRA | Nomi「档案声明槽、通用系统填」(P4) 正好对应这条：可先做轻端（参考图 I2V），把重端（训练身份）留作「角色档案」的进阶槽 |
| **多镜头怎么出** | 单次生成打包多镜头（Kling 6 机位/次、Higgsfield 8 帧/次、即梦多镜头叙事） ←→ 逐镜独立生成再拼（大多数流水线/OSS） | 单次打包：Kling AI Director、Higgsfield Popcorn、Seedance；逐镜拼接：OpenDrama、ViMax、DramaClaw、Micro-Drama-Generator | 单次打包一致性天然更好但可控性差；逐镜可控但要额外保一致。Nomi 节点系统偏逐镜——需补「首帧锚定」这类续接机制 |
| **人机分工** | 全自动无确认闸（一句话进、成片出） ←→ 每个大阶段人工批准 | 全自动：Micro-Drama-Generator、海螺 Media Agent「一键成片」；强确认：drama-skills（生产前必确认）、DramaClaw（大阶段间保留人工审查点）、shuohao（脚本化质量门） | **这是 Nomi 最该抄的分化点**：Nomi 是对话驱动+烧真额度，属于「强确认」阵营更安全（见 §4-1） |
| **质量怎么保** | 纯人眼（绝大多数商业产品） ←→ 自动审查/自我批评/校验门（部分 OSS-Agent） | 纯人眼：Kling/即梦/海螺/Runway/Vidu/OpenDrama；自动化：ViMax(consistency validation)、shuohao(14/10/17 脚本门)、DramaClaw(review/repair loop)、AI-Story-To-Movie(self-correction)、drama-skills(独立审查 skill) | 商业产品普遍**没有**自动审片——这是 Nomi 可差异化的空档：加一层「生成前/生成后自动体检」 |
| **入口形态** | 时间轴/剪辑器心智（LTX Studio、CapCut 化） ←→ 节点画布（ComfyUI、Nomi、DramaClaw Freezone） ←→ 纯对话 Agent（海螺 Media Agent、Nomi 经 Claude Code） | 三形态并存 | Nomi 独特位：**对话（Claude Code MCP）驱动节点画布**——drama-skills/shuohao 是最接近的同构参照，值得逐条对标 |
| **源材料入口** | 一句话/premise 起 ←→ 整本小说改编起 | premise：多数产品；小说改编：DramaClaw、shuohao(novel-outline)、Seedance2-Storyboard、ViMax | Nomi 目标是「一句话想法」，但「长文改编」是短剧工业主流入口，值得作为第二档入口预留 |

---

## 4. 值得 Nomi 抄的 7 条（每条：是什么 / 为什么值得 / 大概怎么落）

### 4-1. 「生成前的确认闸」——把要花的额度逐条摊开、用户点头才跑
- **是什么**：在真正调用视频模型（花额度）之前，系统把「即将执行的镜头任务」逐条列出——**准确数量、每条用哪张参考图、什么参数、预计产出**，用户预览确认后才执行；任何输入变更作废上次确认。〔drama-skills：`short-drama-produce`「提示词先落文件，用户看到预览并明确确认后才执行」〕
- **为什么值得**：① 短剧一次要跑几十个镜头，**烧的是真额度**（OpenDrama 实测 ~25% 要重滚）；② Nomi 是对话驱动、用户看不见「我这一句话会花多少」，确认闸把不可见的花费变可见（正对 D1「effect-first 但别让用户被动烧钱」+ 你们 CLAUDE.md 里「付费确认按谁能问到真人路由」的既有工程投入）；③ 这是「Claude-Code 驱动短剧」这一同类赛道（drama-skills/DramaClaw）的公认标配，不做反而是缺失。
- **大概怎么落**：Nomi 画布「运行前」弹一个**批次预览**：N 个镜头 × 每镜(参考图缩略图 + 运镜 + 时长 + 预计额度) → 一个「全部生成/只生成勾选」的闸。失败的镜头单独重滚、不连累已确认的。可复用你们现有的付费确认路由。

### 4-2. 「角色圣经 + 锁定参考图」作为项目级一等公民
- **是什么**：项目一开就产一份**角色圣经**（每角色：外貌描述 + 一张权威肖像 + 服装 + 声音 + 关系 + 禁改项），冻结后所有镜头都引用它。〔bigprompthub「approve character bible early: lock face/wardrobe/voice/forbidden changes」；shuohao `novel-characters` 角色圣经；aiworkflows step2 锁参考图〕
- **为什么值得**：这是**全行业 make-or-break 的第一步**——跳过就是主角脸漂移、几十个镜头返工。用户从别家过来**默认会找这个东西**（心智已被教育，§2-2）。也正好落 Nomi「档案声明槽、通用系统负责填」(P4)。
- **大概怎么落**：Nomi 项目里做一个**「角色档案」面板/节点**：字段=外貌/服装/声音/关系/禁改；核心是那张**锁定肖像图**（front-lit、中性背景）。生成镜头时，节点默认从对应角色的锁定肖像做 image-to-video。档案是「声明」，通用生成系统负责在每个镜头「填」进去。

### 4-3. image-to-video 作为默认生成路径（而非 text-to-video）
- **是什么**：每个镜头从锁定参考图起步做 I2V，而不是每次纯文生视频。〔aiworkflows、OpenDrama「I2V maintains consistency better across 60+ episodes」；Micro-Drama-Generator 用 FLUX-Kontext I2I 出首帧再 I2V〕
- **为什么值得**：跨镜头/跨集一致性的**头号杠杆**，公认比文生视频稳一个数量级；也让 4-2 的角色档案真正发挥作用。
- **大概怎么落**：Nomi 生成节点默认「参考图 → 首帧 → I2V」两跳（先由角色/场景参考图合成该镜首帧，再 I2V 动起来），文生视频降级为「没有参考图时」的兜底。

### 4-4. 逐镜「首帧/尾帧锚定」的续接机制（解决分段拼接的接缝）
- **是什么**：长片靠分段生成（每段 5-15s），用**上一段末帧作下一段首帧**（或指定尾帧）让镜头无缝续接。〔Kling 3.0 首帧+尾帧参考；Seedance2-Storyboard「用视频延展续接、每段写 final frame description for next-episode continuity」；ViMax first-frame anchoring〕
- **为什么值得**：Nomi 是**逐镜节点**架构（非单次打包多镜头），分段拼接是必经之路；没有锚定机制，段与段之间会跳。
- **大概怎么落**：节点间连线时，允许「把上游节点的末帧喂给下游节点作首帧」；镜头脚本里带一个「结尾画面描述」字段供续接。

### 4-5. 「结构化分镜脚本」作为对话与画布之间的中间产物
- **是什么**：把剧本机器可读地切成镜头表——每镜带「资产引用(用哪张图) + 时间轴(0-3s/3-6s…) + 运镜 + 音/乐 + 结尾帧」。〔Seedance2-Storyboard 的 C/S/P 编号 + 时间轴格式；shuohao storyboard「H3 prompt alignment、production-ready exports」；drama-skills 视频提示词含「跨镜时间轴配乐规格」〕
- **为什么值得**：Nomi 是「对话 → 画布」，中间**需要一个结构化 IR** 把 LLM 的剧本落成可执行的节点图。这个「镜头表 schema」就是那层 IR，能让「导演/编剧技能库」的方法论稳定落到画布。
- **大概怎么落**：定义一份镜头表 JSON schema（镜号 / 引用资产 id / 时长 / 机位运动 / 对白 / 结尾帧描述），LLM 产出它 → Nomi 据此**自动组装节点画布**。这也是你们 MCP `nomi_start_playbook`/画布组装能吃的输入格式。

### 4-6. 一层「自动体检」——商业产品几乎都没有的空档
- **是什么**：生成前/后跑一遍自动检查：生成的角色图**对不对得上角色规格**（一致性校验），或结构/内容审查后给「修/重滚」结论。〔ViMax「validates generated images against character specs before proceeding」；shuohao 脚本化 14/10/17 质量门；DramaClaw review/repair loop；AI-Story-To-Movie self-correction；drama-skills 独立审查 skill〕
- **为什么值得**：**绝大多数商业产品只有人眼**（Kling/即梦/海螺/Runway/Vidu/OpenDrama 全靠人工兜底）——这是 Nomi 可做出差异、且与你们 CLAUDE.md 里「真机走查/评测体系」一脉相承的地方。哪怕先做「角色一致性打分 + 明显崩坏检测」也能省用户的人眼工。注意：这一层要**照 D4 诚实交付**——检出的缺口明着标（如「⚠️ 这镜脸相似度偏低，建议重滚」），不藏。
- **大概怎么落**：生成后对每镜关键帧跑一个轻量 VLM 校验（脸/服装是否匹配角色档案、有没有多手指/畸变），低于阈值的镜头**在确认闸里标红**建议重滚。评测/VLM 额度按你们「默认授权」跑。

### 4-7. 保留「大阶段之间的人工审查点」而非一句话闷头到底
- **是什么**：在剧本 → 资产 → 分镜 → 生成这些**大阶段之间**留人工确认/微调点，而不是全自动黑箱出片。〔DramaClaw「Keep human review points between major AI-generated stages」；drama-skills 每阶段确认；对照组 Micro-Drama-Generator 全自动无闸=可控性差〕
- **为什么值得**：Nomi 要的是「**足够好的初稿**」，初稿意味着用户要能在关键节点介入调方向；全自动一把梭在短剧里可控性最差。与你们 P3/R16「真实任务跑通闭环」的完成标准一致——闭环里本就该有人的确认。
- **大概怎么落**：对话流里做 3 个天然停顿点：① 剧本+角色圣经出来 → 「就这么定吗」；② 分镜表出来 → 「镜头这么切吗」；③ 生成前批次预览（=4-1 的闸）。每个停顿都能一句话让 Nomi 改，改完继续。⚠️ 别做成一堆表单让用户填（违反 D1）——停顿点默认给「AI 已填好的一版 + 一句话就能改」，effect-first。

> 落地优先级建议（按「杠杆 × 与 Nomi 现状契合」）：**4-2 角色档案 + 4-3 I2V 默认路径**（一致性地基，不做别的都白搭）→ **4-1 生成前确认闸**（复用你们付费确认，性价比最高）→ **4-5 镜头表 IR**（把对话接到画布）→ **4-4 首帧锚定**（解决拼接接缝）→ **4-7 人工审查点** → **4-6 自动体检**（差异化，可后置）。

---

## 5. 来源清单（均于 2026-08-19 抓取）

**综述/方法论**
- 通用 5 步短剧工作流：https://aiworkflows.tools/workflows/short-drama
- 8 款短剧工具排名+一致性机制：https://aiworkflows.tools/blog/best-ai-tools-for-short-drama-2026
- 「真正突破是生产工作流」（五层流水线，ReelShort 只把 AI 用于 VFX、China Literature 把 11 步压到 3 步）：https://mcplato.com/en/blog/ai-short-drama-generation-tools-2026-production-workflow/
- 生成前锁资产/批准角色圣经：https://www.bigprompthub.com/ai-short-drama-prompt-workflow-2026/

**商业产品**
- LTX Studio 工作流（脚本→分镜自动化、非破坏性编辑）：https://ltx.io/blog/ai-video-workflow ；功能：https://ltx.io/blog/top-ltx-studio-features
- Kling 3.0 多镜头/AI Director：https://kling.ai/blog/kling-video-3-director-mode-multi-shot-tutorial ；Elements 3.0 一致性：https://kling.ai/blog/best-ai-video-generator-2026-kling-ai
- 即梦 Dreamina + Seedance 2.0（Face-lock、多镜头、2026-02-10 发布、Elo 1269）：https://developer.aliyun.com/article/1724018
- Higgsfield Popcorn（一次成序列）：https://higgsfield.ai/blog/The-AI-Storyboard-Generator-That-Feels-Like-Directing ；Soul ID / 一致性方法总览：https://higgsfield.ai/blog/tools-for-consistent-ai-characters
- 海螺 MiniMax Media Agent / 主体参考：https://www.minimaxi.com/news/minimax-hailuo-23
- Runway Story Engine + Pika 多场景分镜：https://pixflow.net/blog/best-ai-video-generator/
- Vidu Q3 Reference-to-Video（多主体一致性、SXSW 2026 动画剧集）：https://www.vidu.com/blog/ai-character-generator-for-video ；https://wavespeed.ai/blog/posts/introducing-vidu-q3-reference-to-video-on-wavespeedai/
- OpenDrama DEV4 分步指南（6 步、~25% 重滚率）：https://opendrama.ai/guides/how-to-make-ai-short-drama
- ReelShort 规模/AI 只用于 VFX：https://vitrina.ai/blog/ai-generated-short-drama-production-companies/

**开源 / Agent 仓库**
- ViMax（HKUDS，12k★，v1.2.0 2026-07-20，consistency validation）：https://github.com/hkuds/vimax
- DramaClaw（3.8k★，review/repair loop、大阶段间人工审查点、资产库身份一致）：https://github.com/dramaclaw/dramaclaw
- shuohao-skills（eternityspring，1.7k★，Claude Code/Codex，14/10/17 脚本化质量门）：https://github.com/eternityspring/shuohao-skills
- drama-skills（worldwonderer，818★，Claude Code/Codex，生产前强制确认闸 + 独立审查 skill）：https://github.com/worldwonderer/drama-skills
- Open-AI-Micro-Drama-Generator（Anil-matcha，460★，2026-08-06，全自动无确认闸，FLUX+Kling）：https://github.com/Anil-matcha/Open-AI-Micro-Drama-Generator
- Seedance2-Storyboard-Generator（liangdabiao，2.1k★，C/S/P 编号 + 时间轴格式 + 视频延展续接）：https://github.com/liangdabiao/Seedance2-Storyboard-Generator
- AI-Story-To-Movie（SDSmirnov，小项目对照，Auto-Casting「证件照」+ Self-Correction Protocol）：https://github.com/SDSmirnov/AI-Story-To-Movie/

---

## 附：可信度与缺口说明（诚实交付）

- **商业产品的「步骤数/确认点」多为官方教程 + 第三方实测口径**，不等于源码级真相。产品内部是否还有未公开的自动质检，无法证实——表中「无自动审片」应读作「公开材料里未见」，而非「一定没有」。
- **star 数是抓取当日 GitHub 显示值**；多个仓库页面**未暴露「最近 commit 精确日期」**（只给 commit 数），已在表中如实标注「未显式提供」。ViMax（2026-07-20 v1.2.0）、Micro-Drama-Generator（2026-08-06）有明确日期；其余以「近月仍活跃 + commit 数」佐证活跃度。
- **一致性方法的可靠度排序**（微调 > 训练身份 > 参考图锁定）来自 Higgsfield 一篇 2026 文章的口径，属厂商视角，仅供方向参考，非独立评测。
- ReelShort 一条需要注意：它**明确不在编剧室用 AI**、只用于 VFX/后期——说明短剧工业里「AI 生成整片」和「AI 辅助真人拍摄」是两条路；Nomi 走的是前者（AI 生成初稿），本报告聚焦前者。

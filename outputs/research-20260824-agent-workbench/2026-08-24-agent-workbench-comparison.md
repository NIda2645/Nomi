# Agent 视频工作台竞品提取与 Nomi 对账

日期：2026-08-24  
范围：用户提供的 4 份 DOCX、11 个网页/飞书链接，并补充检查了当前可访问的产品首页、画布和 TapNow Brainstorm 页面。  
原则：把“页面上实际看见的事实”“Nomi 当前代码事实”“建议/推断”分开；没有登录、权限或接口授权的内容不做猜测，也不把营销页的能力描述当成已验证的运行能力。

## 1. 已完成的提取物

### 1.1 本地 DOCX

四份文档已用 `python-docx` 读取正文、段落样式、表格、页眉页脚、DOCX 关系和 `word/media` / `word/embeddings` 媒体索引；没有只读摘要。对应文件：

| 文档 | 大小 | 段落 | 表格 | 内嵌媒体 | 落盘文件 |
|---|---:|---:|---:|---:|---|
| MiniMax Design - 手册与指南.docx | 49.7 MiB | 128 | 54 | 59 | `docx/MiniMax_Design_-.md`、`.json` |
| LibTV使用指南.docx | 215.0 MiB | 536 | 81 | 204 | `docx/LibTV.md`、`.json` |
| 🔧LibTV skill 使用指南.docx | 12.6 MiB | 66 | 6 | 9 | `docx/LibTV_skill.md`、`.json` |
| LibTV CLI 使用指南.docx | 418 KiB | 130 | 14 | 4 | `docx/LibTV_CLI.md`、`.json` |

`docx/manifest.json` 是机器可读总清单；`docx/*.json` 保留每一段的原始索引和每个媒体文件的 SHA-256。四份文档中的 276 个内嵌图片/视频/附件也已解包到 `docx-media/`，并在 JSON 中写回 `extracted_path`。四份文档也已通过 LibreOffice 渲染成真实页图，放在 `docx-render/`；其中中文字体在渲染器缺失时会出现方框，但正文提取不受影响。

### 1.2 网页/飞书/画布

通过已登录浏览器的 CDP 页面 DOM 提取可见文本，并保存截图、目标页 ID、URL、字符数和截图路径。页面是动态应用时，结果以当前会话真实可见 DOM 为准，不读取隐藏接口、不绕过权限。

已落盘页面：

- MiniMax Design 官网、MiniMax Design 飞书手册
- 小云雀首页、小云雀 Web 手册、小云雀创作 Agent-画布手册、小云雀运镜库手册
- LibTV 首页、LibTV 画布、LibTV 使用指南/Skill/CLI 飞书文档、LibTV CLI 官网
- TapNow Brainstorm 文档、TapNow 当前画布

原文在 `web/*.txt`，截图在 `screenshots/*.png`，总索引在 `source-manifest.json`。代表性截图已人工检查：MiniMax 首页、 小云雀首页、LibTV 画布、TapNow Brainstorm、小云雀画布手册均为当前真实页面截图。

## 2. 一句话结论

不要把 Nomi 的三个页面简单揉成一个“所有东西都堆在一起”的页面；应保留一个项目壳，把三种工作状态统一到同一个项目事实源：

```text
左：项目上下文/资产/引用     中：当前主工作面       右：Agent 对话、计划、提案、运行状态
                                      ↓
                              底：预览 + 可编辑时间轴
```

“创作/生成/预览”不再是互相跳走的产品边界，而是同一项目的三个可切换焦点：`想法与脚本`、`编排与生成`、`成片与深编`。切换焦点时，项目、资产、引用、运行状态和时间轴不丢失；对话也不丢失。这样同时解决“Agent 能不能先出稿”“能不能中断”“能不能继续深度编辑”“能不能播放/导出”四个真实摩擦。

## 3. 逐功能对账矩阵

状态含义：`已有` = 当前代码/页面有可核对证据；`部分` = 有入口或局部实现，但链路未统一；`计划` = 只在 Nomi 方案文档中定义；`缺口` = 当前没有可核对实现。

| 能力 | 参考产品的事实 | Nomi 当前事实 | 差距与应学习的机制 | 优先级 |
|---|---|---|---|---|
| 统一入口 | MiniMax 把 Agent、Canvas Flow、Skill、Local Index、Output Sync 设计成连续链路；小云雀首页把短剧 Agent、营销 Agent、自由画布、资产、历史放在同一产品壳 | `WorkbenchShell` 仍按 creation/generation/preview 三个 workspace 挂载；只有 generation 显示资源树（`src/workbench/WorkbenchShell.tsx:226-264`） | 保留三焦点但共享项目壳、上下文栏、运行中心；不要让用户为了“继续编辑”重新找项目 | P0 |
| 对话 + 主工作面 | 小云雀画布是左画布、右 Agent；TapNow Brainstorm 是对话推进、确认内容写入画布；MiniMax 右侧 Agent、中央画布/预览、左侧 Skill/资产 | creation 有编辑器+常驻 `CreationAiPanel`，generation 有可停靠/浮层 AI sidebar；preview 无 Agent（`CreationWorkspace.tsx:50-105`、`GenerationWorkspace.tsx:143-175`） | Agent 需要在 preview/深编状态继续工作，并知道选中的镜头、时间码和当前版本；右栏应显示“我将修改哪一段” | P0 |
| 计划先行/确认门 | TapNow Brainstorm 明确要求先发展剧本、角色、世界观，再把确认节点交给后续生成；Gamma 也先生成 outline，再确认后生成 | Nomi 已有 `storyboardPlan`、draft/committed 和 Source/Storyboard tab；创作阶段可停止对话 | 把 plan 变成统一的 `EditProposal`：显示镜头数、时长、素材引用、预计成本、会改哪些轨道；“生成”只接受已确认计划 | P0 |
| 画布节点与连线 | MiniMax/小云雀/LibTV 都把文本、脚本、分镜、图片、视频、音频和结果留在可追溯节点/连线中；LibTV CLI 强调“不是孤立视频链接” | Nomi generation canvas 已有节点、边、布局、节点 prompt；`PromptEditor` 支持在文本中插入 `@` 素材并建立引用 | Nomi 需要把 canvas 和时间轴统一到 `EditorDocument`，不再让两套 store 各自代表“项目是什么”；计划文档已定义该方向 | P0 |
| 引用与上下文 | 小云雀支持 `@` 全画布/资产库；LibTV CLI 支持参考图、来源引用、节点依赖；Nomi 提示词编辑器已支持当前参考/画布/素材库三组候选 | `PromptEditor` 使用 `@[asset:url]` 持久化，候选选择可建边/落上传槽（`src/workbench/assets/PromptEditor.tsx:12-41`） | 增加引用用途（角色/场景/风格/首帧/尾帧/音频）和来源/版本；把 `@` 变成“可解释引用”，而不是只有编号 | P0 |
| 脚本→资产→分镜 | LibTV V2 先从脚本提取风格、角色、场景、道具，再生成可编辑镜头，检查后批量出图/视频；MiniMax 案例也先脚本、分镜、锚定图，再分段生成 | Nomi 有脚本文稿与 storyboard editor；有资产池，但尚未形成脚本实体→资产实体→镜头组→生成批次的统一数据链 | 建立 `Brief → Script → ShotPlan → AnchorAssets → GenerationJobs`，每一步都可回看/修改/局部重跑；这是比“让 Agent 直接出片”更稳的主流程 | P0 |
| 批量生成与局部重跑 | LibTV 有批量组、片段重拍、智能续写；MiniMax 案例按分镜分段生成，坏一段只改一段；小云雀支持多任务并行 | Nomi 有生成任务/对话流的局部能力，方案文档要求支持单镜头 reroll，但完整 GenerationJob→时间轴链路仍是计划 | 以镜头为最小成本单元：成功/失败/取消可混合存在；支持“只重拍 S03”“复制 S03 的 prompt 换模型” | P0 |
| 播放/预览 | LibTV 画布有播放器与任务进度；LTX 把 storyboard、timeline、sound、export 连起来；小云雀有成片展示和片段重拍 | Nomi preview 具备播放器、播放头、帧级推进和通栏时间轴（`PreviewWorkspace.tsx:84-99`）；generation 还有跟随播放头的 mini preview | 预览不要是终点页；同一个播放器应嵌在生成面和深编面，选中片段可直接回到 Agent/Inspector | P0 |
| 深度编辑 | LibTV 支持高清、解析、trim、合成、音视频分离、智能剪辑、逐帧拉片、续写、重拍；MiniMax 有剪辑 Agent，可改片段、字幕、转场、画面效果并导出继续编辑 | Nomi 有基本时间轴编辑、文本轨、拖拽、预览；当前未看到完整自然语言剪辑提案、转场/字幕/音频 mix 的统一执行合同 | 先做 5 个高频命令：`剪掉这段`、`替换 S03`、`字幕改成…`、`加 BGM 并压低人声`、`把结尾延长 2 秒`；全部先提案后应用，可撤销 | P0 |
| 导演/运镜 | LibTV Director Stage 提供 3D 场景、角色/摄像机路径、跟随镜头、Blender 插件；小云雀有运镜库，支持替换/删除/组合，手册列出 33 种预设 | Nomi storyboard 有镜头参数控件，但当前没有 3D 导演台或路径编辑证据 | 不要第一阶段复制 3D 编辑器；先把“运镜 preset + 镜头参数 + 首尾帧 + 角色约束”做成可编辑 shot contract，后续再接 Director adapter | P1 |
| 音频/配音 | LibTV 有音频截取/变速/自定义切分、人声/背景音分离、音色克隆；MiniMax/小云雀强调音色、音乐和成片包装 | Nomi 支持音频资产和音轨基础类型，尚未形成对白/音乐/音效/ducking/音色的统一工作流 | 音频先走资产/轨道统一身份；Agent 生成结构化 mix proposal（音量、淡入淡出、ducking、对齐），不要把音频作为生成后孤立文件 | P1 |
| 任务进度与中断 | LibTV Skill/CLI 要求可查 session、失败节点、重试；小云雀允许并行生成；TapNow 对高成本操作保留确认；Nomi 已有流式 Stop | `workbenchAgentRunner` 暴露 session cancel（`src/workbench/ai/workbenchAgentRunner.ts:67-97`），creation 也有 cancelled 状态；但跨多个生成任务的 run/attempt/reconcile 还在计划 | “停止”要区分：停止对话、取消尚未提交、停止轮询、保留已完成资产；显示阶段、费用、下一动作；杀进程后可恢复或进入 reconcile | P0 |
| 失败恢复 | LibTV 文档明确诊断参数/引用/模型/审核/网络，再局部重试；旧 Skill 声称失败不扣算力但需以当前计费为准 | Nomi 有错误分类和局部测试，但用户面尚未统一展示失败原因、影响范围、可重试动作 | 每个失败卡片给出“原因→影响→修复→重试范围”；不要只给红色 toast；禁止未知计费规则被 UI 写死 | P0 |
| 资产中心/本地优先 | MiniMax 将画布资产本地化、资产中心保存角色/场景/风格/道具/过程；小云雀资产库与画布、对话同步；Nomi 有项目资产库和本地协议 | Nomi 有 `AssetRef`、项目资产扫描、拖入时间轴和 `nomi-local://` 播放 | 增加 `role/provenance/lifecycle/license` 元数据；素材来自免费站点时在资产卡显示授权状态和来源链接 | P1 |
| 免费商用素材 | Pexels、Pixabay、Unsplash 等可作为候选来源，但各站点仍有 attribution、API 展示、品牌/肖像/编辑用途限制；Coverr/Mixkit/Videvo/Bensound 需按单项 license；FreePD 原站已关闭 | Nomi 当前没有素材搜索、授权快照或商用风险标签 | 不要做“免费=无条件商用”；做 source adapter + license snapshot：`green/amber/red`、抓取时间、原始许可 URL、是否需署名、是否含人物/商标 | P1 |
| Skill/插件/工作流 | MiniMax Skill 广场、自定义 Skill、社区审核、ComfyUI/插件；LibTV Skill/CLI 把 Agent 接到画布工具；TapNow Apps 把 Agent 理解和执行能力分开 | Nomi 有 Skill API、Agent runner、MCP 方向，但还没有“Skill 生成/版本/审核/回放”产品面 | 引入通用 `Capability/Skill` 描述，允许 Agent 选择工具，但不让供应商身份渗入编辑器；Skill 运行产出 Proposal/Artifact，不直接改 timeline | P1 |
| CLI/MCP/外部 Agent | LibTV CLI 支持浏览器登录，不要求 Access Key，提供项目/画布/节点/模型/素材/状态查询；明确把项目状态当事实源 | Nomi 方案已有 MCP/外部 Agent 通过 EditorCommand 写入的设计；现有代码仍以 workbench stores 为主 | 对外只暴露稳定 command/query schema；浏览器登录、密钥、额度、provider 都放 adapter；外部 Agent 永远不能绕过 proposal/预算/撤销 | P1 |
| 可观察性/复盘 | LibTV 画布保留中间节点；TapNow 画布保留确认上下文；MiniMax 强调审核节点；这些页面本身也适合做 DOM/截图/网络事件记录 | Nomi 有 observability 分类、事件和测试，但没有一键“记录用户所见”工具 | 建立 Observation Mode：DOM/ARIA、截图、console、network、media readyState、事件时间线一键打包，供 UX 复盘和 bug 复现 | P1 |

## 4. Nomi 应该怎样统一三页

### 4.1 推荐的信息架构

```text
项目壳
├─ 上方：项目名 / 当前阶段 / 运行中心 / 撤销重做 / 导出
├─ 左侧：上下文
│  ├─ 资产（本地、生成、引用、授权）
│  ├─ 项目目录（Brief、Script、Shot Plan、结果）
│  └─ 选中对象的来源与版本
├─ 中央：一个主工作面（随焦点切换）
│  ├─ Idea：文稿 + Agent 讨论 + 计划卡
│  ├─ Build：画布/分镜/批量生成
│  └─ Cut：播放器 + 时间轴 + 片段 Inspector
├─ 右侧：Agent
│  ├─ 对话
│  ├─ 当前上下文（选中 S03、00:04.2–00:06.8）
│  ├─ 待确认 Proposal
│  └─ Run/Attempt/失败恢复
└─ 底部：常驻 mini preview；进入 Cut 时展开完整时间轴
```

### 4.2 为什么不会“不能 play”

播放器必须是项目层的共享组件，不能只属于 PreviewWorkspace。生成结果写入 `AssetRecord` 后立即生成可播放的 artifact 预览；时间轴只引用稳定 `assetId`。显示播放器前做三项检查：可见 media element 的 src、`readyState/networkState`、当前项目时间轴是否引用同一资产。这样不会因为“文件存在”就误判“用户看见的播放器可播放”。

### 4.3 为什么不会“有生成、没深编”

Agent 不直接写最终时间轴，而是输出可审阅的编辑提案：

```text
用户：把 S03 的结尾改成产品特写，保留原音，时长 2.5 秒
Agent：读取选中 S03 → 给出替换/裁切/音频保持的差异预览 → 显示成本和影响
用户：确认
系统：创建新 attempt → 成功后只替换 S03 assetId → 旧版本保留，可撤销/回退
```

首版只做少数可验证命令，不做“全能剪映克隆”：裁切、替换镜头、字幕改写、音频 ducking、片段续写/重拍。这些覆盖用户最常见的“生成后不满意”摩擦，也能复用现有时间轴和资产底座。

## 5. 免费商用素材接入策略

素材来源只做“候选检索 + 授权证据”，不做无条件版权担保：

| 来源 | 默认判定 | 产品处理 |
|---|---|---|
| Pexels | 许可页允许免费商用且通常无需署名；API 使用有来源展示/链接要求 | 绿色候选；保存 license URL、抓取时间和 Pexels 来源链接 |
| Pixabay | 内容许可通常允许商用/无需署名；API 展示要求和人物/商标权仍存在；音乐不得作为独立文件分发 | 图片/视频绿色候选；音乐和含品牌素材标 amber |
| Unsplash | 图片许可允许商用；API 要求署名/热链和下载统计 | 绿色候选但保留 API attribution |
| Coverr | 许可页文字存在“需署名/无需署名”冲突，API 文档更严格 | 默认 amber，必须保存当次页面和单项条款 |
| Mixkit | 按素材区分 Free/Restricted，Restricted 通常非商用 | 单项 license 判断，不能站点级绿灯 |
| Videvo | Royalty Free、Videvo Attribution、CC、Editorial Only 并存 | 每条素材卡必须显示 credit/editorial 状态 |
| Kaboompics | 标准素材可商用；Editorial Only、人物/商标权另行处理 | 绿色/amber 分开 |
| iconfont | 作者/站点权利和商用授权需单独确认 | 默认 amber，不作为无条件商用图标库 |
| Bensound | 免费署名许可适合在线/变现视频；广告/客户商业用途常需付费许可 | 默认 amber；导出前检查 license |
| FreePD | 原 freepd.com 已关闭，不能把同名镜像当官方 | 红色/不可验证，暂不接入 |

产品内每个素材需要保留：原站 URL、作者、license URL、抓取日期、署名文本、人物/商标/编辑用途警告、是否允许独立分发。搜索结果和导出清单都显示状态；导出时生成 `asset-license-report.json`。来源入口： [Pexels License](https://www.pexels.com/legal-pages/license/)、[Pixabay Terms](https://pixabay.com/service/terms/)、[Unsplash License](https://unsplash.com/license)、[Coverr License](https://coverr.co/license/)、[Mixkit License](https://mixkit.co/license/)、[Videvo Licensing](https://www.videvo.net/blog/how-we-license-our-footage-on-videvo-net/)、[Kaboompics License](https://kaboompics.com/page/license-and-faq)、[Bensound FAQ](https://www.bensound.com/faq)。

## 6. 第一批应落地的真实用户任务

这些任务既是产品路线，也是验收测试，不是功能清单：

1. **15 秒产品广告**：上传一张产品图和一段 Brief → Agent 给 3 个方向 → 选择一个 → 生成 4 镜头 → 只重拍 S03 → 预览播放 → 改字幕和 BGM → 导出。
2. **已有素材重剪**：导入 3 段视频和音乐 → 自动识别镜头 → 用户说“删掉中间空镜、保留人声、结尾加 2 秒产品特写” → Proposal 预览 → 应用 → 播放/撤销。
3. **失败恢复**：批量生成 6 镜头，其中 2 个失败 → 其他 4 个可播放 → 查看失败原因 → 只修改失败镜头 → 重试 → 合并版本。
4. **中断恢复**：生成中点击停止 → 已完成资产保留、未提交任务取消、运行卡显示状态 → 重开项目后继续或进入 reconcile。
5. **商用素材交付**：搜索免费素材 → 选中一条 amber 素材 → 查看授权说明 → 替换为绿色素材 → 导出时生成授权清单。

每项都要用真实页面截图和用户所见证据验收，不能只靠单元测试；尤其检查：播放器是否真的有源、取消后是否留下半截假完成、时间轴和画布是否同一版本、Agent 是否明确指出修改范围。

## 7. 参考页面与证据链接

- [MiniMax Design 官网](https://design.minimaxi.com/)
- [小云雀](https://xyq.jianying.com/home?tab_name=home)
- [LibTV](https://www.liblib.tv/)
- [LibTV CLI](https://www.liblib.tv/cli)
- [TapNow Brainstorm](https://docs.tapnow.ai/zh/docs/agent/find-ideas-with-brainstorm)
- [LTX AI Movie Maker](https://ltx.io/studio/platform/ai-movie-maker)
- [InVideo Storyboards](https://help.invideo.io/en/articles/14754413-creating-storyboards-with-invideo)
- [Gamma Agent](https://help.gamma.app/en/articles/15002203-how-do-i-create-with-agent)
- [Canva MCP tools](https://www.canva.dev/docs/mcp/tools/)

## 8. 尚未能验证的内容

- 飞书文档中的嵌入视频、折叠块和部分评论/权限内容不一定全部进入 `innerText`；本地 DOCX 的原文、表格和媒体索引已保留，可继续逐页看媒体。
- 小云雀、LibTV、TapNow 运行中的计费、模型队列和后端失败原因依赖账号/实时服务，本报告不把页面宣传语当作 SLA。
- 未进行任何登录绕过、隐藏 API 调用或大规模下载；页面受权限/登录限制的部分按“当前会话可见”记录，并保留截图和状态。

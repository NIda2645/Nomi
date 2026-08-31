# 对话式创作的交互设计（C 路调研）— 2026-08-19

> **调研对象**：用户在纯对话界面里创作一个大东西（剧本/视频/长文档）时，业界怎么设计**方向确认、中间产物展示、迭代指改、长任务节奏**。
> **背景约束（贯穿全篇）**：Nomi 主力客户端是 Claude Code / Codex 这类**终端对话**，到达用户眼睛的只有**六条通道**：①模型转述的文字 ②行内进度帧 ③elicitation 确认表单 ④可点的 `nomi://` 深链 ⑤桌面系统通知 ⑥切去 Nomi 窗口本身。已知痛点：反复确认惹烦用户（原话「反复去软件确认 不是太麻烦了」）vs 方向问太少=初稿方向错全废。
> **纪律**：每条标来源；产品行为拿不到官方文档就用实测文章，注明推断成分。每条都回答「对六通道适不适用」。

---

## 0. 一句话总纲（先给判断，D5）

业界在「对话里做大东西」上已经收敛出一套**稳定三段式**：**开场收敛（≤3 问）→ 计划/中间产物落文本让人过目 → 长任务后台跑 + 状态帧维持掌控**。而**确认惹烦**这个痛点，业界的解法不是「少确认」，而是**三档闸门 + 批量呈现 + 会话级记忆**——不是所有动作都问，只在「不可逆/大额/方向岔路」这 5% 停下，其余 95% 自主推进。这一条正对 Nomi 的原话痛点。

---

## 1. 方向收敛模式对比（初稿前怎么把意图收窄）

### 1.1 对比表

| 产品 | 问什么 | 问几个 / 一次 or 逐步 | 格式：候选 or 开放 | 用户跳过/敷衍会怎样 | 来源 |
|---|---|---|---|---|---|
| **ChatGPT Deep Research** | 范围角度、时间/时效、地域/行业、分析深度、具体用途/产出形态 | **总是问**（不管首条 prompt 多细）；**一轮问全**（一条消息里列几条） | **开放为主**，偶带方向性引导（如「B2B 还是 B2C？优先 TrustPilot 还是 Crunchbase？」） | 你答得越含糊，报告越可能跑偏；官方明说「how you respond determines the accuracy of your final report」。可以简短说「就按你判断」放行 | [1][2][8][12] |
| **Google Gemini Deep Research** | **不问澄清题** | 改为**先出多步「研究计划」**给你 Edit / Approve | 计划是可编辑文本，藏在可展开控件里，**不鼓励精修**（默认直接 Approve） | 跳过=直接用它给的计划；首轮跑完常引出新问题，再在 chat 里追问 | [3][4] |
| **Claude Research** | 按题目动态问（例：知识工作者类型、时间跨度、是关注岗位替代还是创造） | 问「some clarifying questions」后开工；一轮 | 开放 | 未文档化；agentic 地自己拆概念补 | [5][6] |
| **LTX Studio（视频向导）** | 不靠问；**贴剧本/写一句 prompt → 自动拆场景 + 出分镜缩略图 + 建议运镜** | 零问题，**effect-first**（直接出可改的东西） | N/A（给的是可改的中间产物，不是问题） | 你什么都不填也能得到首版分镜，再逐镜改 | [9][10][11] |
| **Suno（一句话到歌）** | 用**双档输入**代替问：Simple（一句描述、模型全脑补）vs Custom（拆成 200 字 Style + 3000 字 Lyrics，带 `[Verse]/[Chorus]` 结构标签） | 零问题；控制权靠「要不要切 Custom」渐进暴露 | N/A | Simple 模式跳过一切=模型全权发挥；升级到 Custom 才拿回控制 | [13][14] |
| **NotebookLM** | 不问；先让你**上传源**，再在 chat 里问答（答案带可点回源的行内引用） | N/A | N/A | 无源就没得聊；范围天然被「你传了什么」框住 | [15] |

### 1.2 收敛模式的**共性**（跨产品抽出来的规律）

1. **要么问 ≤3 个、一轮问全；要么干脆不问、改用别的收敛器。** 没有产品做「逐条追问式盘问」——UX 研究界的共识落点是**最多 3 个澄清题**，且「人类做决策通常先问一两个」，超过就是 interrogation、制造摩擦（[16][17]）。ChatGPT 是「一轮问全」派，Gemini/LTX/Suno 是「不问、换收敛器」派。
2. **「不问」的三种平替收敛器**（都比问问题更 effect-first，正合 D1）：
   - **可编辑计划**（Gemini）：先出一份计划让你改/放行，把「问你要什么」翻译成「你改我这份草案」。
   - **渐进控制档**（Suno）：默认全脑补，想控制自己切到 Custom；不打断新手，也不困住老手。
   - **直接出可改的中间产物**（LTX）：一句话直接给分镜，让你「指着改」而非「答问卷」。
3. **跳过永远安全**：所有产品的跳过路径都=「用系统的默认判断继续」，从不卡死。这对 Nomi 是硬约束——**任何澄清都必须能一键放行**。

### 1.3 对六通道的适配判断

- **ChatGPT 一轮问全** → 对 Nomi 最直接：用 **通道③ elicitation 表单**一次性呈现 2-3 个字段（enum 带 `enumNames` 做候选按钮），用户一屏答完或点「按你判断」。**不要逐条在对话里追问**（那正是「反复确认」的观感来源）。✅ 强适用。
- **Gemini 可编辑计划** → 用 **通道① 文字**把「拟定的创作计划」（几个镜头、什么风格、时长）落成一段可读文本，末尾一句「直接开始 / 告诉我改哪」。终端能渲染文本，天然适配。✅ 强适用。
- **Suno 渐进控制档** → 映射为「默认自动跑，想精调再展开槽位」的心智；但终端里**不宜靠 UI 模式切换**，改为**默认最少问、老手可在首条 prompt 里塞更多约束**（档案声明槽、通用系统填，正合 P4）。✅ 概念适用，实现走 prompt 而非模式开关。
- **LTX 直接出分镜** → effect-first 的样板：Nomi 可以**先出一版镜头清单再问**，而不是先问再做。✅ 适用，见 §2。
- **NotebookLM 行内回源引用** → 见 §2.4，是「指着改」的反向（指着看）。

---

## 2. 中间产物展示与「指改」的格式清单

**核心矛盾**：终端**不渲染富卡片、不渲染图给用户看**，剧本/分镜这种结构化中间产物只能靠 **通道① 纯文本（Markdown）** 到达用户眼睛。所以格式选择 = 「哪种纯文本布局最好读 + 最好被指着改」。

### 2.1 展示格式（纯文本能承载的几种，按适配度排序）

| 格式 | 长什么样 | 适合 | 对终端对话适配 |
|---|---|---|---|
| **编号镜头列表**（业界 shot-list 惯例） | `Scene 5` 下 `5A / 5B / 5C`，**按故事顺序编号**，每条含：镜号、景别、机位、运镜、主体动作、时长、剪辑意图 | 分镜/脚本的主力展示 | ✅✅ 最佳。纯文本天然支持；**稳定 ID（5A/5B）给了「指着改」的地址**（见 2.3）。来源 [21] |
| **Markdown 表** | 列=镜号/景别/机位/时长/描述 | 镜头属性齐、要横向对比时 | ✅ 适用，但终端窄列会折行；**列多了不如编号列表**。来源 [21][22] |
| **带标签的剧本块** | `[Verse]/[Chorus]`（Suno）、场景 `INT./EXT.` + 时间码 + 斜体对白 | 剧本文本、音乐结构 | ✅ 适用；结构标签本身就是「可寻址锚点」。来源 [13][22] |
| **分层大纲** | Scene → Beat → Action → Insert → Shot 逐级缩进 | 长文档/长片的骨架审阅 | ✅ 适用于「先看骨架再往下钻」。来源 [22] |

**最佳实践一句话**：**编号镜头列表（story-order ID）是纯文本对话里展示分镜的默认最优解**——比 Markdown 表更耐窄屏、且编号直接充当「指改地址」。表格只在需要横向属性对比时用。

### 2.2 「指着改」的三档粒度（从 LTX 抽出来的样板）

LTX Studio 把编辑做成**三层粒度**，这是「指改」交互的最完整参照（[18][19]）：

1. **整项目**改（换全片风格）
2. **单个分镜/storyboard**改
3. **单帧 / 一个 2-16 秒片段**改（Retake：选中某段，只重生成那段，**保留周围**）

**关键机制**：「选中某片段 → 送回生成空间 → 改 prompt → 只重生成这段 → 通过后就地替换」。**保留未选中部分**是这套交互的灵魂。

**跨产品同一条铁律**（Suno / LTX / Claude artifacts 三方独立命中）：
> **两三处定点改 > 整体重生成**（Suno 原话「Two or three targeted edits usually outperform full regeneration」[20]；Claude artifacts 的 `update` 优先于 `rewrite`[改进纪要]；LTX Retake 同理）。

### 2.3 「第 3 镜改成……」怎么设计得顺（落到 Nomi）

- **前提**：每个中间产物元素带**稳定短 ID**（镜头 `5A`，或简单 `#3`）。用户说「把 #3 改成黄昏」——ID 就是地址，无需渲染 UI。✅ 通道① 承载。
- **改动确认走轻**：定点改属于「可逆、低风险」，**不该弹 elicitation**——直接改、把「#3 已改为黄昏，其余不动」用一句进度帧回给用户即可（见 §4 的三档闸门：这属于 auto/notify 档，不是 block 档）。
- **对照 Claude artifacts 的 `create/update/rewrite`**（[Claude 编辑改进纪要][artifact 更新]）：
  - `update` = 精确字符串替换、**只匹配一次**、空白/格式敏感 → 对应「只改 #3 这条」
  - `rewrite` = 大改/无法定点时才整体重来 → 对应「整片风格换掉」
  - **迁移到 Nomi 的启示**：模型内部区分「定点改 vs 整体重来」，**只有整体重来才值得回一次确认**；定点改静默执行 + 一句回执。这直接压低「反复确认」的频率。

### 2.4 反向「指着看」：行内可点引用（NotebookLM）

NotebookLM 每条答案带**行内可点引用**回到源文档段落（[15]）。映射到 Nomi：中间产物里每个镜头可挂一个 **`nomi://` 深链（通道④）**，点开直接跳到 Nomi 窗口里对应那个节点/那一镜——**「指着看」用深链，「指着改」用文字 ID**。两者互补。

---

## 3. 长任务的节奏感（生成几分钟到几十分钟怎么维持「在掌控中」）

### 3.1 三家 deep research 的进度模式对比

| 产品 | 跑多久 | 中途给什么 | 完成怎么通知 | 能否中途步走 | 来源 |
|---|---|---|---|---|---|
| **ChatGPT** | 5-30 min | **右侧活动栏实时滚**：做了哪几步、查了哪些源（例：11 分钟、25 个源、约 100 个页面） | 完成推通知 | ✅ 可步走做别的 | [1][8][12] |
| **Gemini** | 5-10 min | **几乎不给中间进度**（黑盒） | 完成推通知（web 在会话旁 / 移动端设备通知） | ✅ 可离开 | [4] |
| **Claude Research** | 5-45 min | agentic 地多轮搜、边走边定下一步（过程可见度中等） | — | ✅ | [5][6] |

**观察**：进度**粒度可高可低**都被市场接受（ChatGPT 高透明 vs Gemini 黑盒），但**「能步走 + 完成必通知」是共识底线**。Nomi 一定要有的是**通知（通道⑤）**，进度粒度可调。

### 3.2 MCP 官方的长任务规范 = Nomi 的直接技术底座（重要）

MCP 2026 把长任务从实验期扶正为官方扩展（SEP-2663 `io.modelcontextprotocol/tasks`），**call-now-fetch-later** 模式（[23][24][25][26]）：

- **提交**：请求里加 `task: { ttl }` → 立即返回 `taskId`，不阻塞。
- **轮询**：`tasks/get`，客户端**按服务端建议的 `pollInterval`** 拉状态；直到终态或遇到 `input_required`。
- **两条回报通道**：
  1. **状态通知（push）**：状态迁移（`working → input_required → completed`）时发 status notification。
  2. **进度事件**：原请求带的 `progressToken` 在整个任务生命周期内有效，可持续发标准 progress notification。
- **官方 UX 指导原话**（WorkOS 转述，[23]）：
  > **「Show `statusMessage` to explain what's happening, respect `pollInterval` so you don't overload servers, and surface progress events tied to the `progressToken`」** —— 让长操作「感觉在响应」。
- **`input_required`**：任务中途可要求补输入 → 天然对接 elicitation。

**这对 Nomi 是 1:1 契合**：Nomi 已是 submit→poll 架构。规范化的启示——
- `statusMessage` → 直接喂 **通道② 行内进度帧**（「第 2/5 镜生成中…」）。
- 状态迁移到 `completed`/`input_required` → 触发 **通道⑤ 桌面通知**（尤其用户已步走时）。
- 中途需要用户拍板 → 走 `input_required` + **通道③ elicitation**，而不是自己瞎猜。

### 3.3 中途汇报什么 / 什么时候主动停下来问

综合三家 + HITL 框架（[19][23]）：

- **汇报（不打断，通道②）**：粗粒度里程碑即可——「拆好 5 个镜头 → 正在生成 2/5 → 合成中」。**别逐帧刷**（`respect pollInterval`），也别纯黑盒（至少给 statusMessage）。
- **主动停下来问（打断，通道③，仅限这几种）**：只在**方向岔路 / 不可逆大额 / 素材缺口**停。生成中途发现「参考图分不清谁是谁」这类会毁掉初稿方向的，才值得 `input_required`。日常进度**绝不停**。
- **完成（通道⑤+④）**：桌面通知一句「初稿好了」+ `nomi://` 深链点开直达预览。用户步走了也能被拉回来。

---

## 4. 「确认惹烦」的解法：三档闸门 + 批量 + 会话级记忆（直击痛点）

这是本次调研**最该落到 Nomi 的一块**——正对用户原话「反复去软件确认 太麻烦」。业界的 human-in-the-loop 框架给了成体系答案（[27][28]）：

### 4.1 三档闸门模型（不是「要不要确认」，而是「哪档」）

| 档位 | 覆盖动作 | 处理方式 |
|---|---|---|
| **Auto-approve** | 安全可逆：读、搜、定点小改（改 #3）、拆镜头、排版 | **静默执行**，一句进度帧回执即可 |
| **Notify（通知档）** | 有影响但可恢复：整体重生成一版、覆盖草稿 | **先斩后奏式告知**（做了+能撤），不阻塞等确认 |
| **Block（拦截档）** | 不可逆/大额/方向岔路：花大额度真生成、删供应商、初稿方向拍板 | **必须显式批准**才继续 |

**核心配比原则**（[27] 原话）：**「agent 自主处理 95% 的常规，只对 5% 的高风险离群值触发中断」**。「闸门太多 → 用户弃用 agent」是明写的失败模式。
→ **Nomi 的「反复确认」痛点，根因就是把太多 Auto/Notify 档动作误放进了 Block 档。** 修法：重新给动作归档，只有真·Block 档才走 elicitation。

### 4.2 批量呈现（别一个个问）

- [27]：**「多个文件写就一起呈现，而非逐个」**——「present them together rather than one by one. This reduces approval friction」。
- 映射 Nomi：若一次要确认多件事（选模型 + 花额度 + 确认时长），**合并成一个 elicitation 表单一次问全**（正合决策自治里「合并成一轮」）。MCP elicitation 的 `requestedSchema` 支持多字段（string/number/boolean/enum + `enumNames`），一张表单塞多题天然支持（[29]）。

### 4.3 会话级记忆（治「反复」的根）

- 通用 HITL 框架把「记住已批准、避免重复问」列为**文档化空白**（[30] 明说没覆盖）——**这正是 Nomi 已经领先的点**：近期 commit `efa7a99a feat(mcp): 付费确认加会话级信任——治「反复去软件确认」` 已经在做「一次信任、本会话内不再反复问」。本调研佐证这个方向是对的、且是业界标准框架都还没补上的洞。
- **增量建议**：把「会话级信任」从「付费确认」推广到**所有 Notify 档动作**（首次告知一次，之后同类静默）。

### 4.4 闸门上该显示什么（[27][30]）

在 Block 档 elicitation 里，四件事说清：**做什么动作 / 为什么（agent 的理由）/ 会改变什么 / 怎么撤销**。
→ Nomi 的 elicitation 文案模板应含这四栏，且**用大白话 + 具体例子**（D6：如「要花 ~30 额度真生成这 5 个镜头，生成后可在画布里重来」）。

---

## 5. MCP 内容创作 server 的增量发现（Higgsfield 之外）

> 已知 Higgsfield：三轨（远程 MCP + CLI + Agent Skills）、5 动词扛 30+ 模型、submit→poll→URL、**自动选模型**（agent 自动挑最佳或你指定）、结果落 history 可复用（[7][补 Higgsfield 抓取]）。下面是它之外的增量。

### 5.1 横向盘点（新抓到的 server）

| Server | 工具设计 | 确认/澄清 | 长任务处理 | 结果 | 增量点 |
|---|---|---|---|---|---|
| **VEED MCP** | **单个视频生成工具**；调用时带 AI avatar → 传给 Fabric 1.0 talking-video 模型；选声音+加脚本 | **无确认步**，直接发起 | 异步，**返回 MP4 URL** | MP4 URL 直接交给下游（发社媒/贴邮件/存 CMS） | 「**单工具 + URL 交棒**」极简派：把生成物做成可被下个工具消费的 URL | [C1] |
| **invideo MCP** | prompt→自动生成脚本→从 16M+ 图库/AI 生成片段→加 50+ 语言字幕→出整片 | 落地页未见确认/澄清（推断：偏自动） | 异步 | 成片 | 「**一句话→整片全自动流水线**」派 | [C2] |
| **fal / Replicate MCP** | 文生图/图生图/批处理/文生视频/音乐（FLUX/SD/MusicGen 等）；Replicate 跑任意开源模型 | 无确认步 | 异步 | URL | 「**广目录 + 少动词**」，与 Higgsfield 同构但更偏开发者 | [C3] |
| **Artlist MCP** | 100+ 模型；生成物**存进 Artlist 库**（授权合规） | 无确认步 | 异步 | 落库 | 「**生成即入版权库**」——把「合规/资产管理」做进交互 | [C3] |
| **Outline MCP**（写作向） | search/read/create/edit/archive/delete 文档 + 评论 + 反链 + 批量 | 无 | 同步为主 | 文档 | 写作类是 **CRUD 动词集**，非 submit-poll；「edit」是定点改的自然入口 | [C4] |

### 5.2 **最大增量发现**（三条，按对 Nomi 价值排序）

**① 内容创作类 MCP server 普遍「零确认、fire-and-forget」——这正是 Nomi 的差异化空位。**
VEED、invideo、fal、Replicate、Artlist、Higgsfield **无一有确认/澄清/方向收敛步**，全是「收到 prompt 直接异步生成、吐 URL」。它们赌「生成便宜、错了再来一次」。但 Nomi 做的是**「对话生成质量足够高的视频初稿」**——初稿方向错=整条工作流白费，且真生成花额度不便宜。
→ **所以「开场收敛 + Block 档确认」不是抄别人，而是 Nomi 结构性护城河**（D2：对手都省掉的那一步，正是 Nomi 该做重的地方）。业界现成的 MCP 内容 server 里**没有一个把「方向收敛」做进交互**，这块是空白，Nomi 做了就领先。

**② MCP 官方 `tasks` + `input_required` + `progressToken` = 长任务节奏的标准底座（§3.2）。**
这是**协议级**能力，不是某个产品的私货——意味着 Nomi 按这套实现，天然被 Claude Code/Codex 这类合规客户端正确渲染进度与通知。VEED/Higgsfield 只用了「异步吐 URL」的最浅一层，**没用 `input_required` 做中途拍板、没用 `progressToken` 做细粒度进度**。Nomi 若用满这两个，长任务掌控感直接超过所有现役内容 server。

**③ MCP elicitation 的 `enum` + `enumNames` = 「给候选而非开放问」的协议原生支持。**
elicitation `requestedSchema` 支持 `enum`（值）配 `enumNames`（显示标签）（[29]），客户端可渲染成**按钮/选项**而非让用户打字。→ Nomi 的开场收敛应**优先给候选**（如「风格：写实 / 动画 / 复古」三个 enum 按钮 + 一个「其它，我来说」），把 §1.2 的「候选优于开放」用协议原生方式落地。**当前内容创作 server 没人用 elicitation 做收敛**——又一处空白。

---

## 6. 给 Nomi 的适配建议（每条注明用六通道里的哪条承载）

> 通道：①模型转述文字 ②行内进度帧 ③elicitation 表单 ④`nomi://` 深链 ⑤桌面通知 ⑥切去 Nomi 窗口

### A. 方向收敛（初稿前）
1. **开场最多问 2-3 题、一轮问全，且优先给候选。** 用 **通道③ elicitation**，字段用 `enum`+`enumNames` 渲染成候选按钮（风格/时长/主角谁），每题都带「其它，我说」+ 整表带「按你判断直接开始」放行钮。**绝不逐条在对话里追问**。依据 §1.2 共性 + §5.2③。
2. **能不问就别问：先出一版可改的镜头清单再邀请修改**（LTX effect-first 路子）。用 **通道①** 落「拟定 5 镜 + 各镜一句 + 末尾『直接开始 / 告诉我改哪』」。依据 §1.1 LTX/Gemini。
3. **老手把约束塞首条 prompt 即可绕过收敛**（Suno 渐进控制的终端版）——档案声明槽、通用系统填（P4）。承载：**通道①**。

### B. 中间产物展示与指改
4. **默认用「编号镜头列表（story-order ID：#1/#2 或 5A/5B）」展示分镜**，Markdown 表仅在需横向对比属性时用。承载：**通道①**。依据 §2.1。
5. **每个镜头挂一个 `nomi://` 深链**：「指着看」点深链跳 Nomi 对应节点（**通道④→⑥**）；「指着改」用文字 ID（**通道①**）。依据 §2.4。
6. **模型内部区分「定点改 vs 整体重来」**：定点改（对应 artifact `update`）**静默执行 + 一句回执**（通道②）；只有整体重来（`rewrite`）才回一次确认。这是压低「反复确认」频率的关键。依据 §2.3 + §4.1。

### C. 长任务节奏
7. **用满 MCP `tasks` 规范**：`statusMessage` → **通道② 进度帧**（粗粒度里程碑「2/5 镜生成中」，按 `pollInterval` 别刷太密）；状态到 `completed` → **通道⑤ 桌面通知** + **通道④ 深链**直达预览（治「用户已步走」）。依据 §3.2。
8. **中途只在方向岔路/素材缺口停**，走 `input_required` + **通道③**；日常进度绝不打断。依据 §3.3。

### D. 治「反复确认」（最高优先，直击原话痛点）
9. **给所有动作重新归档到三档闸门**，只有 Block 档（不可逆/大额/方向拍板）走 **通道③ elicitation**；Auto 档静默、Notify 档先斩后奏（通道②告知）。**目标：95% 动作不打断。** 依据 §4.1。
10. **多个待确认合并成一张 elicitation 表单一次问全**（通道③），别逐个弹。依据 §4.2。
11. **把已落地的「会话级信任」（commit `efa7a99a`）从付费确认推广到所有 Notify 档**：首次告知一次，本会话同类静默。这是业界标准 HITL 框架都还没补的洞，Nomi 已领先，扩大战果即可。依据 §4.3。
12. **Block 档 elicitation 文案含四栏**：做什么/为什么/改变什么/怎么撤销，用大白话+具体例子（D6）。承载：**通道③**。依据 §4.4。

---

## 附：来源清单

**方向收敛 / deep research**
- [1] OpenAI Help — Deep research FAQ: https://help.openai.com/en/articles/10500283-deep-research-faq
- [2] Deep research in ChatGPT（Help）: https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt
- [3][4] Gemini Deep Research（Google 支持 + workspace 博客）: https://support.google.com/gemini/answer/15719111 · https://blog.google/products/gemini/google-gemini-deep-research/
- [5] SiliconANGLE — Claude Research 升级: https://siliconangle.com/2025/05/01/anthropic-updates-claude-new-integrations-feature-upgraded-research-tool/
- [6] Anthropic Help — Use research on Claude: https://support.claude.com/en/articles/11088861-use-research-on-claude
- [8] PromptLayer — How deep research works: https://blog.promptlayer.com/how-deep-research-works/
- [12] DataCamp — Deep Research（含右侧活动栏实测：11 min / 25 源）: https://www.datacamp.com/blog/deep-research-openai
- [12b] Singularity Moments — Deep research 指南（活动栏）: https://singularitymoments.com/chatgpt-deep-research-guide/

**创作产品收敛/展示/指改**
- [9] Shai Creative — LTX Studio 2025: https://shaicreative.ai/everything-you-need-to-know-about-ltx-studio-in-2025/
- [10] Technori — LTX Studio 评测: https://technori.com/2025/09/22974-ltx-studio/ava/
- [11] LTX 官方博客 — Storyboard generator: https://ltx.io/blog/ltx-storyboard-generator-update
- [13][14] Suno Custom/Simple 模式（Jack Righteous + HookGenius）: https://jackrighteous.com/en-us/blogs/guides-using-suno-ai-music-creation/where-to-put-your-suno-prompt-guide · https://hookgenius.app/learn/suno-custom-mode-guide/
- [15] NotebookLM 三栏 + 行内引用（ZenML/综合）: https://www.zenml.io/llmops-database/source-grounded-llm-assistant-with-multi-modal-output-capabilities
- [18] CineD — LTX Studio Editing（整项目/单板/单帧三级）: https://www.cined.com/ltx-studio-takes-its-next-big-step-editing/
- [19] LTX — Shot Video Editor / Retake（选段重生成保留周围）: https://ltx.io/studio/platform/shot-video-editor
- [20] Suno Song Editor（Replace Section / 两三处定点改 > 全重生成）: https://help.suno.com/en/articles/6141505 · https://jackrighteous.com/en-us/blogs/guides-using-suno-ai-music-creation/replace-section-suno-editor
- [21] Studiovity / Ciaro — shot-list 字段与 story-order ID: https://studiovity.com/shotlist-storyboard/ · https://ciaro.pro/blog/script-breakdown-for-ai-video-shot-list
- [22] DocsBot / invideo — 场景拆分与 Markdown 剧本格式: https://docsbot.ai/prompts/creative/video-scene-breakdown-and-script · https://invideo.io/blog/ai-script-breakdown/
- [artifact 更新] Claude artifacts create/update/rewrite（Hyperdev + Medium「Replace Is All You Need」+ Tom's Guide highlight-to-edit）: https://hyperdev.matsuoka.com/p/claudeais-quiet-revolution-in-artifact · https://medium.com/@rquintino/replace-is-all-you-need-... · https://www.tomsguide.com/ai/claude-artifacts-get-a-big-update-now-you-can-highlight-and-edit-code-with-text

**长任务节奏 / MCP 规范**
- [23] WorkOS — MCP Async Tasks（call-now-fetch-later、statusMessage/pollInterval/progressToken UX 指导）: https://workos.com/blog/mcp-async-tasks-ai-agent-workflows
- [24] DeepWiki — MCP Task System & Async Operations: https://deepwiki.com/modelcontextprotocol/modelcontextprotocol/2.7-task-system-and-async-operations
- [25] MCP Blog — 2026-07-28 RC（Tasks 扶正为扩展、input_required）: https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/
- [26] Agnost / Channel — Long-running tasks 模式: https://agnost.ai/blog/long-running-tasks-mcp/ · https://www.channel.tel/blog/mcp-tasks-async-long-running-agent-tools

**确认闸门 / HITL / elicitation**
- [16][17] 澄清题最多 3 个（Duckweave「Agents that ask better questions」+ Eedi 研究）: https://medium.com/@duckweave/agents-that-ask-better-questions-14834fa6118a · https://www.eedi.com/news/improved-human-ai-alignment-by-asking-smarter-clarifying-questions
- [27] Platform Engineering — HITL 三档闸门 / 95%-5% / 批量呈现 / 闸门四要素: https://platformengineering.com/features/the-platform-engineers-guide-to-human-in-the-loop-agentic-workflows/
- [28] Strata — Human-in-the-Loop 2026 指南: https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/
- [29] DEV — MCP Elicitation（requestedSchema 字段类型 / enum+enumNames / accept-decline-cancel / 生成式 UI 按钮）: https://dev.to/kachurun/mcp-elicitation-human-in-the-loop-for-mcp-servers-m6a
- [30] Agentic Patterns — HITL Approval Framework（闸门四要素；「记住已批准」是文档空白）: https://www.agentic-patterns.com/patterns/human-in-loop-approval-framework/

**MCP 内容创作 server**
- [7][Higgsfield] Higgsfield MCP（5 动词 30+ 模型 / 自动选模型 / submit-poll-URL / history 复用）: https://higgsfield.ai/mcp
- [C1] VEED MCP（单工具 / Fabric 1.0 / MP4 URL 交棒）: https://www.veed.io/tools/veed-mcp
- [C2] invideo MCP（一句话→整片全自动）: https://invideo.io/ai/mcp/
- [C3] fal / Replicate / Artlist MCP（广目录少动词 / 生成即入库）: https://usegola.com/blog/best-image-generation-mcp-servers · https://artlist.io/blog/the-best-mcp-connectors-for-ai-image-and-video-generation-in-2026/
- [C4] Outline MCP（写作类 CRUD 动词集）: https://mcp.directory/blog/outline-mcp-complete-guide-2026

> **推断成分标注**：invideo/fal/Replicate/Artlist 的「无确认步」为落地页/评测页描述所推断（这些页面未公开完整工具 schema，官方文档未逐项抓到）；ChatGPT「一轮问全」的题数上限（≤3）是 UX 研究共识而非 OpenAI 官方硬数字；Higgsfield「5 动词」沿用先前研究结论，本次抓取页面未逐一列出工具名（页面按能力描述、未点名单个 tool）。其余均有直接来源。

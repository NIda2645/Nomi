# 体验走查摩擦修复 · 批次 1（预算焦虑短剧创作者）

日期：2026-08-25 · 分支 `claude/exp-walkthrough-fixes-1`（从 `origin/main` f5d8b501，含 S6 #153）

来源：打包版 + 隔离 profile 真机走查（库页 → 新建空白 → 写剧本 → 全选 → 拆成镜头·落画布），实测抓到 6 条摩擦。

---

## 贯穿发现：F2 / F5 / F6 是同一个根因的三个出口

三条摩擦看似独立，根在**同一处判据错位**：

- `catalogStore.ts:79` 的 `hasApiKey = Boolean(记录里有 apiKey 字段 && enabled)` —— 这只证「**密文字节还在**」，**不证解得开**。
- 真实可用性单一真相源早已存在：`secrets.ts` 的 `apiKeyDecryptStatus()`（`ok | missing | locked`）与 `agentChatV2.chooseTextModel()`（解不出 key 就跳过该候选）。走查现场正是 **`locked`**：safeStorage 解密失败 → key 记录在、`hasApiKey=true`，但 `chooseTextModel` 抛 `No local text model is configured`。

于是：
- **F6**：上手清单第一步「接入模型」用 `useHasTextModel`（只查「catalog 有 enabled text 模型」）→ 打勾。但真实生成会失败 → 绿勾撒谎。
- **F2**：创作 composer 旁 `AssistantModelPicker` 用 `filterUsableAssistantTextModels`（要求 `vendor.hasApiKey===true`）→ locked 时 `hasApiKey` 仍为真 → 误判「有可用模型」，不该出的「去配置模型」不出、该出时也不出（信号不对）。
- **F5**：`hasTextModel===true`（catalog 有模型）→ CreationAiPanel 走不进 `NoTextModelRecoveryCard` 分支，落到通用 `AssistantErrorCard`，而 `classifyGenerationError` 不认识「No local text model **is** configured」这句拗口否定 → 落 `unknown` → 原样甩英文串给用户。

**根因层修法**：把「文本大脑是否真能用」的渲染层信号从「catalog 有没有 enabled 模型」换成「`chooseTextModel` 解得出一个可用大脑」——复用已存在的 `getTextBrain()`（`promptLibraryApi.ts`，背后 `resolveTextBrainKeys`→`chooseTextModel`，与真实生成/优化同一份判据，P1 不另造探测）。一处改，F2/F5/F6 同时到根因。F5 再补一层「错误 code 化」兜底（见 F5）。

---

## 逐条

### F4（重）「上手 4 步」下拉盖住并吞掉它指的按钮

- **现象**：引导面板（`OnboardingChecklist`，挂 `NomiAppBar` 右簇，`fixed z-[180]`）默认展开，rect≈(996,64,256×345)；选中文字后 AI 面板顶部出现的 `[data-action-run="storyboard"]` rect≈(998,217,162×28) **完全被盖**，点击被引导第三步 `li[data-step="generated"]` 拦截到超时。
- **根因**：`OnboardingChecklist.tsx:74` 初始 `open = !readChecklistCollapsed()`（折叠态默认 false）→ **首次进来就自动展开**，且它是右上角 `fixed` 覆盖层，会盖住创作区右侧 AI 面板的工作按钮。违反设计系统 §1.5.3「动作不许压在内容上」。
- **修法**（裁定：不改锚定布局，改**默认收起 + 用户一开始工作就收起**）：
  1. **默认收起**：清单是被动进度指示，不该开屏就摊开盖住工作区。把「首次默认展开」改为「首次默认收起」——`open` 初值改为 `readChecklistCollapsed()` 为真时收起、**且首访（无折叠记录）也收起**。入口 pill（N/4）仍在顶栏常驻可见，用户想看点开即可，零信息损失。
  2. **开始工作即收起**：用户在编辑器聚焦 / 输入 / 选中文字（`selectionchange` 有非空选区）时，若清单展开则自动收起——这正是「用户照引导去点按钮」那一刻，把覆盖层让开。
  - 裁定理由：F4 的伤害是「覆盖层吞掉真实工作按钮」。相比「改成挤占布局的常驻栏」（要重排顶栏预算、涉 §1.5 取舍、超小修范畴），「被动指示默认收起 + 工作时让开」既解遮挡又不动布局，最贴 D1（用户那一刻要点按钮，别让引导挡路）。
- **走查断言**（`tests/ux/onboarding-overlap.walk.mjs`）：遮挡检测——先 `proveProbe` 证明 storyboard 按钮中心点在**无遮挡**时 `elementFromPoint` 命中按钮或其子元素（阳性对照），再断言进入创作区默认态下按钮中心点命中的是按钮自身、而非 `[data-onboarding-checklist]` 面板。
- **不动项**：清单的打勾逻辑、TTL/dismiss 生命周期、win32/mac 挂载分流。

### F6（中）第一步「接入模型」绿勾撒谎

- **根因**：`useHasTextModel.ts` 用 `listWorkbenchModelCatalogModels({kind:'text',enabled:true}).length>0` —— 只看 catalog 有没有 enabled 文本模型，不验 key 解得开。
- **修法**：`useHasTextModel` 改用 `getTextBrain()`（真实可用大脑解析，locked→null）。`hasTextModel = (await getTextBrain()) !== null`；web 无 bridge 仍视为 true（不吓人，保持原行为）。监听事件不变（`nomi-model-catalog-changed`）。
  - 这一处改**同时**修好 F6（清单勾）、F5 的分支门（CreationAiPanel 走进 recovery 卡）、库页「接入模型」状态条（locked 时也会提示去修）。
- **步骤文案**：locked 态目前文案是「接入模型 / 在设置里接入一个模型」——已能引导去模型设置。补一句更精确的 hint（「已保存的 Key 读不出，去模型设置重新粘贴」）到 recovery 卡不可用分支的措辞，见下。
- **走查断言**（同 `model-onboarding` 体系或新脚本 `onboarding-checkmark-honesty`）：种一个 **enc=safeStorage 但密文不可解** 的 apimart key + enabled text 模型 → 断言上手清单第一步 `[data-step="model"][data-done="false"]`（不打勾），且创作区拆镜头报错走 recovery 卡而非原始英文串。阳性对照：换成 plain 明文可用 key → 第一步 `data-done="true"`。

### F5（中）服务端英文错误原串直通用户

- **根因**：① 上游（F6 同源）——`hasTextModel` 假真导致落进通用错误卡；② `classifyError.ts:detectLegacyErrorKind` 的 model-config 分支只认 `not configured / not found / not enabled`，认不出 `agentChatV2.ts:207` 抛的「No local text model **is** configured」（是「无……被配置」的拗口否定，字面是 "is configured"）→ 落 `unknown` → `extractReadableErrorLine` 原样回吐英文。
- **修法**：
  1. **错误 code 化（根因）**：把 `agentChatV2.ts:207` 的 throw 从裸英文散句改成带**稳定 code 前缀**的信号 `Model is not configured: no usable text model`（沿用 electron 侧「专用签名」范式，如 `Model is retired:` / `Model kind mismatch:`）。
  2. **渲染层 t() 翻译**：`classifyError.ts` 加一条 `detectNoTextBrain()`（认 `no usable text model` / `no local text model` 签名）→ 归 `model-config`，reason/hint 走 `narrate` 词表（已有中文「模型未配置 / 去设置→模型检查」）。→ 用户看到人话 + 「去模型接入」按钮 + 折叠技术详情，不再是英文散句。
  3. **未知 code 兜底**：`AssistantErrorCard` 已有 `classifyGenerationError` 的 unknown 兜底（抠可读首行 + 通用建议 + 技术详情折叠），保持。
- **P2 通用性扫描**：全仓「把服务端 message 直拼进用户可见文案」的同类入口——
  - `CreationAiPanel.tsx:224` `planFailed:{{message}}` ← 本条修（拆镜头失败原串）。
  - `StoryboardPlanEditor.tsx:175` `alertDialog` 直贴 `error.message`（落画布失败）——同类；改走 `classifyGenerationError` 或至少收口（详见实施）。
  - `generationCommon.callFailed:{{message}}`（生成区 Agent 执行失败）——同类模板，评估是否同源收口。
  - 结论/清单见「P2 扫描结果」节。
- **走查断言**：F6 的脚本顺带覆盖——locked/无大脑时拆镜头，断言错误卡文本**不含**原始英文串（`No local text model` / `Open model settings`），且含中文人话（「模型未配置」之类）。阳性对照：`proveProbe` 证明该错误卡确实渲染了（`[data-assistant-error]` 或 recovery 卡）。

### F2（中）模型已接入仍显示「去配置模型」

- **根因**：`AssistantModelPicker` 的 empty 分支（`models.length===0`）由 `filterUsableAssistantTextModels` 决定，判据含 `vendor.hasApiKey===true`——locked 时 `hasApiKey` 仍真，信号与真实可用性错位（同 F6 根）。它反映的是「有没有可用文本大脑」这个**真实缺口**，不是无条件常驻——故按任务指引「改文案说清是什么没配」。
- **修法**：empty 态按钮文案从泛泛「去配置模型」改为「**去选文本模型**」（`generationCommon.parameters` 加一条 `selectTextModel`）——点破缺的是「文本模型/大脑」而非任意模型（模型配置的家在顶栏「模型」，这里只是缺大脑的就近提示，一功能一个家不新增入口）。判据错位随 F6 根因修一并对齐（`filterUsableAssistantTextModels` 的 `hasApiKey` 语义本身不改——它是 vendor DTO 字段，改它影响面过大；改的是「上层用它判文本大脑可用」的口径由 `getTextBrain` 兜；此处仅文案精确化）。
  - 注：`AssistantModelPicker` 是否显示不由 `useHasTextModel` 驱动，而由自身 `filterUsableAssistantTextModels`。locked 场景它可能仍显示模型（因 hasApiKey 真），此时选了也会失败——但那条失败已由 F5 的错误卡人话化兜住。本条聚焦「empty 态文案精确」，不扩大到重写 picker 可用性判据（超小修范畴，且 `filterUsableAssistantTextModels` 有自己的注释说明与测试）。
- **走查断言**：无独立脚本（文案级）；在 F6 脚本里顺带截图供人眼看。

### F1（轻）库页空状态文案系统腔

- **根因**：`ProjectLibraryPage.tsx:341` 首次用户（无 query、source=all、零项目）也落 `library.noProjectsInCategory`「这个分类下还没有项目」——但首屏没有「分类」概念，且没给行动指引。
- **修法**：空态分三态精确化——
  - 有 query → `noMatchNamed` + 清除（不动）。
  - 无 query 且 source≠all → 保留「这个来源下还没有项目」（措辞与 source tab 对齐）。
  - **无 query 且 source=all（首次空库）→ 新文案「还没有项目——从上方『新建空白项目』开始」**（指向正上方那张常驻 ActionCard）。走 i18n（zh-CN + en 同改）。
- **走查断言**：无独立脚本（文案级，i18n 门岗覆盖）。

### F3（轻）「拆成镜头·落画布」首屏显著性弱 —— 本 PR 评估后**不动**

- 现状：入口位于右侧 AI 面板顶部（选中文字后 `StoryboardActionCard` 出现），走查者第一眼没扫到。
- 过 §1.5 评估：增强显著性有两条路——(a) 在编辑器选中态浮条（B/I/… 那条，已有生成图片/生成视频图标）里补「拆成镜头」入口；(b) 增强现有按钮视觉。(a) 涉「选中浮条」这条 L2 情境栏的信息架构与布局取舍（那条浮条的图标语义、宽度、与 AI 面板入口的去重关系），(b) 改视觉需样张 + 拍板。**两者都超出「小修」范畴、涉布局/视觉取舍**——按任务约定，本 PR 不动，方案写在此处与最终报告，交用户定夺。
- 推荐方向（供拍板）：倾向 (a)，因为选中文字那一刻用户的注意力就在编辑器浮条上，「拆成镜头」和「生成图片/视频」同属「对选中内容做什么」，同家同词汇；但需先出样张确认浮条不过载（§1.5.1 预算）。

---

## P2 扫描结果（服务端 message 直拼进用户可见文案）

| 位置 | 现状 | 处置 |
|---|---|---|
| `CreationAiPanel.tsx:224` | `planFailed:{{message}}` 直拼 error.message | 本条修：错误已 code 化 + 错误卡人话化（走 classifyError） |
| `StoryboardPlanEditor.tsx:175` | `alertDialog` message 直贴 error.message | 收口：改经 `classifyGenerationError(...).reason`（落画布失败也人话化） |
| `generationCommon.callFailed:{{message}}` | 生成区 Agent 执行失败模板 | 评估：若走 AssistantErrorCard 则已人话化；仅保留为兜底模板，不新增直拼入口 |

（棘轮化留档：这类「拼 error.message 进 toast/卡」难 grep 精确判定，暂不设硬门；已在本轮把可达入口收口到 classifyError 单一真相源。）

---

## 验收门

改动后：`pnpm build` + 亲跑新增/改的走查（真退出码，不管道接 test）+ 截图 Read 亲眼看。全门链过（filesize/tokens/i18n/heavy-path/test-waits/walkthroughs/lint/typecheck/test/build）再 push、开 PR。

## 不动项汇总

- 清单打勾/TTL/dismiss 生命周期、win32 挂载分流（F4）。
- `filterUsableAssistantTextModels` 判据本身、`hasApiKey` DTO 字段语义（F2/F6，影响面过大）。
- F3 显著性增强（超小修，交拍板）。
- 任何模型接入 / 生成管线 / MCP 侧逻辑。

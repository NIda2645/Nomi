# 模型类型猜错后「用不了、也无从发现」——根因与修法

> 2026-08-11。对应主诉「接入了模型但用不了」（issue #4/#8/#9/#19/#23/#42/#62 同源）的最主要剩余根因。
> 样张已拍板（5 屏 · 用户 2026-08-11 确认：五屏全做 / 3D 正确登记但明标跑不了 / 设置页要能力摘要）。

## 1. 病是什么

接入中转时，模型类型是**按 id 关键词猜**的（`electron/catalog/modelKindHeuristic.ts`，猜不中默认 `text`）。
该文件注释自己写明「判断是启发式，必然有猜错的，所以 UI 给用户一个下拉随手改」——**但那个下拉只活在
接入向导提交前**，落库之后全 App 没有任何地方能改它（已核实：`ModelEnableEditor` / `OnboardingDrawer` /
设置页都没有 kind 编辑控件）。

于是「猜错」= 永久错，且**不可发现**。

## 2. 用户实际看到什么（追完四条派发路径后更正了原始判断）

每一层都按 kind 过滤，所以猜错后模型不是「报错」，而是**消失**：

| 层 | 位置 | 行为 |
|---|---|---|
| 下拉选项 | `src/config/modelCatalogCache.ts:116` | `listWorkbenchModelCatalogModels({ kind, enabled: true })` |
| 运行前解析 | `src/workbench/generationCanvas/runner/catalogTaskResolve.ts:144` | 同样按 kind 拉候选 |
| 最终选模型 | `electron/catalog/types.ts:415` | `selectExecutableModel` 的 `(!kind \|\| m.kind === kind)` |

**主症状（绝大多数用户）**：图像节点的模型位显示 `没有可用图像模型`
（`src/config/modelCatalogStatus.ts:62`，i18n `runtime.modelCatalog.noKind`）。模型明明接进来了、
明明启用着，却不在列表里，且没有一个字解释为什么。这正是「接入了模型但用不了」的原话来源。

**次症状（旧项目 / MCP `nomi_generate` / 批跑）**：这些路绕过下拉、直接按存下来的 modelKey 派发，
撞 `findExecutableModel` → 抛 `Model is not enabled: X` → 归类 `model-config` → 错误卡说
「模型未配置 / 这个模型没配好，请去模型接入页设置」。

**这句话是假的**：模型是启用的。真相是「它被登记成了文本，而这里要图片」。

**设置页同时在撒谎**：`buildProviderHealthView`（`src/workbench/settings/settingsAutomationView.ts:40`）
只看 `enabled && hasApiKey` 就显示绿色「已连接」，完全不看下面有没有可用模型、更不看有哪几类。

## 3. 关键发现：光改 kind 是假修

`draftShapeForKind`（`electron/catalog/catalogCommit.ts:326`）在**接入时按 kind 决定调用通道**：

- `image` → `text_to_image` mapping + `image_edit`
- `video` → `text_to_video` + `image_to_video` + 轮询 query + statusMapping
- `audio` → `text_to_audio`
- `text` → **刻意不建任何 mapping**（chat 走 AI SDK 直连）

所以一个被误判成文本的图像模型，catalog 里是**两个洞**：kind 错 + 通道根本没建。
只翻 kind 标签，下一步就撞 `selectTaskMapping` 返回 null，换一个看不懂的错继续失败。

→ **「改类型」必须是一个领域操作**：改 kind + 按新 kind 重建通道，一个事务。
→ 通道生成**复用 `draftShapeForKind`**（唯一真相源），不另写一份 wire 模板（P1 无并行版）。

### 3.1 谁能改（derived，非 allowlist）

判据：`model.onboarding?.addedVia === "manual"`。

理由链：`guessModelKind` 只在手动/中转拉取路被调用（`onboardingIpc.ts:127,168`、
`catalogCommit.ts:460`），而这条路committed 的模型正是 `addedVia:"manual"`（`catalogCommit.ts:500`）
且其通道正是 `draftShapeForKind` 生成的。所以「会猜错的那批」与「能用 draftShapeForKind 重建的那批」
是同一批。内置种子（kie/apimart/comfyui/runninghub…）与 agent 路（按文档证据建 mapping）都不在内，
对它们重建通道会把手写/文档推导的 mapping 换成通用模板 = 破坏。

### 3.2 只增不删

retype 只 upsert 目标 kind 的 mapping，**从不删旧 mapping**。因为 generic mapping 是
`(vendorKey, taskKind)` 级、同 vendor 的其它模型共享——删了会连坐。重复 upsert 幂等。

## 4. 3D 的诚实边界

`newapiTransportFor` 只有 image/video/audio 三种（`electron/catalog/newapiTransport.ts:283`），
**中转没有通用 3D 通道**。所以：

- `model3d` 进 `GuessableModelKind`、进向导类型选项、进 3D 桶 → 不再污染文本下拉、不再被当聊天模型
  塞进 `/chat/completions`。
- 但接入向导明着标「中转 3D 暂无通道，接进来跑不了」（D4 缺口明标），**不假装能用**。
- 内置渠道（RunningHub 混元/HiTem/Meshy）的 3D 不受影响，本来就有手写 mapping。

## 5. 改动清单

### 5.1 electron（领域 / 运行时）

| 文件 | 改动 |
|---|---|
| `catalog/modelKindHeuristic.ts` | `GuessableModelKind` += `model3d`；加 `MODEL3D_PATTERNS`，判定序放 video 之前 |
| `catalog/executableModel.ts` | `findExecutableModel` 三分：不存在=retired / 存在但停用=not enabled / **存在且启用但 kind 不符=新签名带 registered+requested** |
| `catalog/catalogCommit.ts` | 导出 `draftShapeForKind`；kind 联合类型 += `model3d`（无通道，返回空 shape） |
| `catalog/modelRetype.ts`（新） | 领域操作：改 kind + 按新 kind 重建 mapping，单事务；守卫 `addedVia==="manual"` |
| `main.ts` / `preload.ts` | 注册 `nomi:model-catalog:model:retype` |

### 5.2 renderer（分类 / 文案 / UI）

| 文件 | 改动 |
|---|---|
| `observability/narrate.ts` | 新 kind `model-kind-mismatch`、新 action `fix-model-kind`；`narrateGenerationError` 支持插值参数 |
| `observability/classifyError.ts` | 新检测器（专用签名，最先判，与 model-retired 同层）；解析 registered/requested 喂给文案；抑制 providerMessage（这是我们自己的信号，不是服务商原话） |
| `i18n/locales/generationCommon.ts` | 新错误文案 zh + en |
| `generationCanvas/nodes/NodeErrorReport.tsx` | `fix-model-kind` handler：retype + 重试；不可 retype 时按既有机制自动降级为 `open-model-access` |
| `ai/AssistantErrorCard.tsx` | 同步新动作 |
| `ui/onboarding/ModelEnableEditor.tsx` | 每行加类型 chip（常驻可见 = 补上一直缺失的「它被登记成什么」）+ 改类型菜单 |
| `ui/onboarding/OnboardingDrawer.tsx` | 诊断横幅：某 kind 为 0 且存在其它 kind 的已启用模型时说明原委；接 retype |
| `ui/onboarding/ModelPickerScreen.tsx` | 每行显示猜到的类型、可就地改；3D 桶 |
| `ui/onboarding/OnboardingWizard.tsx` | `ModelKind` += `model3d`；**删掉强制 coerce 成 text**（`:195`） |
| `desktop/onboardingBridgeTypes.ts` | `manualCommit` kind += `model3d` |
| `workbench/settings/settingsAutomationView.ts` | 健康视图改模型级口径：新增 `no-models` 态 + 每家能力摘要（按 kind 计数）；未加载完不降级（防闪烁） |
| `workbench/settings/AiModelsSection.tsx` | 渲染能力摘要行 |
| `i18n/locales/settings.ts` / `onboardingProviders.ts` | 对应文案 |

### 5.3 不动项

- 不碰 `selectExecutableModel` 的 kind 过滤语义（严格过滤是对的，问题在猜错与不可纠正）。
- 不碰节点模型下拉的 kind 过滤。
- 不碰内置种子 vendor 的任何 mapping。
- 不改 `guessModelKind` 既有四类的关键词表（只加 3D 桶）。

## 6. 回滚

按文件分组可独立回滚；`modelRetype.ts` 是新增文件，删掉它 + 撤 IPC 注册即回到今天行为。
catalog 数据结构零变更（kind/mapping 都是既有字段），无迁移、无版本 bump。

## 7. 验收门

1. 五门全过：`pnpm run gates`。
2. 单测：
   - `findExecutableModel` 三分（kind 不符 ≠ 停用 ≠ 退役）。
   - `classifyGenerationError` 认得新签名并抽出两个 kind。
   - retype 守卫（内置/agent 路拒绝）+ 幂等 + 只增不删 mapping。
   - `guessModelKind("hunyuan3d-2") === "model3d"`，且不误伤既有四类。
   - 健康视图：无可用模型不显示「已连接」；未加载完不降级。
3. R13 真机走查（截图人眼判断）：抽屉横幅 + 改类型 + 设置页能力摘要。
4. R16 真实用户任务闭环：「接了个中转，想生图，但图像模型被猜成文本」——从卡住到生成成功，
   全程不看源码、不改配置文件。

## 8. 验收结果（2026-08-11 实跑）

`tests/ux/model-kind-misguess.walk.mjs`（零额度）**17/17 通过**，六段走完整闭环：
设置页能力摘要 →「没有可用图片模型」→ 抽屉诊断横幅 → 就地改类型 → 通道真的重建 →
模型回到图像下拉 → 错误卡（旧项目/批跑那条路）说真话 + 一键改对。

`taskKinds: ["image_edit","text_to_image"]` 是关键取证：**通道确实建出来了**，
不是只翻了个标签。

### 走查抓到、门岗抓不到的一处（P3 的活教材）

错误卡动作排在窄节点上被压得**从词中间断字**——「换个模/型」「复制详/情」。
五门全绿、几何断言（不溢出/不越界）也全绿，因为它既没溢出也没越界，**只是难看得像坏了**。
只有人眼看截图才发现。修法沿用 `AssistantErrorCard` 已有范式：整行 `flex-wrap` + 每颗
`shrink-0 whitespace-nowrap`（窄处整颗换行，不把字劈两半），并给走查补了一条「按钮高度
超过 1.8 倍行高即判折行」的断言，让这类以后能被自动抓住。

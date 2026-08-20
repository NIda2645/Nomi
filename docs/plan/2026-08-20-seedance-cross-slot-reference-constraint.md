# Seedance 参考槽的跨槽约束：证伪「合计 ≤12」，改钉「音频需伴随」

日期：2026-08-20 · 分支：`claude/magical-tesla-5a9aae`

## 0. 缘起与结论倒置

任务原本是「Seedance 2.0 缺一条官方约束：所有模态参考文件合计不得超过 12 个」，据 fal 模型页
`https://fal.ai/models/bytedance/seedance-2.0/reference-to-video` 的原文
`"Total files across all modalities must not exceed 12."`。

按任务自带的判据（`seedance25Contract.test.ts` 头部注释：**三家一致才算模型级能力，才该钉在共享档案上**）
逐项核实三条我们真正在用的渠道，结论是 **证伪**：

| 来源 | Seedance 2.0 跨模态合计上限 | 原文 |
|---|---|---|
| **火山方舟**（字节自家平台，模型的一手出处） | **15**（9图+3视频+3音频） | 「参考素材数量上限 \| Seedance 2.0 \| **15（9张图+3个视频+3个音频）**」 |
| **APIMart** | 无此条 | 全文只分别写 9/3/3，无任何跨模态合计条款 |
| **即梦 Dreamina** | 无公开 API 文档 | — |
| fal（**我们没有这条渠道**） | 12 | `"Total files across all modalities must not exceed 12."` |

出处：
- 火山方舟 <https://docs.volcengine.com/docs/82379/2607688?lang=zh>（能力概述表，同表并列 2.0/fast/mini/2.5）
- 火山方舟 <https://docs.volcengine.com/docs/82379/2298881?lang=zh>（使用限制：1~9 张图 / 最多 3 个参考视频 / 最多 3 段参考音频）
- 火山方舟 <https://docs.volcengine.com/docs/82379/2291680?lang=zh>（Seedance 2.0 系列教程：图片 0~9、视频 0~3、音频 0~3）
- APIMart <https://docs.apimart.ai/en/api-reference/videos/seedance-2-0/generation.md>

**两点判断：**

1. 字节自己写的 15 **恰好等于 9+3+3**，即合计上限与各槽上限之和相等 → 这条约束**永不咬合**，
   加了也拦不住任何东西。2.5 同理：方舟写 50 = 30+10+10，fal 也写 50。**两代都不需要「合计上限」这个概念。**
2. `electron/catalog/` 的 vendor 只有 agnes / apimart / dreamina / modelscope / volcengine，**没有 fal**。
   那个 12 打不到任何一个 Nomi 用户身上。

若照 12 钉下去，是重演 2026-08-12 的错误（见 `seedance25Contract.test.ts` 头部）：用户放满 9 图 + 3 视频后，
方舟文档白纸黑字说还能加 3 段音频，我们却在第 12 个就拦死 —— **能力是模型有的，又被我们的档案掐窄。**

→ **不加合计上限。** 但同一次核实挖到一条真的、三家一致、且当前完全没拦的跨槽约束（下节）。

## 1. 真正要修的：Seedance 2.0 的参考音频不能单独用

三家一致 = 模型级契约：

| 来源 | 原文 |
|---|---|
| 火山方舟 | 「您可任意组合以下模态内容，**注意不支持"文本+音频"、"纯音频" 输入**」 |
| APIMart | `"Must be used together with reference images or reference videos"` |
| fal | `"requires at least one image or video"` |

**而 Seedance 2.5 明确解除了它**：
- 火山方舟：「Seedance 2.5 **新增支持纯音频参考生成视频**，无需搭配图片或视频素材。」
- APIMart：`"Reference audio: ≤3, total ≤15s → ≤10, total ≤30s; audio-only OK"`

（fal 的 2.5 页仍写 `"If audio is provided, at least one reference image or video is required."`，
与字节自家 + APIMart 两家相左 —— 判定 fal 该句为陈旧拷贝，不采信。**一手出处优先于中转转述**。）

一个干净的、按模型分化的能力差异 → 正该由档案声明表达，而不是写死在某处 if。

### 当前缺口（实测，非推断）

`canRunGenerationNode`（`src/workbench/generationCanvas/runner/generationRunController.ts:601`）
判「视频节点可否生成」只问 `hasArchetypeArrayReferences` = **任一数组槽非空**。
用户只往 omni 放一段音频 → 判定可生成 → 按钮亮 → 发出去 → 服务商拒。
全仓 grep `纯音频 / audioOnly / requiresCompanion` 无任何相关逻辑。

这正是原任务描述的病（UI 全程放行、到服务商才被拒），只是触发条件不是 15 个文件，而是 1 段音频。

## 2. 设计

### 2.1 档案层：通用的跨槽依赖声明（不为单个模型开特例，P4）

`src/config/modelArchetypes/types.ts` 的 `ArchetypeReferenceSlot` 新增：

```ts
/**
 * 跨槽依赖：本槽有值时，这些 kind 的槽**至少一个**也必须有值，否则该模型不受理。
 * 缺省 = 无依赖，可单独使用。
 */
requiresAnyOf?: ArchetypeReferenceSlotKind[]
```

- Seedance 2.0 **四**档案的 `audio_ref` 槽声明 `requiresAnyOf: ['image_ref', 'video_ref']`。
  ⚠️ 任务描述里只列了 apimart / volcengine / dreamina 三个；**实扫 `kind: "audio_ref"` 才发现
  还有 kie 的 `seedance.ts:78`**，同样是 Seedance 2.0、同样 9/3/3、同样没声明。
  同一个模型换个中转不会改变「不收纯音频」这件事，四条都得带。
  这就是 P2 通用性判定要求的「**全仓实扫、给 file:line，扫不猜**」——照着记忆里的清单改就会漏这条。
- Seedance 2.5 **不声明**（文档已解除），并在注释里写明「2.5 解除了 2.0 的此限制」+ 出处，
  防止后人"对齐"时手贱补回来。

为什么是 `requiresAnyOf`（任一）而不是 `requiresAll`：三家原文都是「图片**或**视频」，是析取。

### 2.2 拦在哪：**不拦插入，拦生成** —— 且说清为什么

原任务写「要在放进去的那一刻就拦住」。对**容量**类约束（槽满）这是对的，因为后续操作救不回来；
对**依赖**类约束这是错的：用户先拖音频、再拖图片是完全合理的顺序，在第一步拦死 = 惩罚操作顺序（违反 D1）。

所以：
- **插入**：放行。音频合法地在那儿，只是还不能单独跑。
- **生成**：`canRunGenerationNode` 判 false，生成钮置灰，composer 的 title 说人话讲**具体**原因。

考虑过、**没做**的一项：在音频槽下方常驻一行「需搭配至少一张图或一个视频」。
按 R2「每条信息问『有行动价值吗』」——用户还没放音频时这句没有任何行动价值，
只是给密度优先的 composer 添一行常驻噪音；真正需要它的那一刻（音频已入、伴随缺失），
置灰原因已经把话说清楚了。故不加。

### 2.3 「为什么不能生成」的单一真相源（顺带治根，P2）

现状是两条真相源：`canRunGenerationNode` 只返回 `boolean`，
composer（`NodeGenerationComposer.tsx:683`）再**按 node.kind + acceptsDrop 重猜**一遍原因文案。
新约束一旦加进来，猜出的文案必然是错的（会说「需要先添加参考素材」，可用户明明加了音频）。

修法：新增纯函数 `unmetReferenceDependency(meta, archetype)` → 返回未满足的依赖（或 null），
`canRunGenerationNode` 与 composer 的 `disabledReason` **同吃这一个**，不再各猜各的。
不改 `canRunGenerationNode` 的签名（6 处调用者不动），只加一个并列导出。

### 2.4 文案（R15：走 i18n，zh-CN + en）

- 槽内常驻说明：`需搭配至少一张图或一个视频`
- 生成钮置灰 title：`参考音频不能单独使用，请再加一张图或一个视频`

## 3. 契约测试

新增 `src/config/modelArchetypes/seedance20Contract.test.ts`，仿 `seedance25Contract.test.ts`，钉住：

1. 三个 2.0 档案的 omni 槽上限 = 9/3/3（三家文档一致）。
2. 三个 2.0 档案的 `audio_ref.requiresAnyOf` 含 image_ref 与 video_ref。
3. **2.5 的 audio_ref 不得声明 requiresAnyOf**（负向钉子：文档已解除，别"对齐"回来）。
4. **两代均不得出现「合计上限」字段**（负向钉子：把本次证伪的结论钉死，
   附 fal=12 / 方舟=15 的出处，防止后人看到 fal 页面又来加一遍）。

文件头注释按 2.5 的格式，逐条写清出处 URL + 原文 + 核实日期。

## 4. 顺带修（同轮收掉）

`sources.url` 与测试头注释里引的 `https://docs.apimart.ai/cn/api-reference/videos/doubao-seedance-2-5`
**已 404**（文档搬到 `/en/api-reference/videos/seedance-2-5/generation`）。
涉及 `seedance25.ts:72`、`seedance25Contract.test.ts:17`、`seedance25ApimartContract.test.ts:2`。
改成现行 URL 并更新 `checkedAt` 为 2026-08-20。

（`check:archetype-sources` 只查字段在不在，查不到 URL 死没死 —— 如实记在此，不在本轮扩门岗范围。）

## 5. 不动项

- 不加任何形式的「跨模态合计上限」字段（第 0 节已证伪；无咬合场景 = 死代码）。
- 不动 9/3/3 与 30/10/10 这六个数（本次复核与文档一致）。
- 不动 2.5 的 resolution 取值。核实中曾疑其被掐窄，但 APIMart 文档里
  `Resolution: 480p, 720p, 1080p` 一处指的是**输入参考视频**的分辨率，与输出清晰度是两件事；
  输出侧「2.5 无 4k」的表述需要方舟 + kie 再逐项对账才能下结论，**不在本轮照抄**。
- 不改 `canRunGenerationNode` 签名（避免 6 处调用点连锁改动）。

## 6. 验收门（已全部完成）

1. ✅ `pnpm run gates` 全过。
2. ✅ 新契约测试先红后绿：3 条 `requiresAnyOf` 断言红 → 加声明 → 23 条全绿
   （4 条 2.0 渠道 × 上限/依赖 + 2 条 2.5 渠道的负向钉子 + 合计上限证伪钉子）。
3. ✅ `referenceDependency.test.ts` 12 条单测（含「切模式后残留值不得误判」「连线来源也算满足」）。
4. ✅ R13 真机走查 `tests/ux/reference-companion-required.walk.mjs`，8 条断言全过，零额度。

### 走查过程中的两处修正（记下来，不然下次还踩）

- **选择器猜错**：音频 tile **没有** `aria-label="参考音频1"`——只有 characterIndexed 的角色图 tile
  才带那个属性（为了拖拽重排）。存在性锚点得用它的移除钮 `button[aria-label="移除参考音频1"]`。
  照角色图的写法猜必然找不到；探真实 DOM 才知道。
- **肉眼差点结错账**：`01-omni-empty.png` 里我一度把置灰的生成钮看成可点的
  （800px 缩略图上两种状态几乎同色）。改成机器断言「空 omni → 置灰 + 泛化文案」才定住。
  **凡是缩略图上分辨不出来的状态，别用"我看着像"结账。**

### 已知限制（诚实标出，D4）

置灰原因只挂在 `title` 上，用户得**悬停才看得到**。这与现有的 `videoReferenceRequired` /
`imageReferenceRequired` 完全同构（没有引入更差的模式），但「为什么不能生成」整体的可发现性偏弱：
用户看到一个死按钮，未必想得到去悬停。要改成常驻可见需要动 composer 的信息层级 → 属于 R8
（先出样张 + 用户拍板）的范围，本轮不擅自动。

## 7. 回滚

单 commit，`git revert` 即可。档案新增字段为可选，旧项目 meta 不受影响；
未声明 `requiresAnyOf` 的所有其它档案行为完全不变。

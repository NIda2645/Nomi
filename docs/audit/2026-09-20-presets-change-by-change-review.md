# 预设恢复 PR #824 独立逐段审计

审计者：aspect_review（未实施 #824）。日期：2026-09-20。

> 后续复核补记：冻结版本 8b6806df8 的 document capture 仍会抢走内部输入控件自己处理的 Escape；已由第二审阅者复现，交由本审阅者修复。下文关于该冻结版本“无阻断项”的结论不作为最终交付结论；最终裁决见总审计报告。

## 身份、范围、结论

- 精确比较：`b06270627c099394881ca2f8c546d7c7facc5c3c^1..b06270627c099394881ca2f8c546d7c7facc5c3c`，包含 `eabe66ef7c71f2990adc9a7b980adc80c94cd693`、`75d139eebfb56e745a934534df7bb6f9e6e80935`。
- 当前被审状态：`86d1ea2e3`；后续相关生产修正为 `8b6806df82194b3a69a89c46f9ca72a5a6b5fafd` 的 AnchoredPopover Escape 处理。未把其他图片比例/镜号改动混为此 PR。
- 按 code-review 技能审了所有生产文件 diff，以及所有新增/修改测试、调用方、主进程真实数据来源、选中写入路径。
- **未发现当前状态需要阻断合入的新缺陷。** #824 恢复普通公共提示词，保留效果和个人提示词；原节点写入逻辑未改。共享组件提取保留 Skill 宿主选中/管理语义。#824 本身曾留下 Escape 冒泡问题，当前后续修正有真实 React Flow + 浏览器证据，不能把“#824 当时已完全无问题”作为结论。
- 未改仓库生产代码，未 commit/push。本报告是代码与定向动态审计，不能替代当前完整 Electron 旅程/合并 SHA CI 验证。

## 每处生产 diff 的旧行为、理由、正确性

| 文件/修改段 | 旧行为 | 为什么修改 | 新行为判定及证据 |
|---|---|---|---|
| `src/i18n/locales/generationCommon.ts`，zh/en `composerBarV1.effects` 两处 | hover/无障碍名叫“效果与提示词库” | 恢复后该入口既选效果又选完整提示词，用户称其“预设” | “提示词预设 / Prompt presets”仅改变显示名，key 与消费者不变，不影响存储或生成。与用户任务相符。 |
| `src/i18n/locales/libraries.ts`，zh/en `prompt.publicLibrary` 两处 | 没有节点选择器专用“公共库”分段标签 | 需要区分效果、普通公共条目、个人条目 | 只添加成对本地化字段，不更改既有库来源 key。运行时 section 使用同轮 t 结果匹配。 |
| `AgentPanelV4Composer.tsx` imports + `V4CommandRow` 类型 | 面板自有 row shape，直接引入分组实现 | 抽出用户要求复用的 Skill 选择壳，避免节点复制整个面板 | 类型 alias 与旧字段逐一相等：group/id/name/command/desc/section/cover/preview/selected 全保留；没有执行器/权限字段被删除。 |
| 同文件 `V4SkillPopover` JSX 整段 | 本地 category、搜索框、分组、媒体 tooltip、管理 footer | 两处选择体验应一致 | 通过 LibraryPicker 接回相同 rows/categories/activeCategory/query/onQueryChange/onSelectCategory/onSelect；保留 data-v4-popover、data-v4-command、data-skill-hover、搜索锚点；footer 仍为原 V4Row 和 onManage。`ProjectAgentResidentShell.tsx:416` 的实际选择回调不动：Skill 清除提示词并切换 activeSkill，提示词设置 selectedLibraryPrompt，不调用节点写入。 |
| `promptLibraryApi.ts:71` fetchPromptLibrary | ok:false 或缺 prompts 被伪装成成功空库 | 新入口需要区分空搜索、加载和失败重试 | 现在抛原 error 或本地化 fallback。所有实际消费者已核查：usePromptLibrary 有 catch 并保留缓存；没有新增未捕获 Promise。属于有意纠正错误语义，不能声称完全保持旧错误行为。 |
| `promptLibraryApi.ts:85` fetchUserPrompts | mapUserPrompts 吞失败并返回 [] | 同上，失败不能看起来像个人条目被删除 | useUserPrompts 有 catch；另一个消费者 assetSurfaceMigration 的 migrateLegacyPromptCards 也捕获 listExistingPrompts 错误并停止迁移，不错误写完成标记。读接口不触及 userAdd/userUpdate/userDelete 的持久化。 |
| `NodeEffectChips.tsx:1` imports | IconSparkles + WorkbenchMenu + 本地分组菜单 | 用户要求 icon 区分、搜索/预览体验与 Skill 一致 | 改为已有 IconFileText、AnchoredPopover、LibraryPicker、filterPrompts/promptDisplayTitle；没有引入新 UI 框架，旧菜单构建与其 expanded/point 状态实际删除。 |
| `NodeEffectChips.tsx:21–36` 数据投影 | 公共库只取 curation.kind=effect，个人库按 promptType | `981858b719` 的效果化改造把推荐集合当完整可选库，普通公共项消失 | 新 compatible 集合包括公共/个人，分类和搜索不参与实际存储。库 id 来源也核过：user-UUID、source.id-number、builtin directoryName 分别生成，正常源无同 id 选择歧义。来源库对象仍为唯一正文来源。 |
| `NodeEffectChips.tsx:38–44` 推荐行 | 四个 STARTER_EFFECTS，空描述时显示，旧 title locale 内联 | 推荐应与完整可选集合分离，标题使用同一个显示边界 | 四个 id、empty 条件、disabled 条件与 onSelect 路径不变；只是从 compatible 中取 effect，标题交 promptDisplayTitle。推荐不再限制普通公共可选项。 |
| `NodeEffectChips.tsx:45–52` 图标和开关 | Sparkles，menu role，坐标式打开 | FileText 与优化区分；富输入框使用 dialog 内容 | 保留 16px/stroke2 和既有 NodePromptToolIconButton 小号档；aria-expanded / aria-haspopup 与真实弹层一致。打开清 query 并 user.reload，解决已挂载 hook 的个人库缓存看不到新条目；刷新未放 render/effect 依赖，不制造循环请求。 |
| `NodeEffectChips.tsx:53–67` 选择器宿主 | 无搜索文字菜单，点击调用 onSelect | 完整库需要搜索、分类、预览、状态 | open/enabled/!disabled 才挂载。选中按 row.id 找原始 LibraryPrompt，回调后关闭；不是把 desc/标题当 prompt。loading/error/retry/empty 独立，错误不会冒充 noMatch。节点原锁定检查在 applyPromptPickerItem 又拦一次。 |
| `nodePromptPresets.ts` 全文件 | 没有共享完整兼容集合，宿主局部 effect 筛选 | 兼容性由数据声明负责，推荐不应决定能力全集 | image/video 两种普通媒介按 promptType，curation 按 appliesTo。实际 `electron/promptLibrary/curatedPrompts.ts:10` 只把 appliesTo 首个 image/video 投影为 promptType，故仅靠 promptType 会错误排除双适用效果；修正与真实 producer 匹配。非 image/video 返回空与当前提示词库能力边界一致。 |
| `LibraryPicker.tsx:8–42` row/type/local category | 相同结构和状态在 V4SkillPopover 内 | 提取可复用内容组件而不搬 Agent 业务 | row shape 相同；controlled activeCategory 优先、本地选择作为缺省，与旧实现一致；搜索由宿主过滤，不偷偷拥有第二份库/执行状态。 |
| `LibraryPicker.tsx:43–58` 外壳、搜索、分类、状态 | 330px、分类 overflow-hidden、无通用状态插槽 | 小视口可达、节点加载/错误/空态 | 添加 max-width 和横向滚动；按钮 V4Row 展开后的 flex 类保持，增加 aria-pressed；空态只在 visibleRows 为零。Agent 不传状态时与原来相同。 |
| `LibraryPicker.tsx:59–82` 分组、行、预览 | 相同 LibraryGroup、媒体和 tooltip；搜索仍可能折叠五条以上命中 | 搜索后应立即看到命中项 | 查询非空时 collapsed=false，key 随“有无 query”重挂 group，删除 query 后恢复通常折叠规则；这是明确改进，不是完全行为等价。row.onSelect、selected 背景、command、预览 play、完整正文均保留；command 空串不再输出无意义空 code。 |
| `LibraryPicker.tsx:84` footer | 管理入口写死在 V4SkillPopover | 节点无需凭空拥有 Agent 管理操作 | footer 由宿主提供，节点不传；Agent 原入口不丢。 |
| `SkillMedia.tsx` props + placeholder 两段 | 无媒体/损坏统一显示 Package | 提示词应显示 FileText，而 Skill 保留原语义 | fallback 可选且使用 nullish fallback；所有未传入宿主仍 IconPackage。url 优先级、broken reset、视频 muted/loop/autoplay/controls、图片加载/错误处理都未改变。 |

## 选中提示词后的数据安全核查

`NodeGenerationComposer.tsx:251` 的 applyPromptPickerItem 在 #824 中没有 diff，实际读取了该函数及上下游：

1. locked 节点立即返回。
2. next = 原正文 + 换行 + item.prompt；不会用 name/desc 替换用户全文。
3. 同步编辑器和 updateNode(node.id,{prompt:next})，既有 mention 序列化处理保留。
4. 撤销闭包恢复 before，并同步编辑器。
5. item.referenceImages 仍走已有 mode promote + addAssetUrlToNode 去重/上限边界。
6. 调用原 persistActiveWorkbenchProjectNow，#824 不创建库副本或改持久化格式。

限制要说清：既有“撤销”只回退提示词正文，不回退一起附加的参考图/模式；这段早于 #824 且未修改。不能把此次“追加/撤销通过”的证据扩大成整次预设应用的完整事务撤销。未观察到此次提取让行为变差。

## Escape 后续修正审计

`8b6806df8` 对 `src/design/AnchoredPopover.tsx:126` 的改动：

- 旧 document bubble keydown 在 React Portal 事件冒泡到 React Flow 节点之后才执行；节点先处理 Escape 取消选择，从而卸载 composer。
- 新 document capture 在没有更上层 popup/dialog 时 preventDefault + stopPropagation + onClose，监听注册/清理的 capture=true 成对。
- 原 IME/defaultPrevented 判据保留；hasOpenPopupAbove 保留；增加 hasOpenDialogAbove 时以自身 role=dialog 为基准，避免自己的 dialog 被误判成上层。
- mousedown 外点行为未改；节点 close 仍恢复 trigger focus。
- 在当前树真实重跑 `node --test --test-name-pattern='AnchoredPopover owns Escape' tests/ux/_feel.browser.mjs`：四类焦点（自然、trigger、菜单按钮、input）、嵌套 listbox/dialog、IME、已 prevented、外点共九子例通过（node:test 统计连父项共10）。使用真实 React Flow/AnchoredPopover/Chromium，无“mock 掉节点 deselect”的假绿。
- 该测试是组件+React Flow 集成，不是整个 Electron；未冒充当前版本完整桌面走查。

## 测试审计、现场复核与证据边界

### 修改测试是否削弱

- 唯一替换既有断言的 `promptLibraryApi.test.ts`：resolves([]) 改 rejects。与生产明确错误语义变更相匹配，保留 ok:false、malformed public、user failure 三种输入，不是为了迁就 bug 删除断言。
- `nodePromptPresets.test.ts`：公共图片/视频、个人类型、双适用 curated、audio 排除和搜索；比较真实 id 列表，能捕获原 effect-only 过滤。没有 mock compatible 实现。
- `LibraryPicker.test.ts`：SSR 断言 DOM 标签/锚点/empty/fallback，确实仅覆盖结构，不能独自证明 click、focus、关闭或选择回调。
- Electron journey 使用 UI 创建项目/节点/个人提示词，不直接改 store：验证 public 追加、原正文保留、undo、个人刷新、图/视频排除、Agent 搜索预览引用、zh/en。媒体断言允许图片加载失败时显示明确 fallback，故不能仅凭 journey passed 声称所有远端素材都成功解码。
- journey 的 `expectAbsent` 搭配先前正向 probe，可证明选择器曾有效，不是空容器天然“没有结果”。
- 历史 journey.json 的通过是当时证据；后续 Linux Escape 失败证明它不是跨平台完整证明。当前已用更贴近事件根因的集成测试补上。

### 本轮实际重跑

- Vitest：nodePromptPresets、LibraryPicker、promptLibraryApi、assetSurfaceMigration 四文件 **19 测试通过**。调用命令还写了一个不存在的 AgentPanelV4Composer.test.tsx path，Vitest 实际仅选中四文件；不计作额外 Agent 单测。
- Chromium：上述 Escape **九子例通过**。
- 独立 `/tmp/nomi-preset-picker-audit.mjs` 装载真实 LibraryPicker、LibraryGroup、SkillMedia、Radix Tooltip；实点原生分组、category、aria-pressed、onSelect id、搜索展开、Enter 选择、空态、management footer，全部通过。为避免全 design barrel 的无关 app init，bundle 仅将 barrel import 指向其真实 tooltip.tsx 实现；没有替换其行为。纯组件脚本，不伪装完整应用。
- 临时脚本首次将全设计 barrel bundle 为 iife，因无关 import.meta 静态资源初始化无法挂载而超时；修正临时脚本构建入口后通过。该失败不归因于生产选择器，也没有为了它修改生产。
- 人眼打开并查看仓库存档 `after-personal-refresh-zh-light.png`、`after-agent-skill-shared-picker.png`：两处确实共享搜索/分类/缩略图/描述行形态，个人无媒体项 FileText，Agent 真媒体预览；这些是历史截图，不声称当前刚截。

## 已知边界与建议

1. 真实网络故障后点击 Retry 的 Electron 流程未在本次独立重跑；API 异常和 hook catch 路径已核查。不得宣称完整网络故障验收。
2. LibraryPicker 与旧 V4SkillPopover 一样以翻译后的分类文字作本地 category identity。通常打开设置会关弹层、重开初始化，不影响本次已验证旅程；若今后支持“弹层保持打开时直接切语言”，应把 id/label 分离。当前未确认用户可达回归，不能据此臆造 P1/P2 缺陷。
3. 节点从 Radix menu 转成富内容 dialog 后，不保留菜单专用上下箭头 roving focus；这是与现有 Skill 搜索选择交互对齐的语义变化。普通按钮 Tab/Enter/Space 和原生 summary 可用，独立实测 Enter 选择通过。不能说“所有键盘交互逐键等价”。
4. 本次没有新后端请求协议、身份验证、密钥或 HTML 执行面；prompt 始终作为字符串/React 文本，媒体仍经原 SkillMedia。未新增注入路径或持久化删除操作。

结论：#824 的恢复、共享呈现和错误态变更理由成立，当前生产行为与保留的宿主职责匹配；未发现需再改生产代码的确认问题。Escape 后续修正应与本次结果一并交付，不能遗漏。完整合并验收由父任务继续。

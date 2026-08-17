# 私有 fork 比对分诊：捞出我们还开着的 bug（2026-08-18）

来源：用户发来一份他人基于 Nomi 的私有改动包（`nomi-private.7z`）+ 一份《近期功能优化与改动汇总
2026-08-15》。诉求是「看是不是我们有问题没有被处理，以及他有哪些优化的地方，看要不要迭代进下一个版本」。

## 一、怎么定位到可比的基线

包里没有 `.git`，且是 Windows 机器打的包（混合 CRLF）。做法：

1. 对解包树逐文件 `git hash-object`，与我们各候选 commit 的 `git ls-tree` 比对。
   **首次只命中 206/2927——是 CRLF 造成的假阴性**；归一化行尾后升到 914，仍偏低。
2. 换成对真实 checkout 做 `diff -r --strip-trailing-cr`（排除二进制/产物），一次收敛：
   **69 改 + 43 增 + 1 删**。基线锁定 `42d58099`（2026-08-14）。

教训：跨平台比对**先归一化行尾**，且**别用 `tr -d '\r'` 去哈希二进制**——那会把 PNG/icns 打坏，
制造出「LICENSE 也改了」这种假差异（本轮踩过）。

## 二、分诊结论

对方 fork 自 08-14，我们主线此后独立推进过 ComfyUI 与模型网关。逐条三向比对（BASE / 他 / 我们）后：

| 类别 | 结果 |
|---|---|
| 他修的、**我们已修且更完整** | 空 media loader 权限错误（我们 `pruneEmptyMediaLoaders` 覆盖到音频 loader，还带 client_id/prompt_id 会话封装）；`params: []` 持久化；`paramKey` 规范化 |
| 他修的、**我们确实还开着** | 见下 7 条 |
| 他做的、**属产品/架构分歧** | H3/Qwen 三个专用 transformer（硬编码节点 ID + 违反 P4）→ 用户 2026-08-18 拍板**暂时不碰** |
| 他做的、**要但要重写** | 「默认生成模型」→ 用户拍板**要功能、按主线结构重写** |
| 文档**夸大**的部分 | 汇总里 7.1–7.5、7.7、7.9、7.10（Base URL 规范化、免鉴权、拉模型列表、供应商管理…）在他 fork 的文件集里**根本没动过**，多数早在 BASE 就有 |

### 微信投诉的真相（重要）

群里「改不了 api url」「要单独删除按钮」两条——**能力自 v0.16.1（2026-07-05）就在**，
`src/ui/onboarding/CustomVendorManage.tsx` 里改地址（铅笔）、删整家、换 key 齐全，v0.19/v0.20 都带着。
该文件第 5 行注释本就写着「本就现成，只是没在这张卡上露出来」。
**所以这不是功能缺失，是可发现性问题**——按 D1 单独立项解，不从他的 fork 抄代码。

## 三、本次范围（只做确认的 bug + 已拍板的功能）

### 已修（7 条，全部我逐条读代码复核过，非转述）

| # | 现象（用户体感） | 根因 | 落点 |
|---|---|---|---|
| 1 | 画布节点右键菜单**点了没反应** | capture 阶段无条件 `setContextNodeMenu(null)`；菜单豁免被 `if (!activeEdgeId) return` 挡在后面，**只保护了边菜单** | `canvasPointerGestureModel.ts` 新增 `isCanvasMenuTarget` 单一判据；`useCanvasViewportGestures.ts` 两处收起共用它 |
| 2 | 小数参数**打不进去**（百万像素/CFG/denoise） | 受控框逐键回写：`0.` 被 parse 成 `0` 冲掉小数点 | 新增 `controls/numericDraft.ts` + `ParameterTextInput` 草稿缓冲 |
| 3 | 参数**失去下界** | `min`/`max` 走「必须为正」的解析，0 与负数被丢 | `modelCatalogMeta.ts` 拆出 `asFiniteNumber`（挡空串） |
| 4 | 供应商没加载完/一家没配时**曝出全部模型** | `if (!enabledVendorKeys.size) return true` 把空集当放行 | `modelCatalogCache.ts` 删掉该逃生口 |
| 5 | **第二台 ComfyUI** 走错 archetype、吃云端 2min 硬超时 | 两处硬比字面量 `'comfyui-local'`；我们**自己早有** `isComfyuiVendorKey` 前缀判据且 onboarding 用了 10 多处 | `catalogTaskResolve.ts` / `catalogTaskActions.ts` 改用该判据 |
| 6 | `16:9 (宽屏)` 这类枚举**卡片不改尺寸** | 比例正则尾部锚死；且解析与规范化**各写了一份正则** | `aspectRatio.ts` 收敛成单一正则常量 + 允许可选后缀 |
| 7 | 测试在 Windows 必挂 | `mkdtempSync("/tmp/...")` 硬编码 | 改 `path.join(os.tmpdir(), …)` |

其中 **1、5、6 是同一种病**：判据写成字面量/只挂在一条路上，另一条同类路径漏掉。
按 P2 都改成了「单一判据 + 两处共用」，不是各打一个补丁。

### 连带的回归防护

修 #3 让 `min: 0` 得以保留，于是 `0–1` 区间开始进滑杆分支——而默认步长 1 只切得出两个端点，
滑杆等于废掉。故同时加 `hasUsableSliderStep`：**切不出两档以上就退回数字框**。
（对方 fork 的做法是把滑杆全砍，那是为他自己那套工作流做的产品决定，我们不跟。）

### 不动项

- H3/Qwen 三个专用 transformer 与其 i18n 豁免行——用户拍板暂不碰。
- 内置「本地 · 文生图」与 WAN 2.2 预设的删除——那是他的产品口味，我们主线有意保留。
- 他的 `AGENTS.md` 增补、`CHANGELOG` 部署产物哈希——与我们 CI 无关。
- 他在 `preload.ts` / `registerSettingsIpc.ts` / `settingsBridge.ts` 里是**替换掉 systemPrompts**
  而非新增，照搬会静默弄坏系统提示词功能。**这是重写而非移植的首要理由。**

## 四、验收门

- `pnpm run gates` 全过（filesize → tokens → i18n → lint → typecheck → test → build）。
- 单测钉住：菜单豁免选择器覆盖面、数字草稿真值表、滑杆步长可用性、参数边界 0/负数、比例标签。
- R13 真机走查：右键菜单点得动、小数输得进、0–1 参数不再是废滑杆——**截图自己亲眼看过**才算。

## 五、回滚

七处改动彼此独立，均为小范围替换，可单条 `git revert`。风险最高的是 #4（收紧模型曝光）——
若线上出现「选择器空了」，先查 `getEnabledVendorKeys` 是否在该时序已返回，而不是把逃生口加回来。

## 六、下一步（待办）

- 「默认生成模型」：先出设置面板样张给用户拍板（R8），再按主线结构实现，含启动竞态修复。
- 「改 Base URL / 删供应商找不到」的可发现性问题：单独立项。

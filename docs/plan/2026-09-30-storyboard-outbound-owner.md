# 分镜「一镜发出去什么」收成唯一出口（2026-09-30）

> 状态：✅ 已实施（PR #939）。根因合同：[`docs/fixes/2026-09-30-storyboard-outbound-owner.root-cause.json`](../fixes/2026-09-30-storyboard-outbound-owner.root-cause.json)。
> 结构评审：[`docs/audit/2026-09-30-storyboard-outbound-structure-review.md`](../audit/2026-09-30-storyboard-outbound-structure-review.md)。
> 检索报告：[`docs/research/2026-09-30-storyboard-outbound-owner/prior-art.md`](../research/2026-09-30-storyboard-outbound-owner/prior-art.md)。

## 问题

用户把某一镜提示词写成「一条巨龙盘在山顶」，生成出来的是人物（花钱错）。供应商收到的是「巨龙」加上两行用户看不见的字
（引用角色的身份特征、文本风格锚整段），还可能带着一张看不见的定妆卡当参考图。

## 用户拍板（09-30）

删掉自动追加。规则：**一镜发出去的 = 这一行写的提示词 + 这一行上看得见的参考图，别的什么都不加。**

## 先查别人

- Runway Gen-4 References：参考图由用户显式打 `@tag` 再在提示词里点名，不存在隐式追加。<https://help.runwayml.com/hc/en-us/articles/40042718905875-Creating-with-Gen-4-Image-References>
- Midjourney Omni Reference：参考是用户显式追加的 `--oref` / `--ow` 参数，写在提示词里。<https://docs.midjourney.com/hc/en-us/articles/36285124473997-Omni-Reference>
- Runway gen4-image API（Replicate 公开 schema）：提示词与参考图 / 参考标签是各自独立的显式字段，接口层没有隐式追加。<https://replicate.com/runwayml/gen4-image/api/schema>
- 我们仓库里已有的正解：`shot.referenceBindings` 经 `src/workbench/creation/storyboard/shotRow/shotReferenceSlots.ts:157` 投影进节点，行上参考列画的就是它；`anchorIds` 展开是并行的第二条路。
- 起草时把角色锚的真实图写进行上绑定已有：`src/workbench/generationCanvas/agent/storyboardAnchorPolicy.ts:64`（保留）。
- 结论：向生态靠拢（显式、可见、可取舍），删并行版；详见调研报告。

## 做什么

1. 删 `anchorPromptBits` 追加、`referenceOrderForShot`、按 `anchorIds` 连边 / 写 `referenceImageUrls`。
2. 唯一出口 `compileShotOutbound`（`electron/shared/storyboard/storyboardPromptCompiler.ts:117`）；所有入口与投影只从它取。
3. `production.materialize-storyboard` 落地后补投影行上的参考图。
4. 「参考图不会被使用」：只在行上真摆着参考图、当前模式用不上时说，逐张点名，模式名与下拉同源（中英）。
5. `@` 素材 = 往这一行参考列放一张；行不再等参考卡 / 等锁定；去掉失效引用拦截。
6. 老方案的 `anchorIds` 不再产生任何作用，不自动迁成文字。

## 不做

- 不新增 Agent 行为（让 Agent 把角色描述写进每镜提示词是可选后续）。
- 不动付费卡 / 制作流程派发（付费卡 lane 持有）。

## 回滚

单个功能提交，`git revert` 即回到追加 + 自动连图（会重新出现「巨龙变人物」）。

## 验收

- 单元：`src/workbench/creation/storyboard/exec/shotOutbound.parity.test.ts`（六个入口逐字节相同；往编译里追加一行字的变异 8 条变红）。
- 真机：走查剧本 pb07（四个入口 × 新装机 / 用过的项目 × 中 / 英）与 pb91（真付费 1 行，龙不是人）；监视器规则 `sent-prompt-unseen-addition`。

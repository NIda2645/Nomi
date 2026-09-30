# 「先查别人」调研报告：分镜一行「发出去什么」——角色 / 风格锚要不要自动拼进提示词（2026-09-30）

> R5② 的必交物。对应方案：[`docs/plan/2026-09-30-storyboard-outbound-owner.md`](../../plan/2026-09-30-storyboard-outbound-owner.md)。
> 触发：用户把某一镜提示词写成「巨龙」，出来的是人物（花钱错）。用户 09-30 拍板「删掉自动追加」。

## 要回答的问题

生成类创作工具里，「让同一个角色 / 风格在多镜里保持一致」通常怎么做？是**悄悄往提示词里追加文字 / 自动连参考图**，还是让用户**在提示词或参考列里明着挑**？我们该不该保留自动追加？

## ① 依赖里已有？

- 没有第三方库替我们决定「一镜发出去什么」。提示词里 `@[asset:url]` 到 `@imageN` 的投影已经住在共享层
  [`electron/shared/storyboard/promptMentions.ts:1`](../../electron/shared/storyboard/promptMentions.ts:1)，
  而且只做「用户自己 @ 出来的素材」的编号，不往里加任何字——这正是我们要的形状。

## ② 仓库里已有？

- 「参考图由行上摆着的绑定决定」的机制其实早就在：`shot.referenceBindings` 经
  [`src/workbench/creation/storyboard/shotRow/shotReferenceSlots.ts:157`](../../src/workbench/creation/storyboard/shotRow/shotReferenceSlots.ts:157)
  投影进节点 meta，行上的参考列（`ShotReferenceZone`）画的就是它。`anchorIds` 展开成追加文字 / 参考边是**并行的第二条路**。
- 「角色锚有真实图 → 写进 `referenceBindings`」已经有正解：
  [`src/workbench/generationCanvas/agent/storyboardAnchorPolicy.ts:64`](../../src/workbench/generationCanvas/agent/storyboardAnchorPolicy.ts:64)
  `normalizeStoryboardAnchorDefaults` 起草时把它落在行上看得见的位置。保留它，删掉另一条路。
- 收成唯一出口的落点：[`electron/shared/storyboard/storyboardPromptCompiler.ts:117`](../../electron/shared/storyboard/storyboardPromptCompiler.ts:117) `compileShotOutbound`，
  投影处 [`src/workbench/creation/storyboard/exec/storyboardProjection.ts:59`](../../src/workbench/creation/storyboard/exec/storyboardProjection.ts:59)。

## ③ 生态里已有？（同类产品怎么做）

- **Runway Gen-4 References**：参考图是用户**显式打标签**（`@tag_name`，3–15 个字符）再在提示词里点名；参考和提示词都看得见，
  不存在「工具悄悄替你追加一段角色描述」。<https://help.runwayml.com/hc/en-us/articles/40042718905875-Creating-with-Gen-4-Image-References>
- **Midjourney Omni Reference**：参考是用户**显式追加的参数**（`--oref <图>`、`--ow` 权重），写在提示词里、用户自己定要不要；
  官方说明里它传递的是图里的身份，不是一段隐藏的文字。<https://docs.midjourney.com/hc/en-us/articles/36285124473997-Omni-Reference>
- **Runway gen4-image 的 API（Replicate 上的公开 schema）**：提示词是一个字段，参考图与参考标签是**另外两个显式字段**
  （`reference_images` / `reference_tags`），接口层就没有「隐式追加」这一层。<https://replicate.com/runwayml/gen4-image/api/schema>

## ④ 用户怎么说（我们自己的真实反馈）

- 2026-09-30 用户原话：分镜里图片提示词写成「巨龙」，生成出来却是人物；并说「更重要的是不能让这种结构性底层问题发生」。
  产品规则随之拍板：**一镜发出去的 = 这一行写的提示词 + 这一行上看得见的参考图，别的什么都不加**。

## 结论：用已有 / 自研

- **对标结论**：同类产品都把「角色一致」做成**用户可见、可取舍的显式引用**，没有一家把它做成对提示词的隐式改写。
  所以删掉自动追加与自动连图是**向生态靠拢**，不是自研一个新东西。
- **我们要写的只有一件**：把「发出去什么」收成唯一出口 `compileShotOutbound`，并让各入口只从它取（对等测试逐字节钉住）。
  没有引入新依赖，也没有新的并行版（旧的追加与连边同一提交删除）。
- **代价（诚实交代）**：失去「引用角色锚就自动带身份文字 + 定妆照」的便利与它的一致性收益
  （2026-09-02 内部实测同参考图下，只给图 0/4 拿到特写，图 + 身份文字 3/4）。用户的选择是先保证所见即所发；
  想要一致性，就把角色描述写进提示词、把定妆照放进这一行的参考列。

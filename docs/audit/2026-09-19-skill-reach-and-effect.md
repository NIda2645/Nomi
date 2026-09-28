# 技能送达与生效实测 · 2026-09-19

> 测量完成；产品代码零改动。基线 `8d95b910305f724213c69224fa07b51fcc663cd1`，macOS arm64，本分支本地 build，1280×933。真 Electron、隔离空项目/设置/Chromium；凭据仅从本机 catalog 复制到隔离区，不进入证据。

## Q1 · 导入入口

**2 条点击入口已证实可达；首次冷启动点击数：技能库 6，composer 5。第三条原生拖入未验证。** 步数含“新建空白项目”“不分享”，不含动画跳过、文件选择；技能库实际多点一次“我的技能”，直接点导入可少一步。三个独立冷启动，未灌 store/走桥导航。截图均已人工查看。

| 路线 | 能到吗 / 步数 | 每一步看到的字与卡点 | 证据 |
|---|---|---|---|
| 技能库 | 是；6 点击（面板内 2 点击） | 新建空白项目 → 不分享 → 生成 → 技能 → 我的技能 → 导入文件；创作页没有技能库侧栏；空态明确写 SKILL.md / zip / 文件夹 | [项目页](../evidence/2026-09-19-skill-reach/shots/q1-02-project.png)、[生成](../evidence/2026-09-19-skill-reach/shots/q1-03-generation.png)、[技能库](../evidence/2026-09-19-skill-reach/shots/q1-04-skills.png)、[我的技能与导入](../evidence/2026-09-19-skill-reach/shots/q1-05-my-skills.png)；实际触发 filechooser |
| composer Skill | 是；5 点击（Skill 起 3 点击） | 新建空白项目 → 不分享 → Skill → 探索更多／新建·管理 → 导入文件；跳到生成区技能库，没有 composer 内直接导入按钮 | [菜单](../evidence/2026-09-19-skill-reach/shots/q1-b2-skill.png)、[跳转结果](../evidence/2026-09-19-skill-reach/shots/q1-b3-manage.png)、[逐步记录](../evidence/2026-09-19-skill-reach/q1-b.json) |
| 冷启动窗口直接拖 zip / .md | 浏览器级文件拖入 0/2；每次 1 次拖入。原生 Finder 拖入数字拿不到，因为当前执行工具没有操作系统文件拖拽接口 | 项目库不变、无提示、技能目录无新增。实际文件通过 CDP Input.dispatchDragEvent 交给 Chromium，**不是原生 Finder 手势，不能据此宣称原生路径已验** | [md](../evidence/2026-09-19-skill-reach/shots/q1-c2-md-drop.png)、[zip](../evidence/2026-09-19-skill-reach/shots/q1-c2-zip-drop.png)、[观察记录](../evidence/2026-09-19-skill-reach/q1-drop.json) |

## Q2 · 外部包

**导入 5/5；composer 可见 5/5；真实请求索引 5/5；产出符合意图 2/5（正常完成且合格 1/5）。** 模型：apimart / DeepSeek V3.2，每包新对话、手动挂技能。来源覆盖三家；5 份 SKILL.md 逐字节保留；整个包文件保留 32/33，丢的是 Semgrep 的 SVG 标志，导入过滤策略所致。PDF 的 8 个 scripts 文件全部保留。

| 真实外部包 | 导入 | composer | 实际索引 | 能跑 / 实际产出 |
|---|---|---|---|---|
| Anthropic brand-guidelines（license） | 成功 | 有 | 有 | 0：色值与字体送达；却把辅助灰色列作正文色，主色用途错配 |
| Anthropic internal-comms（附件） | 成功 | 有 | 有 | 0：读到了 3P 附件；编造周报日期与 MVP 开发计划 |
| Anthropic pdf（scripts/ + license） | 成功 | 有 | 有 | 1：真实 PDF，提取文字正确；超过 180s 观察窗，最终人工停止，会话未正常收尾 |
| Trail of Bits semgrep-rule-creator（allowed-tools） | 成功，跳过 1 SVG | 有 | 有 | 0：缺 semgrep；模型改写模拟测试，未完成真实测试；未批准破坏系统包隔离的安装选项 |
| Hugging Face transformers-js（compatibility + license） | 成功 | 有 | 有 | 1：给出正确安装、pipeline 与指定输入示例；遵照用户要求不下载/执行模型 |

每格证据：[包来源与 SHA](../evidence/2026-09-19-skill-reach/external-packages.json)、[导入逐条 UI 文本](../evidence/2026-09-19-skill-reach/q2-import.json)、[导入/菜单截图](../evidence/2026-09-19-skill-reach/shots/)、[实际索引](../evidence/2026-09-19-skill-reach/q2-actual-index.xml)、[5 轮裁决与输出](../evidence/2026-09-19-skill-reach/q2-results.json)、[原始请求与响应](../evidence/2026-09-19-skill-reach/q2-wire.jsonl.gz)、[PDF 验证](../evidence/2026-09-19-skill-reach/q2-pdf-validation.json)。成功导入的 `SkillImportFailure` 均不适用。不是用代码推导出来的“可用”。

## Q3 · 模型自选

**自选命中 7/12＝58.3%；误选 0/6＝0%；选后成功 5/7＝71.4%。** 单一模型 apimart / DeepSeek V3.2，每句一次主测；[22 句与判据](../evidence/2026-09-19-skill-reach/q3-cases.json)先于调用提交。成功读取目标正文才算选对，回答提名不算。

| 组别 | 实际选择 | 最终产出 | 证据 |
|---|---|---|---|
| 应选 12 | S03/04/06/07/08/09/11 选对；其他 5 未选 | 选对后 5 合格；S04 混朝代，S08 工具错误后超时 | [逐题调用、评分理由](../evidence/2026-09-19-skill-reach/q3-results.json) |
| 模糊 4 | 0/4 选技能，不进命中/误选分母 | 4/4 满足事前 rubric；A02 给草稿与付费确认卡，未批准媒体生成 | 同上；A02 的实际节点少于口头计划，另记行为偏离 |
| 不应选 6 | 0/6 误选 | 4/6 严格符合题意；N03 编造已存文稿，N05 多说一句；N04 排序正确但额外写文稿 | 同上；不误选≠回答可靠 |
| 阳性对照 S03 | 索引有目标：读取 1；删目标：读取 0 | 前者 2 次工具后正常回答；后者 10 次工具、改建节点、180s 超时停止 | [逐请求只删目标校验](../evidence/2026-09-19-skill-reach/q3-positive-control.json)、[原始 wire](../evidence/2026-09-19-skill-reach/q3-wire.jsonl.gz) |

主测每题新空项目。S01/S02 的早期“只开新会话”两轮保留为 pilot，发现项目状态可污染后，末尾补跑独立空项目并替换这两题主样本；没有按成绩挑答案。单次阳性对照证实了行为变化，不声称统计因果或内容只能来自技能。

## Q4 · 未测技能抽样

**抽 10 条：活 8、够不到 0、本次跑坏 2。** 复现文本提及计数 **22/88，未提及 66**；这不是测试执行覆盖率。以下十条均在 66 内；“活”仅表示已由真实 UI/索引送达，“坏”是本次回合失败，不能归因为技能文件永久损坏。

| 样本 | 类别 | 分类 / 可复核原因 |
|---|---|---|
| director-action | skill | 坏：S08 真读后工具反复传错数组、180s 超时；`writeVerbs.ts:156` 是数组契约 |
| director-guzhuang | skill | 坏：S04 明朝题混入唐宋/晚清；正文 `skills/director-guzhuang/SKILL.md:77,129` 有年代限定，模型未筛选 |
| director-transitions | skill | 活：菜单可见，S06 真读并产出三方案 |
| director-performance | skill | 活：菜单及真实索引可见；正文执行效果未单独测，S05 没选它 |
| director-sound | skill | 活：菜单可见，S11 真读并产出声音设计 |
| effect-camera-01 | effect | 活：空镜转场实际写入视频节点 |
| effect-camera-13 | effect | 活：焦点转换实际写入视频节点 |
| effect-camera-27 | effect | 活：声音转场实际写入视频节点 |
| effect-expression-grid | effect | 活：表情九宫格实际写入图片节点 |
| effect-fill-outpaint | effect | 活：自然扩图实际写入图片节点 |

[逐条证据及完整路径](../evidence/2026-09-19-skill-reach/q4-results.json)、[5/5 节点正文哈希一致](../evidence/2026-09-19-skill-reach/q4-ui-effects.json)、[原始提及普查](../evidence/2026-09-19-skill-reach/q4-mention-census.json)。effects 不在模型索引是既定分工，不算“够不到”；未把点击应用算媒体生成成功。

## 结构性发现

六层均已核对，[详细 owner 与 file:line](../evidence/2026-09-19-skill-reach/structure.md)：

- 导入四组规则在 renderer/main 各写一份（`parseSkillImport.ts:39` / `skillPackage.ts:39`）；本轮未注入漂移，不把风险当已复现回归。
- 模型 description 与画廊 summary 两份人工文案 **60/88 不同**，不是 60 个错误；分改可能造成用户与模型理解分叉。
- 手选正文去 frontmatter，`read_skill` 返回完整原文；effect 运行时正文 **40/40** 与唯一源相等，没发现额外手写正文。
- 实读 **40 条 disableModelInvocation=true**，任务书“0条”已过时；`skillRead.ts:44` 的“无模型可见 read_skill”注释也被真实调用反证。

## 待拍板

1. **下一轮优先补“读了但没做对”还是提高命中率？** 建议先处理工具契约错误、编造完成和跨朝代误用；它们直接使任务失效。命中 7/12 不能单独作为产品质量目标。
2. **外部工具型技能承诺到哪一步？** 导入 5/5 不代表依赖可用：PDF 绕路才成功、Semgrep 没跑真测试。需裁决运行依赖的产品边界；本轮没有替产品选自动安装方案。
3. **导入发现与 effect 填槽如何呈现？** 两条点击路可达，原生拖入尚无证据；实际应用仍留下 `{场景}` / `{object}` / `{角色名}`。是否引导填槽、承诺窗口拖入，留下一轮决策。

## 额度与验证

实测 **164 次 HTTP 请求，160 次有 usage**；输入 **5,568,900** token（其中缓存 **5,118,336**），输出 **43,683**。4 个中断请求无 usage，故这是已观察下限。**花费金额拿不到，因为供应商没有扣费字段、catalog 无费率，且没有可读账单**；不记成 0。媒体生成批准数 0。[完整账目](../evidence/2026-09-19-skill-reach/usage.json)。

本地 build 已通过；其余交付验证记入 PR，按任务书只跑 focused 与相关 contracts，不跑全链。四题里程碑：Q1 `452293b75`、Q2 `3db329d6e`、Q3 `1ce01b941`、Q4 `27b5d6340`。测量始终对应页首基线，交付更新基线不改变被测构建身份。

# 技能送达与生效实测 · 2026-09-19

> 测量进行中；产品代码零改动。基线 `8d95b910305f724213c69224fa07b51fcc663cd1`，macOS arm64，本分支本地 build，1280×933。真 Electron、隔离空项目/设置/Chromium；凭据仅从本机 catalog 复制到隔离区，不进入证据。

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

待测。

## 结构性发现

待逐层对账。

## 待拍板

等待测量结束汇总；本轮不修产品。

## 额度与验证

已进行真模型测量；Token 与费用在全轮结束后汇总。供应商响应未给扣费字段，当前 catalog 将该模型记为 unpriced，不把金额猜成 0。验证与 PR 状态待交付时更新。

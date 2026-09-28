# 任务书 · 技能「送达与生效」实测盘点

> ⏳ 已拍板·未开工 · 2026-09-19 · 派工对象：Codex

**档位：Codex（有界 + 有判官）。理由**：这一轮要的是**数字与证据**，不是设计判断——路径已知、判据可机器化、成功标准是「表填满且每格有出处」。出现需要产品裁决的岔路一律**记下来上报，不要自己定**。

**目标（一句话）**：回答「用户自己的技能，导得进来吗、找得到吗、模型会用吗、用对了吗」——**四个问题各出一个数字**，不是「看起来没问题」。

## 先查别人

**这一节不是仪式，是省你一轮**：技能格式那块别人早就做完了，下面四条是已核实的现状，**不要重查，直接用**。

- **官方规范**：Claude Code Agent Skills — https://code.claude.com/docs/en/skills 。「文件夹 + `SKILL.md` + YAML frontmatter」，`name` / `description` 两个必填。Claude Code / pi / Codex 三家收敛到同一形态，没有第二种。
- **官方参考校验器的真实行为**（比规范正文宽）：`skills-ref` 的 `validator.py:104-115` 对**顶层键是闭集**，多一个就报 error；而 `validator.py:118-147` 对 `metadata` 内部**不做任何校验**。所以 Nomi 的扩展放在 `metadata.nomi.*` 下是**跟着参考实现走**，不是自造——出处与裁决全文在 `docs/engineering/standard-formats.json` 的 `agent-skill` 条。
- **仓库里已经做过的**：自造的 `.nomiskill.json` 信封 2026-08-27 已删，导入改为收「文件夹 / zip / 单个 `.md`」，渲染层与主进程的三处口径差 2026-09-07 拉平（真 YAML 解析、可执行区口径、深度上限）——见 `src/workbench/skillLibrary/parseSkillImport.ts` 头注释；根因合同 `docs/fixes/2026-09-01-skill-import-standard-formats.root-cause.json`。
- **依赖里已有的**：加载器不再自研，2026-09-18（PR #815）迁到 pi 的 `loadSourcedSkills`——递归遍历、认 ignore 文件、`SKILL.md` 或根目录下带 frontmatter 的 `.md`、诊断只 warning 不失败、`content` 已去 frontmatter。见 `electron/agentLane/laneSkillCatalog.mts:1-30`。

**留给你的口子**：上面四条覆盖的是**格式与加载**。「导入之后用户找不找得到、模型会不会用」这一段，**没有任何先例调研，也没有任何数字**——那正是这份任务书的全部内容。你要是在 Q2 发现某家的包我们读不进来，先回到这四条出处核一遍是不是我们真偏离了标准，再下结论。

---

## 零、开工三行头（照抄执行，不许变形）

```
git -C /Users/aoqimin/Desktop/Nomi fetch origin
git -C /Users/aoqimin/Desktop/Nomi worktree add /Users/aoqimin/Desktop/Nomi-skillreach-0919 -b audit/skill-reach-20260919 origin/main
cd /Users/aoqimin/Desktop/Nomi-skillreach-0919 && pnpm install
```

- **写死绝对目录**，不许 `cd` 进任何已有 worktree（这台机器常有 20+ 个，进错就是两个会话互相覆盖）。
- **不许派子 agent**（禁嵌套）。
- **自己开 PR 并弄到能合的状态**：`pnpm run review:branch` → `pnpm run gates` → push → 开 PR，正文带 `## Ponytail` 节逐条表态。CI 红了自己修到绿，别把红的 PR 丢回来。
- 本机 gates 锁是全机唯一的。**只跑 `pnpm run test:system:focused` + 相关 contracts，不跑全链**，别占着锁。

---

## 一、先读这些，别重查（已核实，带出处）

（格式与加载那一块的出处在上面「先查别人」节，这里不重复。）

| 事实 | 出处 |
|---|---|
| **用户导入的技能恒可选**：`origin === 'user'` 直接 return true，不需要写任何 `metadata.nomi` | `electron/skills/skillStore.ts:175-181` |
| 模型看到的索引 = `readSkillRecords().filter(isSkillSelectableInWorkbench)` → 48 条内置 + 全部用户导入。**40 条 `kind: effect` 模型看不见**（只走节点 chip，设计如此） | `electron/agentLane/laneDesktopRuntime.ts:164` |
| `<available_skills>` 由 pi 的 `formatSkillsForPrompt` 渲染，模型可 `read_skill` 取正文；`disableModelInvocation` 全仓 0 条为 true | `electron/agentLane/laneSkillCatalog.mts:293` |
| 用户手动挂的那条技能 → 提示词的注入点全仓唯一 | `electron/agentLane/laneSkillPrompt.mts` |
| effect 技能经投影进提示词库，供节点 ✦ chip | `electron/promptLibrary/curatedPrompts.ts` |
| 88 个内置技能里只有 **22 条**被任何测试文件提到过，66 条一次都没有 | 本次实测，复现命令见 §五 |

**机制都在。这一轮不是去确认机制存在，是去量它管不管用。** 凡是你写出「代码里有 X，所以 X 能用」的句子，都不算答案。

---

## 二、要回答的四个问题（每题都写明「怎么算答到了」）

### Q1 · 用户找得到导入入口吗

用**真人路径**走：启动 app（不是灌状态、不是走桥），从冷启动开始找「我要把一个技能加进来」。

- 记**步数**和每一步看到的字，以及有没有一刻卡住。
- 三条路各走一遍：① 从技能库面板 ② 从 composer 的 Skill 入口 ③ 直接把 zip/`.md` 拖进窗口。
- **怎么算答到了**：一张表，三条路 × {能不能到 / 几步 / 中途看到什么}，每格配截图。找不到的那条路**如实写找不到**，不要去读源码补出一条路来。

⚠️ 记忆里有一条相关且**结论会误导你**的记录：入口可发现性「09-01 已修解析，入口待验」——那是**待验**不是已验，别拿它当前提。

### Q2 · 市场上真实的技能包导得进来、并且能用吗

**必须用仓库里没有的、真实外部的包**，至少 5 个，来源覆盖 ≥2 家（Anthropic 官方 skills 仓库、社区包等）。仓库现有的 `tests/fixtures/standard-formats/agent-skill/*` **不算**——拿自己造的夹具证明互操作等于没证明。

每个包记四格：
1. **导入**：成功 / 失败（失败记 `SkillImportFailure` 枚举值 + 用户看到的那句话）
2. **可见**：导入后出现在 composer 选单里吗
3. **进索引**：出现在模型的 `<available_skills>` 段里吗（读真实提示词，不是读代码推断）
4. **能跑**：手动挂上它、给一句该用它的话，模型的输出符合这个技能的意图吗

- 带 `allowed-tools` / `license` / `compatibility` 这些我们不消费的键的包，**必须覆盖到**——登记表声称它们「原样保留、不报错」，这是一条**断言**，要验。
- 带 `scripts/` 可执行区的包也要覆盖一个。

**怎么算答到了**：5×4 的表填满，每格有出处（截图或真实提示词片段）。

### Q3 · 模型会自己选技能吗，选得对吗

这是最重要的一问，也是**至今零数字**的一问。

- 按 `docs/lessons/agent-tests-must-be-prompt-driven-and-human-path.md` 的做法：**先写 ≥20 句用户真会说的话**，覆盖「明显该用某条技能」「模棱两可」「明显不该用技能」三档，**再**跑真模型。不许按界面面排 case。
- 每轮记：模型有没有调 `read_skill` / 调了哪条 / 该不该调 / 最终产出对不对。
- **额度默认授权**，直接花，事后报花了多少。
- **怎么算答到了**：三个数字——**自选命中率**（该用时选对的比例）、**误选率**（不该用时选了的比例）、**选后成功率**（选对之后产出符合意图的比例）。

⚠️ 阳性对照必做：至少一轮**故意把技能从索引里拿掉**，确认模型的行为确实变了。没有阳性对照的「它选对了」不作数——可能它根本没看索引，是靠通用能力蒙对的。

### Q4 · 66 条从没被碰过的技能，是死的还是活的

不要求全跑。要求**分类**：抽样 ≥10 条（覆盖 `kind: skill` 与 `kind: effect` 两类），判定每条属于哪种：

- **活的**：机制上能到用户/模型眼前，只是没测过
- **够不到**：存在某个具体原因到不了（写出那个原因 + file:line）
- **坏的**：到得了但跑不通

**怎么算答到了**：10 条的分类表，「够不到 / 坏的」那几条各带一句可复现的原因。

---

## 三、硬边界（越界就是做错了）

- **这一轮不改产品代码**，除非你发现的是「一行就能修、且不改任何行为」的笔误。发现的问题**全部记进报告**，修法留给下一轮。
- 出现需要产品裁决的岔路（比如「要不要给导入的技能自动生成 library 展示块」）→ **写进报告的「待拍板」段，不要自己定**。
- 不许改 `docs/engineering/standard-formats.json` 的登记或任何棘轮基线来让数字好看。
- 走查里不许用 `win.reload()`；HID 全局按键前先验前台（否则 Cmd+Q 会打到别的 app 上）。

## 四、结构性发现（必答，别留空）

这一轮你会横跨「盘上的包 → 加载 → 索引 → 提示词 → 模型 → 产出」六层。**每一层交接处问一句：这层读到的东西，和上一层写出去的，是同一份吗，还是各自重述了一遍？**

本仓刚刚合入的一整批缺陷是同一个形状：**一份事实被手写了四五遍、之间没有比对、错了不报错**（见 `docs/lessons/walkthrough-tool-args-are-a-compiler-blind-spot.md`）。如果你在技能这条链上又看见同一个形状，**点名写出来**：哪两份、在哪个 file:line、错开了会怎样。

没发现也要写「找过，没有，理由是 X」——空着等于没找。

## 五、交付物

1. `docs/audit/2026-09-19-skill-reach-and-effect.md`：Q1-Q4 四张表 + 结构性发现 + 待拍板
2. 证据目录：截图、真实提示词片段、真模型轨迹
3. 分支 `audit/skill-reach-20260919` 开 PR，CI 绿、Ponytail 表态齐，弄到能合的状态
4. 报告正文控制在能一眼读完的长度；细节进证据目录

复现「22/88」那个数字的命令（给你做起点，不是让你信它）：

```bash
cd /Users/aoqimin/Desktop/Nomi-skillreach-0919
while IFS= read -r n; do
  git grep -lF -- "$n" -- tests/ electron/ src/ scripts/ 2>/dev/null | grep -qE "test|spec|walk|e2e" || echo "$n"
done < <(ls skills)
```

（注意：zsh 默认不做单词分割，`for n in $(ls)` 会把整串当一个词——上面这个 `while read` 写法才是对的。我第一次就栽在这里，报出了个假的「88 条里 1 条」。）

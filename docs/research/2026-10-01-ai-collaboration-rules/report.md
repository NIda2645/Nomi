# AI 协作规则体系调研报告（2026-10-01）

> 调研 agent 只读产出，协调会话落盘。**结论**：官方文档和实证研究对两个毛病的看法一致。①只靠规则文字压不住，必须由机器在动手的那一刻拦下或提示。②规则文件越长越容易被无视。Nomi 的规则体系在这两点上都偏离了官方建议。

## 一、一屏总结

1. **规则文件要短，只放「删掉它 Claude 就会犯错」的内容**；能从代码读出来的、变化快的、长篇说明都不放；过长会让 Claude 无视真正的规则。（Claude Code best practices）
2. **要保证每次必须发生的事，写成 hook，不要写成指令**。官方原话：CLAUDE.md 是 advisory，hook 是 deterministic；Claude 已经自觉做对的规则，删掉或转成 hook。（best practices；memory 页）
3. **「先查仓库已有」靠提示和工具，不靠口号**。
   - 实证（RepoReuse）：agent 在多轮任务里越来越少看仓库已有代码。第 5 轮时，50.8% 的任务链留下了重复逻辑，而通过率几乎不变，测试看不出来。
   - 给一份简洁的**接口级**清单（模块名、签名、行为，并鼓励复用），自身复用率从 30.0% 升到 67.8%。塞完整源码没有改善（29.2%）。
4. **只靠 prompt 压不住修补堆积**（SlopCodeBench）。质量提示能让初始冗余降约 34%，但退化的斜率不变；agent 代码比人维护的开源仓库啰嗦 2.2 倍。需要强制的结构性工具。
5. **官方停止判据：同一问题纠正两次还不对，就 `/clear` 并用更好的 prompt 重开。**
6. **先让改动变容易，再做这个容易的改动**（preparatory refactoring，Beck / Fowler）。
7. **重写不丢行为，靠特征测试**（Feathers）。它只能发现变化，不能证明结果正确。
8. **重写要有边界**：重写一个模块，不重写整个系统，逐步替换（Strangler Fig）。反方是 Spolsky：旧代码里埋着大量 bug 修复。两者合起来：重写前先用特征测试钉住旧行为，范围限一个模块。

## 二、出处（除标注外均已打开读过相关段落）

**官方**
- Best practices for Claude Code — https://code.claude.com/docs/en/best-practices ：CLAUDE.md 取舍表；过长会被无视；用 hook 保证必然发生；给 Claude 一个能跑的校验；纠正两次失败就 `/clear`；对抗评审会倾向过度工程。
- How Claude remembers your project — https://code.claude.com/docs/en/memory ：每个文件目标 200 行以内；指令要具体到可验证；矛盾的指令会被随机取舍；import 不省上下文；路径作用域规则按需加载。
- Hooks guide — https://code.claude.com/docs/en/hooks-guide ：exit 2 阻断并把 stderr 回馈给 Claude；`UserPromptSubmit` 的 stdout 会进上下文；Stop hook 连续阻断 8 次会被覆盖；有 prompt / agent 类型的 hook。
- Effective context engineering for AI agents — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents ：最小但足够的指令集；context rot；即时检索，不预先塞满。（只读到摘要）
- Building effective agents — https://www.anthropic.com/engineering/building-effective-agents ：先找最简方案；工具设计（ACI）比 prompt 更值得投入。（只读到摘要）
- Codex AGENTS.md / best practices — https://learn.chatgpt.com/docs/agent-configuration/agents-md 、https://learn.chatgpt.com/guides/best-practices ：默认 32 KiB 上限；同样的错误出现两次再写具体规则；prompt 写清 Goal / Context / Constraints / Done when。
- AGENTS.md — https://agents.md ：只放 agent 需要的额外上下文。
- GitHub Copilot 自定义指令 / coding agent 最佳实践 — https://docs.github.com/en/copilot/concepts/prompting/response-customization 、https://docs.github.com/en/copilot/tutorials/coding-agent/get-the-best-results ：简短、自包含、按路径作用域；不要把宽泛的重构交给 agent。
- Cursor Rules — https://cursor.com/docs/context/rules ：不超过 500 行；指向规范示例而不是复制代码；只在同一个错误反复出现时才加规则。

**研究与社区**
- Do Coding Agents Reuse Existing Code or Reinvent the Wheel?（arXiv 2609.35357）— https://arxiv.org/abs/2609.35357 ：50.8% 出现重复逻辑；接口级记忆有效，全源码无效。只读了摘要和干预实验部分；样本 75 条任务链、单一开源模型，外推要谨慎。
- SlopCodeBench（arXiv 2603.24755）— https://arxiv.org/html/2603.24755v1 ：80% 的轨迹结构退化；质量提示不改变退化斜率。
- GitClear 2025 AI 代码质量报告 — https://www.gitclear.com/ai_assistant_code_quality_2025_research ：重复代码块占变更行比例 8.3% → 12.3%；重构行 25% → 不足 10%。产业报告，不是同行评审。
- Library Usage in Agent-Authored PRs（arXiv 2512.11589）— https://arxiv.org/html/2512.11589 ：agent 很少新增依赖（1.3% 的 PR）。「重新实现」和「乱加依赖」是两个相反的毛病，规则两头都要管。
- Build-vs-buy 研究方案（arXiv 2606.03907）：只是预注册，**没有结果**，不能当证据。
- Thoughtworks Radar：AI-friendly code design；Kent Beck：Augmented Coding（警报信号：循环、没被要求的功能、删测试作弊）；Fowler：Strangler Fig、Preparatory Refactoring、Beck Design Rules；Characterization test（Wikipedia）；Sandi Metz：The Wrong Abstraction（重复比错误的抽象便宜，参数加条件分支就是抽象错了）；Spolsky：Things You Should Never Do（反方）；Simon Willison：Hoard things you know how to do（让 agent 组合已有示例，不从零写）。
- 只拿到搜索摘要、没读原文：Rule of Three（Fowler / Roberts）、Addy Osmani 的 LLM workflow（Medium 返回 403）。

## 三、对照 Nomi 现在的规则体系

**做对的**：
- P2 + R21.3：数门由机器出门表。
- R21.2：同一层第三份合同就要出结构评审，方向是「别再补了」。
- R5.3 的三问，方向对。
- R17：门岗红了不抬基线。
- L0 hook 只在命中设计关键词时才注入。
- 有教训记录（violations.log、docs/lessons）。

**做反了或做过头的**：
- CLAUDE.md 约 30 KB，远超官方建议的体量。只在特定场景才用到的内容很多：R5.4 / R5.5 的细节、控件层级、画新面三件产物、Ponytail 流程、命令大表、雷达、多会话统御。
- 满篇加粗。
- L0 每轮注入约 3 KB，第①条是一个超长段落，而且和 CLAUDE.md 重复，可开头还写着「本文件不再复述」。
- R5.3 靠 agent 自己判断要不要触发：今天的上下文裁剪就是从这里漏掉的，agent 不知道 pi 有压缩，所以根本没触发。
- 门岗只查交没交文档。
- 门岗太多，本身就是上下文成本。这一条是推断。

**缺的**：
- 重写判据：全库搜不到 rewrite / Strangler / 特征测试相关的规则。
- 前置的 P0。
- 一张接口级的「已有能力清单」。
- 编辑那一刻的停止信号（同一文件近期被反复修）。
- 对抗评审没有「只报影响正确性和需求的缺口」这个限定，可能把人推向过度修补。这一条是推测。

## 四、修改建议

**A. 规则文字**
- P0 只写我们独有的，三行以内，放在 P1 之前；R5.3 改成「每次新建文件都要问一遍」。
- 重写判据（并入 P1 或新设一条）：出现以下任一条，就停止补丁，先交一页「补还是重写」的对比：
  1. 同一文件 14 天内第三次因 bug 修改；
  2. 要给现有函数加第三个特例分支或参数；
  3. 改一处要读两处以上的旁路逻辑。
  
  选重写时：先写特征测试钉住旧行为，范围限一个模块，同一个提交删旧。第 2 条是推出来的，要用我们自己的提交历史校准。
- L0 第①条瘦身：只留一句话加锚点，其余改成按关键词触发。

**B. 机器强制（先只提示，不阻断）**
1. PreToolUse：在 `src/` / `electron/` 新建文件时，注入「仓库和依赖里相近的已有能力」，并要求 agent 回一行「已查：X、Y；没找到：Z」。上线前要按 hooks 参考页核对 Write 的阻断和回馈细节。
2. 接口级「已有能力清单」：由 concept-owners.json 生成，不要另起一份真相源。
3. PreToolUse：Edit 的文件 14 天内已有 ≥3 次 fix 提交时，注入「这是第三次修这里，先过一遍重写判据」。
4. R21.2：从「交一份评审文档」升级为「选定补 / 重写 / 删，并引用特征测试路径」。
5. 重写形态的 PR 要带特征测试（试点）。

**只适合做提示的**：「这算不算通用能力」的判断；重写还是修补的最终决定；清单内容质量。

**C. 删减**
- CLAUDE.md 压到官方能接受的体量。保留：项目事实、非显而易见的命令、P0–P5、D1–D6 各一两行、规则索引。挪走：check 命令大表、交付身份、Ponytail、雷达、多会话统御，改成 skill 或路径作用域规则按需加载。
- 每段最多保留一处加粗。
- L0 压到现在的三分之一。
- 门岗评估用官方那句话：「没有它，agent 会犯错吗？」

## 五、不确定之处

- 「规则文件对 build-vs-buy 有效」没有受控实验结果。
- 「修到第几次就该重写」没有权威的精确数字，需要用我们自己的历史回测。
- SlopCodeBench 是受控基准，只能作方向性佐证。
- GitClear 是产业报告。
- Anthropic 那两篇只读到摘要。
- 没读 Ponytail 的 prompt，也没逐道评估门岗。门岗那部分由 2026-10-01 门岗账本补上。

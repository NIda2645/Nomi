# 六层交接对账（基线 8d95b9103；只量不改）

| 交接 | 实测同一份吗 | owner / 可能错开的位置 |
|---|---|---|
| 上游包 → 用户落盘 | 5/5 SKILL.md 原始字节相等；33 个包内文件留 32，Semgrep SVG 被过滤；PDF 8 个脚本全保留 | `parseSkillImport.ts:39`、`skillPackage.ts:39` 两份扩展名/深度/脚本目录规则；见 `q2-byte-identity.json`、`q2-package-files.json` |
| 落盘 → 加载记录 | 真实进程读到 88 builtin + 5 user；所有外部记录 origin=user；正文与完整原文是不同投影 | `laneSkillCatalog.mts:199` 再读包取 body/hash；`:229` description 与 `:230` content 来自 pi。这不是再手写一份内容，但扫描/再次读盘分两次，未注入并发文件修改，不能声称已测竞态 |
| 记录 → 可见库/模型索引 | 93 条记录，composer 可选 53；实际模型请求含 53 名，40 effects 不在索引 | `laneDesktopRuntime.ts:164` / `skillStore.ts:179` 控制可选；`laneSkillCatalog.mts:293` 用 pi formatter；`curatedPrompts.ts:6` 将 effect 的 record.content 投影成节点提示词。40/40 的 disableModelInvocation=true，任务书“全仓 0”已过时 |
| 索引/手选 → 提示词正文 | **两种真实 payload 不同**：手选 brand-guidelines 的 system 使用已去 frontmatter 的 content；模型 read_skill(internal-comms / director-consistency) 收到 JSON.body，包含完整 frontmatter | `laneSkillPrompt.mts:33` 使用 pi formatSkillInvocation；`skillStore.ts:264` 返回 record.body，经 `skillReadTransportAdapters.ts:87` 到模型。`skillRead.ts:44` 的注释说模型没有 read_skill，真实工具面和实际轨迹均反证；声明在 `verbs/readVerbs.ts:191` |
| 提示词 → 模型工具行为 | 按 Q3 逐轮真轨迹，不能用索引存在推导它被读了 | wire 原始请求/响应、rounds 的生产 trace；只将真正工具调用计为选技能，文本“我使用了”不计 |
| 模型工具结果 → 产出 | Q2 的周报读对附件后仍编造日期/计划；Semgrep 读取方法却用模拟测试替代真实测试；PDF 最终生成真实文件但回合中止 | 这两层之间没有“读过即产出正确”的等价关系。人工按题目与技能意图裁决，真实 PDF 经 pdftotext 与渲染复核 |

## 点名两份手写事实

1. **导入文件规则四组仍有两份**：`src/workbench/skillLibrary/parseSkillImport.ts:39-47` 的 TEXT_EXT / MAX_DEPTH / EXECUTABLE_DIRS / SCRIPT_EXT，对应 `electron/skills/skillPackage.ts:39-51` 的四组常量。错开时前端可丢掉后端支持的文件，或提交后整包被拒。本轮两个方向未故意改规则；33 文件只观察到既定 SVG 过滤，不能把潜在漂移说成已复现回归。
2. **用途说明两份人工文本**：模型用 SKILL.md 顶层 description（`laneSkillCatalog.mts:313`）；画廊优先 metadata.nomi.library.summary（`src/workbench/skillLibrary/skillGallery.ts:29`）。88 条中 28 条中文忽略空白后相等、60 条不同，详细列表 `description-projections.json`。其中许多是有意短摘要，**60 不等于 60 个缺陷**；这里测到的是两份语义文案独立存在，若只改其中一份，用户读到的用途和模型选用依据会分叉，文本差异不报错。
3. **注释与真实契约重述已经错开**：任务书称 disableModelInvocation 全仓 0；实读 40。`skillRead.ts:44` 说模型没有 read_skill，但 `readVerbs.ts:191` 提供它且真模型已调用。这两处是证据可直接反证的文档/注释陈旧，不在本轮修改产品源码。

未发现独立的“effect 提示词正文副本”：40 个实际运行时投影的 prompt 哈希与对应记录 content.trim() 哈希逐条相等，正文仍来自同一 SKILL.md。也没有用另写的模型索引模板；运行时交给 pi formatter。这个结论只覆盖本次 snapshot，不覆盖竞态更新。

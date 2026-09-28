# 通用反问 · 真实模型 18 轮（2026-09-21）

跑法 `node tests/ux/agent-askback-real-model.walk.mjs --label ask-run1`，
模型 DeepSeek V3.2（本机真实 catalog，隔离 profile），真 Electron、真页面输入、真实素材。
**前 16 句与修复前那次实测逐字相同**（`scratchpad/investigate-askback.md` §3.3：反问卡触发 0/16），
所以两次数字直接可比。

| 文件 | 是什么 |
|---|---|
| `report.json` | 每一轮的工具名序列、是否调了 `ask_user`、卡有没有画出来、选项质量、耗时 |
| `trajectories/<用例>.jsonl` | **每一次工具调用**的入参、返回原文、错误分类、第几次重试、最终成没成 |
| `trajectories/_matrix.json` | 「工具 × 错误类型 × 次数」那张表 + 每个用例的小计 |
| `A3-question-card.png` / `A4-question-card.png` | 真机上那两张反问卡 |
| `A3-after-answer.png` | 点 chip 作答之后，同一回合继续跑完的那一屏 |

轨迹为什么要留：用户 2026-09-21 原话——「测试过程中会发现轨迹问题，里面经常有重试、
参数出错，这些轨迹都对我们后续优化有帮助」。`report.json` 只记工具**名**，
一次 `draft_shots` 连发五遍到底是「参数被拒了四次」还是「它在分五批建」，名字那一列看不出半点。

**通过的用例里的重试也记**（不按 `isError` 过滤），**所有工具都记**（不只 `ask_user`）。
`attempt` / `retryOf` 的判据与生产代码里的熔断逐字相同（`laneRepeatedFailure.mts`：
工具名 + 失败正文首行），所以这里数出来的次数和用户真机上熔断看到的是同一个数。

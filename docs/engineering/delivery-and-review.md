# 交付与评审（L2）：push 前分层 · 交付身份 · 交工前评审

> 从 CLAUDE.md 搬来（规则体系瘦身）。**用到时怎么保证看到**：`self-check.sh` 在用户消息含「合并 / merge / 收据 / verify-merged / preflight / 开 PR / 交工 / Ponytail / review:branch / 推送」时注入【交付】块（带合并规矩要点与本文件指针）；CLAUDE.md 的「常用命令」一节也直接指向本文件；push 时 pre-push 闸门自己拦没过的、没收据的。
> 详解在 `docs/engineering-rules.md` 的 R11 / R22 / R25；编排侧见 `docs/engineering/agent-orchestration-playbook.md` §19。

## Push 前按风险面分层（R22）

contracts 始终跑（一次跑完全部门岗再汇总，不再第一个红就停；`check:ledger` 只出 warning 不阻断；`check:docs-index` / `check:doc-status` / `check:research-sources` 已于 2026-10-01 按门岗账本移出 PR 的 Contracts——合入 main 后由 `docs-autosync` workflow 自动补齐回写；`check:symptom-cluster` 降为提示）；unit 独立选 focused/full（**本机 `pnpm run gates` 也按同一份 `scripts/validation-policy.mjs` 分档**，全量一万两千多个测试交给 CI 并行机器，不再占着全机那把 gates 锁；想本机兜底跑全量用 `pnpm run gates:full`）；Electron、真实旅程、React Flow 画布、性能和 macOS package 各按受影响路径独立触发，`main` push 也按真实 `before..after` 分类，不因事件名自动全量。删除/重命名、空 diff、测试/CI 分类器自身和手动发布边界 fail-closed 到全维度。连续小修先在本地收敛，再一次性验证和 push，不让每个微提交反复触发全套 CI。

## 交付身份只走统一命令（R11）

任务开始先跑 `delivery:preflight`；PR 合并后**立即**在 Git fetch 得到的真实 merge SHA 上跑 `delivery:verify-merged`：非纯文档的 merge 必须看到该 SHA 上 `Core Flow Smoke (empty)` / `(used)` 都是 success 才发收据（skipped / 缺席一律拒绝）。**合并规矩（2026-10-01 用户拍板；只由协调会话做，其他会话开 PR 后把号发给它、不自己合）**：CI 绿 + 扫描干净就合；**最多 3 个合并在等收据**（`quality-gate.yml` 按 SHA 分组，每个合并提交各跑一套），任何一个收据红了**立刻停止再合**，交人定修还是回滚（冒烟红了不自动回滚）。任务 commit、PR head、merge commit 与 tree 分开报告；禁止用 REST compare 文件列表重建 Git tree/commit，禁止把 `same-tree-different-commit` 叫成代码不匹配。

## 交工前的 Ponytail 评审（R25，R24 由 PR #223 保留）

评审只在**能落地的时刻**跑一次——交工前对整条分支 `merge-base(origin/main, HEAD)..HEAD` 跑 `pnpm run review:branch`（只读、限时的 Ponytail 适配器，超过单次上限自动按提交／按文件分块多跑几次再合并，不再逼人拆提交）。findings 落 `.claude/ponytail-findings/<headSha>.md`，收据落 `.claude/ponytail-receipt.json`；PR 正文必须带 `## Ponytail` 节，每条发现写「已改」或「不改，因为…」。**钩子只查收据不跑模型**：`pre-commit` 只做敏感数据扫描；`pre-push` 校验要推的每个 ref 的**树**等于收据的树（rebase／改提交信息不改树，不必重审；改一行就失效）——没有收据、树不符、收据 mergeBase 不在这条历史里都 fail-closed。**2026-10-01 起降为提示**（用户按门岗账本拍板：47 个 PR 里约 33 个是 `--defer`，要求没有信息量）：pre-push 的收据要求与 `check:ponytail-review` 只打印提示、不阻断，模式在 `docs/engineering/ponytail-mode.json`；**Codex 恢复以后把 `mode` 改回 `enforce`（一行）、再跑一次 `pnpm run review:branch` 补真收据即重新开起来**（评审本体、收据、延后账本都没删）。**runner 不可用时的留痕延后**：`pnpm run review:branch -- --defer` 记一行进 `.claude/ponytail-deferred.log` 并发一张 deferred 收据，`check:ponytail-review` 一直红到补审或 `--accept <sha>`；绕口写法（`--no-verify`、`-c core.hooksPath=` 等）照旧拒绝。

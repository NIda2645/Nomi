# `scripts` 发布收据边界结构评审（2026-09-27）

> 状态：📎 结构评审已交付。
> 触发：`check:symptom-cluster` 在 `scripts` 模块的七日窗口内再次达到三份根因合同；本次新增合同为 `docs/fixes/2026-09-27-release-tag-blocked-by-dev-hook.root-cause.json`。

## 评审范围

本次只审发布推送收据这一条共享边界：`scripts/ponytail-review-branch.mjs` 的 `verifyPushReceipt` 和 `scripts/ponytail-review-hook.mjs` 的 pre-push 适配器。它们共同决定「推送的对象是否带来本机新内容、是否需要 Ponytail 收据」。已有的 `scripts` 层结构评审（`docs/audit/2026-09-15-scripts-layer-symptom-cluster-review.md`）指出，`scripts/` 是扁平工具目录，把所有工具合成一个模块键会制造跨主题聚簇；本次不把无关门岗或测试工具并入这条边界。

## 结构判断

- `verifyPushReceipt` 是收据判据的唯一 owner；hook 只解析 Git 的 ref range、调用它并输出结果。发布工作流不拥有第二套「标签可豁免」规则。
- 「已在远端跟踪分支历史」是对象内容是否已经发布的事实判据，适用于标签和分支；按 ref 名称或 CI 环境变量豁免会留下未评审新提交的逃生口。
- 远端跟踪 ref 不完整时，`alreadyOnRemote` 只会少豁免并继续要求收据，属于 fail-closed 的保守退化。
- 回归测试覆盖已发布附注标签、新提交标签和混合推送；混合推送证明已发布 ref 的豁免不会跳过新内容的树校验。

## 结构结论与后续

这次修复保持单一判据 owner，没有新增并行发布路径或绕过参数。`docs/fixes/2026-09-27-release-tag-blocked-by-dev-hook.root-cause.json` 的门表（`alreadyOnRemote`、`verifyPushReceipt`）与实现一致。若未来再次修发布收据，先复核这一共享边界及其三类回归；不要以「是 tag」或「在 CI」作为豁免条件。

本评审只记录结构结论，不修改 `check:symptom-cluster` 的聚类算法；`scripts` 扁平目录的文件级聚类建议沿用 2026-09-15 评审，另行派工和验收。

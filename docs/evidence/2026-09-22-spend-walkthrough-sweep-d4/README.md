# D4 收尾 · spend 走查全家 + 两条 MCP 旅程（2026-09-22）

测的是 `50d473151`（分支 `integration/core-a-salvage-20260921`，工作区干净）。
跑法：逐条 `node tests/ux/<name>.walk.mjs`（串行，机器上没有别的走查在跑，load 6–10）。
零额度：九条加起来 `paidCalls: 0`。截图与 `report.json` 落 `tests/ux/shots/` 与 `.tmp/`，两处都 gitignore，这里只引结论。

## 一、九条逐条

| 走查 | 结果 | 这一条钉住了什么（`verified`，原样抄） |
|---|---|---|
| `agent-spend-confirm-executes` | ✅ | card-waits-in-intervention-slot · param-edited-on-the-card · prompt-edited-on-the-card-reaches-the-wire · confirm-pushes-the-edit-into-the-durable-candidate · the-edit-really-reaches-the-provider-on-the-wire · the-node-really-gets-its-artifact-and-the-card-folds-away |
| `agent-spend-full-auto` | ✅ | safe-auto-does-not-touch-the-gate · switch-copy-matches-behaviour · full-auto-really-decides-the-gate · failed-decision-leaves-the-card |
| `agent-spend-nonapimart-vendor` | ✅ | non-apimart-provider-gets-an-executor-at-all · outbound-path-comes-from-that-mapping · auth-scheme-word-comes-from-the-saved-connection · artifact-lands-on-the-node-the-draft-created |
| `agent-spend-priced-card` | ✅ | priced-card-shows-the-amount-zh-and-en · confirm-really-reaches-the-vendor · ledger-records-the-same-amount-the-card-showed · artifact-lands-on-the-node-the-draft-created |
| `agent-spend-reprice` | ✅ | price-follows-the-chip-immediately · canvas-node-untouched-until-generate · candidate-written-back-on-generate |
| `agent-spend-unknown-price` | ✅ | card-says-unavailable-not-zero · confirm-label-is-generate-anyway · no-zero-anywhere-on-the-card-zh-and-en · confirm-really-reaches-the-vendor-and-the-node-gets-its-artifact · unknown-price-authorization-carries-null-not-zero |
| `agent-spend-waiting-owner` | ✅（两次启动，含真重启） | typed-text-answers-the-spend-card-and-withdraws-only-the-quote · same-draft-can-be-presented-again · restart-withdraws-the-quote-not-the-plan · confirm-after-restart-reaches-the-vendor-once · repeated-generate-in-the-same-turn-charges-nothing-more |
| `mcp-l2-journeys` | ✅ 71 断言 | C11/C12 全程：artifact poster、真实时间轴修订号、粗剪审看确认 → `awaiting_export`、export gate 经任务中心确认卡批准、manifest 与 ffmpeg.log 对账 |
| `mcp-generation-elicitation-first` | ✅ 6 断言 | 基线（非 elicitation 客户端 → GUI 卡确实浮出，探针活）+ 不变量（elicitation 客户端确认多镜/单镜时 **0 张 GUI 卡**，生成进入 execute） |

D4 之前单跑过、这次没重跑的两条：`agent-spend-card`（含 33 镜范围旅程）与 `canvas-shortcuts`，
都在 `50d473151` 的父提交链上绿过（见 D4 报告）。

### 为什么 `agent-spend-waiting-owner` 是这一轮的关键一条

它钉的正是 D4 改窄之后那条边的两个回答者：**打字**与**重启**。两者现在和面板的 × 走同一个
`generation.withdraw`——「收回这一次出价、计划留着」。`restart-withdraws-the-quote-not-the-plan` +
`same-draft-can-be-presented-again` 两条一起成立，说明 × 改挂过来之后没有把裁决 C 那条路带坏。

## 二、三条继承红（**不是** D4 引起的，照实标）

`npx vitest run tests/ux/spend-panel-write-ownership.test.mjs tests/ux/selection-drag-lifecycle.test.mjs`
→ 3 failed / 37 passed。逐条：

| 用例 | 红在哪条判据 | 归属 |
|---|---|---|
| `selection-drag-lifecycle` > group settles applied positions once on hidden | `expect(settled.revision).toBe(before.revision + 1)` | **继承红**（T-QA-27，画布拖拽那条会话的地盘）。D4 一个字没碰 `src/workbench/generationCanvas/**` 与这条测试 |
| `selection-drag-lifecycle` > selection settles applied positions once on hidden | 同上 | 同上 |
| `spend-panel-write-ownership` > an all-scope revision failure preserves the remaining shot across quote refresh and paging | `expect(snapshot().prompt).toBe('edited')`，实收 `'b'` | **继承红**（T-QA-27），而且与 D4 新记的 **T-QA-30 同根**：夹具在那一步把 `quoteId` 改成 `quote-revised` 并 `planVersion++`，而本地草稿账本的键 `spendDraftKey` 绑死报价身份，于是用户改过的那句读不回来。失败发生在第 220 行，比同一条用例里的 `discard()`（222 行）**更早**，所以与 D4 改的那一下 × 无关 |

机器核对：`git diff --stat 88f077600..HEAD -- tests/ux/spend-panel-write-ownership.test.mjs
tests/ux/selection-drag-lifecycle.test.mjs tests/ux/fixtures/ src/workbench/generationCanvas/` → **空**。

## 三、这一轮没有新暴露的产品问题

D3 在 09-22 凌晨记下的两处渲染层问题，这一轮的观察：
- 「第二张卡一出来就停在『取消 / 确认不要』那一态」——范围旅程本轮 `secondCardArrivedAlreadyConfirming: false`，
  没有复现。它此前只在「第一张卡上有未提交的手改」时出现，而 × 改成只收回出价之后那条路不一样了；
  不当作「已修」记，只记「本轮没遇到」。
- composer 那颗圆钮在「有卡待答 + 输入框里有字」时的语义——本轮没有专门走查覆盖，仍未验。

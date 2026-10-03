# 付费卡：加「生成剩下 N 张」样张（2026-10-01）

在线画布（私有）：https://claude.ai/artifact/CRd6iEZvmEUwQpCLnJXnL1

**用户 2026-10-01 拍板：样张通过，四处都按默认**（只剩 1 张时不显示；报得出价时按钮不带合计；张 / 段跟标题同一条规则；有意改写设计系统 §1.8，已同步）。
**位置随后按用户反馈调整，以实现为准**：翻页那一行回到只有翻页器和 `←→`，报得出价时合计贴这一行最右端；「生成剩下 N 张」挪到动作行最左，右边是「去掉这张」和主按钮；英文放不下一行时左边那颗整颗换到上一行。
**合计行的单位随后按用户 2026-10-01 拍板统一**：「N 张 · 合计」（视频「N 段」，英文与标题同词，如 `2 images · ¥0.60 total`），和标题、「生成剩下」读同一条规则；样张文字已同步（英文「1 outputs」也一并改成实现里的「1 output」）。
机器对账：`docs/design/mockups/contracts/2026-10-01-paid-card-generate-remaining.intent.mjs`（走查 `tests/ux/agent-spend-generate-remaining.walk.mjs`）。

本目录是离线留存：`index.html` 由 `build.mjs` 生成（结构照 `AgentPanelV4Cards.tsx` / `AgentPanelV4SlotShell.tsx`，
图标从 `@tabler/icons-react` 抽真实路径，颜色逐字取自 `src/theme/nomi-tokens.css`，改前截图 `before/*.png` 取自本分支构建的真机走查）；
`preview/` 是亮 / 暗两套渲染图。用浏览器直接打开 `index.html`，按钮和标题上的字可以点着改。

只改一处：翻页器后面加一颗描边次按钮「生成剩下 N 张 / 段」（en `Generate remaining N`）。
画了中英各四张：2 张第 1 页（报不出价）、2 张点完第 1 张后、33 张去掉 2 张后（N=31）、2 张报得出价。

页面里的画板是改位置之前的那一版（按钮样子和名字不变）；页首那段说明写了改到了哪里。

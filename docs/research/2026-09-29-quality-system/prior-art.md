# 先查别人：质量体系（2026-09-29）

## 问题

怎么让「用户用得成」变成可检查、可持续的事，而不是靠用户撞见问题再反馈。

## 四问

1. **依赖里已有？**
   - Playwright 已在用，负责驱动 Electron（`tests/ux/_assert.mjs`、`tests/ux/agent-runtime-walk-support.mjs`）。
   - 没有引入专门的质量平台，也不需要。
2. **仓库里已有？**
   - `tests/ux/core-smoke/`：清单式核心冒烟，空项目和用过的项目两套资料。
   - `tests/ux/_paidRun.mjs`：真额度走查护栏。
   - `check:concept-owners`：概念唯一主人门岗。
   - `scripts/intake-radar.mjs`：反馈接收端的抓取和汇总。
   - `src/workbench/observability/narrate.ts` 与 `src/workbench/generationCanvas/runner/generationPhaseDeadline.ts`：穷举的动作表和阶段时限表。
   - 这些都是现成零件，本方案负责把它们接成一条链。
3. **生态里已有？**
   - Google SRE：关键用户旅程与 SLO（https://sre.google/workbook/implementing-slos/）、错误预算政策（https://sre.google/workbook/error-budget-policy/）；
   - Chrome 分渠道发布（https://www.chromium.org/getting-involved/dev-channel/）；
   - UI Stack（https://www.scotthurff.com/posts/why-your-user-interface-is-awkward-youre-ignoring-the-ui-stack/）；
   - 状态图（https://statecharts.dev/）；
   - Stripe 错误码目录（https://docs.stripe.com/error-codes）；
   - Joel Test（https://www.joelonsoftware.com/2000/08/09/the-joel-test-12-steps-to-better-code/）。
4. **TikHub 自媒体里怎么说？**
   - 不适用：这是内部工程流程，不是面向用户的功能，没有可对照的用户讨论。

## 结论

用已有的做法和零件，不自研一套新理论。自研部分只限于把上面这些接到 Nomi 的剧本、门岗和反馈接收端上。

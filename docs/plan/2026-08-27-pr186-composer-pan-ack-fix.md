# PR #186 composer pan 取消确认修复

日期：2026-08-27

## 范围

- 修复 composer 自动避让动画被“适应画布”、重置或另一段视口动画取消后，`panRequestPendingRef` 永久锁死的问题。
- 让视口动画在自然完成与被新动画取消时都 exactly-once 通知调用方。
- composer 收到通知后解除 pending 并重新测量；如果仍被遮挡，可以再次发出避让请求。
- 将 stage 视口与时间轴把手分成硬/软两层边界：正常优先完全避开把手；物理无解时以最小位移保证 composer 完整留在 stage 内，允许与把手发生最小必要重叠。
- 保留 #186 已有最小可用高度、几何计算、160ms 自动避让动画与 J5 最小窗口里程碑。

## 不动项

- 不改变 composer 的视觉设计、尺寸 token、时间轴把手位置或最小窗口规格。
- 不用 timer 猜动画完成，不按每帧 `canvasOffset` 解锁，不调整 J5 操作顺序掩盖产品问题。
- 不修改 #179、#183、#188，也不直接合并 PR。

## TDD

1. 先补视口动画生命周期单测：自然完成 exactly-once、被另一动画取消 exactly-once、旧调用不传回调仍兼容。
2. 先补 composer 请求闸单测：第一次避让被外部 fit 取消并 ACK 后，如果几何仍受阻，可以再次发出请求。
3. 在生产代码改动前运行定向测试并确认预期失败。
4. 最小实现 settle 回调与 composer ACK，再运行定向测试转绿。
5. 运行 J5；人工检查最小窗口截图和输出几何。

第二轮红测记录：ACK 解锁后，旧 partial-gain fallback 在无解几何中返回 `+92.8px`、把 composer 反向翻到顶外；期望为守住 stage 所需的最小 `-28.7px`。纯函数回归已钉住连续 ACK 后收敛为 `0`。

规格复核追加的调度红测：

- 旧动画被取消时，`onSettled` 同步重入新动画；外层命令必须失去 generation 所有权，不能覆盖重入动画的 rAF 或 settlement。
- direct transform 与 scheduled offset 取消旧动画时遵守同一所有权协议；若取消回调重入更新动画，外层命令让路，后续取消仍能追踪并 exactly-once 结算最新动画。
- active composer 请求期间，即使中间动画帧短暂测得 `panDelta=0` 也不能释放或重新取得闸门；几何零值只表示本帧不发请求，只有 ACK 释放，卸载时才清理。

代码质量复核追加的通知隔离红测：

- 旧动画的 `onSettled` 属于外部 best-effort ACK；即使它在取消通知里抛错，也不能打断新的 viewport command。
- replacement animate 仍须取得唯一 generation/rAF，且后续取消 exactly-once 结算。
- direct transform 与 scheduled offset 仍须执行，取消的旧 rAF 不得成为孤儿；异常只隔离在外部通知边界，settlement 本身仍先进入终态。

## 回滚

- 按修复 commit 回滚本计划涉及的生命周期/ACK改动即可；#186 原有高度与几何修复仍保留。
- 若 ACK 暴露不可收敛几何，停止推送并以 J5 几何证据定位，不用超时解锁兜底。

## 验收

- 定向 Vitest 全绿，且红测记录证明测试确实覆盖旧实现。
- `node scripts/eval-journey.mjs --only j5-edit-export` 全里程碑通过。
- 最小窗口截图中 composer 完整位于 stage 内；提示词可见高度 ≥20px，主按钮在卡内。
- J5 最终几何：stage `top=56,bottom=691`；composer `top=516.8,bottom=666.8`；提示词可见 `38px`；主按钮在卡内；节点上方余量收敛到 `12px`。
- `pnpm run gates`（含 files/tokens/i18n/lint/type/test/build）全绿。
- 推送前再次确认 PR 源分支仍指向获批 head，再普通 push，禁止 force。

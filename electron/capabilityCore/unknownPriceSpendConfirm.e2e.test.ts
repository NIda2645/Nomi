// 未知价 × 每一条路径（2026-09-21 用户拍板）——零额度 loopback 端到端。
//
// 这台机器就是干净装机：目录一条价都没填（`unpriced: true` ⇒ 整条链的价格全是 `{ known:false }`），
// 也就是今天 204 个内置生成模型里**每一个**的真实处境。两件事必须同时成立：
//   ① 生成**跑得通**——供应商真的收到了请求（从前这里抛 `generation_pricing_unknown`，
//      卡上「仍要生成」按下去必然失败，就是 TODO T-MO-25 登记的那条）；
//   ② 屏上和账本上**没有一处 0**——未知有自己的位置，绝不被写成「这次免费」。
//
// 为什么走这个夹具而不是 mock：正在修的那条边界（封印 → 铸收据 → 决门 → 消费 → 提交 → 账本）
// 全部是真的，只有远端供应商是本机 loopback。mock 掉它等于在测一个我们自己编的世界。
import { afterEach, describe, expect, it } from "vitest";

import { PROJECT_ID, OPERATION_ID, candidate, startLoopbackVendor, harness, buildActions, callTool, draft, resetSpendFixture, advanceClock } from "./agentPanelSpendConfirmTestUtils";

afterEach(resetSpendFixture);

/** 一份待确认投影里所有会被印到屏上的数字位置。任何一处出现 0 都是「把未知写成了免费」。 */
function priceSurface(pending: { knownSubtotal: number; unknownShotCount: number; shots: ReadonlyArray<{ price: { known: boolean } }> }) {
  return {
    unknownShotCount: pending.unknownShotCount,
    everyShotUnknown: pending.shots.every((shot) => !shot.price.known),
    // `knownSubtotal` 是「已知那部分之和」。全未知时它是 0 —— 但卡**不许**把它当合计印出来，
    // 那由 `unknownShotCount > 0 ⇒ total = undefined`（agentPanelSpendCard.ts）保证。
    knownSubtotal: pending.knownSubtotal,
  };
}

describe("未知价：Agent 面板 / 全自动 两条路都跑得通，且哪儿都没有 ¥0", () => {
  it("Agent 面板：卡上是「算不出价」而不是 ¥0，按下去真的出图，账本记未知非 0", async () => {
    const vendor = await startLoopbackVendor();
    const base = harness();
    const submits: string[] = [];
    const { withWindow } = buildActions(base, vendor.origin, submits, { unpriced: true });
    try {
      await draft(base);

      const pending = withWindow.listPendingSpend(PROJECT_ID);
      expect(pending).toHaveLength(1);
      // 卡出得来，而且如实说「这一镜算不出价」——合计位没有数可印。
      expect(priceSurface(pending[0])).toEqual({ unknownShotCount: 1, everyShotUnknown: true, knownSubtotal: 0 });

      advanceClock(1000);
      const confirmed = await withWindow.confirmPendingSpend({
        projectId: PROJECT_ID, operationId: OPERATION_ID, quoteId: pending[0].quoteId,
      });
      // 这一行就是 T-MO-25：从前它必然 `{ ok:false }`（`generation_pricing_unknown` 只进 console）。
      expect(confirmed).toMatchObject({ ok: true, code: "spend_confirmed" });
      await base.canvasLanding.settleCanvasLanding(PROJECT_ID);

      // ① 真的出图：供应商收到了那一次请求，产物落回画布节点。
      expect(submits).toHaveLength(1);
      expect(vendor.bodies).toHaveLength(1);
      expect(base.renderer.resultsByNode.size).toBe(1);

      // ② 账本上它是「未知」不是「0 元」。
      const run = base.repository.read(PROJECT_ID, OPERATION_ID)!;
      expect(run.generationPlan!.authorizationEnvelope!.jobs[0].price.maximum).toBeNull();
      expect(run.generationPlan!.authorizationEnvelope!.budget.unknownJobCount).toBe(1);
      expect(run.budget.unknownInFlight).toBe(1);
      const reserve = base.repository.readBudgetLedger(PROJECT_ID, OPERATION_ID).entries.find((entry) => entry.kind === "reserve");
      expect(reserve).toMatchObject({ kind: "reserve", amount: null });
    } finally {
      await vendor.close();
    }
  });

  it("全自动：未知价不弹卡、直接跑完，收据仍写着 policy:full_auto", async () => {
    const vendor = await startLoopbackVendor();
    const base = harness();
    const submits: string[] = [];
    const built = buildActions(base, vendor.origin, submits, { unpriced: true });
    try {
      const created = await callTool(built.transport("project"), "nomi_generation_plan", {
        operation: "create", taskKind: "text_to_image", candidate: candidate("image-model", { size: "1024x1024" }),
      });
      await base.canvasLanding.settleCanvasLanding(PROJECT_ID);
      const result = (created as { result?: { drafted?: { operation?: { operationId?: string } }; operation?: { operationId?: string } } }).result;
      const operationId = result?.drafted?.operation?.operationId ?? result?.operation?.operationId ?? "";
      expect(operationId, "建草稿必须成功——后面每条断言都以它为前提").toBeTruthy();

      // 用户拍板：「直接跑就行」。所以未知价在这一档**不**退回问人。
      expect(built.withWindow.listPendingSpend(PROJECT_ID)).toHaveLength(0);
      expect(submits).toHaveLength(1);
      expect(vendor.bodies).toHaveLength(1);
      expect(created).toMatchObject({ ok: true, result: { spendDecision: { decidedBy: "policy:full_auto" } } });

      const run = base.repository.read(PROJECT_ID, operationId)!;
      expect(run.generationPlan!.state).toBe("submitted");
      expect(run.generationPlan!.authorizationEnvelope!.budget.unknownJobCount).toBe(1);
      // 全自动也一样：账上是「未知」，不是「这次不花钱」。
      expect(run.budget.reserved).toBe(0);
      expect(run.budget.unknownInFlight).toBe(1);
    } finally {
      await vendor.close();
    }
  });
});

// 付费卡「生成剩下 N 张」（2026-10-01 用户拍板）：等于把卡上还没决定的每一张各点一次「生成这张」。
//
// 真链路、零额度：真 Run 账本、真封印 / 收据 / 决门、真批次调度器，只有供应商是本机 loopback HTTP。
// 钉住拍板里的四句话：
//   · 去掉的不算在 N 里，N 只数还没决定的；
//   · 每张仍各记一笔授权，不出总价授权；
//   · 点完以后卡和芯片的状态跟逐张点完全一致（同一份逐镜结局驱动）；
//   · 按下去时看到的就是要发的——点名的不是卡上那一叠、或报价旧了，一张都不发。
import { afterEach, describe, expect, it } from "vitest";

import { generationPresentationOutcome } from "../shared/productionGenerationPresentation";
import { registerSpendWaiter } from "./spendDecisionWaiters";
import {
  PROJECT_ID, OPERATION_ID, startLoopbackVendor, harness, buildActions, resetSpendFixture, advanceClock, imageDraft, shotsSent,
} from "./agentPanelSpendConfirmTestUtils";

afterEach(resetSpendFixture);

const TARGET = { projectId: PROJECT_ID, operationId: OPERATION_ID } as const;

describe("「生成剩下 N 张」= 卡上还没决定的每一张各点一次「生成这张」", () => {
  it("5 张、去掉第 2 张后点「生成剩下 4 张」：发了 1、3、4、5，每张各一份授权；卡关掉；结局和逐张点完一样", async () => {
    const vendor = await startLoopbackVendor();
    const base = harness();
    const submits: string[] = [];
    const { withWindow, handler } = buildActions(base, vendor.origin, submits);
    const heard: string[] = [];
    const release = registerSpendWaiter(PROJECT_ID, OPERATION_ID, (decision) => heard.push(decision.kind));
    try {
      await imageDraft(base, handler, 5);
      expect(await withWindow.removePendingSpendShot({ ...TARGET, quoteId: withWindow.listPendingSpend(PROJECT_ID)[0].quoteId, shotId: "shot-2" }))
        .toMatchObject({ ok: true });
      const card = withWindow.listPendingSpend(PROJECT_ID)[0];
      expect(card.shots.map((shot) => shot.shotId), "N 只数还没决定的：去掉的不在里面").toEqual(["shot-1", "shot-3", "shot-4", "shot-5"]);
      advanceClock(1000);
      expect(await withWindow.confirmRemainingShots({ ...TARGET, quoteId: card.quoteId, shotIds: card.shots.map((shot) => shot.shotId) }))
        .toMatchObject({ ok: true, code: "spend_confirmed" });

      expect(shotsSent(submits), "每一张都发了，而且只发一次；去掉的那张没发").toEqual(["shot-1", "shot-3", "shot-4", "shot-5"]);
      expect(withWindow.listPendingSpend(PROJECT_ID), "每一张都决定了，卡关掉").toEqual([]);
      expect(heard, "卡关掉那一刻递一次结论，和逐张点完一样").toEqual(["confirmed"]);

      const run = base.repository.read(PROJECT_ID, OPERATION_ID)!;
      const digests = new Set(run.jobs.map((job) => job.authorizationDigest));
      expect(run.jobs, "一张一个作业").toHaveLength(4);
      expect(digests.size, "每张各记一笔授权：四个作业对着四份不同的授权，没有一份盖住整叠的总授权").toBe(4);
      const approvals = run.gates.filter((gate) => gate.scope === "budget_envelope" && gate.status === "approved");
      expect(approvals, "四道各自批准的门").toHaveLength(4);
      expect(generationPresentationOutcome(run)).toEqual({
        closedBy: "resolved",
        generating: ["shot-1", "shot-3", "shot-4", "shot-5"],
        failedBeforeSending: [],
        removed: ["shot-2"],
        takenByCanvas: [],
        undecided: [],
      });
    } finally {
      release();
      await vendor.close();
    }
  });

  it("点名的不是卡上那一叠（少一张 / 多一张 / 顺序不对）或报价旧了：一张都不发，卡原样还在", async () => {
    const vendor = await startLoopbackVendor();
    const base = harness();
    const submits: string[] = [];
    const { withWindow, handler } = buildActions(base, vendor.origin, submits);
    try {
      await imageDraft(base, handler, 3);
      const card = withWindow.listPendingSpend(PROJECT_ID)[0];
      advanceClock(1000);
      for (const shotIds of [["shot-1", "shot-2"], ["shot-1", "shot-2", "shot-3", "shot-4"], ["shot-2", "shot-1", "shot-3"]]) {
        expect(await withWindow.confirmRemainingShots({ ...TARGET, quoteId: card.quoteId, shotIds }), shotIds.join(","))
          .toMatchObject({ ok: false, message: "generation_scope_invalid" });
      }
      expect(await withWindow.confirmRemainingShots({ ...TARGET, quoteId: "stale-quote", shotIds: ["shot-1", "shot-2", "shot-3"] }))
        .toMatchObject({ ok: false, message: "generation_quote_changed" });
      expect(submits, "一张都没发").toEqual([]);
      expect(withWindow.listPendingSpend(PROJECT_ID)[0].shots.map((shot) => shot.shotId), "卡原样还在").toEqual(["shot-1", "shot-2", "shot-3"]);
      expect(base.repository.read(PROJECT_ID, OPERATION_ID)!.gates.filter((gate) => gate.scope === "budget_envelope"), "一道门都没开").toEqual([]);
    } finally {
      await vendor.close();
    }
  });

  it("中途点 ×：已经批下的那张照常生成，剩下的不再生成（× 不排队，正是为了能打断它）", async () => {
    const vendor = await startLoopbackVendor();
    const base = harness();
    const submits: string[] = [];
    let closeAfterFirst = true;
    const built = buildActions(base, vendor.origin, submits, {
      afterAuthorize: async () => {
        if (!closeAfterFirst) return;
        closeAfterFirst = false;
        const open = built.withWindow.listPendingSpend(PROJECT_ID)[0];
        await built.withWindow.discardPendingSpend({ ...TARGET, quoteId: open.quoteId });
      },
    });
    const { withWindow, handler } = built;
    try {
      await imageDraft(base, handler, 3);
      const card = withWindow.listPendingSpend(PROJECT_ID)[0];
      advanceClock(1000);
      expect(await withWindow.confirmRemainingShots({ ...TARGET, quoteId: card.quoteId, shotIds: card.shots.map((shot) => shot.shotId) }))
        .toMatchObject({ ok: true });
      expect(shotsSent(submits), "只有点 × 之前批下的那张").toEqual(["shot-1"]);
      expect(withWindow.listPendingSpend(PROJECT_ID), "× 关掉了卡").toEqual([]);
      expect(generationPresentationOutcome(base.repository.read(PROJECT_ID, OPERATION_ID)!)).toMatchObject({
        closedBy: "user_closed",
        generating: ["shot-1"],
        undecided: [{ shotId: "shot-2", reason: "user_closed" }, { shotId: "shot-3", reason: "user_closed" }],
      });
    } finally {
      await vendor.close();
    }
  });

  it("某一张在发出前就失败：停在那一张，它和后面的还在卡上；前面那张照常生成；这一张说「没发出去」，不借前一张的状态说「可能已提交」", async () => {
    const vendor = await startLoopbackVendor();
    const base = harness();
    const submits: string[] = [];
    let authorizations = 0;
    const { withWindow, handler } = buildActions(base, vendor.origin, submits, {
      beforeAuthorize: async () => {
        authorizations += 1;
        if (authorizations === 2) throw new Error("storyboard_strategy_blocked");
      },
    });
    try {
      await imageDraft(base, handler, 3);
      const card = withWindow.listPendingSpend(PROJECT_ID)[0];
      advanceClock(1000);
      const result = await withWindow.confirmRemainingShots({ ...TARGET, quoteId: card.quoteId, shotIds: card.shots.map((shot) => shot.shotId) });
      expect(result).toMatchObject({ ok: false, message: "generation_not_started" });
      expect(shotsSent(submits), "第 1 张发了，第 2 张没发、第 3 张没轮到").toEqual(["shot-1"]);
      expect(withWindow.listPendingSpend(PROJECT_ID)[0]?.shots.map((shot) => shot.shotId), "第 2、3 张照旧在卡上等人").toEqual(["shot-2", "shot-3"]);
    } finally {
      await vendor.close();
    }
  });
});

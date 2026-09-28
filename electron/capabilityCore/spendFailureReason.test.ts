import { describe, expect, it } from "vitest";

import { spendFailureReason } from "./appIntegrationSpendConfirm";

/**
 * 「账本事实」与「语义码」分成两个字段之后，这一条钉住它们**各说各的**：
 * `message` 回答「这一笔发起过没有」，`reason` 回答「哪一步不成」。
 * 合成一个格子正是 Pass 3c 没做完的那一半——把 `generation_reference_*` 写进 message 会让渲染层
 * 照着挑出「暂时无法确认结果」，而那时一个字节都还没出去，比不说更糟。
 */
describe("spendFailureReason", () => {
  it("带出 Nomi 自己的语义码（参考图那一族是它存在的理由）", () => {
    expect(spendFailureReason(new Error("generation_reference_identity_changed"))).toBe("generation_reference_identity_changed");
    expect(spendFailureReason(new Error("generation_reference_asset_unavailable"))).toBe("generation_reference_asset_unavailable");
    expect(spendFailureReason(Object.assign(new Error("boom"), { code: "run_not_open" }))).toBe("run_not_open");
  });

  it("供应商与凭据原话一个字都不带出去（收敛没有被放松）", () => {
    expect(spendFailureReason(new Error("APIMart said: invalid api key sk-abc123"))).toBeUndefined();
    expect(spendFailureReason(new Error("fetch failed"))).toBeUndefined();
    expect(spendFailureReason(new Error("401 Unauthorized from https://api.example.com/v1/images"))).toBeUndefined();
    expect(spendFailureReason(new Error("其它供应商中文报错"))).toBeUndefined();
  });

  it("不是错误、或者码长得不像码 → 不带", () => {
    expect(spendFailureReason(undefined)).toBeUndefined();
    expect(spendFailureReason("generation_reference_identity_changed")).toBeUndefined();
    expect(spendFailureReason(new Error("generation"))).toBeUndefined();
    expect(spendFailureReason(new Error(`generation_${"x".repeat(80)}`))).toBeUndefined();
  });
});

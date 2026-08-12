import { describe, expect, it } from "vitest";
import { resolvePrecheckGateAction } from "./precheckGate";

describe("resolvePrecheckGateAction（接入类预检门槛 · 非阻断 + 二次确认）", () => {
  it("结构上做不成（必填未齐 / 忙 / 已做过）→ disabled（无论预检态/armed）", () => {
    expect(
      resolvePrecheckGateAction({ actionable: false, precheckPassed: false, forceArmed: false }),
    ).toBe("disabled");
    expect(
      resolvePrecheckGateAction({ actionable: false, precheckPassed: true, forceArmed: true }),
    ).toBe("disabled");
  });

  it("预检通过 → 直接执行（不需二次确认）", () => {
    expect(
      resolvePrecheckGateAction({ actionable: true, precheckPassed: true, forceArmed: false }),
    ).toBe("proceed");
  });

  it("预检未过/未跑、首次点击 → arm（进入二次确认，不执行）", () => {
    expect(
      resolvePrecheckGateAction({ actionable: true, precheckPassed: false, forceArmed: false }),
    ).toBe("arm");
  });

  it("预检未过、已 armed、再次点击 → confirm（明知风险仍执行）", () => {
    expect(
      resolvePrecheckGateAction({ actionable: true, precheckPassed: false, forceArmed: true }),
    ).toBe("confirm");
  });

  // 这条是本模块存在的理由：任何「预检没过就不给做」的回归都会在这里红。
  // 覆盖两类真实误判——连通性探测失败（manual 接入）与缺文件/缺节点（ComfyUI 预置模板 / 模板库）。
  it("非阻断不变量：actionable 时永不因「预检没过」返回 disabled", () => {
    for (const forceArmed of [false, true]) {
      expect(
        resolvePrecheckGateAction({ actionable: true, precheckPassed: false, forceArmed }),
      ).not.toBe("disabled");
    }
  });
});

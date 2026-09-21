// 「只建几张参考卡」是一条正常路径——2026-09-21 用户亲自点名过那条报错。
//
// 这条测试钉住的不只是「校验放行了」，而是**整条路都真的通**：模型面不拦、宿主面不拦、
// 报价卡有行（每一笔要花的钱都看得见）、调度器不会卡在一道守不住任何东西的闸上。
// 只改校验、别的面各自坏掉，才是这一族缺陷真正的长相。
import { describe, expect, it } from "vitest";

import { VERB_DECLARATIONS } from "../shared/agentCapabilities/verbDeclarations";
import { gateRowsFor } from "./mcpGenerationTools";

const draftShots = () => VERB_DECLARATIONS.find((declaration) => declaration.name === "draft_shots")!;

const anchorShot = (title: string) => ({
  title, prompt: `${title} 的外观设定`, taskKind: "text_to_image" as const, role: "anchor" as const,
  storyboard: { kind: "character" as const, carrier: "visual" as const },
});

describe("只有参考卡的草稿", () => {
  it("模型面放行：两张人物卡、没有任何镜头，schema 不再拒绝", () => {
    const result = draftShots().schema.safeParse({ shots: [anchorShot("林野"), anchorShot("陈默")] });
    expect(result.success, result.success ? "" : JSON.stringify(result.error.issues)).toBe(true);
  });

  it("说明书里也没有留下那句「不能只有锚」——拒绝的话不许活在描述里", () => {
    const printed = `${JSON.stringify(draftShots().schema)} ${draftShots().describe.params} ${draftShots().describe.notWhen}`;
    expect(printed).not.toContain("cannot be anchors only");
  });

  it("阳性对照：新建仍然要求 prompt，放行的是「只有锚」这一条，不是把形状放没了", () => {
    const { prompt: _dropped, ...withoutPrompt } = anchorShot("林野");
    expect(draftShots().schema.safeParse({ shots: [withoutPrompt] }).success).toBe(false);
  });
});

// 报价卡那一半：放行之后，**每一笔要花的钱仍然要在卡上看得见**。
// 这条规则住 `gateRowsFor`（一条规则一个家），所以在它自己身上打枪，不用起整条 e2e。
describe("报价卡上的行怎么选", () => {
  const anchor = (id: string) => ({ shotId: id, role: "anchor" as const });
  const video = (id: string) => ({ shotId: id, role: "shot" as const });

  it("常规批次：行 = 非锚镜，锚去 chip（逐字不变）", () => {
    const { rows, anchorChipShots } = gateRowsFor([anchor("a1"), video("s1"), video("s2")]);
    expect(rows.map((shot) => shot.shotId)).toEqual(["s1", "s2"]);
    expect(anchorChipShots.map((shot) => shot.shotId)).toEqual(["a1"]);
  });

  it("只有参考卡：**锚就是行**——否则卡会静默退回单镜路，只摆第一张，其余照样扣钱", () => {
    const { rows, anchorChipShots } = gateRowsFor([anchor("a1"), anchor("a2")]);
    expect(rows.map((shot) => shot.shotId)).toEqual(["a1", "a2"]);
    expect(anchorChipShots).toEqual([]);
  });

  it("没勾上的不进卡，也不因此把一份混合批次变成「只有锚」", () => {
    const { rows } = gateRowsFor([anchor("a1"), { ...video("s1"), included: false }]);
    expect(rows.map((shot) => shot.shotId), "唯一的镜头被取消勾选 → 剩下的锚才是要花的钱").toEqual(["a1"]);
  });
});

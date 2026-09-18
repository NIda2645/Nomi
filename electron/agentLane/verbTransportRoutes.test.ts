// 对应关系表的**尺子测试**：坏表必须在装配期抛，好表必须翻出与手写版逐字节相同的结果。
//
// 这张表存在的全部理由是「手写的翻译没有东西核对它」。所以这一族先证明尺子不是恒真的——
// 三种真实犯过的坏法各来一条：动词加了字段没加对应关系、对应关系指向宿主不存在的字段、
// 把某条对应关系删掉（那正是 2026-09-18 `candidate.providerId` 静默消失的方式）。
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  assembleVerbFieldMap, objectFieldKeys, projectByFieldMap,
} from "../shared/agentCapabilities/verbs/verbFieldMap";
import { DRAFT_SHOTS_FIELD_MAP, DRAFT_SHOT_FIELD_MAP, PROVENANCE_UNVERIFIABLE, SIMPLE_VERB_ROUTES } from "./verbTransportRoutes";
import { verbToTransportCall } from "./laneVerbTransport";

const base = {
  label: "probe",
  sourceKeys: ["keep", "renamed"],
  targets: { host: ["keep", "hostName"] },
  relations: {
    keep: { kind: "same" as const, from: ["model-authored"] },
    renamed: { kind: "rename" as const, to: "hostName", why: "两边叫法不同", from: ["model-authored"] },
  },
};

describe("对应关系表：坏表在装配期就抛", () => {
  it("好表能装配，且真的翻得动——否则下面每条 throws 都可能只是「什么都装不起来」", () => {
    const map = assembleVerbFieldMap(base);
    expect(projectByFieldMap({ keep: 1, renamed: 2 }, map, "host")).toEqual({ keep: 1, hostName: 2 });
  });

  it("动词加了字段却没加对应关系 → 抛，并点名是哪个字段", () => {
    expect(() => assembleVerbFieldMap({ ...base, sourceKeys: [...base.sourceKeys, "freshlyAdded"] }))
      .toThrow(/freshlyAdded/);
  });

  it("对应关系指向宿主不存在的字段 → 抛，并点名是哪个目标形状", () => {
    expect(() => assembleVerbFieldMap({
      ...base,
      relations: { ...base.relations, renamed: { kind: "rename", to: "noSuchHostField", why: "写错了", from: ["model-authored"] } },
    })).toThrow(/noSuchHostField[\s\S]*host/);
  });

  it("把子字段的对应关系删掉 → 抛（重演 candidate.providerId 静默消失的那一刀）", () => {
    const withParent = {
      label: "probe",
      sourceKeys: ["candidate"],
      targets: { host: ["providerId", "modelId"] },
      relations: {
        candidate: { kind: "expanded" as const, into: ["candidate.providerId", "candidate.modelId"], why: "两件分别落位" },
        "candidate.providerId": { kind: "rename" as const, to: "providerId", why: "点名的供应商", from: ["model-authored"] },
        "candidate.modelId": { kind: "rename" as const, to: "modelId", why: "点名的模型", from: ["model-authored"] },
      },
    };
    expect(() => assembleVerbFieldMap(withParent)).not.toThrow();
    const { "candidate.providerId": _deleted, ...withoutProvider } = withParent.relations;
    expect(() => assembleVerbFieldMap({ ...withParent, relations: withoutProvider }))
      .toThrow(/candidate\.providerId/);
  });

  it("两条关系抢同一个落点却不分优先级 → 抛（平铺 modelId 与 candidate.modelId 就是这一对）", () => {
    expect(() => assembleVerbFieldMap({
      label: "probe", sourceKeys: ["a", "b"], targets: { host: ["same"] },
      relations: {
        a: { kind: "rename", to: "same", why: "x", from: ["model-authored"] },
        b: { kind: "rename", to: "same", why: "y", from: ["model-authored"] },
      },
    })).toThrow(/优先级/);
  });

  it("有损那一档不许当成同名透传：resolved 缺 by/why → 抛", () => {
    expect(() => assembleVerbFieldMap({
      ...base,
      relations: { ...base.relations, renamed: { kind: "resolved", to: "hostName", by: "", why: "", from: ["host-resolved"] } },
    })).toThrow(/resolved/);
  });

  it("每条带值的关系都要说清模型从哪拿到它（留空 = 没想过）", () => {
    const { from: _dropped, ...withoutProvenance } = base.relations.keep as { from: unknown };
    expect(() => assembleVerbFieldMap({ ...base, relations: { ...base.relations, keep: withoutProvenance as never } }))
      .toThrow(/没声明来源/);
    expect(() => assembleVerbFieldMap({
      ...base, relations: { ...base.relations, keep: { kind: "same", from: ["somewhere"] } },
    })).toThrow(/不是合法的一档/);
  });

  it("名单从 schema 取，不是手抄的——schema 改了名单就跟着改", () => {
    expect(objectFieldKeys(z.object({ a: z.string(), b: z.number() }), "probe")).toEqual(["a", "b"]);
    expect(objectFieldKeys(z.array(z.object({ a: z.string() })).optional(), "probe")).toEqual(["a"]);
  });
});

describe("生成出来的翻译与手写版逐字节相同", () => {
  const translate = (args: unknown) => verbToTransportCall({ toolCallId: "call-1", toolName: "draft_shots", args })!.call.args;

  it("时长落 parameters.duration 并与已有 parameters 合并，不是一个宿主没有的顶层字段", () => {
    expect(translate({ shots: [{ prompt: "p", durationSec: 3, parameters: { seed: 7 } }] }))
      .toMatchObject({ operation: "create", prompt: "p", parameters: { seed: 7, duration: 3 }, cardHidden: true });
  });

  it("目录点名赢过平铺的 modelId，两件各自落位（优先级是声明出来的，不是靠写的顺序）", () => {
    expect(translate({ shots: [{ prompt: "p", modelId: "fallback", candidate: { providerId: "apimart", modelId: "image-1" } }] }))
      .toMatchObject({ providerId: "apimart", modelId: "image-1" });
    // 只给平铺 modelId 时它就是赢家——否则上一条可能只是「candidate 恒赢」而平铺那条根本没接。
    expect(translate({ shots: [{ prompt: "p", modelId: "fallback" }] })).toMatchObject({ modelId: "fallback" });
  });

  it("参考素材出去的是宿主认的引用外壳，身份留给宿主补", () => {
    expect(translate({ shots: [{ prompt: "p", references: ["asset-1", "asset-2"] }] }))
      .toMatchObject({ references: [{ assetId: "asset-1" }, { assetId: "asset-2" }] });
  });

  it("信封字段进多镜、不进候选 patch（absentOn 的机器版）", () => {
    const multi = translate({ shots: [{ role: "anchor", title: "锚", prompt: "a" }, { role: "shot", prompt: "b" }] }) as { shots: Array<Record<string, unknown>> };
    expect(multi.shots[0]).toMatchObject({ role: "anchor", title: "锚", prompt: "a" });
    const patched = translate({ operationId: "op-1", shots: [{ shotId: "shot-3", prompt: "改一句" }] }) as { patch: Record<string, unknown> };
    expect(patched).toMatchObject({ operation: "patch", operationId: "op-1" });
    expect(patched.patch).toEqual({ prompt: "改一句" });
  });

  it("顶层缺省折进每一镜，逐镜自己写的优先", () => {
    const multi = translate({
      taskKind: "text_to_video", candidate: { providerId: "apimart", modelId: "video-1" },
      shots: [{ role: "anchor", prompt: "a", taskKind: "text_to_image" }, { role: "shot", prompt: "b" }],
    }) as { shots: Array<Record<string, unknown>> };
    expect(multi.shots[0]).toMatchObject({ taskKind: "text_to_image", providerId: "apimart", modelId: "video-1" });
    expect(multi.shots[1]).toMatchObject({ taskKind: "text_to_video", providerId: "apimart", modelId: "video-1" });
  });

  it("其余延迟组动词也走同一张表（一个只覆盖 draft_shots 的机制会在下一个动词上原样复发）", () => {
    expect(Object.keys(SIMPLE_VERB_ROUTES).sort()).toEqual([
      "cancel_job", "check_job", "edit_timeline", "generate", "undo",
    ]);
    expect(verbToTransportCall({ toolCallId: "c", toolName: "undo", args: { undoToken: "undo-1", expectedRevision: "r2" } })!.call.args)
      .toEqual({ undoToken: "undo-1", expectedRevision: "r2" });
    expect(verbToTransportCall({ toolCallId: "c", toolName: "edit_timeline", args: { baseRevision: "r1", summary: "s", operations: [] } })!.call.args)
      .toEqual({ planId: "plan-c", baseRevision: "r1", summary: "s", operations: [] });
  });

  it("「来源核不动」的清单是棘轮：只许减，加一条必须先改这条断言（否则它会悄悄长大）", () => {
    // 这五个动词的 outputSchema 是 z.unknown()——不是「字段不在返回里」，是「返回形状根本没声明」。
    // 把某个契约的 outputSchema 收成真形状，就能从这里删掉一条，对它的来源核对随之生效。
    // 这是下一轮要查的清单，不是豁免：`from-read` 指向一个**有**声明却不含该字段的动词，没有任何出口。
    expect(Object.keys(PROVENANCE_UNVERIFIABLE).sort())
      .toEqual(["draft_shots", "edit_timeline", "export_video", "generate", "list_models"]);
  });

  it("两张 draft_shots 的表都装配得起来，并且各自声明了目标形状", () => {
    expect(DRAFT_SHOT_FIELD_MAP.targetNames).toEqual(["shot", "patch", "flat"]);
    expect(DRAFT_SHOTS_FIELD_MAP.targetNames).toEqual(["patch", "create"]);
  });
});

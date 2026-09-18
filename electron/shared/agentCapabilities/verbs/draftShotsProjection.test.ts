// `draft_shots` 那条**有损投影**的行为锁：三处形状变化各一条，两处「这条路上没有它的位置」各一条。
//
// 这一族的前身是对照表的尺子测试（合成坏表必须在装配期抛）。表删掉之后那些判据没有消失，只是**换了
// 一层**：「一个字段都不许没人管」成了 `tsc`（解构剩下的落进 `Record<string, never>`）、「落点必须在
// 宿主上真的存在」成了返回类型（取自宿主 schema）。编译期的东西没法在 vitest 里断言，所以这里留下的
// 是**行为**那一半——它证明的是：换真相源之后，发出去的载荷与对照表时代逐字节相同。
import { describe, expect, it } from "vitest";

import { verbToTransportCall } from "../../../agentLane/laneVerbTransport";
import { NOT_YET_DECLARED, PROVENANCE_UNVERIFIABLE, VERB_FIELD_PROVENANCE } from "./verbFieldProvenance";

const translate = (args: unknown) => verbToTransportCall({ toolCallId: "call-1", toolName: "draft_shots", args })!.call.args;

describe("draft_shots 的投影与对照表时代逐字节相同", () => {
  it("① 时长落 parameters.duration 并与已有 parameters 合并，不是一个宿主没有的顶层字段", () => {
    expect(translate({ shots: [{ prompt: "p", durationSec: 3, parameters: { seed: 7 } }] }))
      .toMatchObject({ operation: "create", prompt: "p", parameters: { seed: 7, duration: 3 }, cardHidden: true });
  });

  it("② 目录点名赢过平铺的 modelId，两件各自落位（谁赢是声明出来的，不靠写的顺序）", () => {
    expect(translate({ shots: [{ prompt: "p", modelId: "fallback", candidate: { providerId: "apimart", modelId: "image-1" } }] }))
      .toMatchObject({ providerId: "apimart", modelId: "image-1" });
    // 只给平铺 modelId 时它就是赢家——否则上一条可能只是「candidate 恒赢」而平铺那条根本没接。
    expect(translate({ shots: [{ prompt: "p", modelId: "fallback" }] })).toMatchObject({ modelId: "fallback" });
  });

  it("③ 参考素材出去的是宿主认的引用外壳，身份留给宿主补", () => {
    expect(translate({ shots: [{ prompt: "p", references: ["asset-1", "asset-2"] }] }))
      .toMatchObject({ references: [{ assetId: "asset-1" }, { assetId: "asset-2" }] });
  });

  it("信封字段进多镜、不进候选 patch（「送不到」与「可以丢」分开写明的机器版）", () => {
    const multi = translate({ shots: [{ role: "anchor", title: "锚", prompt: "a" }, { role: "shot", prompt: "b" }] }) as { shots: Array<Record<string, unknown>> };
    expect(multi.shots[0]).toMatchObject({ role: "anchor", title: "锚", prompt: "a" });
    const patched = translate({ operationId: "op-1", shots: [{ shotId: "shot-3", prompt: "改一句" }] }) as { patch: Record<string, unknown> };
    expect(patched).toMatchObject({ operation: "patch", operationId: "op-1" });
    // `shotId` 在这条路上是**有意**丢弃（宿主的候选 patch 不寻址单镜），所以 patch 里只剩语义。
    expect(patched.patch).toEqual({ prompt: "改一句" });
  });

  it("信封落不进去的两条路上当场拒绝，不静默消失", () => {
    expect(() => translate({ operationId: "op-1", shots: [{ prompt: "p", title: "标题" }] }))
      .toThrow(/shots\[\]\.title/);
    expect(() => translate({ shots: [{ prompt: "p", shotId: "shot-3" }] }))
      .toThrow(/shots\[\]\.shotId/);
  });

  it("顶层缺省折进每一镜，逐镜自己写的优先", () => {
    const multi = translate({
      taskKind: "text_to_video", candidate: { providerId: "apimart", modelId: "video-1" },
      shots: [{ role: "anchor", prompt: "a", taskKind: "text_to_image" }, { role: "shot", prompt: "b" }],
    }) as { shots: Array<Record<string, unknown>> };
    expect(multi.shots[0]).toMatchObject({ taskKind: "text_to_image", providerId: "apimart", modelId: "video-1" });
    expect(multi.shots[1]).toMatchObject({ taskKind: "text_to_video", providerId: "apimart", modelId: "video-1" });
  });
});

describe("「模型从哪拿到这个值」那条轴（投影接不住它，所以它留下来了）", () => {
  it("「核不动」的清单是棘轮：只许减，加一条必须先改这条断言（否则它会悄悄长大）", () => {
    // 这五个动词的 outputSchema 是 z.unknown()——不是「字段不在返回里」，是「返回形状根本没声明」。
    // 把某个契约的 outputSchema 收成真形状，就能从这里删掉一条，对它的来源核对随之生效。
    // 这是下一轮要查的清单，不是豁免：`from-read` 指向一个**有**声明却不含该字段的动词，没有任何出口。
    expect(Object.keys(PROVENANCE_UNVERIFIABLE).sort())
      .toEqual(["draft_shots", "edit_timeline", "export_video", "generate", "list_models"]);
  });

  it("「还没进表」的清单也是棘轮：静默的空白与「想过了」长得一模一样，所以它必须被写出来", () => {
    expect([...NOT_YET_DECLARED].sort()).toEqual([
      "arrange_canvas", "list_models", "look_at_canvas", "look_at_media", "make_artifact",
      "read_script", "read_timeline", "stage_shot", "start_model_setup", "write_script",
    ]);
    // 两份名单不许有交集，加起来也不许漏掉任何一个动词——否则「没进表」就成了静默的第三种状态。
    expect([...Object.keys(VERB_FIELD_PROVENANCE), ...NOT_YET_DECLARED].sort().length).toBe(20);
  });
});

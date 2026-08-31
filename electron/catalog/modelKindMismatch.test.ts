import { describe, it, expect } from "vitest";
import { selectExecutableModel, type Model } from "./types";
import { guessModelKind } from "./modelKindHeuristic";

/**
 * 「模型类型猜错」这条链的结构性回归（2026-08-11）。
 *
 * 病根提醒：接入时类型是按 id 关键词猜的，猜错之后模型不报错、而是**从对应下拉里消失**
 * （每层都按 kind 过滤）。所以这里锁两件事：① 猜得准不准（3D 有自己的桶、不误伤旧四类）；
 * ② kind 过滤语义没被人「顺手放宽」——那个严格过滤是对的，放宽等于让错类型的模型偷偷跑起来。
 */

function model(over: Partial<Model>): Model {
  return {
    modelKey: "m",
    vendorKey: "relay",
    labelZh: "m",
    kind: "text",
    enabled: true,
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

describe("guessModelKind — 3D 桶", () => {
  it("3D 模型族 → model3d（此前必定落进 text 兜底桶）", () => {
    for (const id of [
      "hunyuan3d-2", "hunyuan3d-v3.1", "tripo3d", "triposr", "trellis-large",
      "meshy-4", "hitem3d", "instantmesh", "wonder3d", "unique3d",
    ]) {
      expect(guessModelKind(id), id).toBe("model3d");
    }
  });

  it("不误伤既有四类（3D 词表最先判，必须收得够窄）", () => {
    expect(guessModelKind("veo3.1-fast")).toBe("video");
    expect(guessModelKind("runway-gen3")).toBe("video");
    expect(guessModelKind("jimeng-video-3.0")).toBe("video");
    expect(guessModelKind("seedream-3")).toBe("image");
    expect(guessModelKind("claude-3-opus")).toBe("text");
    expect(guessModelKind("deepseek-v3-0324")).toBe("text");
    expect(guessModelKind("minimax-speech-02")).toBe("audio");
  });

  it("猜不中的照旧落 text —— 这是**预期**，不是待修的 bug", () => {
    // sd3 / 各家私有命名 都不在词表里。关键词判类必然覆盖不全，所以这次的修法不是把词表堆大
    // （那是没有尽头的追赶），而是让猜错**可见可改**：接入第二屏每行标类型可就地改，落库后在
    // 模型抽屉里仍可改，且改类型会连调用通道一起重建。这条断言把那个前提钉住。
    expect(guessModelKind("sd3-medium")).toBe("text");
    expect(guessModelKind("some-house-brand-v2")).toBe("text");
  });
});

describe("selectExecutableModel — kind 过滤必须保持严格", () => {
  it("kind 不符时选不出来（放宽的话错类型模型会被静默派发）", () => {
    const asText = model({ modelKey: "seedream-4-0", kind: "text" });
    expect(selectExecutableModel([asText], "relay", "seedream-4-0", "image")).toBeUndefined();
    // 不给 kind（如按 vendor 找任意一条）时仍应选得出——两种调用方式语义不同，别一起收紧。
    expect(selectExecutableModel([asText], "relay", "seedream-4-0")?.modelKey).toBe("seedream-4-0");
  });

  it("kind 相符时正常选出", () => {
    const asImage = model({ modelKey: "seedream-4-0", kind: "image" });
    expect(selectExecutableModel([asImage], "relay", "seedream-4-0", "image")?.kind).toBe("image");
  });
});

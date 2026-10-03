// 一镜是图还是视频只有一个答案（2026-09-30 付费卡① 第 9 条）。
//
// 用户那条路：「做一个封面，3:4」→ 画布上建了视频节点、卡标题说「生成这 1 段视频？」，卡体却是图片模型。
// 种类是按提示词猜的，卡标题 / 卡体 / 画布节点 / 派发又各读各的。这里钉住两件事：
//   ① 建镜头时种类只从「点名的模型 + 明写的种类」来（`resolveShotTaskKind`），提示词不进来；
//   ② 建好之后四处只读同一个函数（`generationShotKind`）。
import { describe, expect, it } from "vitest";

import { generationShotKind, resolveShotTaskKind } from "./generationShotKind";

const IMAGE_MODEL = ["text_to_image", "image_edit"];
const VIDEO_MODEL = ["text_to_video", "image_to_video"];

describe("resolveShotTaskKind：建一镜时它要哪一种", () => {
  it("点名的图片模型 → 图片；有参考图 → 改图", () => {
    expect(resolveShotTaskKind({ modelModes: IMAGE_MODEL, hasReferences: false })).toEqual({ ok: true, taskKind: "text_to_image" });
    expect(resolveShotTaskKind({ modelModes: IMAGE_MODEL, hasReferences: true })).toEqual({ ok: true, taskKind: "image_edit" });
  });

  it("点名的视频模型 → 视频；有参考图 → 图生视频", () => {
    expect(resolveShotTaskKind({ modelModes: VIDEO_MODEL, hasReferences: false })).toEqual({ ok: true, taskKind: "text_to_video" });
    expect(resolveShotTaskKind({ modelModes: VIDEO_MODEL, hasReferences: true })).toEqual({ ok: true, taskKind: "image_to_video" });
  });

  it("模型只有一档时有没有参考图都是那一档（不编一档它没有的）", () => {
    expect(resolveShotTaskKind({ modelModes: ["image_edit"], hasReferences: false })).toEqual({ ok: true, taskKind: "image_edit" });
    expect(resolveShotTaskKind({ modelModes: ["text_to_video"], hasReferences: true })).toEqual({ ok: true, taskKind: "text_to_video" });
  });

  it("目录里的拼法（连字符）照样认", () => {
    expect(resolveShotTaskKind({ modelModes: ["text-to-image"], hasReferences: false })).toEqual({ ok: true, taskKind: "text_to_image" });
  });

  it("明写的种类：模型做得了就用它，做不了就拒绝并列出它声明的模式", () => {
    expect(resolveShotTaskKind({ explicit: "image_edit", modelModes: IMAGE_MODEL, hasReferences: false })).toEqual({ ok: true, taskKind: "image_edit" });
    expect(resolveShotTaskKind({ explicit: "text_to_video", modelModes: IMAGE_MODEL, hasReferences: false }))
      .toEqual({ ok: false, refusal: { reason: "model_cannot_do", requested: "text_to_video", declared: IMAGE_MODEL } });
  });

  it("明写的种类、没点名模型 → 照单收下（默认模型按它挑）", () => {
    expect(resolveShotTaskKind({ explicit: "text_to_video", hasReferences: false })).toEqual({ ok: true, taskKind: "text_to_video" });
  });

  it("什么都没写、也没点名模型 → 拒绝（不按提示词猜；这个函数根本不收提示词）", () => {
    expect(resolveShotTaskKind({ hasReferences: false })).toEqual({ ok: false, refusal: { reason: "kind_unspecified" } });
  });

  it("模型既出图又出视频、又没写种类 → 拒绝，请写明", () => {
    expect(resolveShotTaskKind({ modelModes: ["text_to_image", "text_to_video"], hasReferences: false }))
      .toEqual({ ok: false, refusal: { reason: "model_ambiguous", supported: ["text_to_image", "text_to_video"] } });
  });

  it("模型不出图也不出视频 → 拒绝，说它声明了什么", () => {
    expect(resolveShotTaskKind({ modelModes: ["text_to_audio"], hasReferences: false }))
      .toEqual({ ok: false, refusal: { reason: "model_cannot_do", declared: ["text_to_audio"] } });
  });
});

describe("generationShotKind：建好之后四处读的那一个答案", () => {
  it("按候选的模式：图片两档是图片，视频两档是视频", () => {
    expect(generationShotKind({ candidate: { mode: "text_to_image" } })).toBe("image");
    expect(generationShotKind({ candidate: { mode: "image-edit" } })).toBe("image");
    expect(generationShotKind({ candidate: { mode: "text_to_video" } })).toBe("video");
    expect(generationShotKind({ candidate: { mode: "image_to_video" } })).toBe("video");
  });

  it("参考卡恒为图片——它是定形象用的那张图", () => {
    expect(generationShotKind({ role: "anchor", candidate: { mode: "text_to_video" } })).toBe("image");
  });

  it("认不出的旧模式照旧按视频算（画布落地一直以来的兜底），所有读者共用这一个兜底", () => {
    expect(generationShotKind({ candidate: {} })).toBe("video");
    expect(generationShotKind({ candidate: { mode: "legacy-mode" } })).toBe("video");
  });

  // 变异对照：旧的画布落地是 `/image/i.test(mode)`——它会把「image_to_video」判成图片，
  // 于是一段图生视频在画布上落成图片节点，卡标题却说视频。新答案不许再那样。
  it("「图生视频」是视频，不因为名字里有 image 就判成图片", () => {
    expect(generationShotKind({ candidate: { mode: "image_to_video" } })).toBe("video");
  });
});

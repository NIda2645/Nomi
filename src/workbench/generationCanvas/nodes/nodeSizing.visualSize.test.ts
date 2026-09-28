import { describe, expect, it } from "vitest";
import { getNodeSizeBounds, resolveNodeVisualSize } from "./nodeSizing";
import { CARD_FIXED_WIDTH } from "./nodeSizing";

// 回归：连线「连不上」的根因是锚点用名义 node.size，而卡片类实际按固定宽渲染。
// resolveNodeVisualSize 必须返回**真实渲染尺寸**，让连线锚点落在节点框上而非框外空中。
const node = (over: Record<string, unknown>) => over as Parameters<typeof resolveNodeVisualSize>[0];

describe("resolveNodeVisualSize — 真实渲染尺寸（连线锚点单一真相源）", () => {
  it("character-card：名义 size.width=300 但实渲固定宽 200（本次根因）", () => {
    const v = resolveNodeVisualSize(node({ kind: "character", size: { width: 300, height: 190 } }));
    expect(v.width).toBe(200);
    expect(v.width).toBe(CARD_FIXED_WIDTH["character-card"]);
    // 名义 300 与实渲 200 差 100px ⇒ 旧锚点（用 size.width）让连线从节点右侧 100px 外起笔。
    expect(v.width).not.toBe(300);
  });

  it("scene-card 固定宽 320；audio-strip 固定 420×80", () => {
    expect(resolveNodeVisualSize(node({ kind: "scene", size: { width: 300, height: 190 } })).width).toBe(320);
    const audio = resolveNodeVisualSize(node({ kind: "audio", size: { width: 300, height: 190 } }));
    expect(audio).toEqual({ width: 420, height: 80 });
  });

  it("非卡片节点（无 size）回退到默认宽，不被卡片固定宽影响", () => {
    // image 在 shots（无 categoryId 信号）→ 非卡片；无 size 时按 max(minWidth, 默认宽)
    const v = resolveNodeVisualSize(node({ kind: "image", size: { width: 340, height: 280 } }));
    expect(v.width).toBe(340); // 非卡片不套固定宽，沿用 size.width
  });

  it("已存 meta.previewHeight 的卡片：高用 previewHeight（与渲染一致），宽仍固定", () => {
    const v = resolveNodeVisualSize(
      node({ kind: "character", size: { width: 300, height: 190 }, meta: { previewHeight: 260 } }),
    );
    expect(v.width).toBe(200);
    expect(v.height).toBe(260);
  });

  it("媒体节点高用实渲 previewHeight 而非名义 size.height（连线终点落空的真因）", () => {
    // video 镜头节点名义 size.height=340，但按比例实渲更矮（meta.previewHeight=236）。
    // 连线终点必须锚到 236（端口真实位置），否则落在节点下方 52px 处＝「线条没连上」。
    const v = resolveNodeVisualSize(
      node({ kind: "video", categoryId: "shots", renderKind: "shot-frame", size: { width: 420, height: 340 }, meta: { previewHeight: 236 } }),
    );
    expect(v.height).toBe(236);
    expect(v.height).not.toBe(340);
  });

  it("剪辑节点保持轴的紧凑尺寸，让连接锚点与画布上实际外壳一致", () => {
    expect(resolveNodeVisualSize(node({ kind: "clip", size: { width: 560, height: 360 } }))).toEqual({ width: 560, height: 132 });
    expect(getNodeSizeBounds("clip")).toMatchObject({ minWidth: 560, maxWidth: 960, minHeight: 120, maxHeight: 180 });
  });
});

const imageResult = { id: 'generated', type: 'image', url: 'nomi-local://asset/image.png', createdAt: 1 };
describe('image results own their intrinsic canvas aspect ratio', () => {
  it.each([[1920, 1080], [1080, 1920], [4096, 256], [256, 4096]])('preserves complete %i×%i image after generation and restoration', (width, height) => {
    const visual = resolveNodeVisualSize(node({ kind: 'image', size: { width: 340, height: 340 }, result: imageResult,
      meta: { imageWidth: width, imageHeight: height, previewHeight: 340, userResized: true } }));
    expect(visual.width / visual.height).toBeCloseTo(width / height, 8);
    expect(visual.width).toBeLessThanOrEqual(680);
    expect(visual.height).toBeLessThanOrEqual(520);
  });
  it('same dimensions, stale previewHeight and next-generation parameters cannot override a measured result', () => {
    const input = { kind: 'image', size: { width: 480, height: 480 }, result: imageResult,
      meta: { imageWidth: 1920, imageHeight: 1080, imageAspectRatio: 1, previewHeight: 480, params: { aspect_ratio: '1:1' } } };
    expect(resolveNodeVisualSize(node(input))).toEqual({ width: 480, height: 270 });
  });
  it('split layout probes and completed asset tiles keep the same tall slot', () => {
    const input = { kind: 'asset', size: { width: 260, height: 1040 }, result: imageResult,
      meta: { source: 'image-grid-split-3x3', previewHeight: 1040 } };
    const probe = resolveNodeVisualSize(node(input));
    expect(probe).toEqual({ width: 260, height: 1040 });
    expect(resolveNodeVisualSize(node({ ...input, meta: { ...input.meta, imageWidth: 100, imageHeight: 400 } }))).toEqual(probe);
  });
  it('video and dedicated cards use intrinsic media ratio plus card information', () => {
    const input = { size: { width: 340, height: 340 }, meta: { imageWidth: 1920, imageHeight: 1080, previewHeight: 340 } };
    expect(resolveNodeVisualSize(node({ ...input, kind: 'video', meta: { videoWidth: 1920, videoHeight: 1080, previewHeight: 340 }, result: { ...imageResult, type: 'video' } }))).toEqual({ width: 340, height: 191.25 });
    expect(resolveNodeVisualSize(node({ ...input, kind: 'character', meta: { ...input.meta, cardInfoHeight: 36 }, result: imageResult }))).toEqual({ width: 200, height: 148.5 });
  });
  it('invalid measurements do not invent an aspect ratio', () => {
    expect(resolveNodeVisualSize(node({ kind: 'image', size: { width: 340, height: 240 }, result: imageResult,
      meta: { imageWidth: Infinity, imageHeight: 0 } }))).toEqual({ width: 340, height: 240 });
  });
});

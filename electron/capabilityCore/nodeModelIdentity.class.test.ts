// 类级回归：节点上的模型身份**写得进就必须校验、写进去就必须读得回来**。
//
// 旧状态是两个缺口互相掩护：`bindModelIdentity` 注释自陈「非法/未知值原样存——校验留在 UI」，
// 而走这条路的是 MCP，UI 那层校验在这条路上根本不存在（UI 路传的是已组装好的 meta，
// 从不传 vendor/modelKey）；同时 `canvasRead` 的 `.strict()` 节点**一个模型字段都不返回**，
// 于是写错的模型键既拦不住、也读不回来——外部宿主要到点生成那一刻才发现。
import { describe, expect, it } from "vitest";

import { CanvasGraphError, addNodes, type CanvasSnapshot } from "./canvasGraph";
import { projectCanvasRead } from "../shared/agentCapabilities/canvasRead";

const emptySnapshot = (): CanvasSnapshot => ({ nodes: [], edges: [] });

/** 目录桩：只认一个 image 模型和一个 video 模型（真判据在 core.assertCatalogModelIdentity）。 */
const assertModelIdentity = (identity: { vendor?: string; modelKey?: string; kind: string }): void => {
  const catalog = [
    { vendor: "apimart", modelKey: "gpt-image-2", kind: "image" },
    { vendor: "apimart", modelKey: "doubao-seedance-2.0", kind: "video" },
  ];
  const expected = identity.kind === "video" ? "video" : "image";
  const matched = catalog.filter((row) => row.modelKey === identity.modelKey
    && (!identity.vendor || row.vendor === identity.vendor));
  if (matched.length === 0) throw new CanvasGraphError("unknown_model_identity", `no such model: ${identity.modelKey}`);
  if (!matched.some((row) => row.kind === expected)) {
    throw new CanvasGraphError("unknown_model_identity", `${identity.modelKey} is not a ${expected} model`);
  }
};

describe("canvas node model identity", () => {
  it("refuses a model key the catalog does not have", () => {
    expect(() => addNodes(emptySnapshot(), [{ kind: "image", modelKey: "gpt-image-9", vendor: "apimart" }], { assertModelIdentity }))
      .toThrow(CanvasGraphError);
  });

  it("refuses a model whose kind does not match the node", () => {
    // 把 video 模型挂到 image 节点上：过去照存不误，生成时才炸。
    expect(() => addNodes(emptySnapshot(), [{ kind: "image", modelKey: "doubao-seedance-2.0", vendor: "apimart" }], { assertModelIdentity }))
      .toThrow(/not a image model/);
  });

  it("still accepts a real model and keeps the identity the resolver reads", () => {
    const { snapshot } = addNodes(emptySnapshot(), [{ kind: "image", modelKey: "gpt-image-2", vendor: "apimart" }], { assertModelIdentity });
    expect(snapshot.nodes[0]!.meta).toMatchObject({
      modelKey: "gpt-image-2", modelAlias: "gpt-image-2", modelVendor: "apimart", vendor: "apimart",
    });
  });

  it("does not validate when the caller names no model at all (renderer auto-select path)", () => {
    const { snapshot } = addNodes(emptySnapshot(), [{ kind: "image" }], { assertModelIdentity });
    expect(snapshot.nodes[0]!.meta).not.toHaveProperty("modelKey");
  });

  it("reads the model identity back out of the canvas", () => {
    const { snapshot } = addNodes(emptySnapshot(), [{ kind: "video", modelKey: "doubao-seedance-2.0", vendor: "apimart" }], { assertModelIdentity });
    const withVariant = {
      ...snapshot,
      nodes: snapshot.nodes.map((node) => ({ ...node, meta: { ...(node.meta as Record<string, unknown>), variantId: "mini", modeId: "t2v" } })),
    };
    const read = projectCanvasRead(withVariant);
    expect(read.nodes[0]!.model).toEqual({
      modelKey: "doubao-seedance-2.0", vendor: "apimart", variantId: "mini", modeId: "t2v",
    });
  });

  it("omits the model block entirely for a node that carries none", () => {
    // 分级披露：读画布只带标识，不带参数表；没有模型的节点连这个块都不出现。
    const read = projectCanvasRead({ nodes: [{ id: "n1", kind: "text", meta: {} }], edges: [] });
    expect(read.nodes[0]).not.toHaveProperty("model");
  });
});

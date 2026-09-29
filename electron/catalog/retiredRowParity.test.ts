// 「这一行退役了没有」只有一个答案：执行侧 findExecutableModel 的「记录整条不在 = Model is retired」。
//
// 渲染层 resolveExecutableNodeFromCatalog 在请求出门前还要替节点把关（钉死的那家断开了就给明确的恢复路，
// 不许静默换家）。2026-09-09 起它对「这家在、可这一行用不了」一律抢答「供应商断开」，于是退役行的
// 「这个模型已经下线了」+「换个模型」从画布上再也够不着（2026-09-29 Sora 2 退役走查抓到）。
// 修法是渲染层**行不在就不抢答**，原样交给执行侧——这就要求两层对「行不在」的判据逐条同序。
//
// 本文件是两层的对等棘轮：同一份落盘目录，渲染层「不抢答」⇔ 执行侧「Model is retired」。
// 渲染层读的是真实 catalogStore 的清单（与 IPC 背后同一个函数），执行侧读的是同一个文件；
// 哪一层单独改了判据（加 kind 过滤、只看启用行、别名不认……），这里就红。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let userDataRoot = "";

vi.mock("electron", () => ({
  app: {
    getPath: () => userDataRoot,
    getAppPath: () => process.cwd(),
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}));

import { listModelCatalogModels, listModelCatalogVendors } from "./catalogStore";
import { findExecutableModel } from "./executableModel";
import { CURRENT_CATALOG_VERSION, type CatalogState, type Model } from "./types";
import { resolveExecutableNodeFromCatalog } from "../../src/workbench/generationCanvas/runner/catalogTaskResolve";
import type { GenerationCanvasNode } from "../../src/workbench/generationCanvas/model/generationCanvasTypes";
import type { ModelCatalogModelDto, ModelCatalogVendorDto } from "../../src/workbench/api/modelCatalogApi";

const now = "2026-09-29T00:00:00.000Z";

/** 老项目里存着 Sora 2 的视频节点（升级前的旧项目长这样）。 */
const oldNode: GenerationCanvasNode = {
  id: "old-sora",
  kind: "video",
  title: "",
  position: { x: 0, y: 0 },
  prompt: "海浪拍打礁石",
  meta: { modelKey: "sora-2", modelAlias: "sora-2", modelVendor: "apimart", vendor: "apimart" },
};

function model(overrides: Partial<Model>): Model {
  return { vendorKey: "apimart", modelKey: "veo3.1-fast", labelZh: "Veo 3.1 Fast", kind: "video", enabled: true, createdAt: now, updatedAt: now, ...overrides };
}

function seed(input: { vendorEnabled?: boolean; models: Model[] }): void {
  const state: CatalogState = {
    version: CURRENT_CATALOG_VERSION,
    vendors: [{ key: "apimart", name: "APIMart", enabled: input.vendorEnabled ?? true, authType: "bearer", createdAt: now, updatedAt: now }],
    models: input.models,
    mappings: [],
    apiKeysByVendor: {
      apimart: { vendorKey: "apimart", apiKey: Buffer.from("placeholder").toString("base64"), enc: "safeStorage", enabled: true, createdAt: now, updatedAt: now },
    },
  };
  fs.writeFileSync(path.join(userDataRoot, "model-catalog.json"), JSON.stringify(state), "utf8");
}

/** 渲染层：原样放行（交执行侧判）、当场抢答（抛错），还是解析到了可用的行。 */
async function rendererVerdict(): Promise<"defer" | "pre-empt" | "resolved"> {
  try {
    const resolved = await resolveExecutableNodeFromCatalog(oldNode, {
      listCatalogVendors: async () => listModelCatalogVendors() as unknown as ModelCatalogVendorDto[],
      listCatalogModels: async (params) => listModelCatalogModels(params) as unknown as ModelCatalogModelDto[],
    });
    return resolved === oldNode ? "defer" : "resolved";
  } catch {
    return "pre-empt";
  }
}

/** 执行侧：同一个节点身份出门时，唯一的判定说什么。 */
function mainVerdict(): string {
  try {
    findExecutableModel("apimart", "sora-2", "video");
    return "executable";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

beforeEach(() => {
  userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-retired-row-parity-"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  fs.rmSync(userDataRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("退役判据两层对等：渲染层不抢答 ⇔ 执行侧 Model is retired", () => {
  const cases: Array<{ name: string; vendorEnabled?: boolean; models: Model[] }> = [
    { name: "这家启用着、行整条不在（已退役，如 Sora 2）", models: [model({})] },
    { name: "行还在、只是被停用", models: [model({}), model({ modelKey: "sora-2", labelZh: "Sora 2", enabled: false })] },
    { name: "行还在、登记成了别的类型", models: [model({ modelKey: "sora-2", labelZh: "Sora 2", kind: "image" })] },
    { name: "行在、按别名认得出（停用）", models: [model({ modelKey: "sora-2-vendor-id", modelAlias: "sora-2", labelZh: "Sora 2", enabled: false })] },
    { name: "这家本身没启用、行也不在", vendorEnabled: false, models: [model({})] },
  ];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      seed(testCase);
      const renderer = await rendererVerdict();
      const main = mainVerdict();
      // 对等：渲染层放行 恰好当 执行侧说「已退役」。任何一边单独改判据，这一行就红。
      expect({ renderer, retired: main.startsWith("Model is retired:") }).toEqual({
        renderer: main.startsWith("Model is retired:") ? "defer" : "pre-empt",
        retired: main.startsWith("Model is retired:"),
      });
    });
  }

  it("退役那一种：放行的节点身份一个字不改，执行侧给的正是退役签名", async () => {
    seed({ models: [model({})] });
    expect(await rendererVerdict()).toBe("defer");
    expect(mainVerdict()).toBe("Model is retired: sora-2");
    expect(oldNode.meta).toMatchObject({ modelKey: "sora-2", modelVendor: "apimart" });
  });
});

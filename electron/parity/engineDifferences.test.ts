/**
 * 「七项引擎差异」各一条最小用例（sweep2 §二 表 1）。
 *
 * ── 为什么这七条必须先有测试，再铺开执行器 ────────────────────────────────────
 * 引擎 A（`runtime.runTask`）与引擎 B（`apimartGenerationProvider`）共享三个原语
 * （`buildProfileHttpRequest` / `applyHeadlessParamDefaults` / `requestTransforms`）——
 * **报文骨架是一份**。分歧全在骨架外面这七步。今天大部分打不到，因为引擎 B 只服务
 * APIMart 的内置策展模型；**BL-1 把 B 铺开到所有供应商的那一刻，这七项会同时变成真分歧。**
 * 所以这里先把现状差异固定成已知红：每一条要么是一条活的行为对照，要么是一条
 * 结构断言（引擎 A 的模块图里有那个分支、引擎 B 的没有）。
 *
 * ── 结构断言为什么不是凑数 ────────────────────────────────────────────────────
 * 它的失败方向是对的：主进程 lane 一旦把某一步接进引擎 B，这条就会红，
 * 逼着有人给对等矩阵**补一个真的跑得起来的用例**，而不是悄悄合并。
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("electron", async () => {
  const nodeFs = await import("node:fs");
  const nodeOs = await import("node:os");
  const nodePath = await import("node:path");
  const { electronStub } = await import("./parityElectronMock");
  return electronStub(nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "nomi-parity-engines-")));
});

vi.mock("../capabilityCore/rendererBridge", () => ({
  requestRendererDecision: async () => ({ confirmed: true }),
  requestRenderer: async (operation: string) => { throw new Error(`付费路径不该走带超时的桥: ${operation}`); },
}));

import { driveEngineA, driveEngineB, installFetchCapture, seedParityCatalog, type FetchCapture } from "./generationParityTestUtils";

const ENGINE_A_MODULES = [
  "electron/runtime.ts",
  "electron/catalog/taskParams.ts",
  "electron/catalog/multipartOperation.ts",
  "electron/catalog/customCallMode.ts",
  "electron/catalog/imageRouteFallback.ts",
  "electron/catalog/processOperation.ts",
  "electron/vendor/fingerprintCache.ts",
];
const ENGINE_B_MODULES = [
  "electron/capabilityCore/apimartGenerationProvider.ts",
  "electron/capabilityCore/apimartGenerationProjection.ts",
  "electron/capabilityCore/generationRuntimeAdapter.ts",
];

/**
 * 七项差异的身份表：每一条记「引擎 A 用哪个符号做这一步」。
 * `engineBSymbols` 是引擎 B 里会出现这一步的符号——为空表示今天它根本没有这一步。
 */
const ENGINE_DIFFERENCES = [
  { id: "result-cache", zh: "结果缓存（同一配方不重发、不重扣）", symbol: "readCachedTaskResult" },
  { id: "multipart-upload", zh: "multipart 上传分支", symbol: "runMultipartProfileOperation" },
  { id: "custom-call", zh: "自定义调用脚本", symbol: "resolveCustomCallExecution" },
  { id: "image-edit-guard", zh: "图生图/图生视频的空参考护栏", symbol: "imageEditGuardError" },
  { id: "chat-image-fallback", zh: "chat/completions 图片路的失败回落", symbol: "chatImageFallbackOperation" },
  { id: "async-transform", zh: "异步 request_transform 的付费前预飞", symbol: "validateProfileRequestBeforeSpend" },
  { id: "antigravity-preflight", zh: "antigravity 的创建前预检", symbol: "prepareAntigravityCreateOperation" },
] as const;

const readSources = (files: readonly string[]): string =>
  files.map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8")).join("\n");

let engineASource = "";
let engineBSource = "";
let capture: FetchCapture;

beforeAll(async () => {
  engineASource = readSources(ENGINE_A_MODULES);
  engineBSource = readSources(ENGINE_B_MODULES);
  capture = installFetchCapture();
  await seedParityCatalog(["apimart"]);
}, 60_000);

afterAll(() => { capture?.restore(); });

describe("七项引擎差异 · 每项一条最小用例", () => {
  it("引擎 A 这七步都真的存在（否则下面那组断言在比一个空集合）", () => {
    const missing = ENGINE_DIFFERENCES.filter((entry) => !engineASource.includes(entry.symbol)).map((entry) => entry.id);
    expect(missing).toEqual([]);
  });

  it("两台发动机共享那三个原语（分歧只在骨架外面，这是好消息也是前提）", () => {
    for (const shared of ["buildProfileHttpRequest", "applyHeadlessParamDefaults"]) {
      expect(engineASource.includes(shared), `引擎 A 少了 ${shared}`).toBe(true);
      expect(engineBSource.includes(shared), `引擎 B 少了 ${shared}`).toBe(true);
    }
  });

  it.each(ENGINE_DIFFERENCES.map((entry) => [entry.id, entry.zh, entry.symbol] as const))(
    "已知红 · %s（%s）：引擎 B 今天没有这一步——接进去的那一刻这条会红，届时必须给矩阵补一个跑得起来的用例",
    (_id, _zh, symbol) => {
      expect(engineBSource.includes(symbol)).toBe(false);
    },
  );
});

describe("活的行为对照（一条真跑，一条只钉住前提）", () => {
  it("image-edit 护栏：一张参考图都没有时，引擎 A 一个字节都不发；引擎 B 照发不误", async () => {
    const engineA = await driveEngineA(capture, {
      vendorKey: "apimart",
      kind: "image_edit",
      prompt: "把这张图里的人换成侧脸",
      extras: { modelKey: "gpt-image-2", modelAlias: "gpt-image-2", projectId: "p", nodeId: "n", nodeKind: "image" },
    });
    expect(engineA.request, "引擎 A 应当在付费前拒发").toBeUndefined();
    expect(engineA.failure?.code).toBeTruthy();

    const engineB = await driveEngineB(capture, {
      vendorKey: "apimart", modelId: "gpt-image-2", mode: "image_edit",
      prompt: "把这张图里的人换成侧脸", parameters: {}, references: [],
    });
    expect(engineB.request, "引擎 B 今天没有这道护栏，照样把请求发出去了（已知红）").toBeDefined();
  }, 60_000);

  /**
   * 结果缓存这一条**没有**活的行为对照，理由写在这里而不是留一条 skip：
   * 内置 APIMart 的 create mapping 全是「受理 → 轮询」的异步形状（create 只回 task_id），
   * 而 `rememberTaskResult` 只记终态结果——所以在本夹具里引擎 A 的缓存根本写不进去，
   * 写一条「两次都发」的断言会把「夹具到不了那一步」冒充成「两台一样」。
   * 这里改成断言那个**前提**本身：一旦目录里出现同步返终态的 create mapping，
   * 这条会红，届时必须补一个真的能命中缓存的对照。
   */
  it("结果缓存：本夹具够不到（内置 APIMart 全是异步受理），所以只钉住这个前提", async () => {
    const store = await import("../catalog/catalogStore");
    // 音频那两条确实是同步的，但它们走 runAudioTask 那条支路（不经指纹缓存），所以不算。
    const synchronousCreates = store.readCatalog().mappings
      .filter((mapping) => mapping.vendorKey === "apimart" && !mapping.query
        && /image|video/.test(mapping.taskKind))
      .map((mapping) => mapping.id);
    expect(synchronousCreates).toEqual([]);
  }, 60_000);
});

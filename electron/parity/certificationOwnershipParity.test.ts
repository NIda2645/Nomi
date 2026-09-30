/**
 * (c) 画布与 Agent 对同一份目录给同一个答案（2026-09-29，A10b 结构修复）。
 *
 * 报错用户的现场：内置 APIMart 上点过「继续验证」手加一个模型去自检——走渲染层真实的新建写门，
 * 那一行天生带 `meta.adapter`。画布（引擎 A，`runtime.runTask`）照样出图；Agent 付款卡 / 执行计划 /
 * 外部 MCP / 全自动 Run（引擎 B，`createGenerationProviderBootstrap` 造的 provider）对整家 APIMart
 * 关门，报「Provider apimart lacks required recovery capabilities: configured_provider」。
 * 两台发动机对同一份目录给了两个答案——这正是对等矩阵要拦的那一类分歧，只是矩阵的目录里没人点过自检。
 *
 * 这里在「点过自检」的真实目录上跑遍全部生成入口，断言每一个入口都真的发出了请求、且和画布那一路
 * 逐字段相同（同 generationParity.matrix.test.ts 的判据）。
 * 复验它会红：把「这条连接归不归认证管」改回「这家名下任何一行带标记就算」→ 五个引擎 B 入口全部红在
 * configured_provider。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("electron", async () => {
  const nodeFs = await import("node:fs");
  const nodeOs = await import("node:os");
  const nodePath = await import("node:path");
  const { electronStub } = await import("./parityElectronMock");
  return electronStub(nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "nomi-parity-cert-owner-")));
});

// 付费确认等的是人：这里替他点头，钱闸本身照旧真跑（同对等矩阵）。
vi.mock("../capabilityCore/rendererBridge", () => ({
  requestRendererDecision: async () => ({ confirmed: true }),
  requestRenderer: async (operation: string) => { throw new Error(`付费路径不该走带超时的桥: ${operation}`); },
}));

import { BASELINE_ENTRANCE_ID, GENERATION_ENTRANCES } from "./generationEntrances";
import { PARITY_CASES } from "./parityCases";
import { driveEntrance } from "./parityDrive";
import { diffRecords, type OutboundRecord } from "./outboundRecord";
import { installFetchCapture, seedParityCatalog, type FetchCapture } from "./generationParityTestUtils";

const BASELINE_CASE = PARITY_CASES.find((testCase) => testCase.id === "baseline-t2i")!;
let capture: FetchCapture;
const records = new Map<string, OutboundRecord>();

beforeAll(async () => {
  capture = installFetchCapture();
  await seedParityCatalog([BASELINE_CASE.vendorKey]);
  // 报错用户的那一步：手填一个模型 id 去自检（渲染层新建写门 = 设置页「继续验证」加模型的那一扇）。
  const { upsertRendererCatalogModel } = await import("../catalog/rendererCatalogMutation");
  upsertRendererCatalogModel({ vendorKey: BASELINE_CASE.vendorKey, modelKey: "gpt-image-1", labelZh: "gpt-image-1", kind: "image", enabled: false });
  for (const entrance of GENERATION_ENTRANCES) records.set(entrance.id, await driveEntrance(capture, entrance, BASELINE_CASE));
}, 120_000);

afterAll(() => { capture?.restore(); });

describe("(c) 点过自检的目录上，画布与 Agent 给同一个答案", () => {
  it("那一行确实带着认证标记（否则这场对比测的不是报错用户的现场）", async () => {
    const { readCatalog } = await import("../catalog/catalogStore");
    const row = readCatalog().models.find((model) => model.vendorKey === BASELINE_CASE.vendorKey && model.modelKey === "gpt-image-1");
    expect(row?.meta).toMatchObject({ adapter: { state: "unverified" } });
  });

  it("每一个生成入口都真的发出了请求（画布、Agent 付款卡、执行计划、外部 MCP、全自动 Run）", () => {
    const refused = GENERATION_ENTRANCES
      .filter((entrance) => !records.get(entrance.id)?.request)
      .map((entrance) => `${entrance.id}(${entrance.engine}): ${JSON.stringify(records.get(entrance.id)?.failure)}`);
    expect(refused).toEqual([]);
  });

  it("每一个入口发出去的都和画布那一路逐字段相同", () => {
    const baseline = records.get(BASELINE_ENTRANCE_ID)!;
    const drift = GENERATION_ENTRANCES
      .filter((entrance) => entrance.id !== BASELINE_ENTRANCE_ID && !entrance.appendsRetryDirective)
      .flatMap((entrance) => diffRecords(baseline, records.get(entrance.id)!).map((difference) => `${entrance.id} · ${difference.field}`));
    expect(drift).toEqual([]);
  });
});

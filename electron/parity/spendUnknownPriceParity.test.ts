/**
 * 钱那一轴的对等（A4 对账）：同一个模型，**两把闸对「算不出价」给的是不是同一个答案**。
 *
 *   · 令牌闸（手动画布／分镜行／试跑）：`spendQuote.ts:9 quoteSpendLine` → `spendGrant.ts` 的
 *     `unknownRemaining` 名额位。
 *   · 信封闸（Agent 付款卡／提交执行计划／MCP／全自动 Run）：
 *     `productionRun/catalogPricingResolver.ts:51` → 信封上的 `price.maximum` +
 *     `productionGenerationAuthorization.ts:133 countUnknownJobPrices`。
 *
 * 两条必须同时成立：**算不出价不许折成 0**（0 是「免费」，不是「不知道」），
 * 且两把闸对同一行给的金额位逐字节相同。这条今天是**绿**的——它是两轮横扫里
 * 「A4 可以关」那条判断的机器对账，也是整张矩阵的阴性对照（证明矩阵不是只会报红）。
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("electron", async () => {
  const nodeFs = await import("node:fs");
  const nodeOs = await import("node:os");
  const nodePath = await import("node:path");
  const { electronStub } = await import("./parityElectronMock");
  return electronStub(nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "nomi-parity-spend-")));
});

import { seedParityCatalog } from "./generationParityTestUtils";

const UNPRICED = { vendorKey: "apimart", modelKey: "z-image-turbo" };
const PRICED = { vendorKey: "apimart", modelKey: "gpt-image-2", cost: 0.3 };

type Answer = { amount: number | null; unknown: number };
const answers = new Map<string, { token: Answer; envelope: Answer }>();

beforeAll(async () => {
  await seedParityCatalog(["apimart"]);
  const store = await import("../catalog/catalogStore");
  store.upsertModelCatalogModel({
    vendorKey: PRICED.vendorKey, modelKey: PRICED.modelKey, kind: "image", enabled: true,
    pricing: { cost: PRICED.cost, enabled: true, specCosts: [] },
  });

  const { quoteSpendLine } = await import("../spendQuote");
  const { createCatalogShotPriceResolver } = await import("../productionRun/catalogPricingResolver");
  const { countUnknownJobPrices } = await import("../productionRun/productionGenerationAuthorization");
  const resolveShotPrice = createCatalogShotPriceResolver(store.readCatalog().models);

  for (const row of [UNPRICED, PRICED]) {
    const line = quoteSpendLine({ vendorKey: row.vendorKey, modelKey: row.modelKey, parameters: {} });
    const shot = resolveShotPrice({
      providerId: row.vendorKey, modelId: row.modelKey, parameters: {},
    } as never);
    const maximum = shot.known ? shot.amount : null;
    answers.set(row.modelKey, {
      token: { amount: line.amount, unknown: line.amount === null ? 1 : 0 },
      envelope: { amount: maximum, unknown: countUnknownJobPrices([{ price: { maximum } }]) },
    });
  }
});

describe("钱那一轴 · 令牌闸 vs 信封闸", () => {
  it("算不出价的模型：两把闸都记「未知」，且都不是 0", () => {
    const answer = answers.get(UNPRICED.modelKey)!;
    expect(answer.token).toEqual({ amount: null, unknown: 1 });
    expect(answer.envelope).toEqual({ amount: null, unknown: 1 });
  });

  it("有价的模型：两把闸给同一个数，未知计数都是 0", () => {
    const answer = answers.get(PRICED.modelKey)!;
    expect(answer.token).toEqual({ amount: PRICED.cost, unknown: 0 });
    expect(answer.envelope).toEqual({ amount: PRICED.cost, unknown: 0 });
  });

  it("两把闸的金额位在两种模型上都逐字段相同", () => {
    for (const [modelKey, answer] of answers) {
      expect({ modelKey, ...answer.token }).toEqual({ modelKey, ...answer.envelope });
    }
  });
});

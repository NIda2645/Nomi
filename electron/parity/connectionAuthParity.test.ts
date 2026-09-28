/**
 * 「由连接得到的鉴权头」四路对等（只测、不修）。
 *
 * 同一个用户、同一把钥匙、同一家供应商，四条路各自拼一次 Authorization：
 *   ① 生成（`buildProfileHttpRequest` → `authHeaders(…, vendor.authScheme)`）
 *   ② 探测（`ai/onboarding/vendorHealth.ts:91`）
 *   ③ 自检（`providerAdapter/selfCheck.ts:74`）
 *   ④ 接入向导「列出这家的模型」（`integrationCertification/httpConnector.ts:112`）
 *
 * 试金石是内置的 Higgsfield：它的方案词是 `Key` 不是 `Bearer`（`vendor.authScheme`）。
 * 用户镜头里的分歧就是群里最常见的那句：「key 是对的啊，生成都能跑，怎么这里说连不上」。
 *
 * 2026-09-21：④ 曾经写死 `Bearer`（BL-2）。主进程 lane 把 `VendorAuthSpec` 收成单一 owner 之后四条
 * 路实测同形，本文件的对比断言因此从「只测不修的 it.fails」转成常驻的防回归断言。
 */
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("electron", async () => {
  const nodeFs = await import("node:fs");
  const nodeOs = await import("node:os");
  const nodePath = await import("node:path");
  const { electronStub } = await import("./parityElectronMock");
  return electronStub(nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "nomi-parity-auth-")));
});

import { installFetchCapture, seedParityCatalog, type FetchCapture } from "./generationParityTestUtils";
import { redactAuthorization } from "./outboundRecord";

const VENDOR_KEY = "higgsfield";
let capture: FetchCapture;
const headerByPath = new Map<string, string>();

async function captureAuthorization(label: string, run: () => Promise<unknown>): Promise<void> {
  capture.reset();
  try { await run(); } catch { /* 这条路能不能连上不是本测试的判据，头的形状才是 */ }
  const call = capture.calls[0];
  headerByPath.set(label, call ? redactAuthorization(call.headers) : "(没有出站请求)");
}

beforeAll(async () => {
  // 供应商健康探测有 TTL 缓存，别让别的测试留下的记忆影响这一轮。
  capture = installFetchCapture();
  const state = await seedParityCatalog([VENDOR_KEY]);
  const vendor = state.vendors.find((candidate) => candidate.key === VENDOR_KEY);
  expect(vendor?.authScheme, "内置 Higgsfield 必须声明 authScheme=Key，否则这条试金石失效").toBe("Key");

  const { buildProfileHttpRequest } = await import("../catalog/profileHttpRequest");
  const { selectTaskMapping } = await import("../catalog/types");
  const model = state.models.find((candidate) => candidate.vendorKey === VENDOR_KEY && candidate.kind === "image")!;
  const mapping = selectTaskMapping(state.mappings, VENDOR_KEY, "text_to_image", model.modelKey)!;
  const generation = buildProfileHttpRequest({
    vendor: vendor!, model, apiKey: "sk-parity-higgsfield",
    request: { kind: "text_to_image", prompt: "a red paper crane", extras: {} } as never,
    operation: mapping.create,
  });
  headerByPath.set("① 生成", redactAuthorization(generation.headers));

  const { resetVendorHealthCache, checkVendorHealth } = await import("../ai/onboarding/vendorHealth");
  resetVendorHealthCache();
  await captureAuthorization("② 探测", () => checkVendorHealth(VENDOR_KEY, true));

  const { probeAdapterCredential } = await import("../providerAdapter/selfCheck");
  await captureAuthorization("③ 自检", () => probeAdapterCredential({ vendor: vendor!, apiKey: "sk-parity-higgsfield" }));

  const { HttpProviderConnector } = await import("../integrationCertification/httpConnector");
  await captureAuthorization("④ 列模型", () => new HttpProviderConnector().listExistingModels(VENDOR_KEY));
}, 60_000);

afterAll(() => { capture?.restore(); });

describe("由连接得到的鉴权头 · 四路对等", () => {
  it("四条路都真的出站并拼出了一个鉴权头（否则这场对比是空的，红也是假红）", () => {
    const empty = [...headerByPath.entries()].filter(([, value]) => value === "(none)" || value === "(没有出站请求)");
    expect(empty).toEqual([]);
  });

  // 2026-09-21 合并 ①：BL-2 已由主进程 lane 的 `VendorAuthSpec` 单一 owner 修掉——收紧签名之后
  // 编译器一次点名 7 处自己拼头的地方，`httpConnector` 那条（原先写死 Bearer）是其中之一。
  // 四条路实测都是 `Key <redacted>`，所以这条从 `it.fails` 转正：**它从今天起是防回归的硬断言**。
  it("四条路的鉴权头形状相同（同一把钥匙，同一个方案词）", () => {
    const shapes = [...new Set(headerByPath.values())];
    expect({ shapes, byPath: Object.fromEntries(headerByPath) }).toEqual({
      shapes,
      byPath: Object.fromEntries([...headerByPath.keys()].map((key) => [key, shapes[0]])),
    });
  });

  it("把四条路的头形状写进报告（人看的那一行）", () => {
    const lines = [...headerByPath.entries()].map(([label, value]) => `${label}: ${value}`);
    if (process.env.PARITY_DUMP) fs.writeFileSync(`${process.env.PARITY_DUMP}.auth.txt`, lines.join("\n"));
    expect(lines.length).toBe(4);
  });
});

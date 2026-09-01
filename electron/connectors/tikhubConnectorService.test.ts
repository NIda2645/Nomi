import { describe, expect, it, vi, beforeEach } from "vitest";

// 核心不变量测试（治「乱填也显示已连接」的假成功）：saveTikhubApiKey **先真实校验再落盘**——
// 校验失败时坏 key 绝不进凭据库。这里把 verify 与凭据 upsert 都桩掉，只锁「顺序 + 失败不落盘」这条编排契约。
// verify 本身的行为（打鉴权账户端点、401→auth、no-route 区分）在 tikhubConnector.test.ts 单独锁。

const verifyTikhubApiKey = vi.fn();
const upsertModelCatalogVendorApiKey = vi.fn();
const clearModelCatalogVendorApiKey = vi.fn();
// 凭据态：默认「已存且可解密」= ok，让「校验通过→落盘→回 ok」这条正路能走通。
let decryptStatus: "ok" | "missing" = "missing";

vi.mock("./tikhubConnector", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tikhubConnector")>();
  return { ...actual, verifyTikhubApiKey: (...args: unknown[]) => verifyTikhubApiKey(...args) };
});
vi.mock("../catalog/catalogStore", () => ({
  readCatalog: () => ({ apiKeysByVendor: { tikhub: decryptStatus === "ok" ? { safeStorage: "x" } : undefined } }),
  upsertModelCatalogVendorApiKey: (...args: unknown[]) => upsertModelCatalogVendorApiKey(...args),
  clearModelCatalogVendorApiKey: (...args: unknown[]) => clearModelCatalogVendorApiKey(...args),
}));
vi.mock("../catalog/secrets", () => ({
  apiKeyDecryptStatus: () => decryptStatus,
  decryptApiKeyRecord: () => (decryptStatus === "ok" ? "the-key" : ""),
}));

import { saveTikhubApiKey } from "./tikhubConnectorService";
import { TikhubConnectorError } from "./tikhubConnector";

beforeEach(() => {
  verifyTikhubApiKey.mockReset();
  upsertModelCatalogVendorApiKey.mockReset();
  clearModelCatalogVendorApiKey.mockReset();
  decryptStatus = "missing";
});

describe("saveTikhubApiKey — 先校验再落盘", () => {
  it("校验通过 → 落盘并回 status:'ok'", async () => {
    verifyTikhubApiKey.mockResolvedValue(undefined);
    decryptStatus = "ok"; // 落盘后读回来是 ok
    const result = await saveTikhubApiKey({ apiKey: "  good-key  " });
    expect(verifyTikhubApiKey).toHaveBeenCalledWith("good-key"); // 已 trim
    expect(upsertModelCatalogVendorApiKey).toHaveBeenCalledWith("tikhub", { apiKey: "good-key", enabled: true });
    expect(result).toEqual({ status: "ok", hasKey: true });
  });

  it("校验失败（auth）→ **不落盘**、把 auth 抛给渲染层（不是假的「已连接」）", async () => {
    verifyTikhubApiKey.mockRejectedValue(new TikhubConnectorError("auth", "无效密钥", 401));
    await expect(saveTikhubApiKey({ apiKey: "bad-key" })).rejects.toMatchObject({ kind: "auth" });
    // 关键：坏 key 一次都没写进凭据库。
    expect(upsertModelCatalogVendorApiKey).not.toHaveBeenCalled();
  });

  it("线路不通（no-route）→ 不落盘、抛 no-route（区分「网络问题」而非「key 无效」）", async () => {
    verifyTikhubApiKey.mockRejectedValue(new TikhubConnectorError("no-route", "连不上"));
    await expect(saveTikhubApiKey({ apiKey: "key" })).rejects.toMatchObject({ kind: "no-route" });
    expect(upsertModelCatalogVendorApiKey).not.toHaveBeenCalled();
  });

  it("空 key → missing-key，且不校验、不落盘", async () => {
    await expect(saveTikhubApiKey({ apiKey: "   " })).rejects.toMatchObject({ kind: "missing-key" });
    expect(verifyTikhubApiKey).not.toHaveBeenCalled();
    expect(upsertModelCatalogVendorApiKey).not.toHaveBeenCalled();
  });
});

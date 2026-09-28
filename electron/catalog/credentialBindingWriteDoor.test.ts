// 绑定的**写门只有一扇**：catalog 的 key 写入事务（`applyApiKeyUpsert`）。
//
// 为什么这条要单独测：不变量的一半是「发送时比对」，另一半是「保存时记下」。只测前者的话，
// 一个漏记绑定的路径会让判据静默失效——`readCredentialBinding` 返回 undefined 就是「没有绑定」，
// 而没有绑定是**放行**（不许把「不知道」当「拒绝」）。所以「每条存了 key 的连接都带绑定」
// 必须自己有一条断言。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ root: "" }));
vi.mock("electron", () => ({
  app: { getPath: () => state.root, getAppPath: () => process.cwd() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`sealed:${value}`, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8").replace(/^sealed:/, ""),
  },
}));

describe("凭据绑定的写门", () => {
  beforeEach(() => {
    state.root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-credential-binding-"));
    fs.writeFileSync(path.join(state.root, "model-catalog.json"), JSON.stringify({
      version: 12,
      vendors: [{
        key: "relay", name: "Relay", enabled: true, authType: "bearer",
        providerKind: "openai-compatible", baseUrlHint: "https://api.relay.example",
        createdAt: "t", updatedAt: "t",
      }],
      models: [],
      mappings: [],
      apiKeysByVendor: {},
    }));
    vi.resetModules();
  });

  it("存 key 的同一个事务里记下「这把 key 去哪」", async () => {
    const { upsertModelCatalogVendorApiKey, readCatalog } = await import("./catalogStore");
    const { readCredentialBinding } = await import("./credentialBinding");
    upsertModelCatalogVendorApiKey("relay", { apiKey: "sk-live", enabled: true });
    const binding = readCredentialBinding(readCatalog().vendors[0]);
    expect(binding?.origin).toBe("https://api.relay.example");
    expect(binding?.authType).toBe("bearer");
    expect(binding?.confirmedAt).toBeTruthy();
  });

  it("换地址**不**改绑定——绑定只在用户重新保存密钥时更新（这正是判据要抓的那一类）", async () => {
    const { upsertModelCatalogVendorApiKey, upsertModelCatalogVendor, readCatalog } = await import("./catalogStore");
    const { readCredentialBinding } = await import("./credentialBinding");
    upsertModelCatalogVendorApiKey("relay", { apiKey: "sk-live", enabled: true });
    upsertModelCatalogVendor({ key: "relay", baseUrlHint: "https://api.elsewhere.example" });
    expect(readCatalog().vendors[0].baseUrlHint).toBe("https://api.elsewhere.example");
    expect(readCredentialBinding(readCatalog().vendors[0])?.origin).toBe("https://api.relay.example");
    // 用户自己回到接入页重新保存 → 绑定跟上新地址（这是唯一的改法）。
    upsertModelCatalogVendorApiKey("relay", { apiKey: "sk-live-2", enabled: true });
    expect(readCredentialBinding(readCatalog().vendors[0])?.origin).toBe("https://api.elsewhere.example");
  });

  it("绑定后改名及重新保存密钥都保留 assetIngestion / authScheme", async () => {
    const { upsertModelCatalogVendorApiKey, upsertModelCatalogVendor, readCatalog } = await import("./catalogStore");
    const { readCredentialBinding } = await import("./credentialBinding");
    const assetIngestion = { strategy: "upload-multipart", endpoint: "https://api.relay.example/files", urlPath: "url", accepts: ["image"] };
    upsertModelCatalogVendor({ key: "relay", authScheme: "Key", assetIngestion });
    upsertModelCatalogVendorApiKey("relay", { apiKey: "sk-live", enabled: true });
    const binding = readCredentialBinding(readCatalog().vendors[0]);
    expect(binding).toMatchObject({ origin: "https://api.relay.example", authScheme: "Key" });
    expect(readCatalog().vendors[0]).toMatchObject({ assetIngestion, authScheme: "Key" });

    upsertModelCatalogVendor({ key: "relay", name: "Relay renamed" });
    expect(readCatalog().vendors[0]).toMatchObject({ name: "Relay renamed", assetIngestion, authScheme: "Key" });
    expect(readCredentialBinding(readCatalog().vendors[0])).toEqual(binding);

    upsertModelCatalogVendorApiKey("relay", { apiKey: "sk-live-2", enabled: true });
    expect(readCatalog().vendors[0]).toMatchObject({ assetIngestion, authScheme: "Key" });
    expect(readCredentialBinding(readCatalog().vendors[0])).toEqual(binding);
  });
});

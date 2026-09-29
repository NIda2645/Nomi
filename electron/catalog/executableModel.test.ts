import { describe, it, expect, vi, beforeEach } from "vitest";

// 交付2：findExecutableModel 对「没 key」要分两种诚实说法——missing（真没配）vs locked（key 在但当前宿主
// 身份解不开）。旧实现一律 `API key missing`，把 locked 也压成"没配"，用户去接入页只见 key 好端端在那儿。
// safeStorage mock 与 secrets.test 同款（哨兵 "FAIL" 明文在解密时抛错，模拟身份不匹配的解密失败）。

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => Buffer.from(plain, "utf8"),
    decryptString: (buf: Buffer) => {
      const s = buf.toString("utf8");
      if (s === "FAIL") throw new Error("decrypt failed");
      return s;
    },
  },
}));

// readCatalog 注入：一个启用了 vendor + model 的最小目录，apiKeysByVendor 按用例替换。
const catalogState = {
  version: 8,
  vendors: [{ key: "volcengine", name: "火山", enabled: true, authType: "bearer", createdAt: "t", updatedAt: "t" }],
  models: [{ modelKey: "seedream", vendorKey: "volcengine", labelZh: "Seedream", kind: "image", enabled: true, createdAt: "t", updatedAt: "t" }],
  mappings: [] as Array<Record<string, unknown>>,
  apiKeysByVendor: {} as Record<string, unknown>,
};
vi.mock("./catalogStore", () => ({ readCatalog: () => catalogState }));

import { findExecutableModel } from "./executableModel";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

beforeEach(() => {
  catalogState.apiKeysByVendor = {};
  catalogState.mappings = [{
    id: "published", vendorKey: "volcengine", modelKey: "seedream", taskKind: "text_to_image",
    name: "published", enabled: true, create: { method: "POST", path: "/images" }, createdAt: "t", updatedAt: "t",
  }];
  catalogState.models[0] = { modelKey: "seedream", vendorKey: "volcengine", labelZh: "Seedream", kind: "image", enabled: true, createdAt: "t", updatedAt: "t" };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("findExecutableModel — 诚实 key 错误（missing vs locked）", () => {
  it("没有 key 记录 → 明说「未配置」并指向模型接入", () => {
    catalogState.apiKeysByVendor = {};
    expect(() => findExecutableModel("volcengine", "seedream", "image")).toThrow(/API key missing: volcengine（未配置/);
  });

  it("key 记录在、但 safeStorage 解不开（身份不匹配）→ 明说「key 在但解不开、去 App 重存」，不再笼统 missing", () => {
    catalogState.apiKeysByVendor = {
      volcengine: { vendorKey: "volcengine", apiKey: b64("FAIL"), enc: "safeStorage", enabled: true, createdAt: "t", updatedAt: "t" },
    };
    let message = "";
    try {
      findExecutableModel("volcengine", "seedream", "image");
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    // locked 措辞：必含「重新保存」这条真人可执行动作，且带 vendor 名。
    expect(message).toContain("重新保存");
    expect(message).toContain("volcengine");
    expect(message).toContain("宿主身份");
    // 与 missing 明确不同：不带「未配置」。
    expect(message).not.toContain("未配置");
  });

  it("key 解得开非空 → 正常返回（apiKey 解密到位）", () => {
    catalogState.apiKeysByVendor = {
      volcengine: { vendorKey: "volcengine", apiKey: b64("sk-real"), enc: "safeStorage", enabled: true, createdAt: "t", updatedAt: "t" },
    };
    const resolved = findExecutableModel("volcengine", "seedream", "image");
    expect(resolved.apiKey).toBe("sk-real");
    expect(resolved.model.modelKey).toBe("seedream");
  });

  // 2026-09-11「自检失败不下架」：一次没验成的自检不许让一行比没验过时更不可用。
  it("keeps an enabled adapter candidate with a key and enabled mapping executable while its self-check is unverified", () => {
    catalogState.apiKeysByVendor = {
      volcengine: { vendorKey: "volcengine", apiKey: b64("sk-real"), enc: "safeStorage", enabled: true, createdAt: "t", updatedAt: "t" },
    };
    catalogState.models[0] = {
      ...catalogState.models[0],
      enabled: true,
      meta: { adapter: { state: "unverified", modes: [], updatedAt: "t" } },
    } as typeof catalogState.models[number];
    catalogState.mappings = [{
      id: "raw-enabled", vendorKey: "volcengine", modelKey: "seedream", taskKind: "text_to_image",
      name: "raw enabled", enabled: true, create: { method: "POST", path: "/images" }, createdAt: "t", updatedAt: "t",
    }];

    expect(findExecutableModel("volcengine", "seedream", "image").model.modelKey).toBe("seedream");
  });

  it("legacy plaintext stays a migration-only record and never becomes an executable credential", () => {
    const sentinel = "SENTINEL-LEGACY-EXECUTABLE";
    catalogState.apiKeysByVendor = {
      volcengine: { vendorKey: "volcengine", apiKey: sentinel, enc: "plain", enabled: true, createdAt: "t", updatedAt: "t" },
    };
    let message = "";
    try {
      findExecutableModel("volcengine", "seedream", "image");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("重新保存");
    expect(message).not.toContain(sentinel);
  });

  it("两条错误信息互不相同（missing / locked 是两句话，不是同一句）", () => {
    catalogState.apiKeysByVendor = {};
    const missingMsg = (() => { try { findExecutableModel("volcengine", "seedream", "image"); return ""; } catch (e) { return (e as Error).message; } })();
    catalogState.apiKeysByVendor = {
      volcengine: { vendorKey: "volcengine", apiKey: b64("FAIL"), enc: "safeStorage", enabled: true, createdAt: "t", updatedAt: "t" },
    };
    const lockedMsg = (() => { try { findExecutableModel("volcengine", "seedream", "image"); return ""; } catch (e) { return (e as Error).message; } })();
    expect(missingMsg).not.toBe(lockedMsg);
    expect(missingMsg.length).toBeGreaterThan(0);
    expect(lockedMsg.length).toBeGreaterThan(0);
  });
});

// 「记录整条不在 = 已退役」是执行侧的唯一判定：渲染层（catalogTaskResolve）行不在就不抢答、原样交到这里，
// 节点才落得到「这个模型已经下线了」+「换个模型」。钉住三分的前两支与它们的先后（先看记录，再看钥匙）。
describe("findExecutableModel — 记录不在 = 已下线，记录在但停用 = 未配置", () => {
  it("这家启用着、记录整条不在 → Model is retired（先于钥匙检查：没钥匙也照样说下线了）", () => {
    catalogState.apiKeysByVendor = {};
    expect(() => findExecutableModel("volcengine", "sora-2", "video")).toThrow(/^Model is retired: sora-2$/);
  });

  it("记录还在、只是被停用 → Model is not enabled（不是退役，那儿能开回来）", () => {
    catalogState.models[0] = { ...catalogState.models[0], enabled: false };
    expect(() => findExecutableModel("volcengine", "seedream", "image")).toThrow(/^Model is not enabled: seedream$/);
  });

  it("这家本身没启用 → Vendor is not enabled（不落到退役判断）", () => {
    expect(() => findExecutableModel("kie", "sora-2", "video")).toThrow(/^Vendor is not enabled: kie$/);
  });
});

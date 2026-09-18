/**
 * 一次性修复的阳性对照：上一版 upsert 抹掉的供应商声明，装上新版之后**得自己回来**。
 *
 * 用户镜头：Higgsfield 的鉴权是 `Authorization: Key <id>:<secret>`。旧版本只要在设置页
 * 改一次名字、或让 Agent 调一次 `update_vendor` / 翻一次代理开关，`authScheme` 就被抹掉，
 * 之后每一次出站都退回 `Bearer` ⇒ 401。写路径已在 upsertDraft.ts 闭合，但**已经被抹掉的记录
 * 不会自己回来**——本文件钉住的就是「装上新版后它回来了」。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockedUserDataRoot = "";
const tempRoots: string[] = [];

vi.mock("electron", () => ({
  app: { getPath: () => mockedUserDataRoot, getAppPath: () => process.cwd() },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}));

import { listModelCatalogVendors, upsertModelCatalogVendor } from "./catalogStore";
import { upsertRendererCatalogVendor } from "./rendererCatalogMutation";
import { HIGGSFIELD_VENDOR_SEED } from "./higgsfieldVendor";
import { REPLICATE_VENDOR_SEED } from "./replicate";
import { vendorFieldLossNoticeAt, withoutVendorFieldLossNotice } from "./vendorFieldLossRepair";
import { buildHttpRequest } from "../ai/requestPipeline";
import type { CatalogState, Vendor } from "./types";

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

/** 写一份「被上一版抹过」的 v12 目录：内置家的 authScheme / assetIngestion 键整个不存在。 */
function seedDamagedV12Catalog(vendors: Array<Partial<Vendor> & { key: string }>): void {
  const t = "2026-09-10T00:00:00.000Z";
  const state: CatalogState = {
    version: 12,
    vendors: vendors.map((v) => ({ name: v.key, enabled: true, createdAt: t, updatedAt: t, ...v })) as Vendor[],
    models: [],
    mappings: [],
    apiKeysByVendor: {},
  };
  fs.mkdirSync(path.join(mockedUserDataRoot), { recursive: true });
  fs.writeFileSync(path.join(mockedUserDataRoot, "model-catalog.json"), JSON.stringify(state));
}

/** 这条 vendor 记录真的会发出去的 Authorization 头（走生产那支请求装配，不另写一份）。 */
function outboundAuthorization(vendor: Vendor): string | undefined {
  return buildHttpRequest({
    baseUrl: String(vendor.baseUrlHint || "https://example.test"),
    authType: (vendor.authType ?? "bearer") as "bearer",
    authHeaderName: vendor.authHeader ?? undefined,
    authScheme: vendor.authScheme ?? undefined,
    authQueryParam: vendor.authQueryParam ?? undefined,
    apiKey: "id:secret",
    context: {},
    operation: { method: "POST", path: "/v1/jobs" },
  }).headers.Authorization;
}

function vendorByKey(key: string): Vendor | undefined {
  return listModelCatalogVendors().find((vendor) => vendor.key === key);
}

describe("v12→v13 一次性修复：被抹掉的供应商声明回来了", () => {
  beforeEach(() => {
    mockedUserDataRoot = makeTempDir("vendor-field-loss-repair-");
  });
  afterEach(() => {
    for (const dir of tempRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("报告用例：authScheme 被抹掉的 Higgsfield —— 修前发 Bearer(401 语义)，修后恢复 `Authorization: Key`", () => {
    const damaged: Vendor = {
      key: HIGGSFIELD_VENDOR_SEED.key,
      name: "Higgsfield",
      enabled: true,
      baseUrlHint: HIGGSFIELD_VENDOR_SEED.baseUrl,
      authType: HIGGSFIELD_VENDOR_SEED.authType,
      createdAt: "2026-09-10T00:00:00.000Z",
      updatedAt: "2026-09-10T00:00:00.000Z",
    };
    // 修前：磁盘上那条记录没有 authScheme，出站头就是 Bearer —— 这正是用户看到的 401。
    expect(outboundAuthorization(damaged)).toBe("Bearer id:secret");

    seedDamagedV12Catalog([damaged]);
    const healed = vendorByKey(HIGGSFIELD_VENDOR_SEED.key);
    expect(healed?.authScheme).toBe(HIGGSFIELD_VENDOR_SEED.authScheme);
    expect(outboundAuthorization(healed as Vendor)).toBe("Key id:secret");
  });

  it("assetIngestion 被抹掉的内置家按种子补回（参考图重新走这家自己的上传通道）", () => {
    seedDamagedV12Catalog([
      { key: REPLICATE_VENDOR_SEED.key, name: "Replicate", baseUrlHint: REPLICATE_VENDOR_SEED.baseUrl },
    ]);
    expect(vendorByKey(REPLICATE_VENDOR_SEED.key)?.assetIngestion).toEqual(REPLICATE_VENDOR_SEED.assetIngestion);
  });

  it("只补「字段缺失」，绝不覆盖用户改过的值（含显式清空）", () => {
    seedDamagedV12Catalog([
      { key: HIGGSFIELD_VENDOR_SEED.key, name: "H", authScheme: "Token" },
      { key: REPLICATE_VENDOR_SEED.key, name: "R", assetIngestion: { strategy: "inline-base64" } },
    ]);
    expect(vendorByKey(HIGGSFIELD_VENDOR_SEED.key)?.authScheme).toBe("Token");
    expect(vendorByKey(REPLICATE_VENDOR_SEED.key)?.assetIngestion).toEqual({ strategy: "inline-base64" });
  });

  it("自建连接补不了 → 盖一条可见提示；用户点「知道了」后清掉且不再回来", () => {
    seedDamagedV12Catalog([{ key: "my-relay", name: "我的中转", baseUrlHint: "https://relay.example/v1" }]);
    const stamped = vendorByKey("my-relay");
    expect(vendorFieldLossNoticeAt(stamped)).toBeTruthy();

    // 「知道了」走现成的 upsertVendor 写回 meta（不新造一条 IPC）
    upsertModelCatalogVendor({ key: "my-relay", meta: withoutVendorFieldLossNotice(stamped?.meta) ?? null });
    expect(vendorFieldLossNoticeAt(vendorByKey("my-relay"))).toBeNull();
    // 目录已是 v13，迁移不会重跑 —— 提示不会自己长回来
    expect(vendorFieldLossNoticeAt(vendorByKey("my-relay"))).toBeNull();
  });

  it("界面上那颗「知道了」走的是渲染层真实写路径（sanitize 不会把标记又带回来）", () => {
    seedDamagedV12Catalog([{ key: "my-relay", name: "我的中转", meta: { adapter: { state: "unverified", modes: [] }, label: "x" } }]);
    const stamped = vendorByKey("my-relay");
    expect(vendorFieldLossNoticeAt(stamped)).toBeTruthy();

    upsertRendererCatalogVendor({ key: "my-relay", meta: withoutVendorFieldLossNotice(stamped?.meta) ?? null });
    const after = vendorByKey("my-relay");
    expect(vendorFieldLossNoticeAt(after)).toBeNull();
    // 关掉提示不许顺手弄丢 meta 里别的东西
    expect((after?.meta as Record<string, unknown>).label).toBe("x");
  });

  it("迁移只跑一次：内置家的声明被用户之后显式删掉，不会被再次塞回来", () => {
    seedDamagedV12Catalog([{ key: HIGGSFIELD_VENDOR_SEED.key, name: "H" }]);
    expect(vendorByKey(HIGGSFIELD_VENDOR_SEED.key)?.authScheme).toBe(HIGGSFIELD_VENDOR_SEED.authScheme);
    upsertModelCatalogVendor({ key: HIGGSFIELD_VENDOR_SEED.key, authScheme: "" });
    expect(vendorByKey(HIGGSFIELD_VENDOR_SEED.key)?.authScheme).toBeNull();
    expect(vendorByKey(HIGGSFIELD_VENDOR_SEED.key)?.authScheme).toBeNull();
  });
});

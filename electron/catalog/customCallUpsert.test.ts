/**
 * customCall 字段三态回归锁（never-wipe 纪律）：
 * 拉取/重接入类 upsert（不带 customCall 键）绝不清掉用户脚本；null=显式删除；空串=删除。
 * 场景原型：中转站「重新拉取模型列表」会对每个模型 upsertModel——那一步曾把 enabled 都能保住，
 * customCall 同级用户数据必须同样保住。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockedUserDataRoot = "";
const tempRoots: string[] = [];

vi.mock("electron", () => ({
  app: {
    getPath: () => mockedUserDataRoot,
    getAppPath: () => process.cwd(),
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}));

import { listModelCatalogModels, upsertModelCatalogModel, upsertModelCatalogVendor } from "./catalogStore";

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

function readBack(vendorKey: string, modelKey: string) {
  return listModelCatalogModels({ vendorKey }).find((m) => m.modelKey === modelKey);
}

describe("customCall upsert 三态", () => {
  beforeEach(() => {
    mockedUserDataRoot = makeTempDir("custom-call-upsert-");
  });
  afterEach(() => {
    for (const dir of tempRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("设脚本 → 重拉 upsert（不带 customCall）保留 → null 显式删除", () => {
    upsertModelCatalogVendor({ key: "custom-r", name: "R", baseUrlHint: "https://r.example/v1", authType: "bearer" });
    upsertModelCatalogModel({ vendorKey: "custom-r", modelKey: "m1", kind: "video", customCall: { script: "return 'https://a/v.mp4'" } });
    expect(readBack("custom-r", "m1")?.customCall?.script).toContain("v.mp4");

    // 模拟「重新拉取模型列表」的 upsert：只带基本字段
    upsertModelCatalogModel({ vendorKey: "custom-r", modelKey: "m1", kind: "video", labelZh: "m1" });
    expect(readBack("custom-r", "m1")?.customCall?.script).toContain("v.mp4");

    // 停用/启用同样不丢
    upsertModelCatalogModel({ vendorKey: "custom-r", modelKey: "m1", enabled: false });
    expect(readBack("custom-r", "m1")?.customCall?.script).toContain("v.mp4");

    // 显式 null = 删除
    upsertModelCatalogModel({ vendorKey: "custom-r", modelKey: "m1", customCall: null });
    expect(readBack("custom-r", "m1")?.customCall).toBeUndefined();
  });

  it("空串脚本视同删除", () => {
    upsertModelCatalogVendor({ key: "custom-r", name: "R", baseUrlHint: "https://r.example/v1", authType: "bearer" });
    upsertModelCatalogModel({ vendorKey: "custom-r", modelKey: "m2", kind: "image", customCall: { script: "return 'x'" } });
    upsertModelCatalogModel({ vendorKey: "custom-r", modelKey: "m2", customCall: { script: "   " } });
    expect(readBack("custom-r", "m2")?.customCall).toBeUndefined();
  });

  it("模式脚本按 modeId 局部更新，保留通用 fallback 和其他模式", () => {
    upsertModelCatalogVendor({ key: "custom-r", name: "R", baseUrlHint: "https://r.example/v1", authType: "bearer" });
    upsertModelCatalogModel({
      vendorKey: "custom-r",
      modelKey: "m3",
      kind: "video",
      customCall: {
        script: "return 'fallback'",
        modes: { first: { script: "return 'first'" } },
      },
    });
    upsertModelCatalogModel({
      vendorKey: "custom-r",
      modelKey: "m3",
      customCall: { modes: { firstlast: { script: "return 'firstlast'" } } },
    });

    const saved = readBack("custom-r", "m3")?.customCall;
    expect(saved?.script).toBe("return 'fallback'");
    expect(saved?.modes?.first?.script).toBe("return 'first'");
    expect(saved?.modes?.firstlast?.script).toBe("return 'firstlast'");
  });

  it("删除一个模式不删除其他模式；删除 fallback 也不删除模式脚本", () => {
    upsertModelCatalogVendor({ key: "custom-r", name: "R", baseUrlHint: "https://r.example/v1", authType: "bearer" });
    upsertModelCatalogModel({
      vendorKey: "custom-r",
      modelKey: "m4",
      kind: "video",
      customCall: {
        script: "return 'fallback'",
        modes: {
          first: { script: "return 'first'" },
          firstlast: { script: "return 'firstlast'" },
        },
      },
    });
    upsertModelCatalogModel({ vendorKey: "custom-r", modelKey: "m4", customCall: { modes: { first: null } } });
    upsertModelCatalogModel({ vendorKey: "custom-r", modelKey: "m4", customCall: { script: "   " } });

    const saved = readBack("custom-r", "m4")?.customCall;
    expect(saved?.script).toBeUndefined();
    expect(saved?.modes?.first).toBeUndefined();
    expect(saved?.modes?.firstlast?.script).toContain("firstlast");
  });
});

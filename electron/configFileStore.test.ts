// 「读失败绝不覆盖」这条不变量的机器化持有者（批次 E，2026-09-21）。
//
// 它存在的理由是一个真实事故：用户重装旧版后「所有模型配置都没了」。旧的读原语
// `readJson(path, fallback)` 把「文件不存在」「JSON 解析失败」「文件被锁」全吞成同一个 null，
// 调用方于是把默认值原子写回 —— **一次读失败 = 永久抹掉用户配置，而且一声不吭**。
//
// 下面每一条都在没有 configFileStore 的旧写法下会红：旧写法读不出来就回落默认，既不留底、
// 也不拦下一次写。断言用「原始字节逐字节不变」而不是「文件还在」——被覆盖过的文件也还在。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  assertConfigFileWritable,
  configBackupPath,
  configQuarantineNotice,
  configReadFailure,
  configVersionBackupPath,
  quarantineUnreadableConfigFile,
  readConfigFile,
  readConfigFileOrDefault,
  snapshotConfigVersion,
  writeConfigFileAtomic,
} from "./configFileStore";

let root = "";
let target = "";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-config-store-"));
  target = path.join(root, "settings.json");
});

const brokenSiblings = (): string[] => fs.readdirSync(root).filter((name) => name.includes(".broken-"));

describe("config read primitive", () => {
  it("tells a missing file apart from one it could not read", () => {
    expect(readConfigFile(target).status).toBe("missing");
    fs.writeFileSync(target, "{ not json", "utf8");
    expect(readConfigFile(target)).toMatchObject({ status: "failed", reason: "corrupt" });
  });

  it("treats a file that parses into an unusable shape as corrupt, not as an empty config", () => {
    // `null` 和 `[]` 都是合法 JSON。按「读通了」处理，下一步就会把它当成空配置——
    // 和解析失败是同一种损失，只是更难看出来。
    fs.writeFileSync(target, "null", "utf8");
    const outcome = readConfigFile(target, (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value));
    expect(outcome).toMatchObject({ status: "failed", reason: "corrupt" });
  });

  it("keeps a corrupt file byte for byte under a timestamped name and never writes a default over it", () => {
    const original = '{ "vendors": [ "half-written';
    fs.writeFileSync(target, original, "utf8");

    const value = readConfigFileOrDefault<{ vendors: string[] }>(target, () => ({ vendors: [] }));

    expect(value).toEqual({ vendors: [] });
    expect(fs.existsSync(target)).toBe(false); // 没有被默认值覆盖，也没有被重建
    const kept = brokenSiblings();
    expect(kept).toHaveLength(1);
    expect(fs.readFileSync(path.join(root, kept[0]), "utf8")).toBe(original);
    expect(configQuarantineNotice(target)?.quarantinedPath).toBe(path.join(root, kept[0]));
  });

  it("leaves a file it merely could not open exactly where it is, and refuses to write over it", () => {
    // 目录顶替文件 = 可移植的「读得到路径、读不到内容」（EISDIR），对应 Windows 上杀软/索引器
    // 短暂持锁的 EPERM/EBUSY：那多半是一瞬间的事，为它把用户配置挪走是我们自己制造的损失。
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, "inside.txt"), "still here", "utf8");

    const value = readConfigFileOrDefault<{ ok: boolean }>(target, () => ({ ok: false }));

    expect(value).toEqual({ ok: false });
    expect(brokenSiblings()).toEqual([]);
    expect(fs.readFileSync(path.join(target, "inside.txt"), "utf8")).toBe("still here");
    expect(configReadFailure(target)?.reason).toBe("unreadable");
    expect(() => assertConfigFileWritable(target)).toThrow(/CONFIG_UNREADABLE_READ_ONLY/);
    expect(() => writeConfigFileAtomic(target, { ok: true })).toThrow(/CONFIG_UNREADABLE_READ_ONLY/);
  });

  it("clears the write ban as soon as the file reads again", () => {
    fs.mkdirSync(target);
    readConfigFileOrDefault(target, () => null);
    expect(configReadFailure(target)).not.toBeNull();

    fs.rmSync(target, { recursive: true, force: true });
    fs.writeFileSync(target, '{"ok":true}', "utf8");
    expect(readConfigFile(target)).toMatchObject({ status: "ok" });
    expect(configReadFailure(target)).toBeNull();
    expect(() => writeConfigFileAtomic(target, { ok: true })).not.toThrow();
  });

  it("does not move a file it could not open even when quarantine is asked for", () => {
    fs.mkdirSync(target);
    readConfigFile(target);
    expect(quarantineUnreadableConfigFile(target)).toBeNull();
    expect(fs.existsSync(target)).toBe(true);
  });
});

describe("config write primitive", () => {
  it("rotates the previous version into .bak before every write", () => {
    writeConfigFileAtomic(target, { round: 1 });
    expect(fs.existsSync(configBackupPath(target))).toBe(false); // 第一次写没有上一版可留

    writeConfigFileAtomic(target, { round: 2 });
    expect(JSON.parse(fs.readFileSync(configBackupPath(target), "utf8"))).toEqual({ round: 1 });
    expect(JSON.parse(fs.readFileSync(target, "utf8"))).toEqual({ round: 2 });
  });

  it("keeps a version-stamped snapshot before a migration, idempotently, pruning to the most recent few", () => {
    fs.writeFileSync(target, '{"version":9,"vendors":["mine"]}', "utf8");
    const first = snapshotConfigVersion(target, 9);
    expect(first).toBe(configVersionBackupPath(target, 9));
    expect(fs.readFileSync(first as string, "utf8")).toBe('{"version":9,"vendors":["mine"]}');

    // 第二次不再拷贝：迁移那一刻的字节才是要救的东西，之后的写不许把它盖掉。
    fs.writeFileSync(target, '{"version":10,"vendors":[]}', "utf8");
    snapshotConfigVersion(target, 9);
    expect(fs.readFileSync(first as string, "utf8")).toBe('{"version":9,"vendors":["mine"]}');

    for (const version of [10, 11, 12, 13]) {
      fs.writeFileSync(target, `{"version":${version}}`, "utf8");
      snapshotConfigVersion(target, version);
    }
    const remaining = fs.readdirSync(root).filter((name) => /\.v\d+\.bak\.json$/.test(name)).sort();
    expect(remaining).toEqual(["settings.v11.bak.json", "settings.v12.bak.json", "settings.v13.bak.json"]);
  });
});

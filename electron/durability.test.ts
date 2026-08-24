import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDurabilityMode, setDurabilityMode } from "./durability";
import { writeJsonFileAtomic } from "./jsonFile";
import { createProductionRunRepository } from "./productionRun/productionRunRepository";

// 反向保证（P1：不留悄悄削弱生产的逃生口）。
//
// 整个套件默认跑在 'ephemeral'（`tests/setup/durability.ts` 关掉了 fsync，这是 productionRun
// flake 的根因修复）。代价是：**没有任何别的测试还会碰真 fsync**，所以万一哪天生产的落盘屏障
// 被删掉/改坏，全绿也照样看不出来。这个文件就是那道反向闸——它自己翻回 'durable'，
// 断言真实写盘路径确实调了 fsync。
//
// 详见 docs/plan/2026-08-25-production-run-test-flake-fsync.md。

describe("durability barrier", () => {
  const previous = getDurabilityMode();
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-durability-"));
    setDurabilityMode("durable");
  });

  afterEach(() => {
    setDurabilityMode(previous);
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("'durable' 模式下 writeJsonFileAtomic 真的 fsync（掉电不撕裂 project.json 的地基）", () => {
    const spy = vi.spyOn(fs, "fsyncSync");
    writeJsonFileAtomic(path.join(root, "project.json"), { hello: "world" });
    expect(spy).toHaveBeenCalled();
    // 内容照常落地（屏障不改变可观察行为）。
    expect(JSON.parse(fs.readFileSync(path.join(root, "project.json"), "utf8"))).toEqual({ hello: "world" });
  });

  it("'durable' 模式下 production run 的事件追加真的 fsync（事件日志不撕裂 = run 能重放）", () => {
    const repository = createProductionRunRepository({ projectDirResolver: () => root });
    const spy = vi.spyOn(fs, "fsyncSync");
    repository.create({
      runId: "run-durability-1",
      projectId: "project-1",
      playbook: { name: "brand.promo", version: "1.0.0" },
      origin: { host: "codex" },
      brief: { goal: "durability", durationSeconds: 30 },
    });
    expect(spy).toHaveBeenCalled();
  });

  it("'ephemeral' 模式下不 fsync —— 但写入的字节完全一样（关屏障不改变被测行为）", () => {
    const durablePath = path.join(root, "durable.json");
    writeJsonFileAtomic(durablePath, { a: 1, b: [2, 3] });

    setDurabilityMode("ephemeral");
    const spy = vi.spyOn(fs, "fsyncSync");
    const ephemeralPath = path.join(root, "ephemeral.json");
    writeJsonFileAtomic(ephemeralPath, { a: 1, b: [2, 3] });

    expect(spy).not.toHaveBeenCalled();
    expect(fs.readFileSync(ephemeralPath, "utf8")).toBe(fs.readFileSync(durablePath, "utf8"));
  });

  // 注：这条钉的是**模式翻转**（谁有权关屏障）。屏障的另一半——**调用点**
  // （不许绕过 fsyncIfDurable 直接 fs.fsyncSync）由 `pnpm run check:heavy-path` 的
  // `unguarded-fsync` 规则把着，不在这里重复实现（P1：一个不变量一个执行处）。
  it("只有测试 harness 能翻成 ephemeral——生产代码里不许出现（防 flake 修复被当成万能开关滥用）", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx|mts|mjs)$/.test(entry.name) || /\.test\.[a-z]+$/.test(entry.name)) continue;
        if (full.endsWith(path.join("tests", "setup", "durability.ts"))) continue; // 唯一合法处
        if (/setDurabilityMode\(\s*["']ephemeral["']\s*\)/.test(fs.readFileSync(full, "utf8"))) {
          offenders.push(path.relative(process.cwd(), full));
        }
      }
    };
    for (const dir of ["electron", "src", "scripts", "tests"]) {
      const abs = path.join(process.cwd(), dir);
      if (fs.existsSync(abs)) walk(abs);
    }
    expect(offenders).toEqual([]);
  });
});

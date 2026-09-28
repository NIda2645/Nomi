/**
 * 对等测试矩阵：**同一份输入，分别走每个「生成」入口，断言发给供应商的出站报文逐字段相同。**
 *
 * 今天它在已知的分裂点上红，红的那些登记在 `known-splits.json`（棘轮，只减不增）。
 * 主进程 lane 每合并一项就从清单里删一条；删不掉 = 没合并干净，这里会红。
 */
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("electron", async () => {
  const nodeFs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), "nomi-parity-matrix-"));
  return {
    app: {
      getPath: () => root, getAppPath: () => process.cwd(), getName: () => "nomi",
      getVersion: () => "0.0.0-test", on: () => undefined, whenReady: () => Promise.resolve(), quit: () => undefined,
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(value),
      decryptString: (value: Buffer) => value.toString(),
    },
    ipcMain: { handle: () => undefined, on: () => undefined, removeHandler: () => undefined },
    BrowserWindow: class { static getAllWindows() { return []; } },
    shell: { openExternal: async () => undefined, openPath: async () => "" },
    net: { request: () => undefined },
    protocol: { handle: () => undefined, registerSchemesAsPrivileged: () => undefined },
    webContents: { getAllWebContents: () => [] },
    session: { defaultSession: undefined },
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true }),
    },
    crashReporter: { start: () => undefined },
  };
});

// 付费确认等的是人：这里替他点头，钱闸本身（`assertAndConsumeQuotedSpend`）照旧真跑。
vi.mock("../capabilityCore/rendererBridge", () => ({
  requestRendererDecision: async () => ({ confirmed: true }),
  requestRenderer: async (operation: string) => { throw new Error(`付费路径不该走带超时的桥: ${operation}`); },
}));

import { BASELINE_ENTRANCE_ID, GENERATION_ENTRANCES } from "./generationEntrances";
import { PARITY_CASES } from "./parityCases";
import { driveEntrance, RETRY_DIRECTIVE } from "./parityDrive";
import { diffRecords, type FieldDifference, type OutboundRecord } from "./outboundRecord";
import { installFetchCapture, seedParityCatalog, type FetchCapture } from "./generationParityTestUtils";
import { KNOWN_SPLITS, splitKey, type KnownSplit } from "./knownSplits";

type Cell = { entranceId: string; caseId: string; record: OutboundRecord };

let capture: FetchCapture;
const cells: Cell[] = [];

beforeAll(async () => {
  capture = installFetchCapture();
  await seedParityCatalog();
  for (const testCase of PARITY_CASES) {
    for (const entrance of GENERATION_ENTRANCES) {
      const record = await driveEntrance(capture, entrance, testCase);
      cells.push({ entranceId: entrance.id, caseId: testCase.id, record });
    }
  }
  if (process.env.PARITY_DUMP) {
    fs.writeFileSync(process.env.PARITY_DUMP, JSON.stringify(cells, null, 1));
    fs.writeFileSync(`${process.env.PARITY_DUMP}.splits.json`, JSON.stringify(observedSplits(), null, 1));
  }
}, 120_000);

afterAll(() => { capture?.restore(); });

const cellFor = (entranceId: string, caseId: string): OutboundRecord => {
  const hit = cells.find((cell) => cell.entranceId === entranceId && cell.caseId === caseId);
  if (!hit) throw new Error(`矩阵缺格: ${entranceId} × ${caseId}`);
  return hit.record;
};

/**
 * 重拍那一路**按设计**只多一句审片指令。唯一被豁免的差异就是这一条，且必须逐字等于
 * 「基准提示词 + 两个换行 + 那句指令」——多改一个字、或者顺手动了别的字段，照样算分裂。
 */
function isDeclaredRetryDelta(entranceId: string, difference: FieldDifference): boolean {
  const entrance = GENERATION_ENTRANCES.find((candidate) => candidate.id === entranceId);
  if (!entrance?.appendsRetryDirective) return false;
  if (difference.field !== "body.prompt") return false;
  return difference.actual === `${String(difference.baseline)}\n\n${RETRY_DIRECTIVE}`;
}

function observedSplits(): KnownSplit[] {
  const found: KnownSplit[] = [];
  for (const testCase of PARITY_CASES) {
    const baseline = cellFor(BASELINE_ENTRANCE_ID, testCase.id);
    for (const entrance of GENERATION_ENTRANCES) {
      if (entrance.id === BASELINE_ENTRANCE_ID) continue;
      for (const difference of diffRecords(baseline, cellFor(entrance.id, testCase.id))) {
        if (isDeclaredRetryDelta(entrance.id, difference)) continue;
        found.push({
          caseId: testCase.id,
          entranceId: entrance.id,
          field: difference.field,
          baseline: difference.baseline,
          actual: difference.actual,
          blocker: "",
          why: "",
        });
      }
    }
  }
  return found;
}

describe("生成对等矩阵 · 出站报文逐字段", () => {
  it("每个用例都跑遍了全部入口（矩阵没有空格）", () => {
    expect(cells).toHaveLength(PARITY_CASES.length * GENERATION_ENTRANCES.length);
  });

  it("基准入口在每个用例上都真的发出了一次请求（否则整张矩阵没有基准）", () => {
    const missing = PARITY_CASES
      .filter((testCase) => !cellFor(BASELINE_ENTRANCE_ID, testCase.id).request)
      .map((testCase) => `${testCase.id}: ${JSON.stringify(cellFor(BASELINE_ENTRANCE_ID, testCase.id).failure)}`);
    expect(missing).toEqual([]);
  });

  it("同一 dispatchProfile 的入口之间逐字节相同（差了就是有人加了私有预处理）", () => {
    const drift: string[] = [];
    for (const testCase of PARITY_CASES) {
      const byProfile = new Map<string, string>();
      for (const entrance of GENERATION_ENTRANCES) {
        const first = byProfile.get(entrance.dispatchProfile);
        if (!first) { byProfile.set(entrance.dispatchProfile, entrance.id); continue; }
        const differences = diffRecords(cellFor(first, testCase.id), cellFor(entrance.id, testCase.id));
        for (const difference of differences) {
          drift.push(`${testCase.id} · ${entrance.dispatchProfile} · ${first} vs ${entrance.id} · ${difference.field}`);
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it("重拍只多那一句审片指令，别的字段一个都没动", () => {
    const unexpected: string[] = [];
    for (const testCase of PARITY_CASES) {
      const baseline = cellFor(BASELINE_ENTRANCE_ID, testCase.id);
      for (const entrance of GENERATION_ENTRANCES.filter((candidate) => candidate.appendsRetryDirective)) {
        for (const difference of diffRecords(baseline, cellFor(entrance.id, testCase.id))) {
          if (isDeclaredRetryDelta(entrance.id, difference)) continue;
          unexpected.push(`${testCase.id} × ${entrance.id} × ${difference.field}`);
        }
      }
    }
    expect(unexpected).toEqual([]);
  });

  it("今天的分裂恰好等于已知分裂清单（多一条=新回归，少一条=清单没同步删）", () => {
    const observed = observedSplits();
    const observedKeys = new Set(observed.map(splitKey));
    const registeredKeys = new Set(KNOWN_SPLITS.map(splitKey));
    const unregistered = observed
      .filter((split) => !registeredKeys.has(splitKey(split)))
      .map((split) => `${splitKey(split)}  基准=${JSON.stringify(split.baseline)}  实际=${JSON.stringify(split.actual)}`);
    const stale = KNOWN_SPLITS
      .filter((split) => !observedKeys.has(splitKey(split)))
      .map((split) => `${splitKey(split)}（${split.blocker}）已经不再分裂，请从 known-splits.json 删掉这一行`);
    expect({ unregistered, stale }).toEqual({ unregistered: [], stale: [] });
  });

  it("已知分裂清单里每条都写明了阻断编号与理由", () => {
    const incomplete = KNOWN_SPLITS
      .filter((split) => !split.blocker.trim() || !split.why.trim())
      .map(splitKey);
    expect(incomplete).toEqual([]);
  });

  /**
   * 2026-09-21：清单**已经归零**，这条按它自己写好的程序换成正向断言。
   * 从今天起它是防回归的硬闸——任何人再往 `known-splits.json` 里加一行（「先登记着，
   * 回头再修」）都会在这里当场红。棘轮只减不增，减到 0 之后就是「不许增」。
   */
  it("合并完成的判据：已知分裂清单归零", () => {
    expect(KNOWN_SPLITS).toEqual([]);
  });
});

describe("逐条差异可读（报告直接抄这一段）", () => {
  it("按用例列出每个入口与基准的差异字段", () => {
    const lines: string[] = [];
    for (const testCase of PARITY_CASES) {
      const baseline = cellFor(BASELINE_ENTRANCE_ID, testCase.id);
      for (const entrance of GENERATION_ENTRANCES) {
        if (entrance.id === BASELINE_ENTRANCE_ID) continue;
        const differences: FieldDifference[] = diffRecords(baseline, cellFor(entrance.id, testCase.id))
          .filter((difference) => !isDeclaredRetryDelta(entrance.id, difference));
        if (!differences.length) continue;
        lines.push(`${testCase.id} × ${entrance.id}: ${differences.map((d) => d.field).join(", ")}`);
      }
    }
    if (process.env.PARITY_DUMP) fs.writeFileSync(`${process.env.PARITY_DUMP}.diff.txt`, lines.join("\n"));
    expect(Array.isArray(lines)).toBe(true);
  });
});

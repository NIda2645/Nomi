import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_CUTS,
  SHOT_CUT_DETECT_THRESHOLD,
  SHOT_SHEET_COLUMNS,
  buildSheetFilter,
  capShotCutsByScore,
  shotSheetRowsFor,
  dedupeShotCuts,
  pickEvenlyByTime,
  type RawShotCut,
} from "./detectShotCuts";

// 2026-09-22 的回归：一条快剪电影开场（361 秒）在 ffmpeg@0.1 下报 447 刀，
// 而上限是 120 —— 旧做法 `all.slice(0, MAX_CUTS)` 按**时间顺序**取前 120 刀，
// 于是整张表只覆盖到第 55.4 秒，剩下 305.7 秒被并成**一个镜头**。
// 行数看着齐、`startSeconds/endSeconds` 也接得上，所以它不像坏了——它只是不是那条片子了。
//
// 这里的夹具不是手编的：分布形状取自那条真实素材的实测（见 docs/plan/2026-09-22-shot-cut-truncation.md
// 的实测表）——切点铺满全片、分数分布长尾，高分刀在时间上是**散的**而不是聚在开头。
// 这一条很关键：如果高分刀恰好都在开头，那么「取前 N」和「按分数取」就看不出差别，
// 测试会在一个退化的夹具上恒绿。

/** 铺满全片的长尾分布：分数按 index 伪随机，保证高分刀散布在整条时间轴上。 */
function spreadCuts(count: number, duration: number): RawShotCut[] {
  return Array.from({ length: count }, (_, i) => ({
    seconds: Number((((i + 1) * duration) / (count + 1)).toFixed(3)),
    pts: (i + 1) * 1000,
    // 伪随机但确定：黄金比例取小数部分，分布均匀且与下标不相关。
    score: Number((0.1 + ((i * 0.6180339887) % 1) * 0.6).toFixed(6)),
  }));
}

describe("capShotCutsByScore —— 超上限时压的是「给多少」，不是「看多长」", () => {
  const duration = 361.081;

  it("没超上限就一刀不动，阈值就是检测下限", () => {
    const cuts = spreadCuts(50, duration);
    const result = capShotCutsByScore(cuts, MAX_CUTS, SHOT_CUT_DETECT_THRESHOLD);
    expect(result.capped).toBe(false);
    expect(result.kept).toHaveLength(50);
    expect(result.appliedThreshold).toBe(SHOT_CUT_DETECT_THRESHOLD);
  });

  it("超上限：条数压下来，但**全片覆盖不塌**（这就是那条回归）", () => {
    const cuts = spreadCuts(447, duration);
    const { kept, capped, appliedThreshold } = capShotCutsByScore(cuts, MAX_CUTS, SHOT_CUT_DETECT_THRESHOLD);

    expect(capped).toBe(true);
    expect(appliedThreshold).toBeGreaterThan(SHOT_CUT_DETECT_THRESHOLD);
    // 分数互不相同的片子上，名额要用满——阈值取高一档就会白白少给一刀，
    // 而「≤ 上限」这条弱断言放得过去（少给一刀也 ≤ 上限）。并列分数那条用例另测「可以少给」。
    expect(kept).toHaveLength(MAX_CUTS);

    // 核心不变量：最后一刀仍然靠近片尾。旧做法在这里是 55.4s / 361s ≈ 15%。
    const covered = kept[kept.length - 1].seconds;
    expect(covered / duration).toBeGreaterThan(0.9);

    // 另一面同样要钉死：不能有一个「把后半条片子整个吞掉」的巨镜。
    const marks = [0, ...kept.map((c) => c.seconds), duration];
    const longest = Math.max(...marks.slice(1).map((m, i) => m - marks[i]));
    expect(longest).toBeLessThan(duration * 0.2);
  });

  it("分数互异时，留下的那批恰好等于 `score > appliedThreshold`", () => {
    const cuts = spreadCuts(447, duration);
    const { kept, appliedThreshold } = capShotCutsByScore(cuts, MAX_CUTS, SHOT_CUT_DETECT_THRESHOLD);
    expect(kept).toEqual(cuts.filter((cut) => cut.score > appliedThreshold));
  });

  it("留下的那批恒按时间有序 —— 联系表是按这个顺序铺格的", () => {
    const cuts = spreadCuts(447, duration);
    const { kept } = capShotCutsByScore(cuts, MAX_CUTS, SHOT_CUT_DETECT_THRESHOLD);
    expect(kept.map((c) => c.seconds)).toEqual([...kept.map((c) => c.seconds)].sort((a, b) => a - b));
    expect(kept.map((c) => c.pts)).toEqual([...kept.map((c) => c.pts)].sort((a, b) => a - b));
  });

  it("边界上有并列时也不超上限（并列的那一档按时间均匀补，见下面的下限用例）", () => {
    // 121 刀里有 5 刀同分，且这个分正好卡在边界上。
    const tied: RawShotCut[] = Array.from({ length: 121 }, (_, i) => ({
      seconds: i + 1,
      pts: (i + 1) * 1000,
      score: i < 5 ? 0.5 : 0.9 - i * 0.001,
    }));
    const { kept, appliedThreshold } = capShotCutsByScore(tied, MAX_CUTS, SHOT_CUT_DETECT_THRESHOLD);
    expect(kept.length).toBeLessThanOrEqual(MAX_CUTS);
    expect(kept.every((cut) => cut.score >= appliedThreshold)).toBe(true);
  });
});

describe("dedupeShotCuts —— 同一刀连报两帧", () => {
  const fps = 30;

  it("相邻两帧的同一刀并成一条，保留分数更高的那帧（它才是真正的切点位置）", () => {
    const cuts: RawShotCut[] = [
      { seconds: 5.4, score: 0.341, pts: 5400 },
      { seconds: 5.433, score: 0.576, pts: 5433 },
      { seconds: 12.0, score: 0.8, pts: 12000 },
    ];
    expect(dedupeShotCuts(cuts, fps)).toEqual([
      { seconds: 5.433, score: 0.576, pts: 5433 },
      { seconds: 12.0, score: 0.8, pts: 12000 },
    ]);
  });

  it("**不**吃掉真实快剪：0.3 秒一刀的 MV 节奏必须原样留着", () => {
    const cuts: RawShotCut[] = [
      { seconds: 1.0, score: 0.5, pts: 1000 },
      { seconds: 1.3, score: 0.5, pts: 1300 },
      { seconds: 1.6, score: 0.5, pts: 1600 },
    ];
    expect(dedupeShotCuts(cuts, fps)).toHaveLength(3);
  });

  it("fps 读不出来就原样返回——不猜一个秒数窗口", () => {
    const cuts: RawShotCut[] = [
      { seconds: 5.4, score: 0.341, pts: 5400 },
      { seconds: 5.433, score: 0.576, pts: 5433 },
    ];
    expect(dedupeShotCuts(cuts, 0)).toHaveLength(2);
    expect(dedupeShotCuts(cuts, Number.NaN)).toHaveLength(2);
  });
});

describe("去重 → 压上限 的顺序", () => {
  it("先去重再压上限：重复的刀不该白占名额", () => {
    // 130 刀，其中 20 刀是重影（各自紧跟前一刀一帧）。去重后 110 刀 < 上限，不该被压。
    const base = spreadCuts(110, 300);
    const withEchoes: RawShotCut[] = [];
    base.forEach((cut, i) => {
      withEchoes.push(cut);
      if (i < 20) withEchoes.push({ seconds: cut.seconds + 1 / 30, score: cut.score * 0.5, pts: cut.pts + 1 });
    });
    withEchoes.sort((a, b) => a.seconds - b.seconds);
    expect(withEchoes).toHaveLength(130);

    const deduped = dedupeShotCuts(withEchoes, 30);
    expect(deduped).toHaveLength(110);
    expect(capShotCutsByScore(deduped, MAX_CUTS, SHOT_CUT_DETECT_THRESHOLD).capped).toBe(false);
  });
});

describe("联系表选帧 —— 第 i 格 = 第 i 刀必须由构造保证（2026-09-22 阻断 A）", () => {
  // 验收在真实素材上抓到的那一条：阈值必然**等于某一帧的打印分数**，而 JS 只看得到 6 位小数、
  // ffmpeg 的 gt() 比的是内部全精度 double。于是「分数恰好等于阈值」的那一帧两边判断相反：
  // JS 按 `>` 排除，ffmpeg 收下 → ffmpeg 多吐一帧 → 从那一帧起所有格子整体错位。
  // 实测 120 刀里 21 刀指错格，末刀的格子号甚至超出联系表容量。
  const duration = 361.081;

  it("阈值恰好等于某一帧的分数 —— 这是必然发生的情形，不是刁钻构造", () => {
    const cuts = spreadCuts(447, duration);
    const { appliedThreshold, kept } = capShotCutsByScore(cuts, MAX_CUTS, SHOT_CUT_DETECT_THRESHOLD);
    // 阈值取自第 cap+1 名，所以它一定是某一帧的分数——这正是 A 的成因。
    expect(cuts.some((cut) => cut.score === appliedThreshold)).toBe(true);
    // 而**我们不再拿这个阈值去跟 ffmpeg 对齐**：联系表按 pts 点名。
    const filter = buildSheetFilter(kept.map((cut) => cut.pts), SHOT_SHEET_COLUMNS, 15, 90);
    expect(filter).not.toContain("scene");
    expect(filter).not.toContain(String(appliedThreshold));
  });

  it("联系表的 select 逐条点名，顺序与条数与切点清单**完全一致**", () => {
    const cuts = spreadCuts(447, duration);
    const { kept } = capShotCutsByScore(cuts, MAX_CUTS, SHOT_CUT_DETECT_THRESHOLD);
    const filter = buildSheetFilter(kept.map((cut) => cut.pts), SHOT_SHEET_COLUMNS, 15, 90);
    const picked = [...filter.matchAll(/eq\(pts\\,(\d+)\)/g)].map((m) => Number(m[1]));
    // 旧实现（gt(scene,T) 重筛）在这里必然失败：它交给 ffmpeg 自己决定选哪些帧，
    // 于是这份清单根本不存在，格子与切点只能「但愿相等」。
    expect(picked).toEqual(kept.map((cut) => cut.pts));
    expect(picked).toHaveLength(MAX_CUTS);
  });

  it("去重掉的那些帧不会占格子 —— 它们根本没进点名清单", () => {
    const base: RawShotCut[] = [
      { seconds: 1.0, score: 0.4, pts: 1000 },
      { seconds: 1.033, score: 0.6, pts: 1033 }, // 同一刀的第二帧，分更高
      { seconds: 4.0, score: 0.5, pts: 4000 },
      { seconds: 9.0, score: 0.7, pts: 9000 },
    ];
    const deduped = dedupeShotCuts(base, 30);
    expect(deduped.map((c) => c.pts)).toEqual([1033, 4000, 9000]);
    const filter = buildSheetFilter(deduped.map((c) => c.pts), 8, 1, 90);
    // 1000 那一帧被并掉了，它不该在联系表里占一格（旧实现里 ffmpeg 会照样吐出它）。
    expect(filter).not.toContain("eq(pts\\,1000)");
    expect([...filter.matchAll(/eq\(pts/g)]).toHaveLength(3);
  });
});

describe("并列分数的下限 —— 不许塌回「一镜到底」（2026-09-22 建议项 C）", () => {
  it("全片分数完全相同时仍然给满名额，而不是一刀不给", () => {
    // 极端但真实可达：静止镜头 + 规律闪烁，200 刀分数全同。
    // 「严格大于阈值」会把整组一起丢掉 → kept=0 → buildShotBoundaries 得到一个整片长的镜头，
    // 等于换条路走回这次要修的那个症状。
    const flat: RawShotCut[] = Array.from({ length: 200 }, (_, i) => ({
      seconds: i + 1, pts: (i + 1) * 1000, score: 0.5,
    }));
    const { kept, capped } = capShotCutsByScore(flat, MAX_CUTS, SHOT_CUT_DETECT_THRESHOLD);
    expect(capped).toBe(true);
    expect(kept).toHaveLength(MAX_CUTS);
    // 补进来的那些要铺满全片，不是挤在开头。
    expect(kept[kept.length - 1].seconds).toBeGreaterThan(190);
    expect(kept.map((c) => c.seconds)).toEqual([...kept.map((c) => c.seconds)].sort((a, b) => a - b));
  });

  it("高分不够、并列补齐：名额一样要用满", () => {
    const mixed: RawShotCut[] = [
      ...Array.from({ length: 30 }, (_, i) => ({ seconds: i + 1, pts: (i + 1) * 1000, score: 0.9 - i * 0.001 })),
      ...Array.from({ length: 100 }, (_, i) => ({ seconds: 100 + i, pts: (100 + i) * 1000, score: 0.5 })),
    ];
    const { kept } = capShotCutsByScore(mixed, MAX_CUTS, SHOT_CUT_DETECT_THRESHOLD);
    expect(kept).toHaveLength(MAX_CUTS);
  });

  it("pickEvenlyByTime 按时间均匀取，不是取前 N", () => {
    const pool: RawShotCut[] = Array.from({ length: 100 }, (_, i) => ({ seconds: i, pts: i * 100, score: 0.5 }));
    const picked = pickEvenlyByTime(pool, 10);
    expect(picked).toHaveLength(10);
    expect(picked.map((c) => c.seconds)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(pickEvenlyByTime(pool, 0)).toEqual([]);
    expect(pickEvenlyByTime(pool, 500)).toHaveLength(100);
  });
});

describe("联系表行数只有一个 owner（2026-09-22 阻断 B）", () => {
  it("行数由 shotSheetRowsFor 一处算出，喂 tile 与下发给渲染层是同一个数", () => {
    expect(shotSheetRowsFor(120, 8)).toBe(15);
    expect(shotSheetRowsFor(121, 8)).toBe(16);
    expect(shotSheetRowsFor(1, 8)).toBe(1);
    // 一格都没有时也要至少 1 行——否则 filtergraph 会写出 tile=8x0。
    expect(shotSheetRowsFor(0, 8)).toBe(1);
    expect(shotSheetRowsFor(-5, 8)).toBe(1);
    expect(shotSheetRowsFor(10, 0)).toBe(10);
  });

  it("filtergraph 里的行数与算出来的那个恒等（同一个数喂两处）", () => {
    const cuts = spreadCuts(447, 361.081);
    const { kept } = capShotCutsByScore(cuts, MAX_CUTS, SHOT_CUT_DETECT_THRESHOLD);
    const rows = shotSheetRowsFor(kept.length, SHOT_SHEET_COLUMNS);
    const filter = buildSheetFilter(kept.map((c) => c.pts), SHOT_SHEET_COLUMNS, rows, 90);
    expect(filter).toContain(`tile=${SHOT_SHEET_COLUMNS}x${rows}`);
    // 容量必须放得下全部点名的帧，否则末尾几格根本不在图里（第一版末刀就是这么丢的）。
    expect(rows * SHOT_SHEET_COLUMNS).toBeGreaterThanOrEqual(kept.length);
  });

  // 结构守卫：渲染层不许再长出第二份行数算式。这条不是风格检查——
  // 两份算式同时存在正是 B 的成因，而两份都「各自正确」时任何单元测试都发现不了分叉。
  it("渲染层没有任何行数/格子数的自算逻辑", () => {
    const root = path.resolve(__dirname, "../../src/workbench/generationCanvas/nodes");
    for (const file of ["shotCutSelection.ts", "NodeShotCutPanel.tsx"]) {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code).not.toMatch(/shotSheetRows|shotSheetTileCount|sheetIndex/);
      expect(code).not.toMatch(/Math\.ceil\([^)]*(?:cols|columns|sheetColumns)/i);
    }
  });
});

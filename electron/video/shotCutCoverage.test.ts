import { describe, expect, it } from "vitest";
import {
  MAX_CUTS,
  SHOT_CUT_DETECT_THRESHOLD,
  assignSheetIndexes,
  capShotCutsByScore,
  dedupeShotCuts,
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

  it("留下的那批**恰好**等于 `score > appliedThreshold` —— 联系表靠这条才对得上格", () => {
    const cuts = spreadCuts(447, duration);
    const { kept, appliedThreshold } = capShotCutsByScore(cuts, MAX_CUTS, SHOT_CUT_DETECT_THRESHOLD);
    // ffmpeg 的 `gt(scene,T)` 是**严格**大于；差一个等号，联系表就会比切点多出一格。
    expect(kept).toEqual(cuts.filter((cut) => cut.score > appliedThreshold));
  });

  it("并列分数整组一起丢，宁可少给一刀也不让联系表对不上", () => {
    // 121 刀里有 5 刀同分，且这个分正好卡在边界上。
    const tied: RawShotCut[] = Array.from({ length: 121 }, (_, i) => ({
      seconds: i + 1,
      score: i < 5 ? 0.5 : 0.9 - i * 0.001,
    }));
    const { kept, appliedThreshold } = capShotCutsByScore(tied, MAX_CUTS, SHOT_CUT_DETECT_THRESHOLD);
    expect(kept.length).toBeLessThanOrEqual(MAX_CUTS);
    expect(kept.every((cut) => cut.score > appliedThreshold)).toBe(true);
  });
});

describe("dedupeShotCuts —— 同一刀连报两帧", () => {
  const fps = 30;

  it("相邻两帧的同一刀并成一条，保留分数更高的那帧（它才是真正的切点位置）", () => {
    const cuts: RawShotCut[] = [
      { seconds: 5.4, score: 0.341 },
      { seconds: 5.433, score: 0.576 },
      { seconds: 12.0, score: 0.8 },
    ];
    expect(dedupeShotCuts(cuts, fps)).toEqual([
      { seconds: 5.433, score: 0.576 },
      { seconds: 12.0, score: 0.8 },
    ]);
  });

  it("**不**吃掉真实快剪：0.3 秒一刀的 MV 节奏必须原样留着", () => {
    const cuts: RawShotCut[] = [
      { seconds: 1.0, score: 0.5 },
      { seconds: 1.3, score: 0.5 },
      { seconds: 1.6, score: 0.5 },
    ];
    expect(dedupeShotCuts(cuts, fps)).toHaveLength(3);
  });

  it("fps 读不出来就原样返回——不猜一个秒数窗口", () => {
    const cuts: RawShotCut[] = [
      { seconds: 5.4, score: 0.341 },
      { seconds: 5.433, score: 0.576 },
    ];
    expect(dedupeShotCuts(cuts, 0)).toHaveLength(2);
    expect(dedupeShotCuts(cuts, Number.NaN)).toHaveLength(2);
  });
});

describe("assignSheetIndexes —— 去重之后格子号不能再用数组下标", () => {
  it("格子号指向 ffmpeg 真正铺出来的那一格，而不是去重后数组里的位置", () => {
    // ffmpeg 按 gt(scene,T) 吐 5 帧；其中第 1、2 帧是同一刀的两帧，JS 侧去掉一帧。
    const emitted: RawShotCut[] = [
      { seconds: 1.0, score: 0.4 },
      { seconds: 1.033, score: 0.6 },
      { seconds: 4.0, score: 0.5 },
      { seconds: 9.0, score: 0.7 },
      { seconds: 12.0, score: 0.3 },
    ];
    const kept: RawShotCut[] = [emitted[1], emitted[2], emitted[3], emitted[4]];

    const { cuts, emittedCount } = assignSheetIndexes(kept, emitted);

    expect(emittedCount).toBe(5);
    // 拿数组下标当格子号会得到 0,1,2,3 —— 从第一个重复帧起整体错一格，
    // 而且每格都有图、只是配错了时间戳，肉眼根本看不出来。
    expect(cuts.map((c) => c.sheetIndex)).toEqual([1, 2, 3, 4]);
    expect(cuts.map((c) => c.seconds)).toEqual([1.033, 4.0, 9.0, 12.0]);
  });

  it("一帧都没去掉时，格子号就是顺序下标", () => {
    const emitted: RawShotCut[] = [
      { seconds: 2, score: 0.4 },
      { seconds: 5, score: 0.6 },
      { seconds: 8, score: 0.5 },
    ];
    const { cuts } = assignSheetIndexes(emitted, emitted);
    expect(cuts.map((c) => c.sheetIndex)).toEqual([0, 1, 2]);
  });
});

describe("去重 → 压上限 的顺序", () => {
  it("先去重再压上限：重复的刀不该白占名额", () => {
    // 130 刀，其中 20 刀是重影（各自紧跟前一刀一帧）。去重后 110 刀 < 上限，不该被压。
    const base = spreadCuts(110, 300);
    const withEchoes: RawShotCut[] = [];
    base.forEach((cut, i) => {
      withEchoes.push(cut);
      if (i < 20) withEchoes.push({ seconds: cut.seconds + 1 / 30, score: cut.score * 0.5 });
    });
    withEchoes.sort((a, b) => a.seconds - b.seconds);
    expect(withEchoes).toHaveLength(130);

    const deduped = dedupeShotCuts(withEchoes, 30);
    expect(deduped).toHaveLength(110);
    expect(capShotCutsByScore(deduped, MAX_CUTS, SHOT_CUT_DETECT_THRESHOLD).capped).toBe(false);
  });
});

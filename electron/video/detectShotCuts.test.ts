import { describe, expect, it } from "vitest";
import {
  MAX_CUTS,
  buildDetectFilter,
  buildSheetFilter,
  parseShotCutOutput,
} from "./detectShotCuts";

// 真实 ffmpeg 4.4 输出样本（本仓 @ffmpeg-installer 实测，别改成手编的）：
// metadata=print:file=- 写的是 **stdout**，一个切点两行。
const REAL_STDOUT = `frame:0    pts:20480   pts_time:2
lavfi.scene_score=0.673689
frame:1    pts:40960   pts_time:4
lavfi.scene_score=0.520391
frame:2    pts:61440   pts_time:6
lavfi.scene_score=0.630627
`;

describe("parseShotCutOutput", () => {
  it("按真实样本解出 pts + 秒数 + 分数", () => {
    expect(parseShotCutOutput(REAL_STDOUT)).toEqual([
      { pts: 20480, seconds: 2, score: 0.673689 },
      { pts: 40960, seconds: 4, score: 0.520391 },
      { pts: 61440, seconds: 6, score: 0.630627 },
    ]);
  });

  it("一镜到底（无切点）→ 空数组，不抛", () => {
    expect(parseShotCutOutput("")).toEqual([]);
    expect(parseShotCutOutput("frame:0 pts:1024 pts_time:1\n")).toEqual([]);
  });

  it("小数秒照收", () => {
    expect(parseShotCutOutput("pts:257699 pts_time:12.583\nlavfi.scene_score=0.41")).toEqual([
      { pts: 257699, seconds: 12.583, score: 0.41 },
    ]);
  });

  it("不把 ffmpeg 的横幅/进度行当成切点", () => {
    const noise = `  Duration: 00:00:08.00, start: 0.000000, bitrate: 17 kb/s\n${REAL_STDOUT}`;
    expect(parseShotCutOutput(noise)).toHaveLength(3);
  });
});

describe("filtergraph", () => {
  it("检测用 select+metadata，写 stdout", () => {
    expect(buildDetectFilter(0.1)).toBe("select='gt(scene,0.1)',metadata=print:file=-");
  });

  // 2026-09-22 返工：联系表**不再**按分数重筛一遍。它按 pts 点名取帧，所以第 i 格必然是清单第 i 条。
  // 旧写法 `select='gt(scene,T)'` 的前提是「JS 的 T 和 ffmpeg 的 scene 会做出同样的判断」，
  // 而 JS 只看得到 6 位小数的打印值——真实素材上实测差了一帧，120 刀里 21 刀指错格。
  it("联系表按 pts 点名选帧，逗号要转义成 \\,", () => {
    expect(buildSheetFilter([20480, 40960, 61440], 8, 2, 90)).toBe(
      "select='eq(pts\\,20480)+eq(pts\\,40960)+eq(pts\\,61440)',scale=-2:90,tile=8x2",
    );
  });

  it("表达式长度由 MAX_CUTS 封顶，不随片长增长", () => {
    const worst = buildSheetFilter(Array.from({ length: MAX_CUTS }, (_, i) => 999_999_999 - i), 8, 15, 90);
    // 此处只检查字符串长度；随附 ffmpeg 4.4 的执行覆盖见真素材测试。
    expect(worst.length).toBeLessThan(4096);
  });
});

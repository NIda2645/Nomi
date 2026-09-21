import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveFfmpegPath } from "../export/ffmpegRunner";
import { resolveFfprobePath } from "../export/mediaProbe";
// 真实素材的执行层（R13「四件真实」第④件）。登记表：tests/ux/real-media-fixtures.json。
// @ts-expect-error -- helper 是 .mjs，没有类型声明
import { requireRealMediaAssets } from "../../tests/ux/fixtures/realMedia.mjs";
import {
  MAX_CUTS,
  SHOT_CUT_DETECT_THRESHOLD,
  SHOT_SHEET_COLUMNS,
  SHOT_SHEET_TILE_HEIGHT,
  buildDetectFilter,
  buildSheetFilter,
  capShotCutsByScore,
  dedupeShotCuts,
  parseShotCutOutput,
  shotSheetRowsFor,
} from "./detectShotCuts";

const FFMPEG_PATH = resolveFfmpegPath();
const FFPROBE_PATH = resolveFfprobePath(undefined, FFMPEG_PATH);

if (!FFMPEG_PATH || !FFPROBE_PATH) {
  throw new Error("随附 ffmpeg/ffprobe 未解析到：真实素材测试必须与生产使用同一 resolver");
}

/**
 * 联系表逐格核对 —— 这一条只有**真 ffmpeg + 真素材**才证得了。
 *
 * 2026-09-22 的教训就是这一格空着的代价：第一版「按分数抬阈值 + 让联系表用同一个阈值重筛」
 * 单测全绿、合成夹具一个问题都测不出来，而真实素材上 120 刀里有 21 刀指向错误的格子——
 * 因为 JS 只看得到 `lavfi.scene_score` 打印出来的 6 位小数，ffmpeg 的 `gt()` 比的是内部 double，
 * 分数恰好等于阈值的那一帧两边判断相反。合成夹具的分数分布是退化的，**碰不到这条边界**。
 *
 * 所以这条测试不看中间量，只看最终事实：**联系表第 i 格里的画面，是不是第 i 刀那一帧**。
 *
 * ⚠️ 缺素材 = 红，不是 skip（R17：登记即放绿的规则从第一天起就是装饰）。
 */

const TILE_W = 16;
const TILE_H = 12;
const FRAME_BYTES = TILE_W * TILE_H;
/** 灰度平均绝对差阈值。实测：同帧 ≤ 2.4（JPEG 噪声），错帧普遍 > 20、最差 82.8。12 是两者之间的宽裕分界。 */
const SAME_FRAME_MAD = 12;

function ffmpeg(args: string[]): Buffer {
  return execFileSync(FFMPEG_PATH, ["-v", "error", ...args], { maxBuffer: 1 << 28 });
}

/**
 * 从登记的真实素材**派生**一条快剪片：按时间跳着截 175 段各 0.4 秒再首尾相接，
 * 每个接缝就是一次真实硬切。画面是真实拍摄内容（真实熵、真实编码），不是合成色块/测试图样。
 *
 * 派生片保留短间隔接缝的回归样本；原片也直接作为独立参数化用例跑上限路径。
 * 派生物落 tmp（按源文件和二进制身份缓存），不进仓库。
 */
function deriveFastCutClip(source: string): string {
  const stat = fs.statSync(source);
  const binary = fs.statSync(FFMPEG_PATH);
  const id = crypto.createHash("sha1")
    .update(`${source}:${stat.size}:${stat.mtimeMs}:${FFMPEG_PATH}:${binary.size}:${binary.mtimeMs}:v2`)
    .digest("hex").slice(0, 12);
  const out = path.join(os.tmpdir(), `nomi-fastcut-derived-${id}.mp4`);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;

  const duration = Number(
    execFileSync(FFPROBE_PATH, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", source], { encoding: "utf8" }).trim(),
  );
  const segments = 175;
  const segSeconds = 0.4;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-fastcut-"));
  try {
    const list: string[] = [];
    for (let i = 0; i < segments; i += 1) {
      const start = 2 + (i * (duration - 6 - segSeconds)) / (segments - 1);
      const file = path.join(workDir, `${String(i).padStart(3, "0")}.mp4`);
      ffmpeg(["-y", "-ss", start.toFixed(3), "-i", source, "-t", String(segSeconds), "-an",
        "-vf", "scale=480:-2,fps=30,setpts=PTS-STARTPTS", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", file]);
      list.push(`file '${file}'`);
    }
    const concat = path.join(workDir, "concat.txt");
    fs.writeFileSync(concat, list.join("\n"));
    ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", concat, "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-an", out]);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  return out;
}

describe("联系表逐格对得上原片（真实素材）", () => {
  const { assets } = requireRealMediaAssets(["speech-zh-only-hevc", "shot-cut-aug12-hevc"]) as { assets: Map<string, { file: string }> };
  const cases = [
    {
      name: "派生快剪片",
      source: assets.get("speech-zh-only-hevc")!.file,
      prepare: deriveFastCutClip,
      expectedCounts: undefined,
    },
    {
      name: "8月12日原片（390 刀 → 去重 320 刀 → 封顶 120 刀）",
      source: assets.get("shot-cut-aug12-hevc")!.file,
      prepare: (source: string) => source,
      expectedCounts: { raw: 390, deduped: 320 },
    },
  ];

  it.each(cases)(
    "$name：每一格都是它所标的那一刀那一帧",
    { timeout: 20 * 60_000 },
    ({ source, prepare, expectedCounts }) => {
      const clip = prepare(source);
      const [numerator, denominator] = execFileSync(FFPROBE_PATH,
        ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=avg_frame_rate", "-of", "csv=p=0", clip],
        { encoding: "utf8" }).trim().split("/").map(Number);
      const fps = numerator / denominator;
      expect(fps).toBeGreaterThan(0);

      // ① 真检测：生产同款 filtergraph，真解码。
      const detectOut = execFileSync(
        FFMPEG_PATH,
        ["-hide_banner", "-nostats", "-i", clip, "-vf", buildDetectFilter(SHOT_CUT_DETECT_THRESHOLD), "-an", "-f", "null", "-"],
        { encoding: "utf8", maxBuffer: 1 << 26 },
      );
      const parsed = parseShotCutOutput(detectOut);
      const deduped = dedupeShotCuts(parsed, fps);
      const { kept, appliedThreshold, capped } = capShotCutsByScore(deduped, MAX_CUTS, SHOT_CUT_DETECT_THRESHOLD);

      if (expectedCounts) {
        expect(parsed).toHaveLength(expectedCounts.raw);
        expect(deduped).toHaveLength(expectedCounts.deduped);
      }

      // 这条素材必须真的走到「压上限」那条路，否则整条测试是在证明一件没发生的事。
      expect(capped).toBe(true);
      expect(kept).toHaveLength(MAX_CUTS);
      // 并且必须真的踩到那条边界：有一帧的打印分数恰好等于阈值。第一版正是在这里和 ffmpeg 分道扬镳。
      expect(parsed.filter((cut) => cut.score === appliedThreshold).length).toBeGreaterThan(0);

      // ② 真拼联系表：按 pts 点名。
      const rows = shotSheetRowsFor(kept.length, SHOT_SHEET_COLUMNS);
      const sheet = path.join(os.tmpdir(), `nomi-sheet-test-${crypto.randomUUID()}.jpg`);
      try {
        ffmpeg(["-y", "-i", clip,
          "-vf", buildSheetFilter(kept.map((cut) => cut.pts), SHOT_SHEET_COLUMNS, rows, SHOT_SHEET_TILE_HEIGHT),
          "-frames:v", "1", "-q:v", "4", "-an", sheet]);

        const [sheetW, sheetH] = execFileSync(FFPROBE_PATH,
          ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", sheet], { encoding: "utf8" })
          .trim().split(",").map(Number);
        const tileW = Math.floor(sheetW / SHOT_SHEET_COLUMNS);
        const tileH = Math.floor(sheetH / rows);
        // 容量必须放得下全部点名的帧——第一版末刀的格子号就超出了图的容量。
        expect(rows * SHOT_SHEET_COLUMNS).toBeGreaterThanOrEqual(kept.length);

        // ③ 参考帧：整片**一次**解码成灰度序列后按帧号索引。
        //    不用 `-ss` 取参考帧——输入 seek 落在最近的关键帧上，在这种 0.4 秒一段的片子上
        //    会取到隔壁那一段，把一个好的联系表判成错的（本次真踩过，两轮假红）。
        const allFrames = ffmpeg(["-i", clip, "-vf", `scale=${TILE_W}:${TILE_H},format=gray`, "-f", "rawvideo", "-"]);
        const frameCount = Math.floor(allFrames.length / FRAME_BYTES);
        const referenceAt = (seconds: number) => {
          const index = Math.min(frameCount - 1, Math.max(0, Math.round(seconds * fps)));
          return allFrames.subarray(index * FRAME_BYTES, (index + 1) * FRAME_BYTES);
        };

        const mismatches: { index: number; seconds: number; diff: number }[] = [];
        for (let i = 0; i < kept.length; i += 1) {
          const column = i % SHOT_SHEET_COLUMNS;
          const row = Math.floor(i / SHOT_SHEET_COLUMNS);
          const tile = ffmpeg(["-i", sheet,
            "-vf", `crop=${tileW}:${tileH}:${column * tileW}:${row * tileH},scale=${TILE_W}:${TILE_H},format=gray`,
            "-frames:v", "1", "-f", "rawvideo", "-"]);
          const reference = referenceAt(kept[i].seconds);
          let sum = 0;
          for (let k = 0; k < FRAME_BYTES; k += 1) sum += Math.abs(tile[k] - reference[k]);
          const diff = sum / FRAME_BYTES;
          if (diff > SAME_FRAME_MAD) mismatches.push({ index: i, seconds: kept[i].seconds, diff: Number(diff.toFixed(1)) });
        }

        // 第一版在这条素材上是 90/120 错位；按 pts 点名之后实测 0/120、最差 2.4。
        expect(mismatches).toEqual([]);
      } finally {
        fs.rmSync(sheet, { force: true });
      }
    },
  );
});

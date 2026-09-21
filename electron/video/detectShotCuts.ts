// 按切镜检测：找出视频里的画面切点（一条爆款片子是怎么分镜的）。
//
// 通用基建，和 extractVideoFrame 同层：只认「视频 → 切点秒数 + 每个切点长什么样」，不知道任何 vendor。
// 注意别和 LLM 的「拆镜头」（canvasTools 的 propose_storyboard_plan）搞混——那是把**剧本文本**拆成分镜方案，
// 这里是对**已有视频**做画面级切分。
//
// 两趟 ffmpeg，就两趟（不随切点数量增长）：
//   ① 检测：select='gt(scene,LOW)',metadata=print → 吐出每个切点的 pts_time **和 scene_score**。
//   ② 缩略图：同一个 select 条件 + tile → 把这些帧拼成**一张**联系表，切点与格子 1:1 对齐。
//
// 关键设计：检测固定用**低阈值**跑一次拿到全集（带分数），UI 的灵敏度滑杆在**前端**按分数过滤。
// 这样滑杆瞬时响应、且只花一次解码——不必每动一下滑杆重跑 ffmpeg。联系表也在同一阈值下生成，
// 所以第 i 个切点恒对应第 i 个格子，前端过滤只是「少显示几格」，索引不会错位。
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { resolveFfmpegPath } from "../export/ffmpegRunner";
import { ensureExecutable } from "../export/ensureExecutable";
import { probeMediaMetadata } from "../export/mediaProbe";
import { writeProjectCacheFile } from "../assets/projectCacheFile";
import { resolveVideoLocalPath } from "./extractVideoFrame";
import { logError } from "../logging/logger";
// 「给全了没有」这份状态的 owner 在 shared（三个跨进程读侧共用同一份类型与 schema）。
import type { ShotCutCoverage } from "../shared/canvas/shotTable";

/** 检测阈值下限：拿全集用它，前端滑杆再往上筛。太低会把运镜/闪光当切点，0.1 是实测的合理地板。 */
export const SHOT_CUT_DETECT_THRESHOLD = 0.1;
/** 联系表列数（行数按切点数推）。 */
export const SHOT_SHEET_COLUMNS = 8;
/** 每格高度（px）。宽度由源视频比例决定，前端按 sheet 实际宽 / 列数算。 */
export const SHOT_SHEET_TILE_HEIGHT = 90;
/**
 * 单次最多认多少个切点——极碎的片子（快剪 MV）能检出几百个，全铺出来既慢又没法选。
 *
 * **它压的是「一次给多少」，不是「看多长」**（2026-09-22 修）。原来的做法是
 * `all.slice(0, MAX_CUTS)`：按**时间顺序**取前 120 刀，于是 447 刀的片子只覆盖到第 55 秒，
 * 剩下 305 秒被并成**一个巨镜**——行数看着齐、整条片子其实没拆。更糟的是这一刀砍在
 * 灵敏度过滤**之前**，用户把滑杆拉到任何位置都换不回后半段。
 *
 * 现在按**分数**压（`capShotCutsByScore`）：留下最强的那些刀，全片覆盖不变，表短了但片子还是整条。
 * 选它而不是「按分数 Top-N」还有一个硬理由——只有「抬阈值」这一种压法能被 `gt(scene,T)` 原样复现，
 * 联系表才仍旧是一趟 ffmpeg 就能拼出、且第 i 格恒对得上第 i 刀（见下面的 sheetIndex）。
 */
export const MAX_CUTS = 120;
/**
 * 「同一刀连报两帧」的合并窗口（帧）。ffmpeg 的 scene 检测常把一个硬切报在相邻两帧上。
 *
 * 为什么是 2 帧而不是更大：2 帧是三条真实素材上**一条真切点都不误杀**的最大窗口
 * （实测 2026-09-22：F2 精确率 0.882→0.978 而召回恒为 1.0；放到 3 帧起就开始吃掉真快剪，
 * 5 帧/0.2s 虽然 F1 更好看，但那是拿召回换的——那是产品取舍，不是去重）。
 */
export const SHOT_CUT_DEDUPE_FRAMES = 2;

export type ShotCut = {
  /** 切点在源视频里的秒数。 */
  seconds: number;
  /** 该切点的画面变化强度（0-1）。前端灵敏度滑杆按它过滤。 */
  score: number;
  /**
   * 这一刀在**联系表**里占第几格。
   *
   * 为什么不能拿数组下标当格子号：联系表是 ffmpeg 用 `gt(scene,appliedThreshold)` 一趟拼的，
   * 它按**自己**筛出来的帧顺序铺格；而我们在 JS 侧还会去掉「同一刀的第二帧」。
   * 两边一旦不等长，「第 i 格 = 第 i 刀」就从第一个重复帧起整体错位——而且错得很安静
   * （每格都有图，只是配错了时间戳）。所以格子号由主进程算准了带下来，别在任何地方重新编号。
   */
  sheetIndex: number;
};

export type DetectShotCutsPayload = { videoUrl: string; projectId: string };

export type DetectShotCutsResult = {
  cuts: ShotCut[];
  durationSeconds: number;
  /** 联系表图（nomi-local URL）；切点为 0 时为 null。落项目缓存区，**不进素材库**。 */
  sheetUrl: string | null;
  sheetColumns: number;
  sheetTileHeight: number;
  /** 这次给全了没有。**必填**：少给了就必须说，不能假装「就这么多」。 */
  coverage: ShotCutCoverage;
};

export class ShotCutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShotCutError";
  }
}

/** 跑 ffmpeg 并收 stdout（metadata=print:file=- 写的是 stdout，实测 stderr 无内容）。 */
function runFfmpegCapture(ffmpegPath: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    ensureExecutable(ffmpegPath);
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/** 解析出来的原始一行（还没定格子号——格子号要等阈值定下来才算得出）。 */
export type RawShotCut = { seconds: number; score: number };

/** 解析 metadata=print 的输出：`pts_time:<秒>` 后跟一行 `lavfi.scene_score=<分>`。纯函数，可单测。 */
export function parseShotCutOutput(stdout: string): RawShotCut[] {
  const cuts: RawShotCut[] = [];
  const re = /pts_time:([\d.]+)[\s\S]*?lavfi\.scene_score=([\d.]+)/g;
  let match = re.exec(stdout);
  while (match) {
    const seconds = Number.parseFloat(match[1] ?? "");
    const score = Number.parseFloat(match[2] ?? "");
    if (Number.isFinite(seconds) && Number.isFinite(score)) cuts.push({ seconds, score });
    match = re.exec(stdout);
  }
  return cuts;
}

/**
 * 去掉「同一刀连报两帧」。纯函数。
 *
 * 一个硬切常被 ffmpeg 报在相邻两帧上（实测某短片 `5.400/0.576` 紧跟 `5.433/0.341`）。
 * 不去重的代价不只是联系表里多一个重影格子——**拆解那条路每一刀就是一镜、每一镜一次付费读图**，
 * 重复的刀直接变成重复的钱（实测三条素材各多出 5%–11% 的行）。
 *
 * 保留簇里**分数最高**的那一帧：它才是真正的切点位置，余震那帧画面已经切完了。
 * `fps` 读不出来时**原样返回**，不猜一个秒数窗口——猜窄了白做，猜宽了误杀真快剪。
 */
export function dedupeShotCuts(cuts: readonly RawShotCut[], fps: number, frames = SHOT_CUT_DEDUPE_FRAMES): RawShotCut[] {
  if (!Number.isFinite(fps) || fps <= 0) return [...cuts];
  const windowSeconds = frames / fps;
  const out: RawShotCut[] = [];
  for (const cut of cuts) {
    const prev = out[out.length - 1];
    if (prev && cut.seconds - prev.seconds <= windowSeconds) {
      if (cut.score > prev.score) out[out.length - 1] = cut;
      continue;
    }
    out.push(cut);
  }
  return out;
}

/**
 * 压到上限——**按分数压，不按时间砍**。
 *
 * 返回「实际生效的阈值」而不是只返回留下来的那些刀，因为这个数有三个下游都要用：
 * ① 联系表必须用**同一个**阈值重放（`gt(scene,T)` 能原样复现这批帧，Top-N 不能）；
 * ② 用户要看得见「我被自动提到了 0.21」，才知道该往哪调；
 * ③ 它是「这张表为什么只有 120 行」这句话的唯一依据。
 *
 * 阈值取**被丢掉的那些刀里分数最高的那个**，于是「留下的」恰好等于 `score > appliedThreshold`，
 * 和 ffmpeg 的 `gt(scene, appliedThreshold)` 严格同义（gt 是**严格**大于，这里必须对齐，差一个
 * 等号就会让联系表比切点多出一格）。并列分数整组一起丢，所以结果可能略少于 cap——宁可少给一刀，
 * 也不能让联系表和切点对不上。
 */
export function capShotCutsByScore(
  cuts: readonly RawShotCut[],
  cap: number,
  detectThreshold: number,
): { kept: RawShotCut[]; appliedThreshold: number; capped: boolean } {
  if (cuts.length <= cap) return { kept: [...cuts], appliedThreshold: detectThreshold, capped: false };
  // 从高到低扫分数，找**最小**的那个阈值使得「严格大于它」的刀数 <= cap。
  const descending = [...new Set(cuts.map((cut) => cut.score))].sort((a, b) => b - a);
  let appliedThreshold = descending[0] ?? detectThreshold;
  for (const score of descending) {
    if (cuts.filter((cut) => cut.score > score).length <= cap) appliedThreshold = score;
    else break;
  }
  return { kept: cuts.filter((cut) => cut.score > appliedThreshold), appliedThreshold, capped: true };
}

/**
 * 给留下来的每一刀标上它在联系表里的格子号。
 *
 * 联系表是 ffmpeg 按 `gt(scene, appliedThreshold)` 自己筛的帧顺序铺的，**没有去过重**；
 * 我们手上的 `kept` 是去过重的子集。两边按时间顺序对齐一趟即可。
 * 返回值里的 `emittedCount` 是联系表真正有几格——行数必须按它算，不是按 `kept.length`。
 */
export function assignSheetIndexes(
  kept: readonly RawShotCut[],
  emitted: readonly RawShotCut[],
): { cuts: ShotCut[]; emittedCount: number } {
  const cuts: ShotCut[] = [];
  let cursor = 0;
  for (const cut of kept) {
    while (cursor < emitted.length && emitted[cursor].seconds < cut.seconds) cursor += 1;
    cuts.push({ seconds: cut.seconds, score: cut.score, sheetIndex: Math.min(cursor, Math.max(0, emitted.length - 1)) });
    cursor += 1;
  }
  return { cuts, emittedCount: emitted.length };
}

/** 检测用的 filtergraph（纯函数，与联系表共用同一个 select 条件——两者必须同阈值，否则格子对不上切点）。 */
export function buildDetectFilter(threshold: number): string {
  return `select='gt(scene,${threshold})',metadata=print:file=-`;
}

/** 联系表用的 filtergraph。 */
export function buildSheetFilter(threshold: number, columns: number, rows: number, tileHeight: number): string {
  return `select='gt(scene,${threshold})',scale=-2:${tileHeight},tile=${columns}x${rows}`;
}

export async function detectShotCuts(payload: DetectShotCutsPayload): Promise<DetectShotCutsResult> {
  const videoUrl = String(payload?.videoUrl || "").trim();
  const projectId = String(payload?.projectId || "").trim();
  if (!videoUrl) throw new ShotCutError("缺少视频地址");
  if (!projectId) throw new ShotCutError("缺少项目 id");
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) throw new ShotCutError("没找到 ffmpeg，无法检测镜头切点");

  const { filePath, cleanup } = await resolveVideoLocalPath(videoUrl, projectId);
  try {
    const meta = await probeMediaMetadata(filePath);
    const durationSeconds = typeof meta.durationSeconds === "number" && Number.isFinite(meta.durationSeconds)
      ? meta.durationSeconds
      : 0;

    // ① 检测
    const detect = await runFfmpegCapture(ffmpegPath, [
      "-hide_banner", "-nostats",
      "-i", filePath,
      "-vf", buildDetectFilter(SHOT_CUT_DETECT_THRESHOLD),
      "-an", "-f", "null", "-",
    ]);
    if (detect.code !== 0) {
      throw new ShotCutError(`镜头切点检测失败（code ${detect.code}）：${detect.stderr.trim().slice(-300) || "(无 stderr)"}`);
    }
    const parsed = parseShotCutOutput(detect.stdout);
    // 先去掉「同一刀两帧」，再压上限——顺序不能反：先压上限会让重复的刀白占名额。
    const deduped = dedupeShotCuts(parsed, typeof meta.fps === "number" ? meta.fps : 0);
    const { kept, appliedThreshold, capped } = capShotCutsByScore(deduped, MAX_CUTS, SHOT_CUT_DETECT_THRESHOLD);
    // 联系表那一趟 ffmpeg 会按 `gt(scene, appliedThreshold)` 自己筛帧——**没去重**，所以格子号要对齐它。
    // （没压过时 appliedThreshold 就是检测下限，这一筛是恒等的——全集本来就都 > 它。）
    const emitted = parsed.filter((cut) => cut.score > appliedThreshold);
    const { cuts, emittedCount } = assignSheetIndexes(kept, emitted);
    const coverage: ShotCutCoverage = {
      detectedCuts: deduped.length,
      keptCuts: cuts.length,
      appliedThreshold,
      capped,
      coveredSeconds: cuts.length ? cuts[cuts.length - 1].seconds : 0,
      durationSeconds,
    };
    if (capped) {
      logError("tasks", "shotCuts.capped", new ShotCutError(
        `切点 ${deduped.length} 刀超过上限 ${MAX_CUTS}，阈值自动提到 ${appliedThreshold}，采用 ${cuts.length} 刀，覆盖到 ${coverage.coveredSeconds}s / ${durationSeconds}s`,
      ), { projectId });
    }
    if (!cuts.length) {
      return {
        cuts: [], durationSeconds, sheetUrl: null,
        sheetColumns: SHOT_SHEET_COLUMNS, sheetTileHeight: SHOT_SHEET_TILE_HEIGHT, coverage,
      };
    }

    // ② 联系表：用**实际生效的那个阈值**重放同一个 select 条件，故第 i 格恒是第 sheetIndex 刀。
    const rows = Math.ceil(emittedCount / SHOT_SHEET_COLUMNS);
    const outPath = path.join(os.tmpdir(), `nomi-shotsheet-${crypto.randomUUID()}.jpg`);
    try {
      const sheet = await runFfmpegCapture(ffmpegPath, [
        "-y", "-hide_banner", "-nostats",
        "-i", filePath,
        "-vf", buildSheetFilter(appliedThreshold, SHOT_SHEET_COLUMNS, rows, SHOT_SHEET_TILE_HEIGHT),
        "-frames:v", "1", "-q:v", "4", "-an",
        outPath,
      ]);
      if (sheet.code !== 0 || !fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
        // 缩略图挂了不该拖垮整件事：切点数据仍然有用（用户照样能按时间点选）。
        return {
          cuts, durationSeconds, sheetUrl: null,
          sheetColumns: SHOT_SHEET_COLUMNS, sheetTileHeight: SHOT_SHEET_TILE_HEIGHT, coverage,
        };
      }
      // 落项目缓存区而非素材库：这是可再生的中间产物，写进素材库会把用户的库刷屏（见 filmstrip 的同款教训）。
      const written = writeProjectCacheFile(projectId, fs.readFileSync(outPath), "shot-cuts", ".jpg");
      return {
        cuts, durationSeconds, sheetUrl: written.url,
        sheetColumns: SHOT_SHEET_COLUMNS, sheetTileHeight: SHOT_SHEET_TILE_HEIGHT, coverage,
      };
    } finally {
      try { fs.unlinkSync(outPath); } catch { /* non-fatal */ }
    }
  } finally {
    cleanup();
  }
}

// 按切镜检测：找出视频里的画面切点（一条爆款片子是怎么分镜的）。
//
// 通用基建，和 extractVideoFrame 同层：只认「视频 → 切点秒数 + 每个切点长什么样」，不知道任何 vendor。
// 注意别和 LLM 的「拆镜头」（canvasTools 的 propose_storyboard_plan）搞混——那是把**剧本文本**拆成分镜方案，
// 这里是对**已有视频**做画面级切分。
//
// 两趟 ffmpeg，就两趟（不随切点数量增长）：
//   ① 检测：select='gt(scene,LOW)',metadata=print → 吐出每个切点的 **pts（整数）**、pts_time 和 scene_score。
//   ② 缩略图：select='eq(pts\,A)+eq(pts\,B)+…' + tile → 按①定下来的那份清单**点名选帧**拼成一张联系表。
//
// 关键设计：检测固定用**低阈值**跑一次拿到全集（带分数），UI 的灵敏度滑杆在**前端**按分数过滤。
// 这样滑杆瞬时响应、且只花一次解码——不必每动一下滑杆重跑 ffmpeg。
//
// 「第 i 格 = 第 i 刀」怎么保证（2026-09-22 返工）：靠**第二趟按 pts 点名**，不靠「两边各筛一次应该筛出同一批」。
// 原来第二趟也写 `gt(scene,T)`，前提是 JS 的 T 和 ffmpeg 的 scene 会做出同样的判断——可 JS 只看得到
// 打印出来的 6 位小数，ffmpeg 比的是内部 double，分数恰好等于 T 的那一帧两边判断相反。
// 真实素材上 ffmpeg 因此多吐一帧，120 刀里 21 刀指错格。pts 是整数，点名选帧没有这种缝。
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
/** 联系表列数（行数由主进程按采用的刀数算好，随结果下发——渲染层不再自己推）。 */
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

/**
 * 一个切点。
 *
 * **第 i 刀恒是联系表的第 i 格**——这条不再靠「两边算出来应该相等」，而是**由构造保证**：
 * 联系表那一趟 ffmpeg 不再自己按分数重筛一遍，而是按这份清单的 `pts` **精确点名选帧**
 * （`buildSheetFilter`）。JS 这一份就是唯一真相源，ffmpeg 只负责照单抓帧。
 *
 * 2026-09-22 第一版栽在这上面：当时联系表用 `gt(scene,appliedThreshold)` 重筛，以为能原样复现。
 * 实际上 JS 手里只有 `lavfi.scene_score` **打印出来的 6 位小数**，而 ffmpeg 的 `gt()` 比的是
 * 内部全精度 double。分数恰好等于阈值的那一帧，JS 按 `>` 排除、ffmpeg 按全精度收下——
 * 真实素材上实测 ffmpeg 多吐 1 帧，120 刀里 21 刀指错格、末刀的格子号甚至超出图的容量。
 * 每格都有图、只是配错了时间戳，正是「错得很安静」。阈值必然取自某一帧的打印值，
 * 所以这不是小概率：约一半压上限的片子都会中。
 */
export type ShotCut = {
  /** 切点在源视频里的秒数。 */
  seconds: number;
  /** 该切点的画面变化强度（0-1）。前端灵敏度滑杆按它过滤。 */
  score: number;
};

export type DetectShotCutsPayload = { videoUrl: string; projectId: string };

export type DetectShotCutsResult = {
  cuts: ShotCut[];
  durationSeconds: number;
  /** 联系表图（nomi-local URL）；切点为 0 时为 null。落项目缓存区，**不进素材库**。 */
  sheetUrl: string | null;
  sheetColumns: number;
  /**
   * 联系表有几行。**由主进程算好下发，渲染层不许自己推**（2026-09-22 第二条阻断）：
   * 两侧各算一份时，只要末帧是被去重并掉的那一帧，两边就差一行——而 `background-size` 的高度
   * 按行数算，少一行就把整张联系表**竖向压扁**，所有格子一起错位。实测 0.4%–2% 的片长会中，
   * 且**不压上限的普通片子也会中**。格子数/行数只许有一个 owner，就是这里。
   */
  sheetRows: number;
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

/**
 * 解析出来的原始一行。
 *
 * `pts` 是这一帧的**整数**时间戳——联系表靠它点名选帧。为什么必须是 pts 而不是 `pts_time` 或分数：
 * 它是整数，两边比较不存在精度差；秒数是打印出来的小数，分数更是只有 6 位——拿它们跟 ffmpeg
 * 对齐就是在赌舍入（第一版正是这么栽的，见 `ShotCut` 的注释）。
 */
export type RawShotCut = { seconds: number; score: number; pts: number };

/**
 * 解析 metadata=print 的输出：`frame:N pts:<整数> pts_time:<秒>` 后跟一行 `lavfi.scene_score=<分>`。
 * 纯函数，可单测。
 *
 * ⚠️ `frame:N` 是**选出来之后**的序号（0,1,2…），不是源帧号——别拿它当帧标识。真正能标识一帧的是 `pts`。
 */
export function parseShotCutOutput(stdout: string): RawShotCut[] {
  const cuts: RawShotCut[] = [];
  const re = /pts:(\d+)\s+pts_time:([\d.]+)[\s\S]*?lavfi\.scene_score=([\d.]+)/g;
  let match = re.exec(stdout);
  while (match) {
    const pts = Number.parseInt(match[1] ?? "", 10);
    const seconds = Number.parseFloat(match[2] ?? "");
    const score = Number.parseFloat(match[3] ?? "");
    if (Number.isFinite(pts) && Number.isFinite(seconds) && Number.isFinite(score)) cuts.push({ seconds, score, pts });
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
 * 联系表有几行。**这是这份状态唯一的算式**（2026-09-22 阻断 B）。
 *
 * 它同时喂给 `tile=CxR` 和随结果下发给渲染层——一个数、一个来源。
 * 曾经渲染层自己也有一份（`shotSheetRows(格子数, 列数)`），两份算式的输入口径只要差一点
 * （末帧恰好是被去重并掉的那一帧就差一行），`background-size` 的高度就按错的行数算，
 * 整张联系表**竖向压扁**、所有格子一起错位。实测 0.4%–2% 的片长会中，普通片子也会中。
 */
export function shotSheetRowsFor(cutCount: number, columns: number): number {
  return Math.max(1, Math.ceil(Math.max(0, cutCount) / Math.max(1, columns)));
}

/**
 * 从并列的那一档里按**时间**均匀挑 `need` 条。
 *
 * 为什么需要它：阈值取第 cap+1 名的分数，若那一档有大量并列，「严格大于阈值」会把整组一起丢掉。
 * 极端情形（200 刀分数全同）会得到 kept=0 → `buildShotBoundaries` 给出**一个整片长的镜头**，
 * 等于换条路走回这次要修的那个症状。所以并列时不能只会「宁少勿超」，要有个讲理的下限。
 *
 * 挑的判据是**时间均匀**而不是再比分数（同分之间没有可比性），这样补进来的刀仍然铺满全片。
 */
export function pickEvenlyByTime(cuts: readonly RawShotCut[], need: number): RawShotCut[] {
  if (need <= 0) return [];
  if (need >= cuts.length) return [...cuts];
  const picked: RawShotCut[] = [];
  for (let i = 0; i < need; i += 1) {
    picked.push(cuts[Math.floor((i * cuts.length) / need)]);
  }
  return picked;
}

/**
 * 压到上限——**按分数压，不按时间砍**。
 *
 * 返回「实际生效的阈值」而不是只返回留下来的那些刀，因为这个数有两个下游要用：
 * ① 用户要看得见「我被自动提到了 0.21」，才知道该往哪调；
 * ② 它是「这张表为什么只有 120 行」这句话的唯一依据。
 *
 * **阈值不再拿去跟 ffmpeg 对齐**（2026-09-22 第二版）：联系表改成按 `pts` 点名选帧，
 * 谁入选完全由这里说了算，ffmpeg 不再自己筛一遍。所以这个阈值只是一条**对内**的选取判据，
 * 它是打印值还是全精度值都不再影响任何跨系统的一致性。
 *
 * 并列处理：先取「严格大于阈值」的那些；若因为并列而不够 cap，再从并列那一档里按时间均匀补齐。
 */
export function capShotCutsByScore(
  cuts: readonly RawShotCut[],
  cap: number,
  detectThreshold: number,
): { kept: RawShotCut[]; appliedThreshold: number; capped: boolean } {
  if (cuts.length <= cap) return { kept: [...cuts], appliedThreshold: detectThreshold, capped: false };
  // 分数从高到低排，取第 cap+1 名当阈值：严格大于它的顶多 cap 条，而再低一档就必然超上限。
  const appliedThreshold = cuts.map((cut) => cut.score).sort((a, b) => b - a)[cap];
  const strong = cuts.filter((cut) => cut.score > appliedThreshold);
  if (strong.length >= cap) return { kept: strong, appliedThreshold, capped: true };
  // 并列补齐：名额没用满的那部分，从恰好等于阈值的那一档里按时间均匀取。
  const tied = cuts.filter((cut) => cut.score === appliedThreshold);
  const filled = new Set(pickEvenlyByTime(tied, cap - strong.length));
  const kept = cuts.filter((cut) => cut.score > appliedThreshold || filled.has(cut));
  return { kept, appliedThreshold, capped: true };
}

/** 检测用的 filtergraph（纯函数，与联系表共用同一个 select 条件——两者必须同阈值，否则格子对不上切点）。 */
export function buildDetectFilter(threshold: number): string {
  return `select='gt(scene,${threshold})',metadata=print:file=-`;
}

/**
 * 联系表用的 filtergraph：**按 pts 点名选帧**，不再按分数重筛一遍。
 *
 * 这是「第 i 格 = 第 i 刀」从「两边应该算出一样的结果」变成「由构造保证」的那一刀。
 * 第一版用 `select='gt(scene,T)'` 让 ffmpeg 自己再筛一次，前提是「JS 的 T 和 ffmpeg 的 scene
 * 会做出同样的判断」——而 JS 只看得到 6 位小数的打印值，ffmpeg 比的是内部 double，
 * 分数恰好等于 T 的那一帧两边判断相反。真实素材上因此 120 刀里错了 21 刀。
 *
 * 现在 ffmpeg 只负责照单抓帧：`select='eq(pts\,A)+eq(pts\,B)+…'`。pts 是**整数**，没有精度可言。
 * 于是 tile 铺出来的第 i 格必然就是清单里第 i 条，不存在「多吐一帧」这种事。
 *
 * 表达式长度：一条 `eq(pts\,NNNNNNN)+` 约 16 字节，刀数上限 `MAX_CUTS`=120 ⇒ 最长约 2KB，
 * 实测 ffmpeg 8.0.1 接受（1994 字节那条跑通、耗时 2.5s）。**长度由 MAX_CUTS 封顶**，不会随片长增长。
 * 逗号必须转义成 `\,`，否则会被 filtergraph 当成 filter 分隔符。
 */
export function buildSheetFilter(ptsList: readonly number[], columns: number, rows: number, tileHeight: number): string {
  const picks = ptsList.map((pts) => `eq(pts\\,${pts})`).join("+");
  return `select='${picks}',scale=-2:${tileHeight},tile=${columns}x${rows}`;
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
    const cuts: ShotCut[] = kept.map((cut) => ({ seconds: cut.seconds, score: cut.score }));
    // 行数在这里算一次，既喂给 tile 也随结果下发——渲染层不许再推一遍（B 那条阻断）。
    const sheetRows = shotSheetRowsFor(cuts.length, SHOT_SHEET_COLUMNS);
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
        sheetColumns: SHOT_SHEET_COLUMNS, sheetRows: 1, sheetTileHeight: SHOT_SHEET_TILE_HEIGHT, coverage,
      };
    }

    // ② 联系表：按**这份清单的 pts** 点名选帧，故第 i 格恒是 cuts[i]——由构造保证，不靠两边算得一样。
    const outPath = path.join(os.tmpdir(), `nomi-shotsheet-${crypto.randomUUID()}.jpg`);
    try {
      const sheet = await runFfmpegCapture(ffmpegPath, [
        "-y", "-hide_banner", "-nostats",
        "-i", filePath,
        "-vf", buildSheetFilter(kept.map((cut) => cut.pts), SHOT_SHEET_COLUMNS, sheetRows, SHOT_SHEET_TILE_HEIGHT),
        "-frames:v", "1", "-q:v", "4", "-an",
        outPath,
      ]);
      if (sheet.code !== 0 || !fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
        // 缩略图挂了不该拖垮整件事：切点数据仍然有用（用户照样能按时间点选）。
        return {
          cuts, durationSeconds, sheetUrl: null,
          sheetColumns: SHOT_SHEET_COLUMNS, sheetRows, sheetTileHeight: SHOT_SHEET_TILE_HEIGHT, coverage,
        };
      }
      // 落项目缓存区而非素材库：这是可再生的中间产物，写进素材库会把用户的库刷屏（见 filmstrip 的同款教训）。
      const written = writeProjectCacheFile(projectId, fs.readFileSync(outPath), "shot-cuts", ".jpg");
      return {
        cuts, durationSeconds, sheetUrl: written.url,
        sheetColumns: SHOT_SHEET_COLUMNS, sheetRows, sheetTileHeight: SHOT_SHEET_TILE_HEIGHT, coverage,
      };
    } finally {
      try { fs.unlinkSync(outPath); } catch { /* non-fatal */ }
    }
  } finally {
    cleanup();
  }
}

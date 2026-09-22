// 文字叠加链（字幕 / 标题卡）。从 ffmpegFiltergraph.ts 拆出来的一块：
// 视觉链、过渡链、音频链各管各的，文字链的特殊之处是它的输入不来自时间轴素材，
// 而是渲染好的全画幅透明 PNG —— 也正是 2026-09-21 那条「导出慢几十倍」的根因所在。

import {
  FfmpegFiltergraphError,
  formatSeconds,
  loopedStillInput,
  secondsFromFrames,
  type FfmpegFiltergraphPlanInput,
} from "./ffmpegGraphPrimitives";

/** 字幕/标题卡叠加：已渲染成全画幅透明 PNG 的临时文件 + 可见区间。 */
export type FfmpegTextOverlayInput = {
  path: string;
  startFrame: number;
  endFrame: number;
};

/**
 * 叠加层输入在自己窗口前后各留的余量（秒）——保证 `enable` 区间的**端点帧**一定取得到叠加帧。
 * 按秒不按帧：静帧的帧率不是我们定的（见 `loopedStillInput`），0.2 s 在 image2 默认的 25 fps 下
 * 是 5 帧，对任何 ≥5 fps 的输入都够。代价可忽略：120 条字幕多生成 120 × 0.4 s 的静帧。
 */
const OVERLAY_INPUT_MARGIN_SECONDS = 0.2;

/**
 * 每条 overlay PNG 作为新输入，**只生成它自己可见的那一段**（`loopedStillInput`），
 * 再用 `setpts` 落到时间轴上的位置，最后在 [start,end] 区间 overlay 到视频上。
 * PNG 是全画幅透明 → overlay=0:0 对齐。接在视觉链尾（最上层）。返回新增滤镜行 + 输入 + 最终视频 label。
 *
 * 窗口两端各留 `OVERLAY_INPUT_MARGIN_SECONDS` 余量，为的是 `enable` 那个**闭区间**的端点帧
 * （t=start 与 t=end）在 framesync 里一定取得到叠加帧。两端之外不会「多叠」，因为 `enable` 关着：
 * 窗口开始之前 framesync 按 `in[1].before = EXT_NULL` 直接把主帧放过去
 * （`libavfilter/framesync.c` `ff_framesync_init_dualinput`），EOF 之后按 `eof_action=pass` 同样直通。
 *
 * `timelineSeconds` 用来把流的末端夹住：窗口比时间轴还长时（数据模型今天造不出来——
 * `computeTimelineDuration` 会被字幕自己撑长——但手搓 manifest 能造），不夹的话反而比旧写法多生成。
 */
export function buildTextOverlayGraph(
  textOverlays: FfmpegTextOverlayInput[],
  assetInputCount: number,
  baseVideoLabel: string,
  fps: number,
  timelineSeconds: number,
  pixelFormat: string,
): { filters: string[]; inputs: FfmpegFiltergraphPlanInput[]; videoLabel: string } {
  const filters: string[] = [];
  const inputs: FfmpegFiltergraphPlanInput[] = [];
  let label = baseVideoLabel;
  textOverlays.forEach((overlay, index) => {
    if (
      !Number.isFinite(overlay.startFrame)
      || !Number.isFinite(overlay.endFrame)
      || overlay.endFrame <= overlay.startFrame
    ) {
      throw new FfmpegFiltergraphError(
        "invalid_manifest",
        `Text overlay ${index} needs endFrame > startFrame, got ${overlay.startFrame}..${overlay.endFrame}`,
      );
    }
    const inputIndex = assetInputCount + index;
    const start = secondsFromFrames(overlay.startFrame, fps);
    const end = secondsFromFrames(overlay.endFrame, fps);
    const streamStart = Math.max(0, start - OVERLAY_INPUT_MARGIN_SECONDS);
    const streamEnd = Math.min(end, timelineSeconds) + OVERLAY_INPUT_MARGIN_SECONDS;
    inputs.push(loopedStillInput(`text_overlay_${index}`, overlay.path, Math.max(streamEnd - streamStart, 1 / fps)));
    const placedLabel = `vtxtsrc${index}`;
    filters.push(`[${inputIndex}:v]setpts=PTS-STARTPTS+${formatSeconds(streamStart)}/TB[${placedLabel}]`);
    const isLast = index === textOverlays.length - 1;
    const out = isLast ? "voutfinal" : `vtxt${index}`;
    const formatSuffix = isLast ? `,format=${pixelFormat}` : "";
    filters.push(
      `[${label}][${placedLabel}]overlay=0:0:eof_action=pass:enable='between(t,${formatSeconds(start)},${formatSeconds(end)})'${formatSuffix}[${out}]`,
    );
    label = out;
  });
  return { filters, inputs, videoLabel: `[${label}]` };
}

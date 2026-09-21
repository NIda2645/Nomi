// 导出滤镜图的地基：错误类型、输入描述、时间格式化，以及「循环静帧输入」的唯一构造口。
// 独立成文件是为了让文字叠加链（ffmpegTextOverlayGraph.ts）与主图（ffmpegFiltergraph.ts）
// 共用同一份地基而不互相 import（运行期循环依赖会把 FfmpegFiltergraphError 变成 undefined）。

export type FfmpegFiltergraphPlanInput = {
  assetId: string;
  path: string;
  kind: "image" | "video" | "audio";
  inputArgs: string[];
};

export type FfmpegFiltergraphErrorCode =
  | "missing_asset"
  | "unsupported_audio"
  | "unsupported_clip"
  | "invalid_manifest";

export class FfmpegFiltergraphError extends Error {
  readonly code: FfmpegFiltergraphErrorCode;

  constructor(code: FfmpegFiltergraphErrorCode, message: string) {
    super(message);
    this.name = "FfmpegFiltergraphError";
    this.code = code;
  }
}

export function secondsFromFrames(frames: number, fps: number): number {
  return frames / fps;
}

/**
 * 秒数写进滤镜表达式的**唯一**格式。只保留 6 位小数：这一点是有语义的——
 * `enable='between(t,a,b)'` 的端点就是这样写出去的，200/30 = 6.666666… 截成 6.666667 之后
 * 够不够得着那一帧，取决于滤镜链的 time_base 取整。改这里等于改所有窗口的边界帧。
 */
export function formatSeconds(seconds: number): string {
  if (Number.isInteger(seconds)) return String(seconds);
  return Number(seconds.toFixed(6)).toString();
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(6)).toString();
}

/**
 * 全仓唯一构造「循环静帧输入」（`-loop 1`）的地方。守一条不变量：
 *
 * > **`-t` 只能是消费这张静帧的那个可见窗口的长度，绝不是时间轴全长。**
 *
 * `enable` 只挡混合、不挡上游生成，`-t` 写成全片长 ⇒ 成本 = 条目数 × 全片帧数 × 全画幅 RGBA。
 * **不要加 `-framerate`**：它改这条链的 time_base，framesync 取两路的公约数当输出 time_base，
 * 下游 `enable` 的闭区间端点帧会翻转（试过，被逐帧对照抓到）。
 *
 * 事故经过、实测数字、同类扫描、残余风险：
 * `docs/fixes/2026-09-21-export-text-overlay-cost.root-cause.json`。
 * 门岗：`check:heavy-path` 的 `ffmpeg-still-input-outside-owner`（按闸判，基线 0）。
 */
export function loopedStillInput(
  assetId: string,
  absolutePath: string,
  windowSeconds: number,
): FfmpegFiltergraphPlanInput {
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    throw new FfmpegFiltergraphError(
      "invalid_manifest",
      `Still input ${assetId} needs a positive visible window, got ${windowSeconds}`,
    );
  }
  return {
    assetId,
    path: absolutePath,
    kind: "image",
    inputArgs: ["-loop", "1", "-t", formatSeconds(windowSeconds)],
  };
}

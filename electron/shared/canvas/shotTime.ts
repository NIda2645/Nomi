// 镜头时间的**精度真相源**：拆解出来的镜头起止只允许落在 0.1 秒的格子上。
//
// 为什么需要一个 owner（2026-09-12 用户：「秒数也离谱，为什么那么多小数字」）：
// 切点来自 ffmpeg 的 `showinfo`、时长来自 ffprobe，两者都是 IEEE-754 双精度的原始测量值
// （`1.4681260000000001`）。分镜表的时间列是**直接插值**这个数字的（i18n `shotTable.timeRange`
// = `{{start}}–{{end}}s`），所以模型/探针的浮点尾数会一路漏到用户眼前。
// 治法只有一条：在产出和落库这两道边界上把它量化，显示层一个 round 都不写。
//
// 为什么是 0.1 秒：
// ① 人的感知：24/25/30fps 下一帧是 33–42ms，0.1s ≈ 2.5–3 帧——已经是「看得出差别」的最小单位，
//    再细的位数对「这一镜多长」这个判断没有任何行动价值（D1：没有行动价值的信息就是噪音）。
// ② 与时间轴不打架：时间轴的内部单位是**帧**（`src/workbench/timeline/timelineMath.ts`，
//    默认 30fps ≈ 0.033s），刻度标签最细是 1 秒（`TimelinePanel.tsx:resolveTimelineRulerStep`
//    最密一档 = `fps` 帧 = 1s）。0.1s 比一帧粗、比一个刻度细，夹在两者中间，谁都不冲突。
// ③ 它同时替掉了原先「贴边切点」那个手写的 0.01 魔法数：量化之后，落在边缘 0.05s 内的切点
//    自然会被吸到 0 或片尾那一格上，判「贴边」变成判「等于端点」，阈值由精度派生。

/** 镜头时间的格子大小（秒）。改这一个数就改掉全链路的精度。 */
export const SHOT_TIME_PRECISION_SECONDS = 0.1;

const STEPS_PER_SECOND = Math.round(1 / SHOT_TIME_PRECISION_SECONDS);

/**
 * 把一个秒数吸到最近的格子上。非有限值与负值按 0 处理（上游已各自校验，这里只保证不外泄 NaN）。
 *
 * 返回值仍是 number（不是字符串）：精度是**领域约束**，不是排版选择——落库的数字本身就该是干净的，
 * 显示层只负责拼 `–` 和 `s`。
 */
export function quantizeShotSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * STEPS_PER_SECOND) / STEPS_PER_SECOND;
}

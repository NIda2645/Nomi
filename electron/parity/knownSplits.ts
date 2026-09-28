/**
 * 已知分裂清单（棘轮：只许减，不许增）。
 * 每条写明：哪两个入口、差在哪个字段、对应哪条阻断编号。主进程 lane 每合并一项删一条。
 */
import splits from "./known-splits.json";

export type KnownSplit = {
  caseId: string;
  entranceId: string;
  /** 与基准入口 `canvas-node` 相比差在哪个字段（`body.resolution` / `failure.code` …）。 */
  field: string;
  baseline?: unknown;
  actual?: unknown;
  /** 对应的阻断编号（A1–A5 / B1–B6 / BL-1–BL-5）。 */
  blocker: string;
  why: string;
};

export const KNOWN_SPLITS: readonly KnownSplit[] = splits as KnownSplit[];

export const splitKey = (split: Pick<KnownSplit, "caseId" | "entranceId" | "field">): string =>
  `${split.caseId} × ${split.entranceId} × ${split.field}`;

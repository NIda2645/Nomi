import fs from "node:fs";
import path from "node:path";
import type { JsonRecord } from "../jsonUtils";
import { assetKindFromContentType, contentTypeFromPath } from "./assetPaths";
import { copyAssetFile } from "./projectAssetStore";

class UnsupportedLocalImageError extends Error {}

function readImageSource(sourcePath: string): { fileName: string; contentType: string } {
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile()) throw new Error("source path is not a file");
  const fileName = path.basename(sourcePath);
  const contentType = contentTypeFromPath(sourcePath);
  if (assetKindFromContentType(contentType) !== "image") {
    throw new UnsupportedLocalImageError("source file is not an image");
  }
  return { fileName, contentType };
}

export function copyLocalImageFile(projectId: string, sourcePath: string): unknown {
  const { fileName, contentType } = readImageSource(sourcePath);
  const meta: JsonRecord = { kind: "upload", originalName: fileName };
  return copyAssetFile(projectId, sourcePath, fileName, contentType, meta);
}

export type LocalImageCopyBatchResult = {
  created: unknown[];
  skippedUnsupportedCount: number;
  failedCount: number;
};

export function copyLocalImageFiles(projectId: string, sourcePaths: string[]): LocalImageCopyBatchResult {
  const result: LocalImageCopyBatchResult = { created: [], skippedUnsupportedCount: 0, failedCount: 0 };
  for (const sourcePath of sourcePaths) {
    try {
      result.created.push(copyLocalImageFile(projectId, sourcePath));
    } catch (error) {
      if (error instanceof UnsupportedLocalImageError) result.skippedUnsupportedCount += 1;
      else result.failedCount += 1;
    }
  }
  return result;
}

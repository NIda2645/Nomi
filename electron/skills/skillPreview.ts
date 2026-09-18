import fs from "node:fs";
import path from "node:path";
import { contentTypeFromPath } from "../assets/assetPaths";
import type { SkillRecord } from "./skillStore";

/** Media identity, shared by library cards and the future Agent hover consumer. */
export function skillPreviewUrl(record: SkillRecord): string {
  return record.origin === "builtin" && !record.manifestError && record.curation?.preview
    ? `nomi-local://skill-preview/${encodeURIComponent(record.directoryName)}` : "";
}

/** Only declared built-in media is exposed; a request never supplies a disk path. */
export function resolveSkillPreview(
  segments: readonly string[],
  records: readonly SkillRecord[],
): { filePath: string; contentType: string } | null {
  if (segments.length !== 1) return null;
  const record = records.find((item) => item.directoryName === segments[0] && skillPreviewUrl(item));
  const preview = record?.curation?.preview;
  if (!record || !preview) return null;
  try {
    const directory = fs.realpathSync(path.dirname(record.filePath));
    const filePath = fs.realpathSync(path.join(directory, preview.path));
    if (!filePath.startsWith(directory + path.sep) || !fs.statSync(filePath).isFile()) return null;
    return { filePath, contentType: contentTypeFromPath(filePath) };
  } catch {
    return null;
  }
}

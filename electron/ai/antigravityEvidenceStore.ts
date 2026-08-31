import fs from "node:fs";
import path from "node:path";
import { getSettingsRoot } from "../runtimePaths";
import { writeJsonFileAtomic } from "../jsonFile";
import type { AntigravityCheck } from "../shared/antigravity";

// Main-process-owned evidence, not editable model metadata or an IPC payload.
const evidencePath = () => path.join(getSettingsRoot(), "antigravity-verification.json");
export function readAntigravityEvidence(): unknown {
  let fd: number | undefined;
  try {
    fd = fs.openSync(evidencePath(), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const info = fs.fstatSync(fd);
    if (!info.isFile() || !info.size || info.size > 128 * 1024) return [];
    const bytes = Buffer.alloc(info.size + 1);
    const count = fs.readSync(fd, bytes, 0, bytes.length, 0);
    if (count !== info.size) return [];
    return JSON.parse(bytes.subarray(0, count).toString("utf8"));
  } catch { return []; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
export function writeAntigravityEvidence(checks: AntigravityCheck[]): void {
  writeJsonFileAtomic(evidencePath(), checks);
}

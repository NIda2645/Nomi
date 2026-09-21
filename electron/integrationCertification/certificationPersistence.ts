import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fsyncDirectoryIfDurable, fsyncIfDurable } from "../durability";
import { renameSyncWithRetry } from "../jsonFile";

/**
 * 这一族状态文件的硬上限。**它是最后一道兜底，不该是用户撞上的那一道**：
 * 撞上它的调用方只会拿到一句 `oversized`，而在启动路径上（看门狗收尾 → persist）
 * 那一抛会一路走到 `main.ts` 的 `.catch` → `app.quit()`，和「接入会话超过 100 条」
 * 那次静默退出是同一种死法。所以「还能不能写得下」要在更早的地方按预算裁掉，
 * 再由这里 fail-closed 收口——见 integrationSessionRecord.capIntegrationSessions。
 */
export const CERTIFICATION_MAX_FILE_BYTES = 1_048_576;

/** 落盘后的真实字节数。预算判断必须用**写盘时那一份序列化**，别在别处另估一份。 */
export function certificationJsonBytes(state: unknown): number {
  return Buffer.byteLength(serializeCertificationJson(state));
}

function serializeCertificationJson(state: unknown): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export class CertificationPersistenceError extends Error {
  constructor(
    readonly reason: "corrupt" | "unsupported_version" | "oversized" | "invalid_state" | "lock_timeout",
    message: string,
  ) {
    super(message);
    this.name = "CertificationPersistenceError";
  }
}

export function writeCertificationJsonAtomic(filePath: string, state: unknown): void {
  const serialized = serializeCertificationJson(state);
  if (Buffer.byteLength(serialized) > CERTIFICATION_MAX_FILE_BYTES) throw new CertificationPersistenceError("oversized", "Certification persistence exceeds size limit");
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
  let renamed = false;
  try {
    const fd = fs.openSync(tempPath, "wx", 0o600);
    try { fs.writeFileSync(fd, serialized, "utf8"); fsyncIfDurable(fd); } finally { fs.closeSync(fd); }
    renameSyncWithRetry(tempPath, filePath);
    renamed = true;
    fs.chmodSync(filePath, 0o600);
    fsyncDirectoryIfDurable(dir);
  } finally {
    if (!renamed) try { fs.rmSync(tempPath, { force: true }); } catch { /* preserve original failure */ }
  }
}

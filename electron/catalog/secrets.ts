// API key 加密 —— 从 runtime.ts 拆出（见
// docs/plan/2026-06-04-runtime-split-execution.md 第 4 步）。
//
// safeStorage 走 OS 钥匙串（macOS Keychain / Windows DPAPI / Linux libsecret）。
// 不可用时（如无 keyring 的 rootless Linux）回退明文，并给记录打 enc 标记，
// 供下次读取时懒升级（见 runtime.ts readCatalog）。
import { safeStorage } from "electron";

export type ApiKeyRecord = {
  vendorKey: string;
  /** Key material. Encoding indicated by `enc`. Legacy v1 records have no `enc` and are plaintext. */
  apiKey: string;
  /** v2+: how the apiKey above is encoded. Absent = legacy plaintext (v1). */
  enc?: "safeStorage" | "plain";
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * Custom-call named configuration values. These share the vendor credential
   * record so API keys and AK/SK-style secondary secrets have one storage and
   * deletion boundary. Values are never exposed through the vendor DTO.
   */
  customConfig?: Record<string, EncryptedSecretValue>;
};

export type EncryptedSecretValue = {
  value: string;
  enc: "safeStorage";
};

let __safeStorageConfirmed = false;
let __safeStorageUnavailableWarned = false;

export function isSafeStorageAvailable(): boolean {
  if (__safeStorageConfirmed) return true;
  let available = false;
  try {
    available = safeStorage.isEncryptionAvailable();
  } catch {
    available = false;
  }
  if (available) {
    __safeStorageConfirmed = true;
    return true;
  }
  if (!__safeStorageUnavailableWarned) {
    __safeStorageUnavailableWarned = true;
    console.warn("[catalog] safeStorage unavailable; API keys will be stored as plaintext");
  }
  return false;
}

/** Build a fresh ApiKeyRecord from plaintext, encrypting if safeStorage is available. */
export function makeApiKeyRecordFromPlain(
  plain: string,
  vendorKey: string,
  enabled: boolean,
  createdAt: string,
  updatedAt: string,
): ApiKeyRecord {
  if (isSafeStorageAvailable()) {
    const encrypted = safeStorage.encryptString(plain).toString("base64");
    return { vendorKey, apiKey: encrypted, enc: "safeStorage", enabled, createdAt, updatedAt };
  }
  return { vendorKey, apiKey: plain, enc: "plain", enabled, createdAt, updatedAt };
}

/** Custom config is always fail-closed: unlike legacy API keys it may not add a plaintext fallback. */
export function encryptCustomSecretValue(plain: string): EncryptedSecretValue {
  if (!isSafeStorageAvailable()) {
    throw new Error("系统安全存储不可用，无法保存自定义配置；未写入任何明文。请解锁系统钥匙串后重试。");
  }
  return {
    value: safeStorage.encryptString(plain).toString("base64"),
    enc: "safeStorage",
  };
}

export function decryptCustomSecretValue(record: EncryptedSecretValue | undefined): string {
  if (!record?.value) return "";
  try {
    return safeStorage.decryptString(Buffer.from(record.value, "base64"));
  } catch (error) {
    console.error(
      `[catalog] failed to decrypt custom configuration: ${error instanceof Error ? error.message : error}`,
    );
    return "";
  }
}

export function decryptCustomConfigRecord(record: ApiKeyRecord | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, secret] of Object.entries(record?.customConfig || {})) {
    const normalizedName = name.trim();
    if (!normalizedName) continue;
    out[normalizedName] = decryptCustomSecretValue(secret);
  }
  return out;
}

/** Runtime compatibility for a v8 catalog whose migration is deferred until the keychain is available. */
export function decryptCustomConfigWithLegacy(
  record: ApiKeyRecord | undefined,
  vendorMeta: unknown,
): Record<string, string> {
  const legacy: Record<string, string> = {};
  if (vendorMeta && typeof vendorMeta === "object" && !Array.isArray(vendorMeta)) {
    const raw = (vendorMeta as Record<string, unknown>).customConfig;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [rawName, rawValue] of Object.entries(raw as Record<string, unknown>)) {
        const name = rawName.trim();
        if (!name) continue;
        if (typeof rawValue === "string") legacy[name] = rawValue;
        else if (typeof rawValue === "number" || typeof rawValue === "boolean") legacy[name] = String(rawValue);
        else if (rawValue === null) legacy[name] = "";
      }
    }
  }
  return { ...legacy, ...decryptCustomConfigRecord(record) };
}

/** Decode an ApiKeyRecord to plaintext. Returns "" if a safeStorage-encoded value can't be decrypted. */
export function decryptApiKeyRecord(rec: ApiKeyRecord | undefined): string {
  if (!rec || !rec.apiKey) return "";
  if (rec.enc === "safeStorage") {
    try {
      return safeStorage.decryptString(Buffer.from(rec.apiKey, "base64"));
    } catch (e) {
      console.error(
        `[catalog] failed to decrypt API key for vendor ${rec.vendorKey}: ${e instanceof Error ? e.message : e}`,
      );
      return "";
    }
  }
  // enc === "plain" or absent (legacy v1)
  return rec.apiKey;
}

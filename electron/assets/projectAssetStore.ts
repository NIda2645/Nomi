import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { hardenedFetch } from "../hardenedFetch";
import { isJsonRecord, nowIso, type JsonRecord } from "../jsonUtils";
import { projectDirById, sanitizeName } from "../projects/repository";
import { ensureDir } from "../runtimePaths";
import { broadcastAssetsUpdated } from "./assetEvents";
import { collectFilesRecursively, parseDataUrl } from "./assetBytes";
import {
  assetBucketFromMeta,
  canonicalAssetFileName,
  assetKindFromContentType,
  contentTypeFromPath,
  extensionFromMime,
  extensionFromUrl,
  localAssetUrl,
  sanitizeAssetMetaForKind,
  stableAssetId,
} from "./assetPaths";
import { resolveContentType } from "./mediaTypes";

type LocalAssetRecord = {
  id: string;
  name: string;
  userId: "local";
  projectId: string;
  createdAt: string;
  updatedAt: string;
  data: {
    url: string;
    relativePath: string;
    absolutePath: string;
    contentType: string;
    size: number;
    kind: string;
  } & JsonRecord;
};

function readAssetSidecarMeta(absolutePath: string): JsonRecord {
  try {
    const parsed = JSON.parse(fs.readFileSync(`${absolutePath}.meta`, "utf8"));
    return isJsonRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeAssetSidecarMeta(absolutePath: string, meta: JsonRecord): void {
  const sidecar: JsonRecord = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined) sidecar[key] = value;
  }
  if (Object.keys(sidecar).length === 0) return;
  try {
    fs.writeFileSync(`${absolutePath}.meta`, JSON.stringify(sidecar));
  } catch {
    /* non-fatal */
  }
}

function contentTypeFromStoredFile(absolutePath: string): string {
  const extensionType = contentTypeFromPath(absolutePath);
  if (extensionType !== "application/octet-stream") return extensionType;
  try {
    const handle = fs.openSync(absolutePath, "r");
    const header = Buffer.alloc(4096);
    const bytesRead = fs.readSync(handle, header, 0, header.length, 0);
    fs.closeSync(handle);
    return resolveContentType(absolutePath, header.subarray(0, bytesRead));
  } catch {
    return extensionType;
  }
}

function effectiveContentType(fileName: string, declared: string, bytes?: Uint8Array): string {
  const normalized = String(declared || "application/octet-stream").toLowerCase().split(";")[0].trim();
  const extension = path.extname(fileName).toLowerCase();
  // 已有真实扩展名的旧文件保留其历史落盘语义（例如 .avi 交给懒自愈处理）；
  // 只有无扩展名或通用 .bin 才需要用文件头把视频从未知类型救回来。
  return normalized === "application/octet-stream" && (!extension || extension === ".bin")
    ? resolveContentType(fileName, bytes)
    : declared;
}

async function writeAssetSidecarMetaAsync(absolutePath: string, meta: JsonRecord): Promise<void> {
  const sidecar: JsonRecord = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined) sidecar[key] = value;
  }
  if (Object.keys(sidecar).length === 0) return;
  try {
    await fs.promises.writeFile(`${absolutePath}.meta`, JSON.stringify(sidecar));
  } catch {
    /* non-fatal */
  }
}

function uniqueAssetPath(
  projectId: string,
  fileName: string,
  bucket: "generated" | "imported" = "generated",
): { absolutePath: string; relativePath: string } {
  const projectDir = projectDirById(projectId);
  if (!projectDir) throw new Error("Project not found");
  const today = new Date().toISOString().slice(0, 10);
  const assetDir = path.join(projectDir, "assets", bucket, today);
  ensureDir(assetDir);
  const parsed = path.parse(sanitizeName(fileName, "asset.bin"));
  const base = parsed.name || "asset";
  const ext = parsed.ext || ".bin";
  let absolutePath = path.join(assetDir, `${base}${ext}`);
  for (let index = 2; fs.existsSync(absolutePath); index += 1) {
    absolutePath = path.join(assetDir, `${base}-${index}${ext}`);
  }
  return {
    absolutePath,
    relativePath: path.relative(projectDir, absolutePath).replace(/\\/g, "/"),
  };
}

function stableStoredAssetId(projectId: string, relativePath: string): string {
  return stableAssetId(projectId, relativePath);
}

function stableLocalReferenceId(projectId: string, url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    if (parts[0] === projectId && parts.length > 1) return stableStoredAssetId(projectId, parts.slice(1).join("/"));
  } catch {
    // Fall through to a deterministic reference identity for malformed legacy URLs.
  }
  return stableStoredAssetId(projectId, url);
}

export function writeAsset(
  projectId: string,
  bytes: Buffer,
  fileName: string,
  contentType: string,
  rawMeta: JsonRecord,
): unknown {
  // 唯一 sidecar 写入者之一：capture 族 originalUrl 恒 null 的不变量在此收口（见 assetPaths）。
  const meta = sanitizeAssetMetaForKind(rawMeta);
  const actualContentType = effectiveContentType(fileName, contentType, bytes);
  const storageFileName = canonicalAssetFileName(fileName, actualContentType);
  const { absolutePath, relativePath } = uniqueAssetPath(projectId, storageFileName, assetBucketFromMeta(meta));
  fs.writeFileSync(absolutePath, bytes);
  writeAssetSidecarMeta(absolutePath, meta);
  broadcastAssetsUpdated(projectId);
  const url = localAssetUrl(projectId, relativePath);
  const t = nowIso();
  return {
    id: stableStoredAssetId(projectId, relativePath),
    name: sanitizeName(fileName, "asset"),
    userId: "local",
    projectId,
    createdAt: t,
    updatedAt: t,
    data: {
      ...meta,
      url,
      relativePath,
      absolutePath,
      contentType: actualContentType,
      size: bytes.byteLength,
    },
  };
}

/**
 * Persist a generated output at a path derived from its materialization key.
 * A retry after a crash returns the same asset instead of creating `-2` copies.
 */
export function writeDeterministicAsset(
  projectId: string,
  bytes: Buffer,
  fileName: string,
  contentType: string,
  rawMeta: JsonRecord,
  materializationKey: string,
): unknown {
  const meta = sanitizeAssetMetaForKind(rawMeta);
  const actualContentType = effectiveContentType(fileName, contentType, bytes);
  const storageFileName = canonicalAssetFileName(fileName, actualContentType);
  const parsed = path.parse(sanitizeName(storageFileName, "asset"));
  const keyHash = crypto.createHash("sha256").update(materializationKey).digest("hex").slice(0, 24);
  const projectDir = projectDirById(projectId);
  if (!projectDir) throw new Error("Project not found");
  const bucket = assetBucketFromMeta(meta);
  const relativePath = path.posix.join("assets", bucket, "materialized", `${parsed.name || "asset"}-${keyHash}${parsed.ext || ".bin"}`);
  const absolutePath = path.join(projectDir, relativePath);
  ensureDir(path.dirname(absolutePath));
  if (fs.existsSync(absolutePath)) {
    const existingHash = crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
    const nextHash = crypto.createHash("sha256").update(bytes).digest("hex");
    if (existingHash !== nextHash) throw new Error("Deterministic materialization key maps to different bytes");
  } else {
    fs.writeFileSync(absolutePath, bytes);
    writeAssetSidecarMeta(absolutePath, meta);
    broadcastAssetsUpdated(projectId);
  }
  const url = localAssetUrl(projectId, relativePath);
  const t = nowIso();
  return {
    id: stableStoredAssetId(projectId, relativePath),
    name: sanitizeName(fileName, "asset"),
    userId: "local",
    projectId,
    createdAt: t,
    updatedAt: t,
    data: {
      ...meta,
      url,
      relativePath,
      absolutePath,
      contentType: actualContentType,
      size: bytes.byteLength,
    },
  };
}

/** Copy an existing native file into the project without materializing it as a main-process Buffer. */
export async function copyAssetFile(
  projectId: string,
  sourcePath: string,
  fileName: string,
  contentType: string,
  rawMeta: JsonRecord,
): Promise<unknown> {
  const meta = sanitizeAssetMetaForKind(rawMeta);
  let actualContentType = contentType;
  if (String(contentType || "").toLowerCase().split(";")[0].trim() === "application/octet-stream") {
    const handle = await fs.promises.open(sourcePath, "r");
    try {
      const header = Buffer.alloc(4096);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      actualContentType = effectiveContentType(fileName, contentType, header.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  }
  const storageFileName = canonicalAssetFileName(fileName, actualContentType);
  const { absolutePath, relativePath } = uniqueAssetPath(projectId, storageFileName, assetBucketFromMeta(meta));
  await fs.promises.copyFile(sourcePath, absolutePath);
  const stat = await fs.promises.stat(absolutePath);
  await writeAssetSidecarMetaAsync(absolutePath, meta);
  broadcastAssetsUpdated(projectId);
  const url = localAssetUrl(projectId, relativePath);
  const t = nowIso();
  return {
    id: stableStoredAssetId(projectId, relativePath),
    name: sanitizeName(fileName, "asset"),
    userId: "local",
    projectId,
    createdAt: t,
    updatedAt: t,
    data: {
      ...meta,
      url,
      relativePath,
      absolutePath,
      contentType: actualContentType,
      size: stat.size,
    },
  };
}

export function moveAssetFile(
  projectId: string,
  sourcePath: string,
  fileName: string,
  contentType: string,
  rawMeta: JsonRecord,
): unknown {
  // 唯一 sidecar 写入者之二：与 writeAsset 同一道 capture 族隐私收口。
  const meta = sanitizeAssetMetaForKind(rawMeta);
  const header = String(contentType || "").toLowerCase().split(";")[0].trim() === "application/octet-stream"
    ? (() => {
        const handle = fs.openSync(sourcePath, "r");
        try {
          const bytes = Buffer.alloc(4096);
          const bytesRead = fs.readSync(handle, bytes, 0, bytes.length, 0);
          return bytes.subarray(0, bytesRead);
        } finally {
          fs.closeSync(handle);
        }
      })()
    : undefined;
  const actualContentType = effectiveContentType(fileName, contentType, header);
  const storageFileName = canonicalAssetFileName(fileName, actualContentType);
  const { absolutePath, relativePath } = uniqueAssetPath(projectId, storageFileName, assetBucketFromMeta(meta));
  try {
    fs.renameSync(sourcePath, absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    fs.copyFileSync(sourcePath, absolutePath);
    fs.rmSync(sourcePath, { force: true });
  }
  const stat = fs.statSync(absolutePath);
  writeAssetSidecarMeta(absolutePath, meta);
  broadcastAssetsUpdated(projectId);
  const url = localAssetUrl(projectId, relativePath);
  const t = nowIso();
  return {
    id: stableStoredAssetId(projectId, relativePath),
    name: sanitizeName(fileName, "asset"),
    userId: "local",
    projectId,
    createdAt: t,
    updatedAt: t,
    data: {
      ...meta,
      url,
      relativePath,
      absolutePath,
      contentType: actualContentType,
      size: stat.size,
    },
  };
}

type RemoteAssetImportOptions = {
  /** 仅供 main 进程内部已配置的本地生成服务使用；renderer IPC 无法注入第二参数。 */
  trustedPrivateOrigin?: string;
};

export async function importRemoteAsset(payload: unknown, options: RemoteAssetImportOptions = {}): Promise<unknown> {
  const raw = payload as JsonRecord;
  const projectId = String(raw.projectId || "").trim();
  const url = String(raw.url || "").trim();
  if (!projectId) throw new Error("projectId is required");
  if (!url) throw new Error("url is required");
  if (url.startsWith("nomi-local://")) {
    return {
      id: stableLocalReferenceId(projectId, url),
      name: String(raw.fileName || "local asset"),
      userId: "local",
      projectId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      data: { url, kind: raw.kind || "local" },
    };
  }
  if (url.startsWith("data:")) {
    const parsed = parseDataUrl(url);
    const ext = extensionFromMime(parsed.contentType, "bin");
    return writeAsset(
      projectId,
      parsed.bytes,
      String(raw.fileName || `asset-${Date.now()}.${ext}`),
      parsed.contentType,
      { kind: raw.kind || "generated", originalUrl: null },
    );
  }
  if (!/^https?:\/\//i.test(url)) throw new Error("Only http(s), data, and nomi-local assets are supported");
  const fetched = await hardenedFetch(url, {
    timeoutMs: 60_000,
    maxBytes: 200 * 1024 * 1024,
    allowContentTypes: ["image/", "video/", "audio/", "application/octet-stream"],
    ...(options.trustedPrivateOrigin ? { allowedPrivateOrigins: [options.trustedPrivateOrigin] } : {}),
  });
  const bytes = fetched.bytes;
  const hintedContentType = fetched.contentType || "application/octet-stream";
  const rawFileName = String(raw.fileName || path.basename(new URL(url).pathname) || "").trim();
  const contentType = hintedContentType.toLowerCase().split(";")[0] === "application/octet-stream"
    ? resolveContentType(rawFileName || url, bytes)
    : hintedContentType;
  const ext = extensionFromMime(contentType, extensionFromUrl(url));
  const fileName = rawFileName || `asset-${Date.now()}.${ext}`;
  return writeAsset(projectId, bytes, fileName.includes(".") ? fileName : `${fileName}.${ext}`, contentType, {
    kind: raw.kind || "generated",
    originalUrl: url,
    ownerNodeId: raw.ownerNodeId || null,
  });
}

export function listProjectAssets(payload: unknown): { items: LocalAssetRecord[]; cursor: string | null } {
  const raw = payload as JsonRecord | undefined;
  const projectId = String(raw?.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const projectDir = projectDirById(projectId);
  if (!projectDir) return { items: [], cursor: null };
  const assetsDir = path.join(projectDir, "assets");
  const requestedLimit = typeof raw?.limit === "number" && Number.isFinite(raw.limit) ? Math.floor(raw.limit) : 200;
  const limit = Math.max(1, Math.min(500, requestedLimit));
  const offset = Math.max(0, Number.parseInt(String(raw?.cursor || "0"), 10) || 0);
  const kindFilter = typeof raw?.kind === "string" && raw.kind.trim() ? raw.kind.trim() : "";
  const records = collectFilesRecursively(assetsDir)
    .flatMap((absolutePath): LocalAssetRecord[] => {
      try {
        if (absolutePath.endsWith(".meta")) return [];
        const stat = fs.statSync(absolutePath);
        const relativePath = path.relative(projectDir, absolutePath).replace(/\\/g, "/");
        const contentType = contentTypeFromStoredFile(absolutePath);
        const sidecarMeta = readAssetSidecarMeta(absolutePath);
        const mediaKind = assetKindFromContentType(contentType);
        const sidecarKind =
          typeof sidecarMeta.kind === "string" && sidecarMeta.kind.trim() ? sidecarMeta.kind.trim() : "";
        const kind = sidecarKind || mediaKind;
        if (kindFilter && kind !== kindFilter) return [];
        const createdAt = new Date(stat.birthtimeMs || stat.mtimeMs).toISOString();
        const updatedAt = new Date(stat.mtimeMs).toISOString();
        return [
          {
            id: stableAssetId(projectId, relativePath),
            name: path.basename(absolutePath),
            userId: "local",
            projectId,
            createdAt,
            updatedAt,
            data: {
              ...sidecarMeta,
              url: localAssetUrl(projectId, relativePath),
              relativePath,
              absolutePath,
              contentType,
              size: stat.size,
              kind,
              mediaType:
                typeof sidecarMeta.mediaType === "string" && sidecarMeta.mediaType
                  ? sidecarMeta.mediaType
                  : mediaKind === "image" || mediaKind === "video" || mediaKind === "audio"
                    ? mediaKind
                    : undefined,
            },
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const items = records.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    items,
    cursor: nextOffset < records.length ? String(nextOffset) : null,
  };
}

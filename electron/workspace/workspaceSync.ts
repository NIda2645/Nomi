import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readJsonFile, writeJsonFileAtomic } from "../jsonFile";
import { resolveWorkspaceRelativePath, workspaceNomiDir, workspaceProjectBackupFile, workspaceProjectFile } from "./workspacePaths";
import type { WorkspaceSyncInspection } from "../shared/workspaceSyncContracts";
export type { WorkspaceSyncInspection, WorkspaceSyncStatus } from "../shared/workspaceSyncContracts";

export type WorkspaceSyncState = {
  schemaVersion: 1;
  workspaceId: string;
  revision: number;
  contentHash: string;
  writerId: string;
  writtenAt: string;
};

// 第 1 组 = URL 自带的项目 id（素材归谁由 URL 说了算，见 src/media/nomiLocalAssetUrl.ts），第 2 组 = 项目内相对路径。
const LOCAL_ASSET_RE = /nomi-local:\/\/asset\/([^/"'\s]+)\/([^"'\s]+)/g;

function syncStatePath(rootPath: string): string {
  return path.join(workspaceNomiDir(rootPath), "sync-state.json");
}

function contentHash(filePath: string): string | null {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  } catch {
    return null;
  }
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 这个文件夹**自己的**素材引用（相对路径）。
 *
 * 只数 URL 里项目 id 等于本项目的那些：从「全部素材」拖进来的别的项目的素材，URL 仍编着源项目 id，
 * 文件住在源项目文件夹里，协议也按那个 id 去读（electron/protocol/localProtocol.ts parseLocalAssetUrl）。
 * 同步本文件夹既不搬它们、也不该为它们报「缺素材」——2026-09-24 用户反馈：把别的项目的素材拖进来后，
 * 这些引用被拿去本文件夹下找，全数判成缺失，项目库随即拦住「继续创作」，项目再也进不去。
 */
function referencedAssetPaths(rootPath: string, projectId: string): string[] {
  const manifestPath = workspaceProjectFile(rootPath);
  if (!fs.existsSync(manifestPath)) return [];
  const raw = fs.readFileSync(manifestPath, "utf8");
  const paths = new Set<string>();
  for (const match of raw.matchAll(LOCAL_ASSET_RE)) {
    if (decodeSegment(match[1]) !== projectId) continue;
    paths.add(match[2].split("/").map(decodeSegment).join("/"));
  }
  return [...paths];
}

export function writeWorkspaceSyncState(rootPath: string, state: WorkspaceSyncState): void {
  writeJsonFileAtomic(syncStatePath(rootPath), state);
}

export function readWorkspaceSyncState(rootPath: string): WorkspaceSyncState | null {
  try {
    const raw = readJsonFile(syncStatePath(rootPath)) as Partial<WorkspaceSyncState>;
    if (raw.schemaVersion !== 1 || typeof raw.workspaceId !== "string" || typeof raw.writerId !== "string") return null;
    if (!Number.isInteger(raw.revision) || typeof raw.contentHash !== "string" || typeof raw.writtenAt !== "string") return null;
    return raw as WorkspaceSyncState;
  } catch {
    return null;
  }
}

export function inspectWorkspaceSync(
  rootPath: string,
  projectId: string,
  expected?: { revision: number; contentHash: string },
): WorkspaceSyncInspection {
  const manifestPath = workspaceProjectFile(rootPath);
  const manifestExists = fs.existsSync(manifestPath);
  const backupExists = fs.existsSync(workspaceProjectBackupFile(rootPath));
  if (!manifestExists) {
    return {
      status: "corrupt-manifest",
      manifestExists,
      backupExists,
      referencedAssetCount: 0,
      missingAssetCount: 0,
      observedRevision: null,
      lastWriterId: null,
      contentHash: null,
    };
  }

  const observedRevision = (() => {
    try {
      const raw = readJsonFile(manifestPath) as { revision?: unknown };
      return typeof raw.revision === "number" ? raw.revision : 0;
    } catch {
      return null;
    }
  })();
  if (observedRevision === null) {
    return {
      status: "corrupt-manifest",
      manifestExists,
      backupExists,
      referencedAssetCount: 0,
      missingAssetCount: 0,
      observedRevision: null,
      lastWriterId: null,
      contentHash: null,
    };
  }

  const hash = contentHash(manifestPath);
  const references = referencedAssetPaths(rootPath, projectId);
  const missingAssetCount = references.filter((relativePath) => {
    try {
      return !fs.existsSync(resolveWorkspaceRelativePath(rootPath, relativePath));
    } catch {
      return true;
    }
  }).length;
  const state = readWorkspaceSyncState(rootPath);
  const changed = Boolean(expected && (expected.revision !== observedRevision || expected.contentHash !== hash));
  return {
    status: changed ? "external-change" : missingAssetCount > 0 ? "missing-assets" : "ready",
    manifestExists,
    backupExists,
    referencedAssetCount: references.length,
    missingAssetCount,
    observedRevision,
    lastWriterId: state?.writerId ?? null,
    contentHash: hash,
  };
}

export function quarantineWorkspaceConflict(rootPath: string, source: "local" | "remote"): string {
  const dir = path.join(workspaceNomiDir(rootPath), "conflicts");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `project-${source}-${Date.now()}.json`);
  fs.copyFileSync(workspaceProjectFile(rootPath), filePath);
  return filePath;
}

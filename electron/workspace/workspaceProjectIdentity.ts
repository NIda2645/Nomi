import crypto from "node:crypto";
import fs from "node:fs";

import { readJsonFile } from "../jsonFile";
import { withWorkspaceManifestMutation } from "./workspaceManifest";
import type { WorkspaceManifestLockOptions } from "./workspaceManifestLock";
import { workspaceProjectBackupFile, workspaceProjectFile } from "./workspacePaths";
import { WorkspaceProjectIdentityUnavailableError, type WorkspaceProjectRecordV2 } from "./workspaceTypes";

export { WorkspaceProjectIdentityUnavailableError } from "./workspaceTypes";

type IdentityCompleteWorkspaceRecord = WorkspaceProjectRecordV2 & {
  immutableProjectUuid: string;
  projectGeneration: number;
};

export type WorkspaceProjectIdentity = {
  projectId: string;
  immutableProjectUuid: string;
  projectGeneration: number;
  canonicalRootPath: string;
  canonicalRootDigest: string;
};

export type EnsureWorkspaceProjectIdentityOptions = {
  randomUuid?: () => string;
  lockOptions?: WorkspaceManifestLockOptions;
};

function identityUnavailable(message: string, cause?: unknown): WorkspaceProjectIdentityUnavailableError {
  return new WorkspaceProjectIdentityUnavailableError(message, cause === undefined ? undefined : { cause });
}

function digestCanonicalRoot(canonicalRootPath: string): string {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalRootPath)).digest("hex");
}

export function deriveCanonicalWorkspaceRootIdentity(actualRootPath: string): {
  canonicalRootPath: string;
  canonicalRootDigest: string;
} {
  try {
    const canonicalRootPath = fs.realpathSync(actualRootPath);
    if (!fs.statSync(canonicalRootPath).isDirectory()) {
      throw new Error("Workspace root is not a directory");
    }
    return {
      canonicalRootPath,
      canonicalRootDigest: digestCanonicalRoot(canonicalRootPath),
    };
  } catch (error) {
    throw identityUnavailable("Workspace project root identity is unavailable", error);
  }
}

function requireCompleteOrLegacy(record: WorkspaceProjectRecordV2): IdentityCompleteWorkspaceRecord | null {
  const hasUuid = typeof record.immutableProjectUuid === "string" && record.immutableProjectUuid.length > 0;
  const hasGeneration = Number.isSafeInteger(record.projectGeneration) && (record.projectGeneration ?? 0) > 0;
  if (hasUuid !== hasGeneration) {
    throw identityUnavailable("Workspace project identity is only partially present");
  }
  return hasUuid && hasGeneration ? (record as IdentityCompleteWorkspaceRecord) : null;
}

function projectIdentity(record: IdentityCompleteWorkspaceRecord, canonicalRootPath: string): WorkspaceProjectIdentity {
  return {
    projectId: record.id,
    immutableProjectUuid: record.immutableProjectUuid,
    projectGeneration: record.projectGeneration,
    canonicalRootPath,
    canonicalRootDigest: digestCanonicalRoot(canonicalRootPath),
  };
}

type SettledIdentity = { id: string; immutableProjectUuid: string; projectGeneration: number };

function readSettledIdentity(filePath: string): SettledIdentity | null {
  try {
    const raw = readJsonFile(filePath) as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const { id, immutableProjectUuid, projectGeneration } = raw;
    if (typeof id !== "string" || !id) return null;
    if (typeof immutableProjectUuid !== "string" || !immutableProjectUuid) return null;
    if (typeof projectGeneration !== "number" || !Number.isSafeInteger(projectGeneration) || projectGeneration < 1) return null;
    return { id, immutableProjectUuid, projectGeneration };
  } catch {
    return null;
  }
}

/**
 * 身份已经落定时的无锁读：主清单和备份**都**带着完整且一致的身份。身份只在两份都缺时生成、生成后永不再改
 * （见下面加锁路径与 initializeWorkspace），所以这时读到的就是最终答案——不拿清单写锁、不写盘、不 fsync。
 * 打开项目每次都要问两遍身份（提交画布读面、打开右侧 Agent）；以前每问一遍都走一次加锁写事务
 * （锁主人文件 + 候选目录 + 锁改名 + 释放，各一次 fsync），读路径在写盘。
 * 任何不确定（缺备份、半缺、不一致、读失败、不是合法 JSON）一律返回 null，交给加锁路径按原规则补齐或报错。
 */
function readSettledWorkspaceProjectIdentity(actualRootPath: string): WorkspaceProjectIdentity | null {
  let canonicalRootPath: string;
  let mainFile: string;
  let backupFile: string;
  try {
    canonicalRootPath = fs.realpathSync(actualRootPath);
    mainFile = workspaceProjectFile(canonicalRootPath);
    backupFile = workspaceProjectBackupFile(canonicalRootPath);
  } catch {
    return null;
  }
  const main = readSettledIdentity(mainFile);
  if (!main) return null;
  const backup = readSettledIdentity(backupFile);
  if (
    !backup ||
    backup.id !== main.id ||
    backup.immutableProjectUuid !== main.immutableProjectUuid ||
    backup.projectGeneration !== main.projectGeneration
  ) {
    return null;
  }
  return {
    projectId: main.id,
    immutableProjectUuid: main.immutableProjectUuid,
    projectGeneration: main.projectGeneration,
    canonicalRootPath,
    canonicalRootDigest: digestCanonicalRoot(canonicalRootPath),
  };
}

export async function ensureWorkspaceProjectIdentity(
  actualRootPath: string,
  options: EnsureWorkspaceProjectIdentityOptions = {},
): Promise<WorkspaceProjectIdentity> {
  const settled = readSettledWorkspaceProjectIdentity(actualRootPath);
  if (settled) return settled;
  try {
    return await withWorkspaceManifestMutation(
      actualRootPath,
      (context) => {
        if (!context.current || !context.currentRaw) {
          throw identityUnavailable("Workspace project manifest is unavailable");
        }

        const mainIdentity = requireCompleteOrLegacy(context.current);
        const backupIdentity = context.currentBackup ? requireCompleteOrLegacy(context.currentBackup) : null;

        if (mainIdentity) {
          if (!backupIdentity) {
            context.replaceBackup({
              ...(context.currentBackupRaw ?? context.currentRaw),
              immutableProjectUuid: mainIdentity.immutableProjectUuid,
              projectGeneration: mainIdentity.projectGeneration,
            });
          }
          return projectIdentity(mainIdentity, context.canonicalRootPath);
        }

        const selectedIdentity = backupIdentity ?? {
          ...context.current,
          immutableProjectUuid: (options.randomUuid ?? (() => crypto.randomUUID()))(),
          projectGeneration: 1,
        };
        if (!backupIdentity) {
          context.replaceBackup({
            ...(context.currentBackupRaw ?? context.currentRaw),
            immutableProjectUuid: selectedIdentity.immutableProjectUuid,
            projectGeneration: selectedIdentity.projectGeneration,
          });
        }
        const persisted = context.replace({
          ...context.currentRaw,
          immutableProjectUuid: selectedIdentity.immutableProjectUuid,
          projectGeneration: selectedIdentity.projectGeneration,
        });
        const persistedComplete = requireCompleteOrLegacy(persisted);
        if (
          !persistedComplete ||
          persistedComplete.immutableProjectUuid !== selectedIdentity.immutableProjectUuid ||
          persistedComplete.projectGeneration !== selectedIdentity.projectGeneration
        ) {
          throw identityUnavailable("Workspace project identity did not persist atomically");
        }
        return projectIdentity(persistedComplete, context.canonicalRootPath);
      },
      options.lockOptions,
      { localizeEmbeddedMedia: false },
    );
  } catch (error) {
    if (error instanceof WorkspaceProjectIdentityUnavailableError) throw error;
    throw identityUnavailable("Workspace project identity could not be completed", error);
  }
}

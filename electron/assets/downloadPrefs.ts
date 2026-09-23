// 下载/输出偏好持久化 —— 存 userData/download-prefs.json（非用户数据、丢了只是回退默认、无损）。
// 两件事同住这一份：① 记住上次「另存」到的目录（fb-20260724）；② 集中设置页「自动另存」的开关+目录
//（2026-08-01，生成完自动复制一份到用户目录）。所有写都走 writePrefs 做 merge——写一个字段绝不抹掉另一个。
import path from "node:path";
import { ensureDir, getSettingsRoot } from "../runtimePaths";
import { readConfigFileOrDefault, writeConfigFileAtomic } from "../configFileStore";

const PREFS_FILE = "download-prefs.json";

type DownloadPrefs = { lastDir?: string; autoSaveEnabled?: boolean; autoSaveDir?: string };

function prefsPath(): string {
  return path.join(getSettingsRoot(), PREFS_FILE);
}

function readPrefs(): DownloadPrefs {
  const prefs = readConfigFileOrDefault<DownloadPrefs>(prefsPath(), () => ({}));
  return prefs && typeof prefs === "object" ? prefs : {};
}

/** merge 写：同一份 JSON 同时存 lastDir 与自动另存字段，改一处绝不覆盖另一处。best-effort。 */
function writePrefs(patch: DownloadPrefs): void {
  try {
    ensureDir(getSettingsRoot());
    writeConfigFileAtomic(prefsPath(), { ...readPrefs(), ...patch });
  } catch {
    /* 写失败只是下次回退默认，不影响本次操作 */
  }
}

export function getLastDownloadDir(): string {
  const dir = readPrefs().lastDir;
  return typeof dir === "string" ? dir : "";
}

export function rememberDownloadDir(dir: string): void {
  const trimmed = String(dir || "").trim();
  if (!trimmed) return;
  writePrefs({ lastDir: trimmed });
}

export type AutoSavePrefs = { enabled: boolean; dir: string };

/** 自动另存偏好：默认关、目录空。enabled 严格布尔（缺省/脏值 → false，绝不误开自动写盘）。 */
export function getAutoSavePrefs(): AutoSavePrefs {
  const prefs = readPrefs();
  return {
    enabled: prefs.autoSaveEnabled === true,
    dir: typeof prefs.autoSaveDir === "string" ? prefs.autoSaveDir : "",
  };
}

export function setAutoSavePrefs(next: AutoSavePrefs): void {
  writePrefs({ autoSaveEnabled: Boolean(next.enabled), autoSaveDir: String(next.dir || "").trim() });
}

/**
 * 选另存对话框 defaultPath 的目录：上次用过且**仍存在**的目录优先，否则系统下载夹。
 * 纯函数（目录存在性由调用方注入），单测钉死「上次目录没了不会把用户带进死路径」。
 */
export function pickDownloadDir(lastDir: string, downloadsDir: string, dirExists: (dir: string) => boolean): string {
  const candidate = String(lastDir || "").trim();
  return candidate && dirExists(candidate) ? candidate : downloadsDir;
}

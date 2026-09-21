import path from "node:path";
import { readConfigFileOrDefault, writeConfigFileAtomic } from "../configFileStore";
import { getSettingsRoot } from "./settingsRoot";

const PROJECT_LOCATION_FILE = "project-location.json";

export type ProjectLocationSettings = {
  projectsRoot: string | null;
};

function settingsPath(): string {
  return path.join(getSettingsRoot(), PROJECT_LOCATION_FILE);
}

export function isStableAbsolutePath(
  value: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== "win32") return path.posix.isAbsolute(value);
  if (!path.win32.isAbsolute(value)) return false;
  return (
    /^[A-Za-z]:[\\/]/.test(value) ||
    /^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(value) ||
    /^\\\\\?\\(?:[A-Za-z]:\\|UNC\\[^\\]+\\[^\\]+(?:\\|$))/.test(value)
  );
}

function normalizeAbsolutePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.trim() || !isStableAbsolutePath(value)) return null;
  return path.normalize(value);
}

export function readProjectLocationSettings(): ProjectLocationSettings {
  const stored = readConfigFileOrDefault<{ projectsRoot?: unknown } | null>(settingsPath(), () => null);
  return { projectsRoot: normalizeAbsolutePath(stored?.projectsRoot) };
}

export function writeProjectsRoot(projectsRoot: string | null): ProjectLocationSettings {
  const normalized = projectsRoot === null ? null : normalizeAbsolutePath(projectsRoot);
  if (projectsRoot !== null && !normalized) {
    throw new Error("Project location must be an absolute path");
  }
  const next = { projectsRoot: normalized };
  writeConfigFileAtomic(settingsPath(), next);
  return next;
}

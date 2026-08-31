// 运行时基础设施层 —— 路径 / 目录 / JSON 读取的共享地基（见
// docs/plan/2026-06-04-runtime-split-execution.md）。projects / assets / catalog /
// skills 等域都依赖这一层；先抽出来才能解开它们之间的循环依赖。
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { WorkspaceRepositoryDeps } from "./workspace/workspaceRepository";
import { readProjectLocationSettings } from "./settings/projectLocationSettings";
export { getSettingsRoot, SETTINGS_ROOT_ENV } from "./settings/settingsRoot";
import { getSettingsRoot } from "./settings/settingsRoot";

export const PROJECT_FILE = "project.json";
export const PROJECT_ROOT_ENV = "NOMI_PROJECTS_DIR";
export const CATALOG_FILE = "model-catalog.json";
export const SKILLS_ROOT_ENV = "NOMI_SKILLS_DIR";

export type ProjectLocationSource = "environment" | "custom" | "default";
export type ProjectLocationState = { path: string; source: ProjectLocationSource };

export function defaultProjectsFolderName(appName: string): string {
  const normalized = String(appName || "").trim();
  if (!normalized || normalized.toLowerCase() === "nomi") return "Nomi Projects";
  return `${normalized} Projects`;
}

export function getProjectLocationState(): ProjectLocationState {
  const configured = String(process.env[PROJECT_ROOT_ENV] || "").trim();
  if (configured) return { path: configured, source: "environment" };

  const customRoot = readProjectLocationSettings().projectsRoot;
  if (customRoot) return { path: customRoot, source: "custom" };

  const appName = typeof app.getName === "function" ? app.getName() : "Nomi";
  return { path: path.join(app.getPath("documents"), defaultProjectsFolderName(appName)), source: "default" };
}

export function getProjectsRoot(): string {
  return getProjectLocationState().path;
}

export function getWorkspaceRepositoryDeps(): WorkspaceRepositoryDeps {
  return {
    settingsRoot: getSettingsRoot(),
    defaultProjectsRoot: getProjectsRoot(),
  };
}

/**
 * 可写的用户 skills 目录（userData/skills）—— 导入/创建的 skill 落这里。
 * 安装目录是只读的，分享导入必须有一个可写根。排在 getSkillsRoots 末尾，故内置同名 skill
 * 优先（skillStore 去重 = 先出现的根胜），导入的包无法覆盖内置。
 */
export function getUserSkillsRoot(): string {
  return path.join(getSettingsRoot(), "skills");
}

export function getSkillsRoots(): string[] {
  const candidates = [
    String(process.env[SKILLS_ROOT_ENV] || "").trim(),
    path.join(process.cwd(), "skills"),
    path.join(app.getAppPath(), "skills"),
    path.join(__dirname, "../skills"),
    path.join(process.resourcesPath || "", "skills"),
    getUserSkillsRoot(),
  ].filter(Boolean);
  return Array.from(new Set(candidates.map((item) => path.resolve(item))));
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function readText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

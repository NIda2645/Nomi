import { ipcMain } from "electron";
import { assertTrustedUiSender } from "../../ipcSenderGuard";
import fs from "node:fs";
import path from "node:path";
import { writeJsonFileAtomic } from "../../jsonFile";
import { readProject } from "../../projects/repository";
import { workspaceNomiDir } from "../../workspace/workspacePaths";
import { issueWindowProject } from "../../assets/windowProjectCapture";
import { getOwnerWindowForSender } from "../overlay/browserViewOverlay";

const SETTINGS_FILE_NAME = "browser-prompt-extraction.json";

function browserPromptExtractionSettingsFile(projectId: string): string {
  const id = String(projectId || "").trim();
  if (!id) throw new Error("projectId is required");
  const project = readProject(id) as { lastKnownRootPath?: unknown } | null;
  const rootPath = typeof project?.lastKnownRootPath === "string" ? path.resolve(project.lastKnownRootPath) : "";
  if (!rootPath) throw new Error("Project folder is unavailable");
  const dir = workspaceNomiDir(rootPath);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, SETTINGS_FILE_NAME);
}

function normalizeSettingsPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("settings must be an object");
  }
  return value as Record<string, unknown>;
}

export function registerBrowserPromptExtractionSettingsIpc(): void {
  // 模板设置按项目存。项目只认发起窗口（浮层 = 父窗口）已提交的项目面，渲染层不报 projectId；
  // 没有打开项目时读 = 无设置（用默认），写 = 拒绝。
  ipcMain.handle("browser:prompt-extraction-settings:read", async (event) => {
    assertTrustedUiSender(event);
    const project = issueWindowProject(getOwnerWindowForSender(event.sender));
    if (!project) return { ok: true, settings: null };
    const filePath = browserPromptExtractionSettingsFile(project.binding.projectId);
    if (!fs.existsSync(filePath)) return { ok: true, settings: null };
    const raw = fs.readFileSync(filePath, "utf8");
    return { ok: true, settings: normalizeSettingsPayload(JSON.parse(raw)) };
  });

  ipcMain.handle("browser:prompt-extraction-settings:write", async (event, payload: { settings?: unknown }) => {
    assertTrustedUiSender(event);
    const project = issueWindowProject(getOwnerWindowForSender(event.sender));
    if (!project) throw Object.assign(new Error("project_identity_unavailable"), { code: "project_identity_unavailable" });
    const settings = normalizeSettingsPayload(payload?.settings);
    const filePath = browserPromptExtractionSettingsFile(project.binding.projectId);
    project.assertCurrent();
    writeJsonFileAtomic(filePath, settings);
    return { ok: true, settings };
  });
}

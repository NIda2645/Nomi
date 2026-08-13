// 素材域 IPC 注册器（2026-07-22 素材面收敛时从 main.ts 抽出,R9 巨壳门岗）：
// 文件夹读写 + 本地文件导入 + 素材下载 + 自动另存/设置（集中设置页「文件与保存」）。
import { dialog, ipcMain } from "electron";
import { getAutoSavePrefs, setAutoSavePrefs, type AutoSavePrefs } from "./downloadPrefs";

export function registerAssetsIpc(): void {
  ipcMain.handle("nomi:assets:folders-get", async (_event, payload) => {
    const { getAssetFolders } = await import("./assetFolders");
    return getAssetFolders(payload);
  });
  ipcMain.handle("nomi:assets:folders-save", async (_event, payload) => {
    const { saveAssetFolders } = await import("./assetFolders");
    return saveAssetFolders(payload);
  });
  ipcMain.handle("nomi:assets:import-file", async (_event, payload) => {
    const { importLocalFile } = await import("./localFileImport");
    const raw = (payload || {}) as Record<string, unknown>;
    // 字节通道不接受 renderer 自报路径；原生路径只能经 webUtils 桥进入下面的专用通道。
    return importLocalFile({ ...raw, sourcePath: undefined });
  });
  ipcMain.handle("nomi:assets:import-native-file", async (_event, payload) => {
    const { importLocalFile } = await import("./localFileImport");
    return importLocalFile(payload, { allowSourcePath: true });
  });
  ipcMain.handle("nomi:assets:ensure-playable", async (_event, payload) => {
    const { ensurePlayableAsset } = await import("./localFileImport");
    return ensurePlayableAsset(payload);
  });
  // 引导示例项目的预置成图 → 真项目资产（拿稳定 nomi-local URL；构建产物 URL 不配写进用户数据）。
  ipcMain.handle("nomi:assets:seed-onboarding-demo", async (_event, payload) => {
    const { seedOnboardingDemoAssets } = await import("../onboarding/demoAssetSeed");
    return seedOnboardingDemoAssets(payload);
  });
  ipcMain.handle("nomi:assets:download", async (_event, payload) => {
    const { downloadAssetToDisk } = await import("./downloadAsset");
    return downloadAssetToDisk(payload);
  });
  // 自动另存：生成完成时渲染层调这里，把生成物静默复制一份到用户目录（best-effort，关/失败不打断生成）。
  ipcMain.handle("nomi:assets:auto-save", async (_event, payload) => {
    const { autoSaveAssetToDisk } = await import("./autoSaveAsset");
    const p = (payload || {}) as { url?: unknown; suggestedName?: unknown };
    return autoSaveAssetToDisk(String(p.url || ""), String(p.suggestedName || ""));
  });
  // 集中设置页「文件与保存」：读/写自动另存开关+目录、选目录。
  ipcMain.handle("nomi:settings:auto-save-get", () => getAutoSavePrefs());
  ipcMain.handle("nomi:settings:auto-save-set", (_event, payload) => {
    const p = (payload || {}) as Partial<AutoSavePrefs>;
    setAutoSavePrefs({ enabled: Boolean(p.enabled), dir: String(p.dir || "") });
    return getAutoSavePrefs();
  });
  ipcMain.handle("nomi:settings:pick-dir", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
    return { dir: result.canceled || !result.filePaths[0] ? "" : result.filePaths[0] };
  });
}

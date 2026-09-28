import { app, BrowserWindow } from "electron";

import { createBackgroundIdleExit, setBackgroundIdleExitOwner, type BackgroundIdleExit } from "./backgroundIdleExit";
import { hasInFlightTasks } from "./tasks/taskCache";
import { listProjects } from "./projects/repository";
import { getProductionRunService } from "./productionRun/productionRunRuntime";

export const isBackgroundLaunch = process.env.NOMI_LAUNCH_BACKGROUND === "1";

let idleExit: BackgroundIdleExit | undefined;

export function backgroundWindowOptions(): { show: boolean; backgroundThrottling: boolean } {
  return { show: !isBackgroundLaunch, backgroundThrottling: !isBackgroundLaunch };
}

export function installBackgroundWindowBehavior(mainWindow: BrowserWindow): void {
  if (!isBackgroundLaunch) return;
  mainWindow.on("show", () => {
    idleExit?.markWindowShown();
    mainWindow.webContents.setBackgroundThrottling(true);
    if (process.platform === "darwin") app.dock?.show?.();
  });
  if (process.platform === "darwin") app.dock?.hide();
}

export function installBackgroundLifecycle(deps: {
  hasInFlightWork: () => boolean;
  quit: () => void;
}): void {
  if (!isBackgroundLaunch) return;
  idleExit = createBackgroundIdleExit(deps);
  setBackgroundIdleExitOwner(idleExit);
}

export function hasInFlightProductionWork(): boolean {
  try {
    const service = getProductionRunService();
    return hasInFlightTasks() || listProjects().some((project) => service.repository.list(project.id).some((run) =>
      ["ready", "running", "exporting", "pausing"].includes(String(run.status)),
    ));
  } catch {
    return true;
  }
}

export function touchBackgroundActivity(): void {
  idleExit?.touch();
}

export function disposeBackgroundLifecycle(): void {
  setBackgroundIdleExitOwner(null);
  idleExit?.dispose();
  idleExit = undefined;
}

import { installCrashHandlers } from "./crashLog";
import { installParentProcessWatchdog } from "./parentProcessWatchdog";
import { installProcessStdioErrorGuards } from "./processStdio";

type ElectronAppLifecycle = {
  readonly isPackaged: boolean;
  exit: (code?: number) => void;
  once: (event: "before-quit", listener: () => void) => unknown;
};

type MainProcessLifecycleDependencies = {
  env?: NodeJS.ProcessEnv;
  installCrashHandlers?: typeof installCrashHandlers;
  installParentProcessWatchdog?: typeof installParentProcessWatchdog;
  installProcessStdioErrorGuards?: typeof installProcessStdioErrorGuards;
};

function readLauncherPid(env: NodeJS.ProcessEnv): number | undefined {
  const launcherPid = Number(env.NOMI_LAUNCHER_PID);
  return Number.isInteger(launcherPid) && launcherPid > 1 ? launcherPid : undefined;
}

export function installMainProcessLifecycle(
  app: ElectronAppLifecycle,
  dependencies: MainProcessLifecycleDependencies = {},
): void {
  const crashHandlerInstaller = dependencies.installCrashHandlers ?? installCrashHandlers;
  const watchdogInstaller =
    dependencies.installParentProcessWatchdog ?? installParentProcessWatchdog;
  const stdioGuardInstaller =
    dependencies.installProcessStdioErrorGuards ?? installProcessStdioErrorGuards;
  stdioGuardInstaller();
  crashHandlerInstaller();
  const stopParentProcessWatchdog = watchdogInstaller({
    // 正装由操作系统管理；只有开发/测试实例应跟随临时启动器退出。
    enabled: !app.isPackaged,
    // 启动器可能在 Electron 完成模块加载前已被强杀；此时 process.ppid 已经变成 1。
    // 显式传入 spawn 时的 PID，才能封住这段启动竞态。
    parentPid: readLauncherPid(dependencies.env ?? process.env),
    exit: (code) => app.exit(code),
  });
  app.once("before-quit", stopParentProcessWatchdog);
}

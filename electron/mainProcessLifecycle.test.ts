import { describe, expect, it, vi } from "vitest";
import { installMainProcessLifecycle } from "./mainProcessLifecycle";

function createApp(isPackaged: boolean) {
  let beforeQuit: (() => void) | undefined;
  const app = {
    isPackaged,
    exit: vi.fn(),
    once: vi.fn((event: "before-quit", listener: () => void) => {
      if (event === "before-quit") beforeQuit = listener;
      return app;
    }),
  };
  return { app, beforeQuit: () => beforeQuit?.() };
}

describe("installMainProcessLifecycle", () => {
  it("使用启动器显式传入的 PID，覆盖安装前已经被重新托管的竞态", () => {
    const { app, beforeQuit } = createApp(false);
    const stop = vi.fn();
    const installCrashHandlers = vi.fn();
    const installProcessStdioErrorGuards = vi.fn();
    const installParentProcessWatchdog = vi.fn(() => stop);

    installMainProcessLifecycle(app, {
      env: { NOMI_LAUNCHER_PID: "42" },
      installCrashHandlers,
      installProcessStdioErrorGuards,
      installParentProcessWatchdog,
    });

    expect(installProcessStdioErrorGuards).toHaveBeenCalledOnce();
    expect(installCrashHandlers).toHaveBeenCalledOnce();
    expect(installProcessStdioErrorGuards.mock.invocationCallOrder[0]).toBeLessThan(
      installCrashHandlers.mock.invocationCallOrder[0],
    );
    expect(installParentProcessWatchdog).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      parentPid: 42,
    }));

    beforeQuit();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("装齐三层崩溃证据：JS 异常 / 原生 minidump / 进程死亡，且 Crashpad 挂在 app 上", () => {
    const { app } = createApp(true);
    const installProcessGoneHandlers = vi.fn();
    const startNativeCrashCapture = vi.fn();

    installMainProcessLifecycle(app, {
      installCrashHandlers: vi.fn(),
      installProcessStdioErrorGuards: vi.fn(),
      installParentProcessWatchdog: vi.fn(() => vi.fn()),
      installProcessGoneHandlers,
      startNativeCrashCapture,
    });

    expect(startNativeCrashCapture).toHaveBeenCalledOnce();
    // 进程死亡要挂在 app 上（辅助窗口的渲染进程挂单个 webContents 会漏）——由 crashLog 自绑 app。
    expect(installProcessGoneHandlers).toHaveBeenCalledOnce();
  });

  it("打包实例不启用开发父进程守卫", () => {
    const { app } = createApp(true);
    const installParentProcessWatchdog = vi.fn(() => vi.fn());
    const installProcessStdioErrorGuards = vi.fn();

    installMainProcessLifecycle(app, {
      env: { NOMI_LAUNCHER_PID: "42" },
      installCrashHandlers: vi.fn(),
      installProcessStdioErrorGuards,
      installParentProcessWatchdog,
    });

    expect(installProcessStdioErrorGuards).toHaveBeenCalledOnce();
    expect(installParentProcessWatchdog).toHaveBeenCalledWith(expect.objectContaining({
      enabled: false,
      parentPid: 42,
    }));
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  installCrashHandlers,
  installProcessGoneHandlers,
  startNativeCrashCapture,
} from "./crashLog";

describe("installCrashHandlers", () => {
  it("只监控未捕获异常，不接管 Node 的默认退出", () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const target = {
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, listener);
        return target;
      }),
    };
    const record = vi.fn();

    installCrashHandlers(target, record);

    expect([...listeners.keys()]).toEqual(["uncaughtExceptionMonitor"]);
    expect(listeners.has("uncaughtException")).toBe(false);
    expect(listeners.has("unhandledRejection")).toBe(false);
  });

  it("monitor 路径只同步落盘一次，不再写回坏掉的终端", () => {
    let monitor: ((error: Error, origin: string) => void) | undefined;
    const target = {
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        if (event === "uncaughtExceptionMonitor") {
          monitor = listener as (error: Error, origin: string) => void;
        }
        return target;
      }),
    };
    const record = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("write EIO"), { code: "EIO" });

    installCrashHandlers(target, record);
    monitor?.(error, "uncaughtException");

    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith("uncaughtException", error);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("installProcessGoneHandlers", () => {
  function createTarget() {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const target = {
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, listener);
        return target;
      }),
    };
    return { target, listeners };
  }

  it("渲染进程死亡落盘：带上 reason/exitCode，否则日志等于没有", () => {
    const { target, listeners } = createTarget();
    const record = vi.fn();

    installProcessGoneHandlers(target, record);
    listeners.get("render-process-gone")?.({}, {}, { reason: "crashed", exitCode: 5 });

    expect(record).toHaveBeenCalledWith("render-process-gone", "reason=crashed exitCode=5");
  });

  it("子进程死亡落盘：GPU/utility 也要留证（辅助窗口的进程一样会死）", () => {
    const { target, listeners } = createTarget();
    const record = vi.fn();

    installProcessGoneHandlers(target, record);
    listeners.get("child-process-gone")?.({}, { type: "GPU", reason: "crashed", exitCode: 133 });

    expect(record).toHaveBeenCalledWith("child-process-gone", "type=GPU name=- reason=crashed exitCode=133");
  });

  it("装在 app 上而不是单个窗口上：两个事件都要挂", () => {
    const { target, listeners } = createTarget();
    installProcessGoneHandlers(target, vi.fn());
    expect([...listeners.keys()].sort()).toEqual(["child-process-gone", "render-process-gone"]);
  });
});

describe("startNativeCrashCapture", () => {
  it("开 Crashpad 且不外传（原生崩溃只有 minidump 能指认模块）", () => {
    const reporter = { start: vi.fn() };
    startNativeCrashCapture(reporter);
    expect(reporter.start).toHaveBeenCalledWith({ uploadToServer: false });
  });

  it("采集器起不来也不能拖垮启动", () => {
    const reporter = { start: vi.fn(() => { throw new Error("no crashpad"); }) };
    expect(() => startNativeCrashCapture(reporter)).not.toThrow();
  });
});

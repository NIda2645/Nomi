// 生产崩溃落盘（多维审计 P0-8）：主进程未捕获异常与
// 渲染层崩溃统一落到 app logs 目录，省得用户报"打不开"时无任何日志可查（盲修）。
//
// 三层证据，缺一层就有整类崩溃是「黑的」（2026-08-12 Windows 改保存名闪退时我们手上零信息）：
//   ① JS 异常 → uncaughtExceptionMonitor（installCrashHandlers）；
//   ② 子进程/渲染进程死亡 → render-process-gone / child-process-gone（installProcessGoneHandlers）；
//   ③ 原生层崩溃（第三方 DLL、原生对话框线程）→ Crashpad minidump（startNativeCrashCapture）+
//      面包屑（logBreadcrumb）。原生 access violation 不是 JS 异常，①②都拦不到、进程直接消失，
//      唯一线索是「日志最后一行停在哪」和 minidump 里的模块名。
import { app, crashReporter } from "electron";
import fs from "node:fs";
import path from "node:path";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB 简单滚动

let sessionStamped = false;

function logFilePath(): string {
  const dir = app.getPath("logs"); // macOS: ~/Library/Logs/<app>
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "nomi-crash.log");
}

/** 每段日志自带「哪个构建、哪个平台」——否则拿到用户回报也对不上版本，等于没有证据。 */
function sessionLine(): string {
  let version = "unknown";
  try {
    version = app.getVersion();
  } catch {
    /* app 未就绪时不阻断落盘 */
  }
  const electronVersion = process.versions.electron ?? "?";
  return `--- session nomi=${version} electron=${electronVersion} ${process.platform}-${process.arch} pid=${process.pid}`;
}

function append(line: string): void {
  try {
    const file = logFilePath();
    let rotated = false;
    try {
      if (fs.statSync(file).size > MAX_BYTES) {
        fs.writeFileSync(file, "");
        rotated = true; // 滚动会把表头冲掉，补写一行，别让后半段日志无版本可归属
      }
    } catch {
      /* 文件不存在，忽略 */
    }
    if (rotated || !sessionStamped) {
      sessionStamped = true;
      fs.appendFileSync(file, `[${new Date().toISOString()}] ${sessionLine()}\n`);
    }
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    /* 落盘失败不应再抛，避免崩溃处理本身崩溃 */
  }
}

function recordCrash(scope: string, error: unknown): void {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ""}` : String(error);
  append(`[${scope}] ${message}`);
}

export function logCrash(scope: string, error: unknown): void {
  recordCrash(scope, error);
  console.error(`[nomi:${scope}]`, error);
}

/**
 * 面包屑：进入/离开「可能把整个进程带走」的原生调用时各记一笔。
 *
 * 为什么必须有：原生崩溃（access violation）不走 JS，try/catch 和 uncaughtExceptionMonitor 都拦不到，
 * 进程直接消失——事后唯一能指认崩点的证据就是「日志最后一行停在哪」。必须同步落盘
 * （append 用 appendFileSync），异步写在进程被带走的那一刻会丢。
 */
export function logBreadcrumb(scope: string, detail: string): void {
  append(`[${scope}] ${detail}`);
}

export type ProcessGoneTarget = {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
};

type GoneDetails = {
  reason?: string;
  exitCode?: number;
  type?: string;
  name?: string;
  serviceName?: string;
};

/**
 * 渲染进程/子进程（GPU、utility、network service…）死亡落盘。
 *
 * 装在 app 上而不是某个 webContents 上：辅助窗口（浏览器菜单/叠加窗）的渲染进程一样会死，
 * 挂单个窗口会漏掉它们。这两个事件不代表主进程还活着——但只要它们先落了盘，
 * 「app 整个没了」就能区分是渲染层先死还是主进程原生崩溃。
 */
export function installProcessGoneHandlers(
  // 默认就是 Electron 的 app。这里必须 cast：Electron 把 app.on 声明成上百条按事件名字面量重载，
  // 结构类型表达不出来（写成 (event: string, …) 会反过来不被 App 满足）。单测注入自己的假 target。
  target: ProcessGoneTarget = app as unknown as ProcessGoneTarget,
  // 默认走 logCrash（落盘 + console）：这里主进程本身是健康的，不像 uncaughtExceptionMonitor
  // 那样要防"stderr 已经坏了"，开发时直接在终端看到进程死因更省事。
  record: CrashRecorder = logCrash,
): void {
  target.on("render-process-gone", (...args: unknown[]) => {
    const details = (args[2] ?? {}) as GoneDetails;
    record("render-process-gone", `reason=${details.reason ?? "?"} exitCode=${details.exitCode ?? "?"}`);
  });
  target.on("child-process-gone", (...args: unknown[]) => {
    const details = (args[1] ?? {}) as GoneDetails;
    const name = details.serviceName || details.name || "-";
    record(
      "child-process-gone",
      `type=${details.type ?? "?"} name=${name} reason=${details.reason ?? "?"} exitCode=${details.exitCode ?? "?"}`,
    );
  });
}

export type NativeCrashReporter = { start(options: { uploadToServer: boolean }): void };

/**
 * 开 Crashpad：原生层崩溃（第三方输入法 DLL、GPU、原生对话框线程）只有 minidump 能留下
 * 「崩在哪个模块」。本地留证不外传（uploadToServer:false），dump 落 app.getPath("crashDumps")。
 * 必须在 app ready 之前调用，否则装不上。
 */
export function startNativeCrashCapture(reporter: NativeCrashReporter = crashReporter): void {
  try {
    reporter.start({ uploadToServer: false });
  } catch {
    /* 崩溃采集起不来也不能拖垮启动 */
  }
}

export type CrashMonitorTarget = {
  on(
    event: "uncaughtExceptionMonitor",
    listener: (error: Error, origin: string) => void,
  ): unknown;
};

export type CrashRecorder = (scope: string, error: unknown) => void;

export function installCrashHandlers(
  target: CrashMonitorTarget = process,
  record: CrashRecorder = recordCrash,
): void {
  // 只观察、不接管：Node 会在 monitor 之后保持默认的非零退出。
  // 这里绝不能 console.*；stderr/stdout 本身损坏（EIO/EPIPE）正是常见崩溃源，
  // 再写一次会让崩溃处理器递归触发。
  target.on("uncaughtExceptionMonitor", (error, origin) => record(origin, error));
}

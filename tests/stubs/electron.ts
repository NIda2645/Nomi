// Vitest 专用的 Electron 运行时桩（stub）。
//
// 单测跑在 `environment: "node"`，而真·electron 模块在被 import 时会执行
// `node_modules/electron/index.js`：若平台二进制不可解析（如 CI 全新环境里
// path.txt 缺失），它会**在 import 那一刻**抛
// "Electron failed to install correctly"。源码（如 runtimePaths.ts）在模块顶层
// `import { app } from "electron"`，于是任何传递依赖到它的单测都会在加载期崩。
//
// 这里把 electron 整个 alias 成无副作用的桩：单测本就不该、也无法使用真 electron
// 运行时；真正需要 electron 行为的测试各自注入自己的假实现。桩只需"存在且不抛"。
// 真实 app 构建走 vite.config.ts，不受此 alias 影响。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const globalScope = globalThis as { __nomiElectronStubRoot?: string };

// 真 Electron 的 getPath() 永远返回绝对路径。测试桩按 worker 进程提供独立临时根，
// 并在首次使用时清掉同 pid 的旧内容。缓存必须挂在 globalThis：Vitest 的模块隔离会
// 重新求值本文件，模块级缓存会在同一轮测试中反复清目录，破坏别的测试刚写入的数据。
function runtimeRoot(): string {
  const existing = globalScope.__nomiElectronStubRoot;
  if (existing) return existing;
  const root = path.join(os.tmpdir(), `nomi-vitest-${process.pid}`);
  fs.rmSync(root, { recursive: true, force: true });
  globalScope.__nomiElectronStubRoot = root;
  return root;
}

const noop = (): undefined => undefined;

export const app = {
  // 真 Electron 的各 name（userData / temp / documents / downloads…）是不同目录，
  // 这里同样分开，免得「项目默认目录」之类的东西被塞进 userData 里。
  getPath: (name = "userData"): string => path.join(runtimeRoot(), name),
  // 开发态下 getAppPath() 就是仓库根（既有各测试的自备 mock 也都这么写）。
  getAppPath: (): string => process.cwd(),
  getName: (): string => "Nomi",
  getVersion: (): string => "0.0.0-test",
  on: noop,
  whenReady: (): Promise<void> => Promise.resolve(),
  quit: noop,
};

export const ipcMain = { handle: noop, on: noop, removeHandler: noop };

export const ipcRenderer = {
  invoke: (): Promise<unknown> => Promise.resolve(undefined),
  on: noop,
  send: noop,
};

export const contextBridge = { exposeInMainWorld: noop };

export class BrowserWindow {
  static getAllWindows(): BrowserWindow[] {
    return [];
  }
}

export const dialog = {
  showOpenDialog: (): Promise<{ canceled: boolean; filePaths: string[] }> =>
    Promise.resolve({ canceled: true, filePaths: [] }),
  showSaveDialog: (): Promise<{ canceled: boolean; filePath?: string }> =>
    Promise.resolve({ canceled: true }),
};

export const crashReporter = { start: noop };

export const shell = {
  openExternal: (): Promise<void> => Promise.resolve(),
  openPath: (): Promise<string> => Promise.resolve(""),
};

export const safeStorage = {
  isEncryptionAvailable: (): boolean => false,
  encryptString: (s: string): Buffer => Buffer.from(s, "utf-8"),
  decryptString: (b: Buffer): string => b.toString("utf-8"),
};

export const net = { request: noop };

export const session = { defaultSession: undefined };

export const protocol = { handle: noop, registerSchemesAsPrivileged: noop };

export const webContents = { getAllWebContents: (): unknown[] => [] };

export default {
  app,
  ipcMain,
  ipcRenderer,
  contextBridge,
  BrowserWindow,
  dialog,
  crashReporter,
  shell,
  safeStorage,
  net,
  session,
  protocol,
  webContents,
};

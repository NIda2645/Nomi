// 代理偏好持久化（应用内代理设置 · 见 docs/plan/2026-08-01-in-app-proxy-setting.md）。
//
// 群反馈 07-24：「电脑里有的软件不能走全局系统代理，一般是给需要的软件设置代理端口」——
// 用户要的是**只对 Nomi 生效**的代理，而不是被迫改系统全局设置。
//
// 沿用 downloadPrefs 的小文件模式（settings root 下一个 json，best-effort），不另造存储层。
// 这里只管「用户选了什么」；「实际生效的是什么」由 systemProxy 探测后决定（两者可能不同：
// 选了跟随系统但系统压根没代理 / 选了自定义但地址填错）。
import path from "node:path";
import { readConfigFileOrDefault, writeConfigFileAtomic } from "./configFileStore";
import { ensureDir, getSettingsRoot } from "./runtimePaths";

const PREFS_FILE = "proxy-prefs.json";

/**
 * - `system`：跟随系统/环境变量探测（默认，= 本设置上线前的唯一行为）。
 * - `custom` ：用用户填的地址，只对 Nomi 生效。
 * - `off`    ：强制直连，即便系统开着代理。国内厂商走代理反而更慢/被拒时用得上。
 */
export type ProxyMode = "system" | "custom" | "off";

export type ProxyPrefs = {
  mode: ProxyMode;
  /** 仅 mode=custom 时有意义；其余模式保留用户上次填的值，切回来不用重打。 */
  customUrl: string;
};

export const DEFAULT_PROXY_PREFS: ProxyPrefs = { mode: "system", customUrl: "" };

const MODES: readonly ProxyMode[] = ["system", "custom", "off"];

/**
 * 把任意读到的值归一成合法 ProxyPrefs。纯函数，直测。
 * 非法 mode / 缺字段 / 手改坏了的文件都退回默认——代理配置读坏了绝不能拖垮启动。
 */
export function normalizeProxyPrefs(value: unknown): ProxyPrefs {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const mode = MODES.includes(raw.mode as ProxyMode) ? (raw.mode as ProxyMode) : DEFAULT_PROXY_PREFS.mode;
  const customUrl = typeof raw.customUrl === "string" ? raw.customUrl.trim() : "";
  // 选了 custom 却没填地址 = 没配完，按跟随系统跑（别把用户静默扔进直连）。
  if (mode === "custom" && !customUrl) return { mode: "system", customUrl: "" };
  return { mode, customUrl };
}

function prefsPath(): string {
  return path.join(getSettingsRoot(), PREFS_FILE);
}

export function readProxyPrefs(): ProxyPrefs {
  return normalizeProxyPrefs(readConfigFileOrDefault<unknown>(prefsPath(), () => DEFAULT_PROXY_PREFS));
}

export function writeProxyPrefs(prefs: ProxyPrefs): ProxyPrefs {
  const normalized = normalizeProxyPrefs(prefs);
  try {
    ensureDir(getSettingsRoot());
    writeConfigFileAtomic(prefsPath(), normalized);
  } catch {
    /* best-effort：写失败只是下次启动回退默认，不影响本次已生效的 dispatcher */
  }
  return normalized;
}

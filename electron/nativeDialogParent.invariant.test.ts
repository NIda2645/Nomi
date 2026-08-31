// 结构不变量：原生对话框一律不许传父窗口（整类崩溃的闸，不是单点修复）。
//
// 为什么是全仓扫描而不是给某个调用点写用例：2026-07-30 那次只修了 downloadAsset 一个调用点的
// 「传哪个窗口」，跨线程持有属主这件事本身没去掉，同类崩溃 2026-08-12 又回来了（Windows 上用
// 搜狗输入法改保存名 → 整个 app 闪退）。根因是 Electron 把原生对话框跑在专用 COM STA 线程上，
// 而父窗口 HWND 属于主 UI 线程 → 跨线程模态属主 → 两线程输入队列绑定 → 第三方输入法 DLL 在
// TranslateMessage/PeekMessage 里重入 Imm*（微软记录在案的 IME 崩溃）。
//
// 所以规则要钉在「任何调用点」上：dialog.showSaveDialog / showOpenDialog / showMessageBox
// 只能收一个参数（options）。两参数形态 = (window, options) = 跨线程属主 = 这条测试必须红。
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ELECTRON_DIR = path.dirname(fileURLToPath(import.meta.url));
const PARENTABLE_DIALOGS = ["showSaveDialog", "showOpenDialog", "showMessageBox"] as const;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    // 只管生产代码：测试文件里有伪实现/断言，不代表真实调用形态。
    if (!entry.name.endsWith(".ts") || entry.name.includes(".test.")) return [];
    return [full];
  });
}

/** 从 `(` 后开始按括号深度数顶层逗号，得出实参个数（0 = 空参）。 */
function countArguments(source: string, openParenIndex: number): number {
  let depth = 0;
  let topLevelCommas = 0;
  let sawContent = false;
  for (let i = openParenIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      if (depth === 0) return sawContent ? topLevelCommas + 1 : 0;
    } else if (ch === "," && depth === 1) topLevelCommas += 1;
    else if (depth === 1 && !/\s/.test(ch)) sawContent = true;
  }
  return sawContent ? topLevelCommas + 1 : 0;
}

describe("原生对话框不许有父窗口（跨线程模态属主 = 输入法闪退根因）", () => {
  const files = sourceFiles(ELECTRON_DIR);

  it("扫到了 electron 主进程源码（防扫描器本身空转，测试假绿）", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(PARENTABLE_DIALOGS)("dialog.%s 全仓只允许单参数（options）形态", (method) => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf-8");
      const needle = `dialog.${method}(`;
      for (let idx = source.indexOf(needle); idx !== -1; idx = source.indexOf(needle, idx + 1)) {
        const openParen = idx + needle.length - 1;
        if (countArguments(source, openParen) <= 1) continue;
        const line = source.slice(0, idx).split("\n").length;
        offenders.push(`${path.relative(ELECTRON_DIR, file)}:${line}`);
      }
    }
    expect(
      offenders,
      `这些调用点给原生对话框传了父窗口，会在 Windows 上跨线程持有属主，遇到第三方输入法（搜狗）整个 app 闪退。` +
        `改成只传 options：dialog.${method}(options)。详见 electron/assets/downloadAsset.ts 的根因注释。`,
    ).toEqual([]);
  });
});

/**
 * 「渲染层能调到的 preload 桥面」到底住在哪几个文件里 —— 唯一那份清单。
 *
 * 2026-09-17 把 preload 巨壳按领域拆成 electron/preload.ts（组装层）+ electron/preload/*.ts 之后，
 * 任何按**源码文本**判断桥面的检查（结构测试、门岗）只读组装层都会扫出 0 条，然后静默变绿。
 * 那种假绿和真绿长得一模一样（教训 dead-selector-lies-both-ways），所以清单收成一处、
 * 并且每个读者都要自己带一条「扫到 0 条就红」的判据。
 */
import fs from "node:fs";
import path from "node:path";

/** 相对仓库根的路径清单：组装层 + 各族桥面（本文件自己不算桥面）。 */
export function preloadSurfaceFiles(repoRoot = process.cwd()): string[] {
  const dir = path.join(repoRoot, "electron", "preload");
  const modules = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".ts") && name !== "preloadSurfaceSources.ts")
    .sort()
    .map((name) => `electron/preload/${name}`);
  return ["electron/preload.ts", ...modules];
}

/** 全部桥面源码拼成一份文本，供「这条线接上了没有」这类结构断言直接搜。 */
export function preloadSurfaceSource(repoRoot = process.cwd()): string {
  return preloadSurfaceFiles(repoRoot)
    .map((relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8"))
    .join("\n");
}

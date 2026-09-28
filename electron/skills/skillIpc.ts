// 渲染层要的 skill 列表 DTO（主进程组装）。按「路 A」：这里只把 manifest 原样给渲染层，
// 能力比对（缺哪个 provider）放渲染层用 getCatalogHealth 做，catalog 一变实时刷新、不耦合。
import { skillPreviewUrl } from "./skillPreview";
import type { SkillCuration } from "../shared/skillCuration";
import { deriveSkillNeeds } from "./skillCapability";
import { ipcMain } from "electron";
import { assertTrustedSender } from "../ipcSenderGuard";
import type { SkillProviderKind } from "./skillManifestSchema";
import { isSkillSelectableInWorkbench, readSkillRecords, type SkillRecord } from "./skillStore";
import {
  importSkillPackageToUserDir,
  exportSkillPackageByName,
  deleteUserSkill,
} from "./skillPackage";

export type SkillImportOutcome =
  | {
      ok: true;
      dirName: string;
      skillName: string;
      /**
       * Provider modalities the freshly saved Skill declares.  The creation panel
       * uses it to say "this one needs video, go connect one" the moment the save
       * lands.  It is derived here, from the package that actually hit disk —
       * before the format converged the renderer read it off the `author_skill`
       * tool arguments, which made the tool call a second owner of the same fact.
       */
      neededProviders: SkillProviderKind[];
    }
  | { ok: false; error: string };

function importSkillAndDeriveNeeds(raw: unknown): SkillImportOutcome {
  const result = importSkillPackageToUserDir(raw);
  if (!result.ok) return result;
  const needs = result.manifest ? deriveSkillNeeds(result.manifest) : null;
  return { ok: true, dirName: result.dirName, skillName: result.skillName, neededProviders: needs?.providers ?? [] };
}

export type SkillListItem = {
  cover?: string;
  preview?: { url: string; type: "image" | "video" };
  curation?: SkillCuration;
  body?: string;
  directoryName: string;
  name: string;
  /** 人话显示名（manifest.label，缺则回退 name）。 */
  label: string;
  description: string | null;
  author: string | null;
  /** 多段 playbook 的阶段标签（卡片/阶段条展示用；单段 skill 为空）。 */
  stageLabels: string[];
  /** 这个 skill 是不是多段 playbook（有 stages）。 */
  isPlaybook: boolean;
  /**
   * 端到端需要的 provider 模态（deriveSkillNeeds 权威算出 = requiredProviders ∪ stages.modelPrefs.kind）。
   * 渲染层只对它做「减去当前可用」的平凡差集得出缺口——能力派生逻辑只在 electron 一处（不违 P1）。
   */
  neededProviders: SkillProviderKind[];
  /** manifest 解析失败的人话原因（加载期诊断）；正常为 null。 */
  manifestError: string | null;
  /** 来源：'user'=可写用户目录（可删/可导出）；'builtin'=安装随附（只读、禁删）。 */
  origin: "builtin" | "user";
  packageVersion: string;
  contentHash: string;
};

/** 目录记录 → 渲染层 DTO（纯投影）。 */
export function projectSkillsForRenderer(records: readonly SkillRecord[]): SkillListItem[] {
  return records
    // The canonical record policy owns picker visibility. Do not recreate a
    // stages-only heuristic here: single-stage built-ins may explicitly opt in.
    .filter(isSkillSelectableInWorkbench)
    .map((r) => {
    const needs = r.manifest ? deriveSkillNeeds(r.manifest) : null;
    return {
      cover: r.curation?.preview?.type === "image" ? skillPreviewUrl(r) : undefined,
      preview: skillPreviewUrl(r) ? { url: skillPreviewUrl(r), type: r.curation!.preview!.type } : undefined,
      curation: r.curation,
      body: r.body,
      directoryName: r.directoryName,
      name: r.name,
      label: r.manifest?.label || r.name,
      // description 只有一个 owner：SKILL.md frontmatter 的必填字段（pi 的加载器读好的）。
      // 2026-08-27 真机走查抓出过这里的旧形状：那时只取 manifest → 没有 skill.json 的技能
      // 一律显示「暂无说明」，哪怕 frontmatter 里写着标准的 description。清单退场后
      // 「两处取值」这个形状本身没了，回归也就不可能再来一次。
      description: r.description || null,
      author: r.manifest?.author ?? null,
      stageLabels: (r.manifest?.stages ?? []).map((s) => s.goal),
      isPlaybook: (r.manifest?.stages ?? []).length > 0,
      neededProviders: needs?.providers ?? [],
      manifestError: r.manifestError ?? null,
      origin: r.origin,
      packageVersion: r.packageVersion,
      contentHash: r.contentHash,
    };
  });
}

/** 每次都重扫盘（目录没有快照）：技能盘刚变，下一次 list 就是新的。 */
export async function listSkillsForRenderer(): Promise<SkillListItem[]> {
  return projectSkillsForRenderer(await readSkillRecords());
}

type RegisterSyncIpc = (channel: string, handler: (...args: unknown[]) => unknown) => void;

/**
 * Register the renderer-facing skill list boundary used by the ref Host wiring.
 *
 * 协议按通道分两种，且**每条通道两侧必须同一种**（`check:skill-ipc-coverage` 门岗）：
 *   · `nomi:skill:list` 走 `ipcMain.handle` / `ipcRenderer.invoke`——目录由 pi 的加载器给，它是 async 的；
 *   · 三条写通道（import / export / delete）仍走 `registerSyncIpc` / `invokeSync`——它们不碰目录，
 *     渲染层拿到 `{ok, ...}` 对象而非 Promise，`res.ok` 检查有意义（2026-09-03 合同不变量 ③）。
 */
export function registerSkillIpc(registerSyncIpc: RegisterSyncIpc): void {
  ipcMain.handle("nomi:skill:list", async (event) => {
    assertTrustedSender(event);
    return listSkillsForRenderer();
  });
  // 三个写操作 handler —— 渲染层用 invokeSync 调，返回值结构与 skillPackage.ts 里的函数一致。
  // 2026-09-03: PR #279 合入了渲染层解析逻辑和主进程落地函数，但忘了在这里注册，
  // 导致渲染层一直收到 "No handler registered" 且 UI 静默（P0 回归）。
  registerSyncIpc("nomi:skill:import", (raw: unknown) => importSkillAndDeriveNeeds(raw));
  // 导出要先拿目录（async），而这条通道是同步的：渲染层已经拿着列表（含 directoryName / filePath / packageDir
  // 都在主进程），所以这里现扫一次盘的代价用 `handle` 付——写通道里只有它读目录，故它也走 handle。
  ipcMain.handle("nomi:skill:export", async (event, dirName: unknown) => {
    assertTrustedSender(event);
    return exportSkillPackageByName(String(dirName ?? ""), Date.now(), await readSkillRecords());
  });
  registerSyncIpc("nomi:skill:delete", (dirName: unknown) =>
    deleteUserSkill(String(dirName ?? "")),
  );
}

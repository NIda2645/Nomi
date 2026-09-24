import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { localAssetUrl } from "../assets/assetPaths";
import { workspaceNomiDir, workspaceProjectBackupFile, workspaceProjectFile } from "./workspacePaths";
import { inspectWorkspaceSync, quarantineWorkspaceConflict, readWorkspaceSyncState, writeWorkspaceSyncState } from "./workspaceSync";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-sync-"));
  roots.push(root);
  fs.mkdirSync(workspaceNomiDir(root), { recursive: true });
  return root;
}

function writeManifest(root: string, payload: unknown): void {
  fs.writeFileSync(workspaceProjectFile(root), JSON.stringify({ id: "project-1", version: 2, revision: 2, payload }), "utf8");
}

describe("workspace sync inspection", () => {
  it("reports a missing manifest as corrupt-manifest", () => {
    const root = makeRoot();
    expect(inspectWorkspaceSync(root, "project-1").status).toBe("corrupt-manifest");
  });

  it("counts local assets and reports missing references", () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, "assets", "imported"), { recursive: true });
    fs.writeFileSync(path.join(root, "assets", "imported", "ok.png"), "image", "utf8");
    writeManifest(root, { image: localAssetUrl("project-1", "assets/imported/ok.png"), video: localAssetUrl("project-1", "assets/imported/missing.mp4") });
    const report = inspectWorkspaceSync(root, "project-1");
    expect(report.referencedAssetCount).toBe(2);
    expect(report.missingAssetCount).toBe(1);
    expect(report.status).toBe("missing-assets");
  });

  it("does not count another project's assets as missing from this folder", () => {
    // 从「全部素材」拖进来的素材 URL 编的是源项目 id，文件住在源项目文件夹——不归本文件夹同步。
    const root = makeRoot();
    fs.mkdirSync(path.join(root, "assets", "imported"), { recursive: true });
    fs.writeFileSync(path.join(root, "assets", "imported", "own.png"), "image", "utf8");
    writeManifest(root, {
      own: localAssetUrl("project-1", "assets/imported/own.png"),
      borrowed: localAssetUrl("project-other", "assets/generated/hero shot.png"),
    });
    const report = inspectWorkspaceSync(root, "project-1");
    expect(report.referencedAssetCount).toBe(1);
    expect(report.missingAssetCount).toBe(0);
    expect(report.status).toBe("ready");
  });

  it("decodes encoded path segments the same way the protocol does", () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, "assets", "imported"), { recursive: true });
    fs.writeFileSync(path.join(root, "assets", "imported", "雨夜 1.png"), "image", "utf8");
    writeManifest(root, { image: localAssetUrl("project-1", "assets/imported/雨夜 1.png") });
    expect(inspectWorkspaceSync(root, "project-1").status).toBe("ready");
  });

  it("detects an external revision or content change", () => {
    const root = makeRoot();
    writeManifest(root, { title: "A" });
    const first = inspectWorkspaceSync(root, "project-1");
    writeManifest(root, { title: "B" });
    expect(inspectWorkspaceSync(root, "project-1", { revision: first.observedRevision ?? 0, contentHash: first.contentHash ?? "" }).status).toBe("external-change");
  });
});

describe("workspace sync state", () => {
  it("round-trips the versioned state", () => {
    const root = makeRoot();
    const state = { schemaVersion: 1 as const, workspaceId: "project-1", revision: 3, contentHash: "abc", writerId: "device-a", writtenAt: "2026-09-02T00:00:00.000Z" };
    writeWorkspaceSyncState(root, state);
    expect(readWorkspaceSyncState(root)).toEqual(state);
  });

  it("quarantines a conflict without replacing the main manifest", () => {
    const root = makeRoot();
    writeManifest(root, { title: "A" });
    const conflict = quarantineWorkspaceConflict(root, "remote");
    expect(fs.existsSync(conflict)).toBe(true);
    expect(JSON.parse(fs.readFileSync(workspaceProjectFile(root), "utf8")).payload.title).toBe("A");
  });

  it("keeps an existing backup visible to diagnostics", () => {
    const root = makeRoot();
    writeManifest(root, { title: "A" });
    fs.copyFileSync(workspaceProjectFile(root), workspaceProjectBackupFile(root));
    expect(inspectWorkspaceSync(root, "project-1").backupExists).toBe(true);
  });
});

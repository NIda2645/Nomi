import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "../projects/repository";
import { copyLocalImageFile, copyLocalImageFiles } from "./localFileCopy";

const tempRoots: string[] = [];
let documentsRoot = "";
let userDataRoot = "";

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "documents" ? documentsRoot : userDataRoot),
    getAppPath: () => process.cwd(),
  },
}));

beforeEach(() => {
  documentsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-copy-documents-"));
  userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-copy-user-data-"));
  tempRoots.push(documentsRoot, userDataRoot);
  delete process.env.NOMI_PROJECTS_DIR;
});

afterEach(() => {
  delete process.env.NOMI_PROJECTS_DIR;
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function makeTempDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-copy-source-"));
  tempRoots.push(root);
  return root;
}

function createWorkspace(): { id: string; rootPath: string } {
  const rootPath = makeTempDir();
  const project = createProject({ rootPath, name: "Copy Workspace", payload: {} });
  return { id: project.id, rootPath };
}

function hash(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("copyLocalImageFile", () => {
  it("copies image bytes into imported assets and keeps the source", () => {
    const workspace = createWorkspace();
    const sourceDir = makeTempDir();
    const sourcePath = path.join(sourceDir, "hero.png");
    fs.writeFileSync(sourcePath, Buffer.from([137, 80, 78, 71, 0, 1, 2, 3]));
    const sourceHash = hash(sourcePath);

    const asset = copyLocalImageFile(workspace.id, sourcePath) as { data: { absolutePath: string; relativePath: string; kind: string } };

    expect(asset.data.relativePath).toBe("assets/imported/" + new Date().toISOString().slice(0, 10) + "/hero.png");
    expect(asset.data.kind).toBe("upload");
    expect(hash(asset.data.absolutePath)).toBe(sourceHash);
    expect(fs.existsSync(sourcePath)).toBe(true);
  });

  it("uses a unique filename and skips non-images in a batch", () => {
    const workspace = createWorkspace();
    const sourceDir = makeTempDir();
    const first = path.join(sourceDir, "same.jpg");
    const text = path.join(sourceDir, "notes.txt");
    fs.writeFileSync(first, Buffer.from([255, 216, 255, 0]));
    fs.writeFileSync(text, "not an image");

    const result = copyLocalImageFiles(workspace.id, [first, first, text]);

    expect(result.created).toHaveLength(2);
    expect(result.created.map((item) => (item as { data: { relativePath: string } }).data.relativePath).sort()).toEqual([
      "assets/imported/" + new Date().toISOString().slice(0, 10) + "/same-2.jpg",
      "assets/imported/" + new Date().toISOString().slice(0, 10) + "/same.jpg",
    ]);
    expect(result.skippedUnsupportedCount).toBe(1);
    expect(result.failedCount).toBe(0);
  });

  it("reports a missing source as a failed item without throwing", () => {
    const workspace = createWorkspace();

    const result = copyLocalImageFiles(workspace.id, ["/tmp/nomi-source-does-not-exist.png"]);

    expect(result.created).toHaveLength(0);
    expect(result.skippedUnsupportedCount).toBe(0);
    expect(result.failedCount).toBe(1);
  });
});

import { describe, expect, it, vi } from "vitest";
import { getDesktopBridge } from "../../desktop/bridge";
import {
  filePathsFromDrop,
  importImagePathsToLibrary,
  isTextEditingTarget,
} from "./assetLibraryLocalImport";

vi.mock("../../desktop/bridge", () => ({ getDesktopBridge: vi.fn() }));

const mockedGetDesktopBridge = vi.mocked(getDesktopBridge);

describe("assetLibraryLocalImport", () => {
  it("extracts unique absolute paths from dropped Electron files", () => {
    const files = [
      { path: "/tmp/a.png" },
      { path: "/tmp/a.png" },
      { path: "relative.jpg" },
      { name: "missing-path.png" },
    ] as unknown as File[];

    expect(filePathsFromDrop(files)).toEqual(["/tmp/a.png"]);
  });

  it("does not treat an editing target as the asset library paste surface", () => {
    expect(isTextEditingTarget({ closest: () => ({}) })).toBe(true);
    expect(isTextEditingTarget({ closest: () => null })).toBe(false);
    expect(isTextEditingTarget(null)).toBe(false);
  });

  it("uses the desktop copy bridge and returns its batch result", async () => {
    const copyFiles = vi.fn(async () => ({ created: [{ id: "asset-1" }], skippedUnsupportedCount: 1, failedCount: 0 }));
    mockedGetDesktopBridge.mockReturnValue({ assets: { copyFiles } } as never);

    await expect(importImagePathsToLibrary("project-1", ["/tmp/a.png"])).resolves.toEqual({
      created: [{ id: "asset-1" }],
      skippedUnsupportedCount: 1,
      failedCount: 0,
    });
    expect(copyFiles).toHaveBeenCalledWith({ projectId: "project-1", paths: ["/tmp/a.png"] });
  });
});

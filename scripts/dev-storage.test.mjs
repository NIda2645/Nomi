import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "vitest";
import { resolveDevStoragePaths } from "./dev-storage.mjs";

describe("resolveDevStoragePaths", () => {
  it("keeps default dev settings and projects inside the worktree profile", () => {
    const repoRoot = path.resolve("/workspace/Nomi-feature");
    const result = resolveDevStoragePaths({ repoRoot, rendererPort: 5273, env: {} });

    assert.equal(result.userDataDir, path.join(repoRoot, ".tmp", "electron-user-data", "dev-5273"));
    assert.equal(result.projectsDir, path.join(result.userDataDir, "projects"));
    assert.notEqual(result.projectsDir, path.join(process.env.HOME || "", "Documents", "Nomi Projects"));
  });

  it("preserves explicit settings and project overrides", () => {
    const result = resolveDevStoragePaths({
      repoRoot: "/workspace/Nomi-feature",
      rendererPort: 5274,
      env: {
        NOMI_ELECTRON_USER_DATA_DIR: "/tmp/nomi-dev-settings",
        NOMI_PROJECTS_DIR: "/tmp/nomi-dev-projects",
      },
    });

    assert.deepEqual(result, {
      userDataDir: "/tmp/nomi-dev-settings",
      projectsDir: "/tmp/nomi-dev-projects",
    });
  });

  it("places projects below a custom user-data directory when no project override is supplied", () => {
    const result = resolveDevStoragePaths({
      repoRoot: "/workspace/Nomi-feature",
      rendererPort: 5275,
      env: { NOMI_ELECTRON_USER_DATA_DIR: "/tmp/nomi-custom-profile" },
    });

    assert.equal(result.projectsDir, "/tmp/nomi-custom-profile/projects");
  });
});

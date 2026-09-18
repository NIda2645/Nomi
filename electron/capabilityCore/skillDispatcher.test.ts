import { beforeEach, describe, expect, it, vi } from "vitest";

// 目录由 pi 的加载器给（async）：分发器每次都 `await readSkillRecords()` 再把记录交给策略函数。
vi.mock("../skills/skillStore", () => ({
  readSkillRecords: vi.fn(async () => []),
  listSkillSummariesForMcp: vi.fn(() => []),
  readSkillContentForMcp: vi.fn(() => null),
}));

import { listSkillSummariesForMcp, readSkillContentForMcp } from "../skills/skillStore";
import { dispatch } from "./dispatcher";

describe("Skill dispatcher audience authority", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses public MCP visibility by default and ignores caller-supplied audience", async () => {
    await dispatch("skills.list", { audience: "internal" }, {} as never);
    expect(listSkillSummariesForMcp).toHaveBeenCalledWith("public", []);
  });

  it("uses public MCP visibility and version identity for read", async () => {
    await dispatch("skills.read", {
      audience: "internal",
      directoryName: "director-camera",
      packageVersion: "nomi-skill-v1",
      contentHash: "a".repeat(64),
      filePath: "references/camera.md",
    }, {} as never);
    expect(readSkillContentForMcp).toHaveBeenCalledWith(
      "director-camera",
      "public",
      [],
      { packageVersion: "nomi-skill-v1", contentHash: "a".repeat(64) },
      "references/camera.md",
    );
  });

  it("lets a verified local MCP client use the same private catalog as the desktop Agent", async () => {
    await dispatch("skills.list", {}, { origin: { host: "codex" } } as never);
    expect(listSkillSummariesForMcp).toHaveBeenCalledWith("local-authenticated", []);
    await dispatch("skills.read", { name: "private.skill" }, { origin: { host: "claude" } } as never);
    expect(readSkillContentForMcp).toHaveBeenCalledWith("private.skill", "local-authenticated", [], undefined, undefined);
  });
});

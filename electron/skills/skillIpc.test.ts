import { describe, expect, it, vi } from "vitest";

import type { SkillManifest } from "./skillManifestSchema";
import { SKILL_PACKAGE_VERSION } from "./skillPackage";
import type { SkillRecord } from "./skillStore";
import { listSkillsForRenderer, projectSkillsForRenderer } from "./skillIpc";

const manifest = (partial: Partial<SkillManifest>): SkillManifest => ({
  version: "1.0.0",
  tools: [],
  requiredProviders: [],
  ...partial,
});

const record = (partial: Partial<SkillRecord>): SkillRecord => ({
  name: "test.skill",
  directoryName: "test-skill",
  filePath: "/tmp/test-skill/SKILL.md",
  packageDir: "/tmp/test-skill",
  description: "Test skill",
  content: "Use the test skill.",
  body: "Use the test skill.",
  manifest: manifest({}),
  origin: "builtin",
  audience: "internal",
  packageVersion: SKILL_PACKAGE_VERSION,
  contentHash: "a".repeat(64),
  requiresCodingTools: false,
  ...partial,
});

vi.mock("./skillStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./skillStore")>();
  return { ...actual, readSkillRecords: vi.fn() };
});

describe("listSkillsForRenderer", () => {
  it("projects declared media and the body through the renderer boundary, without inventing a cover for legacy Skills", async () => {
    const { readSkillRecords } = await import("./skillStore");
    const { readSkillCuration } = await import("../shared/skillCuration");
    const { parseSkillFrontmatter } = await import("./skillFrontmatter");
    const fs = await import("node:fs");
    const source = fs.readFileSync("skills/curated-multi-view/SKILL.md", "utf8");
    const curation = readSkillCuration(parseSkillFrontmatter(source).values);
    // 目录是 async 的（pi 的加载器）：list 每次现读，刚导入的技能下一次 list 就在。
    vi.mocked(readSkillRecords).mockResolvedValue([
      record({ directoryName: "curated-multi-view", curation, body: source, manifest: manifest({ selectableInWorkbench: true }) }),
      record({ name: "external", origin: "user" }),
    ]);
    const [curated, external] = await listSkillsForRenderer();
    expect(readSkillRecords).toHaveBeenCalledOnce();
    expect(curated.cover).toBe("nomi-local://skill-preview/curated-multi-view");
    expect(curated.preview).toEqual({ url: curated.cover, type: "image" });
    expect(curated.body).toBe(source);
    expect(curated.curation?.license).toBe("Apache-2.0");
    expect(external.cover).toBeUndefined();
    expect(external.preview).toBeUndefined();
  });
  it("projects an explicitly selectable single-stage storyboard Skill into the real renderer DTO", () => {
    const dto = projectSkillsForRenderer([
      record({
        name: "workbench-storyboard-planner",
        directoryName: "workbench-storyboard-planner",
        manifest: manifest({ selectableInWorkbench: true }),
      }),
      record({
        name: "workbench-generation",
        directoryName: "workbench-generation",
        manifest: manifest({}),
      }),
    ]);

    expect(dto.map((skill) => skill.name)).toEqual([
      "workbench-storyboard-planner",
    ]);
  });

  it("keeps user Skills and existing playbooks visible while excluding malformed or routing-only built-ins", () => {
    const dto = projectSkillsForRenderer([
      record({ name: "brand-promo", manifest: manifest({ stages: [{ id: "script", goal: "Write", tools: [] }] }) }),
      record({ name: "workbench-broken", manifest: null, manifestError: "invalid metadata.nomi" }),
      record({ name: "workbench-routing", manifest: manifest({}) }),
      record({ name: "user-skill", origin: "user", manifest: null, manifestError: "invalid metadata.nomi" }),
      record({ name: "wrong-scope", manifest: manifest({ audience: "mcp" }) }),
    ]);

    expect(dto.map((skill) => skill.name)).toEqual([
      "brand-promo",
      "user-skill",
    ]);
    expect(dto.find((skill) => skill.name === "user-skill")).toMatchObject({
      origin: "user",
      manifestError: "invalid metadata.nomi",
    });
  });

  // S18：根目录下的 my-skill.md 技能，描述照样进 DTO（不是「暂无说明」），句柄是文件名去掉 .md。
  it("projects a loose root .md Skill with its own description and file-stem handle", () => {
    const [loose] = projectSkillsForRenderer([
      record({ name: "my-skill", directoryName: "my-skill", filePath: "/tmp/skills/my-skill.md", packageDir: "/tmp/skills",
        origin: "user", manifest: null, description: "一个以单文件分发的技能。" }),
    ]);
    expect(loose).toMatchObject({ directoryName: "my-skill", description: "一个以单文件分发的技能。" });
  });
});

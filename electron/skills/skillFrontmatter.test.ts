import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { parseSkillFrontmatter } from "./skillFrontmatter";

/**
 * `parseSkillFrontmatter` 是 pi 的 `parseFrontmatter` 的一份**本地等价物**，不是第二种做法（S8 / S13）。
 *
 * 为什么它还在（2026-09-18 技能加载迁到 pi 之后）：pi 的 `loadSkills` 只交出 name / description /
 * content / disable-model-invocation，**不交出解析好的 frontmatter 对象**；而 `metadata.nomi`、策展块、
 * `tools:` 都住在 frontmatter 里，且 CJS 侧的同步导入校验（`validateSkillPackage`）摸不到 ESM-only 的 pi。
 *
 * 于是 R29 的问题变成「怎么保证这份本地版本不漂」。答案不是写一句注释，是这条测试：
 * 拿**盘上每一份真 SKILL.md** 逐个比对两个实现解析出来的 frontmatter 值——pi 升级改了判据、
 * 或者有人来改我们这份，当场红。此前只对账「剥正文」那一半；剥正文那份已经删了（pi 的 `content` 就是），
 * 现在对账的是留下来的这一半。
 */
describe("skill frontmatter parsing stays pinned to pi's parseFrontmatter", () => {
  const skillsRoot = path.join(process.cwd(), "skills");
  const files = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsRoot, entry.name, "SKILL.md"))
    .filter((file) => fs.existsSync(file));

  it("has real installed Skills to compare against", () => {
    // 阳性对照：文件列表空了的话下面那条 forEach 一条都不跑，而 vitest 照样绿。
    expect(files.length).toBeGreaterThan(40);
  });

  it.each(files.map((file) => [path.basename(path.dirname(file)), file] as const))(
    "%s: frontmatter values deep-equal pi's",
    (_name, file) => {
      const raw = fs.readFileSync(file, "utf8");
      const ours = parseSkillFrontmatter(raw);
      expect(ours.error).toBeUndefined();
      expect(ours.values).toEqual(parseFrontmatter(raw).frontmatter);
    },
  );

  it("agrees with pi on the edge shapes too (no frontmatter / BOM / CRLF / empty block)", () => {
    for (const sample of [
      "# 没有 frontmatter\n正文",
      "---\nname: x\n---\n\n# 正文\n一句话。",
      "﻿---\r\nname: x\r\ndescription: d\r\n---\r\n\r\n正文\r\n",
      "---\n---\n只有一对分隔符",
    ]) {
      expect(parseSkillFrontmatter(sample).values, JSON.stringify(sample)).toEqual(parseFrontmatter(sample).frontmatter);
    }
  });

  it("reports an unclosed frontmatter instead of silently reading it as none", () => {
    // pi 把没闭合的 `---` 当「没有 frontmatter」（整份是正文）；导入侧要的是一句人话拒收，
    // 否则一个写坏的技能会以「没有 description」的样子进来，用户看不出是哪一行坏了。
    expect(parseSkillFrontmatter("---\nname: x\n没闭合的 frontmatter").error).toMatch(/没有闭合/);
  });

  it("still exposes the parsed frontmatter to the callers that need it", () => {
    // 技能清单（metadata.nomi）、curation、coding 解锁都还要读它——这正是这个文件留下的理由。
    const parsed = parseSkillFrontmatter("---\nname: x\ndescription: d\n---\n\n正文");
    expect(parsed.values).toEqual({ name: "x", description: "d" });
  });
});

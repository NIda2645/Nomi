// R31 · 官方夹具对账：**别人按规范写出来的 SKILL.md，我们的读取器读得过吗。**
//
// 夹具 tests/fixtures/standard-formats/agent-skill/SKILL.md 是从 Agent Skills 官方文档
// （https://code.claude.com/docs/en/skills）原样抄下来的最小样例，出处见 tests/fixtures/standard-formats/SOURCES.md。
// 它不是我们编的样例——这正是全部意义所在：既有的 skillPackage.test.ts / skillStore.test.ts 喂的都是
// 我们自己手写的输入，它们只能证明「我们读得过自己写的」。2026-08-26 群里那条「别人的技能导不进来」
// 就发生在这个盲区里。
//
// 门岗 `pnpm run check:standard-formats` 会要求登记表里每份夹具都有测试引用它；本文件就是 agent-skill 那份的引用方。
// 这里读不过 = 我们的解析器有 bug，不是夹具写错了。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SKILL_PACKAGE_VERSION, validateSkillPackage } from "./skillPackage";
// 目录来自 pi 的加载器（岛上、async）——官方样例现在由 pi 自己的解析器读，判官与被判的是同一把尺子。
import { discoverSkillRecords } from "../agentLane/laneSkillCatalog.mjs";

const FIXTURE = "tests/fixtures/standard-formats/agent-skill/SKILL.md";
const officialSkillMd = fs.readFileSync(path.resolve(process.cwd(), FIXTURE), "utf8");

let root = "";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-official-skill-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("Agent Skills 官方样例（R31 夹具对账）", () => {
  it("官方最小样例本身就是合法的技能包——没有 skill.json 也进得来", () => {
    const result = validateSkillPackage({
      version: SKILL_PACKAGE_VERSION,
      dirName: "my-skill",
      files: { "SKILL.md": officialSkillMd },
    });
    expect(result.ok).toBe(true);
    // 收敛后（2026-09-07）校验只回「包合不合法 + 它叫什么」：技能清单没有第二份文件可校验了，
    // Nomi 扩展块随同一份 frontmatter 一起读——官方样例里根本没有扩展块，见下一条断言。
    if (result.ok) expect(result.skillName).toBe("my-skill");
  });

  it("落盘后被发现，name / description 从 YAML frontmatter 读出来", async () => {
    const dir = path.join(root, "my-skill");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), officialSkillMd);

    const { records } = await discoverSkillRecords([{ path: root, origin: "user" }]);
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe("my-skill");
    expect(records[0].description).toBe("What this skill does");
    // manifest = null 是**期望值**：官方格式里没有 Nomi 扩展块，纯知识层技能就该这样进来。
    expect(records[0].manifest).toBeNull();
    expect(records[0].manifestError).toBeUndefined();
  });

  it("官方文档列出的可选键（allowed-tools / argument-hint）不会让解析失败", async () => {
    // 登记表 agent-skill 的第一条 deviation 声明「我们不消费这些键，但它们不许让导入失败」。
    // 这条断言就是那句声明的执行体：声明写在 JSON 里没人跑，写成断言才拦得住人。
    const withOptionalKeys = officialSkillMd.replace(
      "description: What this skill does",
      "description: What this skill does\nallowed-tools: Read Grep\nargument-hint: [filename]",
    );
    const dir = path.join(root, "my-skill");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), withOptionalKeys);

    const { records } = await discoverSkillRecords([{ path: root, origin: "user" }]);
    expect(records).toHaveLength(1);
    expect(records[0].description).toBe("What this skill does");
  });
});

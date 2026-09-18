/**
 * 开放性回归：**别人家的技能装进 Nomi 要能跑。**
 *
 * 2026-09-18 用户拍板：「不，我们必须可以开放。」对应 09-07 的开放战略——
 * 评估任何功能先问「更能被接、更能接别人吗」。
 *
 * 夹具是本机真实安装的第三方技能 `~/.claude/skills/chatcut-video-gen/SKILL.md` 的摘录
 * （`__fixtures__/chatcut-video-gen.SKILL.md`，逐字，只删不改）。它点名 `submit_video`
 * `track_progress` `browse_assets` —— **Nomi 一个都没有**。这不是一份写坏的技能，
 * 它在它自己的宿主里完全正确；它只是不知道 Nomi 的工具叫什么。
 *
 * 这正是用户问题的原型：「外部安装的 skill 不知道我们的工具名称，怎么让它调该调的东西？」
 *
 * 对照组是 ChatCut 自己的做法：他们产品技能直呼工具名（技能与 MCP 同一次发版），
 * 用户工作流技能则由 `chatcut-skill-creator` 代写且 `user-invocable: false`——
 * 生成器里明令「不要写内部命令名」「给工具留出演进空间」。**规则是对的，执行方式是关门。**
 * 我们取规则、不取垄断：任何来源的技能照收，运行时给模型能力清单让它自己映射。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SKILL_PACKAGE_VERSION, validateSkillPackage } from "./skillPackage";
import { buildSelectedSkillPrompt } from "../harness/context/agentContext";
import { CAPABILITY_ALIAS_ENTRIES } from "../shared/agentCapabilities/registry";
import type { SkillRecord } from "./skillStore";

const foreignBody = readFileSync(path.join(__dirname, "__fixtures__/chatcut-video-gen.SKILL.md"), "utf8");
const FOREIGN_TOOLS = ["submit_video", "track_progress", "browse_assets"] as const;

describe("别人家的技能装进 Nomi", () => {
  it("夹具的前提成立：它点名的工具 Nomi 一个都没有", () => {
    const ours = new Set(CAPABILITY_ALIAS_ENTRIES.map((entry) => entry.alias));
    for (const foreign of FOREIGN_TOOLS) {
      expect(foreignBody, `夹具该点名 ${foreign}`).toContain(foreign);
      expect(ours.has(foreign), `${foreign} 不该是 Nomi 的工具，否则这条测试证明不了任何事`).toBe(false);
    }
    // 反向锚：我们确实有一个「生视频」的家，所以「照意图改用」是做得到的，不是空话。
    expect(ours.has("draft_shots")).toBe(true);
  });

  it("① 照收：不因为工具名我们没有就拒绝导入", () => {
    const result = validateSkillPackage({
      version: SKILL_PACKAGE_VERSION,
      dirName: "chatcut-video-gen",
      files: { "SKILL.md": foreignBody },
    });
    expect(result.ok, result.ok ? "" : `不该拒收，但拒了：${result.error}`).toBe(true);
  });

  it("② 运行时给能力清单，语气不是「你写错了」", () => {
    const foreignSkill: SkillRecord = {
      name: "video-gen",
      directoryName: "chatcut-video-gen",
      filePath: path.join(process.cwd(), "skills/chatcut-video-gen/SKILL.md"),
      description: "Generate a video with ChatCut's own tools.",
      body: foreignBody,
      manifest: null,
      origin: "user",
      audience: "internal",
      packageVersion: SKILL_PACKAGE_VERSION,
      contentHash: "c".repeat(64),
    };
    const prompt = buildSelectedSkillPrompt(foreignSkill);

    // 正文原样进去——我们不改用户装的文件，也不在提示词里删它的字。
    for (const foreign of FOREIGN_TOOLS) expect(prompt).toContain(foreign);

    // 权威节在正文之后：真相靠 recency 压住，而不是靠正文没说过话。
    expect(prompt.indexOf("关于工具，一律以本条提示词里的")).toBeGreaterThan(prompt.indexOf("</skill>"));

    // 指令是「按意图改用我们的」，不是「报错」。这三条断言就是「开放」这个目标的验收面。
    expect(prompt).toContain("你**实际拥有**的全部工具");
    expect(prompt).toContain("不是错误");
    expect(prompt).toContain("挑能做成的那个用");
    // 兜底仍在，但排在映射之后，且是一句人话不是异常。
    expect(prompt).toContain("把其余步骤照常做完");
    expect(prompt).not.toMatch(/技能.*(写错|不合法|无效|不支持)/);
  });
});

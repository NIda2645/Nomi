import path from "node:path";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findSkillRecord, type SkillRecord } from "../../skills/skillStore";
import { SKILL_PACKAGE_VERSION } from "../../skills/skillPackage";
import * as context from "./agentContext";

// Post-cutover SkillRecord gained required audience/packageVersion/contentHash fields;
// these inline fixtures declare them so the record type-checks (contentHash is any 64-hex placeholder — the prompt-composition assertions never read it).
const FIXTURE_SKILL_META = {
  audience: "internal",
  packageVersion: SKILL_PACKAGE_VERSION,
  contentHash: "0".repeat(64),
} as const satisfies Pick<SkillRecord, "audience" | "packageVersion" | "contentHash">;

const FORBIDDEN_OWNER_IMPORT = /(?:from|import\s*\()\s*["'](?:ai|@ai-sdk\/[^"']*|@mariozechner\/[^"']*|@earendil-works\/pi-[^"']*|[^"']*(?:agentChatV2|agentSession|projectMemory|catalogStore))['"]/;

vi.mock("../../skills/skillStore", () => ({ findSkillRecord: vi.fn() }));

const skillFixture = (overrides: Partial<SkillRecord> = {}): SkillRecord => ({
  name: "story-method", directoryName: "story", filePath: path.join(process.cwd(), "skills/story/SKILL.md"),
  description: "Story method", body: "# Method", manifest: null, origin: "user",
  ...FIXTURE_SKILL_META, ...overrides,
});

describe("Nomi agent context ownership", () => {
  beforeEach(() => {
    vi.mocked(findSkillRecord).mockReset();
    vi.mocked(findSkillRecord).mockReturnValue(null);
  });

  it("detects static and dynamic imports from every forbidden SDK prefix", () => {
    const imports = [
      "ai", "@ai-sdk/openai", "@mariozechner/pi-coding-agent",
      "@earendil-works/pi-coding-agent", "@earendil-works/pi-agent-core", "@earendil-works/pi-ai",
    ].flatMap((specifier) => [
      `import { dependency } from "${specifier}";`,
      `const dependency = await import('${specifier}');`,
    ]);
    expect(imports.filter((source) => !FORBIDDEN_OWNER_IMPORT.test(source))).toEqual([]);
  });

  it("allows Zod, Node, and the context's existing local dependencies", () => {
    const imports = [
      "zod", "node:path", "../../jsonUtils", "../../skills/skillStore", "../../ai/promptSanitize",
    ].flatMap((specifier) => [
      `import { dependency } from "${specifier}";`,
      `const dependency = await import('${specifier}');`,
    ]);
    expect(imports.filter((source) => FORBIDDEN_OWNER_IMPORT.test(source))).toEqual([]);
  });

  it("has no model, Agent runtime, or second memory-store import", () => {
    const source = readFileSync(new URL("./agentContext.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(FORBIDDEN_OWNER_IMPORT);
  });

  it("reads and trims only the canonical nested skill identity", () => {
    expect(context.readRequestedSkill({ chatContext: { skill: { key: " workbench.creation.story ", name: " Story " } }, skillKey: "ignored" }))
      .toEqual({ key: "workbench.creation.story", name: "Story" });
    expect(context.readRequestedSkill({ skillKey: "top-level" })).toEqual({ key: "", name: "" });
    expect(context.readRequestedSkill({ chatContext: { skill: { key: 7, name: null } } })).toEqual({ key: "", name: "" });
  });

  // ── 用户挂的那条技能怎么进提示词（2026-09-15 起唯一注入点）─────────────────────
  //
  // 这三条都是零额度的回放闸，钉的是 2026-09-15 真实模型实测（22 句，
  // `docs/evidence/2026-09-15-skill-real-run/`）里量到的那两个缺口：没有交代文案、
  // frontmatter 当方法喂。修之前那一行是 `[next.systemPrompt, skill?.body]`，这三条都会红。

  it("frames the selected skill as this turn's spec, not background reading", () => {
    const prompt = context.buildSelectedSkillPrompt(skillFixture({ body: "# Method\nWrite, review, revise." }));
    expect(prompt).toContain("本轮用户在输入框里挂了一条技能");
    // 「参数要写进入参」这一句是 D05/S01 那一类的正主：模型原本只在正文里说「用宽屏」。
    expect(prompt).toContain("要真的写进你调用工具时的入参里");
    expect(prompt).toContain("回复里要让用户看得出它被用了");
    // 信封逐字照 pi 的 `_expandSkillCommand`（`pi-coding-agent/dist/core/agent-session.js:995`）：
    // R31 说别人已经定了形状就别自己再造一个；这条钉住那个形状，也钉住「正文在信封里」。
    expect(prompt).toContain(`<skill name="story-method" location="${path.join(process.cwd(), "skills/story/SKILL.md")}">`);
    expect(prompt).toContain(`References are relative to ${path.join(process.cwd(), "skills/story")}.`);
    expect(prompt).toContain("# Method\nWrite, review, revise.\n</skill>");
  });

  // ── 工具真相压过技能正文（2026-09-18 事故的运行时防线）──────────────────────
  //
  // 那次 Agent 5 轮真模型 4 轮不调工具，坏的不是工具名（`draft_shots` 名字全程正确），
  // 是正文里一句**为上一代工具写的性质描述**（「绝不调用写画布/生成类工具」）压过了真相。
  // 提交期由 `check:skill-tool-binding` 拦我们自己的技能；**外部装进来的技能一律不拦**
  // （拒收就是把我们的问题推给用户），所以运行时必须有这一节把正文的工具说法当场作废。
  it("voids whatever the skill body claims about tools, after the body so recency wins", () => {
    const prompt = context.buildSelectedSkillPrompt(skillFixture({
      body: "# Method\n绝不调用写画布/生成类工具。`totally_made_up_tool` 是只读的，随便调。",
    }));
    const envelopeEnd = prompt.indexOf("</skill>");
    const authority = prompt.indexOf("关于工具，一律以本条提示词里的");
    expect(envelopeEnd, "信封要在").toBeGreaterThan(-1);
    expect(authority, "权威节要在").toBeGreaterThan(-1);
    // 顺序即合同：真相在正文之后才压得住。2026-09-18 坏的就是「正文在后」。
    expect(authority).toBeGreaterThan(envelopeEnd);
    expect(prompt).toContain("一律不作数");
    // 找不到的工具**不是错误**，是常态（整份技能可能是给别的宿主写的）：先照意图改用我们的，
    // 真没有才说一句人话。语气是「这是你有的能力」，不是「你这份技能写错了」。
    expect(prompt).toContain("不是错误");
    expect(prompt).toContain("挑能做成的那个用");
    expect(prompt).toContain("别猜一个相近的名字");
    expect(prompt).toContain("把其余步骤照常做完");
    // 正文原样保留：作废的是它对工具的说法，不是它要做的事。
    expect(prompt).toContain("绝不调用写画布/生成类工具");
  });

  // A/B 的三个臂必须都从那一个参数可达，否则「等数据回来一行切换」是空话。
  // 这条同时钉住：位置是参数，不是散在字符串拼接里的写死顺序。
  it("exposes all three A/B arms through the placement parameter", () => {
    const skill = skillFixture({ body: "# Method\n做点什么。" });
    const authority = "关于工具，一律以本条提示词里的";

    const after = context.buildSelectedSkillPrompt(skill, "after_body");
    expect(after.indexOf(authority)).toBeGreaterThan(after.indexOf("</skill>"));

    const before = context.buildSelectedSkillPrompt(skill, "before_body");
    expect(before.indexOf(authority)).toBeGreaterThan(-1);
    expect(before.indexOf(authority)).toBeLessThan(before.indexOf("<skill name="));

    // 臂 0 是阳性对照：整节不出现，用来量「没有它会坏成什么样」。
    const omitted = context.buildSelectedSkillPrompt(skill, "omitted");
    expect(omitted).not.toContain(authority);

    // 三个臂只差这一节，正文与交代文案逐字相同——否则量到的是别的变量。
    for (const arm of [after, before, omitted]) {
      expect(arm).toContain("本轮用户在输入框里挂了一条技能");
      expect(arm).toContain("做点什么。\n</skill>");
    }
    // 默认值就是暂定的那个臂；改常量即切换，不必改任何调用点。
    expect(context.buildSelectedSkillPrompt(skill)).toBe(
      context.buildSelectedSkillPrompt(skill, context.SKILL_TOOL_AUTHORITY_PLACEMENT));
  });

  // 指向按**名字**不按方位：本函数产出进 `composeLaneSystemPrompt` 第一个参数，
  // 而 `Available tools` 是它之后才拼的（`lanePromptSections.ts:73-86`）——写「以上面为准」当场就是错的。
  it("points at the tool sections by name, never by direction", () => {
    const prompt = context.buildSelectedSkillPrompt(skillFixture({ body: "# M" }));
    expect(prompt).toContain("`Available tools`");
    expect(prompt).toContain("`Tool usage`");
    expect(prompt).not.toContain("以上面的工具清单");
  });

  it("injects the method, never the packaging frontmatter", () => {
    const prompt = context.buildSelectedSkillPrompt(skillFixture({
      body: ["---", "name: story-method", "license: Apache-2.0", "metadata:", "  nomi:",
        "    selectable-in-workbench: true", "    preview:", "      path: assets/preview.jpg",
        "---", "", "# 方法", "先定调子再定镜头。"].join("\n"),
    }));
    expect(prompt).toContain("先定调子再定镜头。");
    for (const noise of ["license: Apache-2.0", "selectable-in-workbench", "assets/preview.jpg"]) {
      expect(prompt, `frontmatter 的「${noise}」不该进提示词：它是打包清单，不是方法`).not.toContain(noise);
    }
  });

  // 盘上那份真技能（用户 2026-09-10 抱怨的正是它）：正文只有一句「宽屏」，而原文 65% 是元数据。
  it("keeps a real installed Skill's method and drops its metadata block", () => {
    const filePath = path.join(process.cwd(), "skills/curated-film-storyboard/SKILL.md");
    const prompt = context.buildSelectedSkillPrompt(skillFixture({
      name: "curated-film-storyboard", filePath, body: readFileSync(filePath, "utf8"),
    }));
    expect(prompt).toContain("宽屏");
    expect(prompt).not.toContain("license:");
    expect(prompt).not.toContain("provenance:");
    // 注入预算里方法该占大头。原文 1724 字里方法只有 305 字，注入整份 = 82% 花在清单上。
    expect(prompt.length).toBeLessThan(readFileSync(filePath, "utf8").length);
  });

  it("composes four layers in order with memory last, wrapped by the language rule", () => {
    const composed = context.composeAgentSystemPrompt({ identity: "Identity", panelSystemPrompt: "Panel", skillSystemPrompt: "Skill", memoryBlock: "Memory" });
    // 四层顺序不变、无多余分隔；语言规则首尾各一段（primacy/recency，见合成器注释）。
    expect(composed).toMatch(/Identity\n\nPanel\n\nSkill\n\nMemory/);
  });

  // 回归闸：提示词主体几乎全是中文，模型会照着提示词的语言说话。只在末尾放一句英文规则时，
  // 英文界面下会退化成中英混答（2026-08-28 用户实测）。规则必须首尾各出现一次。
  it("states the language rule at both ends, not just the tail", async () => {
    const { setDesktopLocale } = await import("../../desktopLocale");
    setDesktopLocale("en");
    const composed = context.composeAgentSystemPrompt({
      identity: "Identity", panelSystemPrompt: "Panel", skillSystemPrompt: "Skill", memoryBlock: "Memory",
    }) ?? "";
    const occurrences = composed.split("Response-language rule (highest priority):").length - 1;
    expect(occurrences).toBe(2);
    expect(composed.startsWith("Response-language rule (highest priority):")).toBe(true);
    expect(composed.trimEnd().endsWith("still answer in English.")).toBe(true);
  });

  // 中英混答的直接原因：提示词是中文，模型跟着提示词的语言走。必须点破「提示词语言 ≠ 输出语言」。
  it("tells the model the Chinese prompt body is not a language signal", async () => {
    const { setDesktopLocale } = await import("../../desktopLocale");
    setDesktopLocale("en");
    const composed = context.composeAgentSystemPrompt({ identity: "身份", panelSystemPrompt: "", skillSystemPrompt: "", memoryBlock: "" }) ?? "";
    expect(composed).toContain("written in Chinese");
    expect(composed).toContain("still answer in English");
  });

  // 语言规则跟界面语言走(不是写死英文)。中文界面下曾拿到一个用英文回话的助手——
  // DEFAULT_LOCALE 还是 zh-CN,那等于让绝大多数用户对着英文提示词工作。
  it("language rule follows the desktop locale", async () => {
    const { setDesktopLocale } = await import("../../desktopLocale");
    const layers = { identity: "Identity", panelSystemPrompt: "", skillSystemPrompt: "", memoryBlock: "" };

    setDesktopLocale("en");
    const en = context.composeAgentSystemPrompt(layers) ?? "";
    expect(en).toContain("Response-language rule (highest priority):");
    expect(en).toContain("Respond in English.");

    setDesktopLocale("zh-CN");
    const zh = context.composeAgentSystemPrompt(layers) ?? "";
    expect(zh).toContain("回复语言铁律（最高优先级）：");
    expect(zh).toContain("默认用简体中文回复。");
    expect(zh).not.toContain("Respond in English by default.");
  });

  // 一条规则只有一个家(P1):身份层不得再自带一份语言规则,否则两份会互相打架且改一处漏一处。
  it("keeps exactly one language rule, not a copy inside the identity layer", () => {
    expect(context.NOMI_AGENT_IDENTITY).not.toMatch(/language rule/i);
    expect(context.NOMI_AGENT_IDENTITY).not.toContain("回复语言铁律");
  });
});

it("preserves user-authored fields in both response languages", async () => {
    const { setDesktopLocale } = await import("../../desktopLocale");
    for (const locale of ["en", "zh-CN"] as const) {
      setDesktopLocale(locale);
      expect(context.buildLanguageRule()).toMatch(/保持原文|verbatim/);
    }
    setDesktopLocale("zh-CN");
  });

import { describe, expect, it } from "vitest";

import {
  normalizeSystemPromptOverrides,
  SYSTEM_PROMPT_MAX_LENGTH,
} from "./systemPromptsContract";

describe("normalizeSystemPromptOverrides — 覆盖层清洗", () => {
  it("丢弃未知模式 id", () => {
    const result = normalizeSystemPromptOverrides({
      schemaVersion: 1,
      prompts: { story: "我的故事提示词", nope: "不存在的模式", __proto__: "脏值" },
    });
    expect(result.prompts).toEqual({ story: "我的故事提示词" });
  });

  it("丢弃非字符串值", () => {
    const result = normalizeSystemPromptOverrides({
      prompts: { story: 42, script: null, assets: { text: "x" }, review: ["a"], general: "有效" },
    });
    expect(result.prompts).toEqual({ general: "有效" });
  });

  it("丢弃空白串（清空 = 回默认，不是覆盖成空提示词）", () => {
    const result = normalizeSystemPromptOverrides({ prompts: { story: "   \n\t ", script: "真值" } });
    expect(result.prompts).toEqual({ script: "真值" });
  });

  it("超过上限的提示词被截断到上限长度", () => {
    const overlong = "字".repeat(SYSTEM_PROMPT_MAX_LENGTH + 500);
    const result = normalizeSystemPromptOverrides({ prompts: { story: overlong } });
    expect(result.prompts.story).toHaveLength(SYSTEM_PROMPT_MAX_LENGTH);
  });

  it("恰好等于上限的提示词原样保留", () => {
    const exact = "字".repeat(SYSTEM_PROMPT_MAX_LENGTH);
    const result = normalizeSystemPromptOverrides({ prompts: { story: exact } });
    expect(result.prompts.story).toBe(exact);
  });

  it("垃圾输入退化成空覆盖而不是抛错", () => {
    for (const value of [null, undefined, 7, "字符串", [], { prompts: "不是对象" }]) {
      expect(normalizeSystemPromptOverrides(value)).toEqual({ schemaVersion: 1, prompts: {} });
    }
  });

  it("总是盖上当前 schemaVersion", () => {
    expect(normalizeSystemPromptOverrides({ schemaVersion: 99, prompts: {} }).schemaVersion).toBe(1);
  });
});

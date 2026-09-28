// 「声明卡表达不了」这条出口，只许指向**人写调用脚本**那条路（方案 §5 末段 / §4.3）。
//
// 为什么这条要有自己的断言：09-11 那条 bug（自建端点静默落回 OpenAI 兼容模板）在代码层已经修了
// （`compileRequestFor` 现在返回显式 `private_host_needs_declaration`），但它在**人话层**还能原样复发：
// 只要有人在这条 nextAction 里写一句「试试 openai-compatible 模板」，用户就会一直试，
// 而每一次都必然撞在同一堵墙上——那堵墙不是配置错，是这条路本来就不通。
import { describe, expect, it } from "vitest";
import { noGenericContractFailure } from "./envelope";

describe("no_generic_contract 的出口", () => {
  const failure = noGenericContractFailure("voice-clone-v2");

  it("码与出口都是「人写脚本」，不是「换个模板再试」", () => {
    expect(failure.code).toBe("no_generic_contract");
    expect(failure.nextAction).toMatch(/Call script/);
    // 出口必须是**可执行的位置**（在哪一页、点哪一项），不是一句「这个不支持」。
    expect(failure.nextAction).toMatch(/Settings/);
  });

  it("nextAction 里不许出现任何内置模板 id —— 那是 09-11 那条 bug 的人话版复发", () => {
    const text = `${failure.message} ${failure.nextAction}`.toLowerCase();
    for (const forbidden of ["openai-compatible", "built-in template", "chat/completions", "/v1/chat"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("说清是哪个模型、缺的是哪一类能力（不是笼统一句「不支持」）", () => {
    expect(failure.message).toContain("voice-clone-v2");
    expect(failure.message).toMatch(/signature|non-HTTP|SDK|encoding|steps/);
  });
});

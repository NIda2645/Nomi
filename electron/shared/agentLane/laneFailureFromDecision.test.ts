import { describe, expect, it } from "vitest";

import { isBareCodeMessage, laneFailureFromDecision } from "./laneFailureFromDecision";

describe("传输判决 → 模型看得懂的失败", () => {
  it('C18: generation failure ignores raw provider text and forbids repayment before reconciliation', () => {
    const failure = laneFailureFromDecision({ toolName: 'generate', code: 'generation_execution_failed',
      message: 'synthetic-secret-token /private/project/prompt', fallbackCode: 'tool_execution_failed', nextAction: 'Retry and pay again.' });
    expect(JSON.stringify(failure)).not.toContain('synthetic-secret');
    expect(failure.nextAction).toContain('Do not request payment');
    expect(failure.nextAction).toContain('reconcile');
  });
  // 2026-09-18 根因：传输适配器里有 9 处写着 `message: code`。前人诊断过后果并留在
  // `laneRuntimePort.ts` 头部：「`[error] E_DENIED` 对一个要自纠的模型等于什么都没说……
  // 模型据此没法自纠，只会把同一个调用再发一遍，用户撞到的『连续 6 次被自己拒收』就是这么来的」。
  // 他们在延迟组那个出口修了，**兄弟出口 laneDesktopTools 没跟上**（文档/画布/时间轴三条 lane 走那儿）。
  it("裸码进来，出去的绝不是裸码", () => {
    const failure = laneFailureFromDecision({
      toolName: "read_script",
      code: "capability_unsupported",
      message: "capability_unsupported", // ← 适配器里那 9 处写的就是这个
      fallbackCode: "capability_execution_failed",
      nextAction: "Read the current state and retry with what you just read.",
    });
    expect(failure.message).not.toBe(failure.code);
    expect(failure.message).toContain("read_script");
    expect(failure.nextAction.length).toBeGreaterThan(0);
    // 码仍然在正文里出现一次（UI 分档要它），但它不是**唯一**的内容。
    expect(failure.message.length).toBeGreaterThan(failure.code.length * 2);
  });

  it("领域给了真原因就带上——这是模型自纠唯一有用的那部分", () => {
    const failure = laneFailureFromDecision({
      toolName: "draft_shots",
      code: "generation_input_invalid",
      message: "shots.0.candidate: Required",
      fallbackCode: "capability_execution_failed",
      nextAction: "Fix that field and call again.",
    });
    expect(failure.message).toContain("shots.0.candidate: Required");
  });

  it("领域给了人话建议就用它，压过合成的那句", () => {
    const failure = laneFailureFromDecision({
      toolName: "write_script",
      code: "capability_unsupported",
      message: "capability_unsupported",
      fallbackCode: "capability_execution_failed",
      advice: { message: "The project disk has no free space.", nextAction: "Free space, then retry." },
      nextAction: "（这句该被 advice 压过）",
    });
    expect(failure.message).toBe("The project disk has no free space.");
    expect(failure.nextAction).toBe("Free space, then retry.");
  });

  it("空串、缺省也算「等于没说」——不然它们会伪装成有内容", () => {
    expect(isBareCodeMessage(undefined, "x")).toBe(true);
    expect(isBareCodeMessage("   ", "x")).toBe(true);
    expect(isBareCodeMessage("x", "x")).toBe(true);
    expect(isBareCodeMessage(" x ", "x")).toBe(true);
    // 阳性对照：真有内容的那句不能被误判成裸码，否则这道闸会把唯一有用的信息丢掉。
    expect(isBareCodeMessage("shots.0: Required", "generation_input_invalid")).toBe(false);
  });

  it("没有 code 时也永远有 nextAction——没有下一步的拒绝会让模型把同一个调用原样再发一遍", () => {
    const failure = laneFailureFromDecision({
      toolName: "look_at_canvas", code: undefined, message: undefined,
      fallbackCode: "capability_execution_failed",
      nextAction: "Read the canvas again before retrying.",
    });
    expect(failure.code).toBe("capability_execution_failed");
    expect(failure.message).not.toBe(failure.code);
    expect(failure.nextAction).toBe("Read the canvas again before retrying.");
  });
});

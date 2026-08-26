import { describe, expect, it, vi } from "vitest";
import { AntigravityProtocol } from "./antigravityProtocol";

const expected = { agent: "nomi-text", cwd: "/tmp/test" };
const usage = { input_tokens: 4, output_tokens: 2, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: 6 };
const init = { event: "init", conversation_id: "task-1", init: { cwd: expected.cwd, tools: [], agent: "nomi-text", permission_mode: "request-review" } };
const result = { event: "result", result: { conversation_id: "task-1", status: "SUCCESS", response: "你好", duration_seconds: 0.1, num_turns: 1, usage } };
const delta = (text: string) => ({ event: "step_update", step_update: { conversation_id: "task-1", step_index: 1, state: "ACTIVE", step_type: "agent_response", text_delta: text } });

describe("official Antigravity stream-json contract", () => {
  it("recognizes the real CLI's authentication ERROR result before init without sending input", () => {
    const ready = vi.fn(); const parser = new AntigravityProtocol(ready, vi.fn(), expected);
    expect(() => parser.accept({ event: "result", result: { status: "ERROR", error: "authentication failed or timed out" } }))
      .toThrow("ANTIGRAVITY_LOGIN_REQUIRED");
    expect(ready).not.toHaveBeenCalled();
  });
  it("accepts documented init without an optional conversation id, then pins the first step", () => {
    const parser = new AntigravityProtocol(vi.fn(), vi.fn(), expected);
    parser.accept({ event: "init", init: init.init });
    parser.accept(delta("你")); parser.accept(result);
    expect(parser.finish().conversationId).toBe("task-1");
  });
  it("opens the prompt gate only after an explicit empty tool list for our agent", () => {
    const ready = vi.fn(); const onDelta = vi.fn();
    const parser = new AntigravityProtocol(ready, onDelta, expected);
    parser.accept(init);
    parser.accept(delta("你")); parser.accept(delta("好")); parser.accept(result);
    expect(ready).toHaveBeenCalledOnce();
    expect(onDelta.mock.calls.flat()).toEqual(["你", "好"]);
    expect(parser.finish()).toEqual({ text: "你好", conversationId: "task-1", usage });
  });

  it.each([
    { ...init, init: { ...init.init, tools: ["run_command"] } },
    { ...init, init: { agent: "nomi-text" } },
    { ...init, init: { ...init.init, agent: "another-agent" } },
    { ...init, init: { ...init.init, permission_mode: "always-proceed" } },
    delta("before init"),
  ])("never releases the prompt for an unsafe/missing init: %j", (event) => {
    const ready = vi.fn();
    const parser = new AntigravityProtocol(ready, vi.fn(), expected);
    expect(() => parser.accept(event)).toThrow();
    expect(ready).not.toHaveBeenCalled();
  });

  it.each([
    { event: "step_update", step_update: { step_type: "tool", tool_name: "run_command" } },
    { event: "control_request" },
    { ...result, result: { ...result.result, status: "INTERRUPTED" } },
    { ...result, result: { ...result.result, conversation_id: "other-task" } },
  ])("rejects unsupported execution and unsuccessful results: %j", (event) => {
    const parser = new AntigravityProtocol(vi.fn(), vi.fn(), expected); parser.accept(init);
    expect(() => parser.accept(event)).toThrow();
  });

  it("does not leak thinking and rejects missing/duplicate terminal results", () => {
    const onDelta = vi.fn(); const parser = new AntigravityProtocol(vi.fn(), onDelta, expected);
    parser.accept(init);
    parser.accept({ event: "step_update", step_update: { conversation_id: "task-1", step_index: 0, state: "DONE", step_type: "checkpoint", text_delta: "private" } });
    expect(onDelta).not.toHaveBeenCalled();
    expect(() => parser.finish()).toThrow();
    parser.accept(result);
    expect(() => parser.accept(result)).toThrow();
  });

  it("uses the final response without duplicating already streamed text", () => {
    const onDelta = vi.fn(); const parser = new AntigravityProtocol(vi.fn(), onDelta, expected);
    parser.accept(init); parser.accept(delta("你")); parser.accept(result);
    expect(onDelta.mock.calls.flat().join("")).toBe("你好");
    expect(parser.finish().text).toBe("你好");
  });

  it.each([
    { ...init.init, cwd: "/tmp/another-task" },
    { ...init.init, model: "other-model" },
    { ...init.init, model: undefined },
  ])("does not send input with mismatched cwd or explicit model", (details) => {
    const ready = vi.fn();
    const parser = new AntigravityProtocol(ready, vi.fn(), { ...expected, model: "chosen-model" });
    expect(() => parser.accept({ event: "init", init: details })).toThrow();
    expect(ready).not.toHaveBeenCalled();
  });

  it.each([
    { step_index: -1 }, { step_index: 0.5 }, { step_index: "1" },
    { state: "WAITING" }, { step_type: "thinking" }, { text_delta: 42 },
    { state: ["ACTIVE"] }, { step_type: ["agent_response"] },
    { conversation_id: "another-task" }, { tool_info: null }, { subagent_info: {} },
  ])("rejects invalid step fields before emitting text", (fields) => {
    const onDelta = vi.fn(); const parser = new AntigravityProtocol(vi.fn(), onDelta, expected);
    parser.accept(init);
    expect(() => parser.accept({ event: "step_update", step_update: { ...delta("unsafe").step_update, ...fields } })).toThrow();
    expect(onDelta).not.toHaveBeenCalled();
  });

  it.each([
    { num_turns: 2 }, { duration_seconds: -1 }, { duration_seconds: NaN },
    { usage: { ...usage, input_tokens: -1 } }, { usage: { ...usage, output_tokens: 1.5 } },
    { usage: { ...usage, total_tokens: undefined } },
  ])("rejects invalid result metadata without emitting its final response", (fields) => {
    const onDelta = vi.fn(); const parser = new AntigravityProtocol(vi.fn(), onDelta, expected);
    parser.accept(init);
    expect(() => parser.accept({ event: "result", result: { ...result.result, ...fields } })).toThrow();
    expect(onDelta).not.toHaveBeenCalled();
    expect(() => parser.finish()).toThrow("ANTIGRAVITY_MISSING_RESULT");
  });

  it("keeps repeated DONE deltas and never adds session usage to step usage", () => {
    const onDelta = vi.fn(); const parser = new AntigravityProtocol(vi.fn(), onDelta, expected);
    parser.accept(init); parser.accept(delta("好"));
    parser.accept({ event: "step_update", step_update: { ...delta("好").step_update, state: "DONE", usage } });
    parser.accept({ ...result, result: { ...result.result, response: "好好" } });
    expect(onDelta.mock.calls.flat()).toEqual(["好", "好"]);
    expect(parser.finish().usage).toEqual(usage);
  });
});

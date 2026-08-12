import { describe, expect, it } from "vitest";
import { APICallError } from "ai";
import { describeAgentError, describeEmptyAgentReply } from "./agentError";
import { parseVendorErrorFromMessage, stripVendorErrorMarker } from "../../src/workbench/generationCanvas/runner/vendorErrorIpc";

function apiError(opts: { statusCode?: number; responseBody?: string; message?: string }): APICallError {
  return new APICallError({
    message: opts.message ?? "Bad Request",
    url: "https://relay.example/v1/chat/completions",
    requestBodyValues: {},
    ...(opts.statusCode != null ? { statusCode: opts.statusCode } : {}),
    ...(opts.responseBody != null ? { responseBody: opts.responseBody } : {}),
  });
}

describe("describeAgentError", () => {
  it("surfaces the upstream human message hidden in a JSON responseBody", () => {
    // The real dm-fox / gpt-5.5 case: HTTP 400 with a useful business message.
    const err = apiError({
      statusCode: 400,
      responseBody: JSON.stringify({ error: { message: "官方算力限制，请等待一段时间后再进行使用" } }),
    });
    const out = describeAgentError(err);
    expect(out).toContain("官方算力限制");
    // The bare status text must NOT be all the user sees.
    expect(out).not.toBe("Bad Request");
    expect(out).toContain("400");
  });

  it("reads the common { msg } / { message } envelope shapes", () => {
    expect(describeAgentError(apiError({ statusCode: 429, responseBody: JSON.stringify({ msg: "rate limited" }) }))).toContain("rate limited");
    expect(describeAgentError(apiError({ statusCode: 500, responseBody: JSON.stringify({ message: "upstream down" }) }))).toContain("upstream down");
    expect(describeAgentError(apiError({ statusCode: 400, responseBody: JSON.stringify({ error: "plain string error" }) }))).toContain("plain string error");
  });

  it("falls back to a trimmed raw body when it is not JSON", () => {
    const out = describeAgentError(apiError({ statusCode: 502, responseBody: "<html>Bad Gateway</html>" }));
    expect(out).toContain("Bad Gateway");
    expect(out).toContain("502");
  });

  it("falls back to the error message when there is no responseBody", () => {
    expect(describeAgentError(apiError({ statusCode: 401, message: "Unauthorized" }))).toContain("Unauthorized");
  });

  it("handles plain Errors and non-errors", () => {
    expect(describeAgentError(new Error("boom"))).toBe("boom");
    expect(describeAgentError("just a string")).toBe("just a string");
  });

  // 2026-08-12：这个漏斗除了「说人话」还多担一件事——把厂商失败的 category 结构化带过 IPC，
  // 让渲染层不必用关键词猜（来龙去脉见 aiSdkVendorError.ts 文件头）。两端契约在这里对账：
  // 电子侧编码 ↔ 渲染层 vendorErrorIpc 解码，改一端不改另一端立刻红。
  it("厂商失败带上结构化 category，且剥掉标记后展示串一字未变", () => {
    const out = describeAgentError(apiError({ statusCode: 401, message: "Unauthorized" }), { vendorKey: "apimart" });
    expect(parseVendorErrorFromMessage(out)).toMatchObject({ category: "auth", httpStatus: 401, vendorKey: "apimart" });
    // 用户眼前看到的仍是老样子——标记只是搭了趟顺风车。
    expect(stripVendorErrorMarker(out)).toBe("（HTTP 401）Unauthorized");
  });

  it("不是厂商失败的不加标记（没配模型/输出截断/用户点停止走 legacy 兜底）", () => {
    expect(parseVendorErrorFromMessage(describeAgentError(new Error("No local text model is configured.")))).toBeNull();
  });
});

describe("describeEmptyAgentReply", () => {
  it("explains a length-truncation and steers to a stronger model", () => {
    const out = describeEmptyAgentReply("length", {
      modelLabel: "moonshot-v1-128k-vision-preview",
      agentSuitability: "poor",
      agentNote: "Moonshot v1 series truncates tool-call argument JSON mid-stream.",
    });
    // Names the cause (length cap / truncation) ...
    expect(out).toMatch(/长度|截断/);
    // ... carries the model name ...
    expect(out).toContain("moonshot-v1-128k-vision-preview");
    // ... and guides toward a general chat model.
    expect(out).toMatch(/GPT-4o|Claude|Gemini|通用/);
  });

  it("returns empty string for finish reasons that are not a recognized failure", () => {
    // stop / tool-calls with empty text is ambiguous — not our truncation bug.
    expect(describeEmptyAgentReply("stop", { modelLabel: "x" })).toBe("");
    expect(describeEmptyAgentReply("tool-calls", { modelLabel: "x" })).toBe("");
  });
});

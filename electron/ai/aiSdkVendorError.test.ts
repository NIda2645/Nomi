// 文本侧结构化错误的映射层单测（对照 vendorHttp.test.ts 的图/视频侧同名保证）。
// 钉的是「状态码在源头被接住」——不是「关键词表够不够全」。
import { describe, expect, it } from "vitest";
import { APICallError, RetryError } from "ai";
import { VendorRequestError } from "../vendor/vendorHttp";
import { upstreamMessageFromBody, vendorErrorFromAiSdkError, vendorStallError } from "./aiSdkVendorError";

function apiError(opts: { statusCode?: number; responseBody?: string; message?: string }): APICallError {
  return new APICallError({
    message: opts.message ?? "Bad Request",
    url: "https://relay.example/v1/chat/completions",
    requestBodyValues: {},
    ...(opts.statusCode != null ? { statusCode: opts.statusCode } : {}),
    ...(opts.responseBody != null ? { responseBody: opts.responseBody } : {}),
  });
}

/** provider-utils 在 `TypeError: fetch failed` 且带 cause 时造的正是这个形状（无 statusCode）。 */
function connectionError(causeMessage: string): APICallError {
  return new APICallError({
    message: `Cannot connect to API: ${causeMessage}`,
    url: "https://relay.example/v1/chat/completions",
    requestBodyValues: {},
    isRetryable: true,
  });
}

/** maxRetries 打光后 SDK 抛的套壳形态（ai/dist/index.mjs:294）。 */
function retryWrapped(last: unknown): RetryError {
  return new RetryError({
    message: `Failed after 4 attempts. Last error: ${last instanceof Error ? last.message : String(last)}`,
    reason: "maxRetriesExceeded",
    errors: [last, last, last, last],
  });
}

describe("vendorErrorFromAiSdkError — 状态码查表(复用 categorizeVendorFailure,不另写一份)", () => {
  it.each([
    [401, "auth", false],
    [403, "auth", false],
    [402, "balance", false],
    [429, "quota", true],
    [400, "input", false],
    [422, "input", false],
    [500, "server", true],
    [503, "server", true],
  ] as const)("HTTP %i → %s", (statusCode, category, retryable) => {
    const mapped = vendorErrorFromAiSdkError(apiError({ statusCode }));
    expect(mapped).toBeInstanceOf(VendorRequestError);
    expect(mapped?.structured.category).toBe(category);
    expect(mapped?.structured.retryable).toBe(retryable);
    expect(mapped?.structured.httpStatus).toBe(statusCode);
  });

  it("上游人话从 responseBody 抠出来进 upstreamMsg(中转把真原因只放体里)", () => {
    const mapped = vendorErrorFromAiSdkError(
      apiError({ statusCode: 400, responseBody: JSON.stringify({ error: { message: "官方算力限制，请等待一段时间后再进行使用" } }) }),
    );
    expect(mapped?.structured.upstreamMsg).toBe("官方算力限制，请等待一段时间后再进行使用");
    expect(mapped?.message).toContain("官方算力限制");
  });

  it("带上调用方给的 vendorKey 与 APICallError 自己的 url", () => {
    const mapped = vendorErrorFromAiSdkError(apiError({ statusCode: 500 }), { vendorKey: "apimart" });
    expect(mapped?.structured.vendorKey).toBe("apimart");
    expect(mapped?.structured.url).toBe("https://relay.example/v1/chat/completions");
  });

  it("upstreamMsg 截 256(与 vendorHttp 同一口径,防日志/卡片爆炸)", () => {
    const mapped = vendorErrorFromAiSdkError(apiError({ statusCode: 500, responseBody: "x".repeat(400) }));
    expect(mapped?.structured.upstreamMsg).toHaveLength(256);
  });
});

describe("vendorErrorFromAiSdkError — 三条 AI SDK 事实", () => {
  it("① RetryError 套壳要拆开——不拆的话 500 只剩一句『Failed after 4 attempts』，状态码照样丢", () => {
    const mapped = vendorErrorFromAiSdkError(retryWrapped(apiError({ statusCode: 500, message: "Internal Server Error" })));
    expect(mapped?.structured.category).toBe("server");
    expect(mapped?.structured.httpStatus).toBe(500);
  });

  it("② 连接失败(无 statusCode)→ network·可重试，不用特判", () => {
    const mapped = vendorErrorFromAiSdkError(retryWrapped(connectionError("connect ECONNREFUSED 127.0.0.1:443")));
    expect(mapped?.structured.category).toBe("network");
    expect(mapped?.structured.retryable).toBe(true);
    expect(mapped?.structured.httpStatus).toBeUndefined();
    expect(mapped?.structured.upstreamMsg).toContain("ECONNREFUSED");
  });

  it("② DNS 失败(ENOTFOUND)同归 network——关键词表里有没有这个词都不影响", () => {
    const mapped = vendorErrorFromAiSdkError(connectionError("getaddrinfo ENOTFOUND relay.example"));
    expect(mapped?.structured.category).toBe("network");
  });

  it("③ 不可重试错误第一次就裸抛,不套 RetryError——裸形态也认", () => {
    expect(vendorErrorFromAiSdkError(apiError({ statusCode: 401 }))?.structured.category).toBe("auth");
  });

  it("套壳套多层也拆得到底(防御性,SDK 内层重试嵌套)", () => {
    const mapped = vendorErrorFromAiSdkError(retryWrapped(retryWrapped(apiError({ statusCode: 429 }))));
    expect(mapped?.structured.category).toBe("quota");
  });
});

describe("vendorErrorFromAiSdkError — 不是厂商请求失败的一律放行给 legacy", () => {
  it("普通 Error（没配文本模型 / 空响应截断）→ null", () => {
    expect(vendorErrorFromAiSdkError(new Error("No local text model is configured."))).toBeNull();
    expect(vendorErrorFromAiSdkError(new Error("模型「x」这一轮达到了输出长度上限，内容被截断"))).toBeNull();
  });

  it("用户点停止的 AbortError → null（它不是失败,别塞进厂商错误桶）", () => {
    const aborted = new Error("This operation was aborted");
    aborted.name = "AbortError";
    expect(vendorErrorFromAiSdkError(aborted)).toBeNull();
  });

  it("非 Error 值 → null", () => {
    expect(vendorErrorFromAiSdkError("just a string")).toBeNull();
    expect(vendorErrorFromAiSdkError(undefined)).toBeNull();
  });

  it("已经结构化的原样放行,不二次加工", () => {
    const already = vendorStallError("模型 90s 内无响应（端点慢或挂起）");
    expect(vendorErrorFromAiSdkError(already)).toBe(already);
  });
});

describe("vendorStallError — 我们自己的流式超时守卫", () => {
  it("归 network·可重试(与 vendorHttp 给自家超时的待遇一致)", () => {
    const stalled = vendorStallError("流式 120s 无新内容（端点中途挂起）", { vendorKey: "apimart" });
    expect(stalled.structured.category).toBe("network");
    expect(stalled.structured.retryable).toBe(true);
    expect(stalled.structured.vendorKey).toBe("apimart");
    expect(stalled.message).toContain("端点中途挂起");
  });
});

describe("upstreamMessageFromBody", () => {
  it("认四种常见信封", () => {
    expect(upstreamMessageFromBody(JSON.stringify({ error: { message: "a" } }))).toBe("a");
    expect(upstreamMessageFromBody(JSON.stringify({ error: "b" }))).toBe("b");
    expect(upstreamMessageFromBody(JSON.stringify({ message: "c" }))).toBe("c");
    expect(upstreamMessageFromBody(JSON.stringify({ msg: "d" }))).toBe("d");
  });

  it("不是 JSON 就给清洗过的片段", () => {
    expect(upstreamMessageFromBody("<html>  Bad\n Gateway </html>")).toBe("<html> Bad Gateway </html>");
  });

  it("空体给空串", () => {
    expect(upstreamMessageFromBody("   ")).toBe("");
  });
});

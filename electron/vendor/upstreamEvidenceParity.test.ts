// 三条把上游失败带过 IPC 的通道（图 / 视频 / JSON 请求的 vendorHttp、AI SDK 的文本请求、Agent 的 pi 运行时）
// 对**同一份上游响应体**必须带出同一份证据——否则渲染层那一张分类目录会在不同通道上对同一次失败说不同的话。
//
// 为什么单独一个对等测试：每条通道各有自己的单测，但「新增一条证据字段时漏掉某条通道」这件事，单条通道的单测看不见
// （漏掉的那条通道根本没有那条用例）。2026-09-29 加 upstreamCode 时，第三条通道（pi 运行时）就是数门才找出来的。
// 这里把三条通道放在同一张表上：新增字段而某条通道没带，这一条红。
import assert from "node:assert/strict";
import { APICallError } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseVendorErrorFromMessage } from "../../src/workbench/generationCanvas/runner/vendorErrorIpc";
import { vendorErrorFromAiSdkError } from "../ai/aiSdkVendorError";
import { describeRuntimeError } from "../ai/runtimeVendorError";
import type { Vendor } from "../catalog/types";
import { VendorRequestError, requestJson } from "./vendorHttp";
import { setSubmitOutboundDepsForTests } from "./vendorOutboundGuard";

const vendor = { key: "kie", authType: "bearer", baseUrlHint: "https://api.kie.ai" } as unknown as Vendor;

beforeEach(() => {
  // 同 vendorHttp.test.ts：把提交侧出站授权的网络事实钉成「公网、无代理」，本文件只测证据怎么带过去。
  setSubmitOutboundDepsForTests({
    resolve: async () => [{ address: "93.184.216.34", family: 4 as const }],
    readEnvironment: async () => ({ syntheticResolver: false, syntheticSample: "" }),
    isApplicationProxyActive: () => false,
  });
});
afterEach(() => {
  setSubmitOutboundDepsForTests(null);
  vi.unstubAllGlobals();
});

type Evidence = { upstreamCode?: string; category?: string; httpStatus?: number };
const evidenceOf = (structured: (Evidence & Record<string, unknown>) | null | undefined): Evidence => ({
  upstreamCode: typeof structured?.upstreamCode === "string" ? structured.upstreamCode : undefined,
  category: typeof structured?.category === "string" ? structured.category : undefined,
  httpStatus: typeof structured?.httpStatus === "number" ? structured.httpStatus : undefined,
});

async function viaVendorHttp(status: number, body: string): Promise<Evidence> {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));
  const error = await requestJson(vendor, "k", "POST", "https://api.kie.ai/v1/images/generations", {}, {}, {}).catch((cause) => cause);
  assert(error instanceof VendorRequestError);
  return evidenceOf(error.structured);
}

function viaAiSdk(status: number, body: string): Evidence {
  const mapped = vendorErrorFromAiSdkError(new APICallError({
    message: "Bad Request", url: "https://relay.example/v1/chat/completions", requestBodyValues: {}, statusCode: status, responseBody: body,
  }));
  return evidenceOf(mapped?.structured);
}

function viaAgentRuntime(status: number, body: string): Evidence {
  return evidenceOf(parseVendorErrorFromMessage(describeRuntimeError({ kind: "http", status, message: `HTTP ${status}`, body }, "provider")));
}

describe("同一份上游响应体，三条通道带出同一份证据", () => {
  it.each([
    ["OpenAI / new-api 信封：码 + 话", 400, { error: { message: "This model has been deprecated and is no longer available.", code: "model_not_found" } }, "model_not_found"],
    ["顶层字符串码", 400, { code: "model_not_found", message: "no available channel" }, "model_not_found"],
    ["同一个码换了 HTTP 状态码（404）", 404, { error: { message: "The model does not exist", code: "model_not_found" } }, "model_not_found"],
    ["没有码", 400, { error: { message: "Bad Request" } }, undefined],
    ["纯数字业务码不是标识码", 400, { code: 1004, msg: "x" }, undefined],
    ["整句话不是码", 400, { error: { message: "x", code: "this is a sentence, not an identifier" } }, undefined],
  ] as const)("%s", async (_label, status, body, expectedCode) => {
    const text = JSON.stringify(body);
    const http = await viaVendorHttp(status, text);
    const sdk = viaAiSdk(status, text);
    const runtime = viaAgentRuntime(status, text);
    // 三条通道对同一份响应体必须同形：码、分类、状态码逐项相同。
    expect(sdk).toEqual(http);
    expect(runtime).toEqual(http);
    expect(http.upstreamCode).toBe(expectedCode);
  });

  it("响应体不是 JSON 时，三条通道都不写码（不把一段文本当码）", async () => {
    const http = await viaVendorHttp(400, "upstream exploded");
    expect(viaAiSdk(400, "upstream exploded")).toEqual(http);
    expect(viaAgentRuntime(400, "upstream exploded")).toEqual(http);
    expect(http.upstreamCode).toBeUndefined();
  });
});

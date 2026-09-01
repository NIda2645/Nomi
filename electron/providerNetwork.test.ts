import { describe, expect, it } from "vitest";
import type { Dispatcher } from "undici";
import { normalizeProviderProxyUrl, providerDispatcher, providerProxyUrl } from "./providerNetwork";
import { SelectiveProxyDispatcher, createExplicitProxyDispatcher } from "./systemProxy";
import { redactNetworkMessage, safeNetworkUrl } from "./networkErrorDetails";

describe("provider-specific network routes", () => {
  it("normalizes supported HTTP and SOCKS routes while leaving blank routes absent", () => {
    expect(normalizeProviderProxyUrl(" 127.0.0.1:7897 ")).toBe("http://127.0.0.1:7897");
    expect(normalizeProviderProxyUrl("socks5://127.0.0.1:7897")).toBe("socks5://127.0.0.1:7897");
    expect(providerProxyUrl({ network: { proxyUrl: "" } })).toBeUndefined();
  });

  it("rejects unsupported provider routes before any request can be sent", () => {
    expect(() => normalizeProviderProxyUrl("ftp://127.0.0.1:21")).toThrow("Invalid provider proxy URL");
  });

  it("creates an isolated dispatcher only for a configured provider", async () => {
    expect(providerDispatcher({})).toBeUndefined();
    const dispatcher = providerDispatcher({ network: { proxyUrl: "http://127.0.0.1:7897" } });
    expect(dispatcher).toEqual(
      expect.objectContaining({ dispatch: expect.any(Function) }),
    );
    await dispatcher?.close();
  });
});

// ── 硬门 b：私网重定向防护（评估文档定的验收核心）─────────────────────────────
// per-connection 代理作为 suppliedDispatcher 传给 appFetch 时会**完全跳过** appDispatcher
// 的 isPrivateTarget 检查（见 appFetch.ts：suppliedDispatcher ?? getAppDispatcher）。因此
// 单连接 dispatcher 自己必须包 SelectiveProxyDispatcher：私网/回环 origin 走直连、公网走代理，
// 且每次 dispatch 都查——防私网 URL 302 跳公网继承代理、或把本地模型服务器也代理掉。
describe("per-connection dispatcher 保持应用级私网语义（硬门 b）", () => {
  it("HTTP 单连接代理被包成 SelectiveProxyDispatcher（而非裸 ProxyAgent）", async () => {
    const dispatcher = createExplicitProxyDispatcher("http://127.0.0.1:7897");
    expect(dispatcher).toBeInstanceOf(SelectiveProxyDispatcher);
    await dispatcher.close();
  });

  it("SOCKS 单连接代理也被包成 SelectiveProxyDispatcher", async () => {
    const dispatcher = createExplicitProxyDispatcher("socks5://127.0.0.1:7891");
    expect(dispatcher).toBeInstanceOf(SelectiveProxyDispatcher);
    await dispatcher.close();
  });

  it("私网/回环 origin 走内部直连、公网 origin 才走代理（每次 dispatch 都判）", async () => {
    // 用可观测的假 inner dispatcher 直接验 SelectiveProxyDispatcher 的路由分流，
    // 与 systemProxy.test.ts 的应用级 dispatcher 同语义、同判据（单一真相源 isPrivateHost）。
    const calls: string[] = [];
    const fake = (tag: string): Dispatcher =>
      ({
        dispatch(opts: Dispatcher.DispatchOptions) {
          calls.push(`${tag}:${String(opts.origin)}`);
          return true;
        },
        close: async () => {},
        destroy: async () => {},
      }) as unknown as Dispatcher;
    const selective = new SelectiveProxyDispatcher(fake("proxy"), fake("direct"));
    selective.dispatch({ origin: "http://127.0.0.1:11434", path: "/", method: "GET" }, {} as never);
    selective.dispatch({ origin: "http://localhost:1234", path: "/", method: "GET" }, {} as never);
    selective.dispatch({ origin: "https://api.apimart.ai", path: "/", method: "GET" }, {} as never);
    expect(calls).toEqual([
      "direct:http://127.0.0.1:11434",
      "direct:http://localhost:1234",
      "proxy:https://api.apimart.ai",
    ]);
  });
});

// ── 硬门 a：代理凭据不入日志（评估文档定的验收核心）───────────────────────────
// proxyUrl 可能含 user:pass（socks5://user:pass@host）。per-connection 报错走
// 既有 redactNetworkMessage/safeNetworkUrl 一族脱敏，凭据绝不出现在任何输出。
describe("代理凭据脱敏（硬门 a）", () => {
  it("含凭据的 HTTP 代理 URL 经脱敏后不残留用户名/密码", () => {
    const credentialed = "http://REDACTED-USER:REDACTED-PASS@proxy.example.com:7897";
    const message = `provider proxy connect failed via ${credentialed} (ECONNREFUSED)`;
    const redacted = redactNetworkMessage(message);
    expect(redacted).not.toMatch(/REDACTED-USER|REDACTED-PASS/);
    // 端点主机仍可见（诊断需要），只是剥掉了 userinfo。
    expect(redacted).toContain("proxy.example.com");
  });

  it("含凭据的 SOCKS 代理 URL 同样被剥掉 userinfo", () => {
    const credentialed = "socks5://REDACTED-USER:REDACTED-PASS@127.0.0.1:1080";
    expect(safeNetworkUrl(credentialed)).not.toMatch(/REDACTED-USER|REDACTED-PASS/);
    const redacted = redactNetworkMessage(`tunnel via ${credentialed} timed out`);
    expect(redacted).not.toMatch(/REDACTED-USER|REDACTED-PASS/);
  });
});

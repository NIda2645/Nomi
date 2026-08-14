import { afterEach, describe, expect, it, vi } from "vitest";
import { resetComfyuiCapabilitiesForTest } from "./comfyui/capabilityStore";
import { probeComfyuiSystemStats } from "./comfyuiProbe";

afterEach(() => {
  vi.unstubAllGlobals();
  resetComfyuiCapabilitiesForTest();
});

describe("ComfyUI system probe", () => {
  it("同时探测系统信息与官方 feature flags，并标记增强协议", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/features")) {
        return new Response(JSON.stringify({ supports_preview_metadata: true }));
      }
      if (url.endsWith("/system_stats")) {
        return new Response(JSON.stringify({
          system: { python_version: "3.12.4 final", comfyui_version: "0.3.50" },
          devices: [{ name: "cuda:0 NVIDIA RTX 4090", vram_total: 24 * 1024 ** 3 }],
        }));
      }
      return new Response("missing", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeComfyuiSystemStats("127.0.0.1:8188/")).resolves.toEqual({
      ok: true,
      summary: "Python 3.12.4 · NVIDIA RTX 4090 · 24GB 显存",
      version: "0.3.50",
      protocol: "enhanced",
    });
    expect(fetchMock.mock.calls.map(([input]) => String(input)).sort()).toEqual([
      "http://127.0.0.1:8188/features",
      "http://127.0.0.1:8188/system_stats",
    ]);
  });

  it("旧服没有 /features 时仍可连接，并明确标记兼容模式", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/features")) return new Response("missing", { status: 404 });
      return new Response(JSON.stringify({ system: {}, devices: [] }));
    }));

    await expect(probeComfyuiSystemStats("http://old-comfy:8188")).resolves.toEqual({
      ok: true,
      summary: "已连上 ComfyUI",
      version: undefined,
      protocol: "compatibility",
    });
  });
});

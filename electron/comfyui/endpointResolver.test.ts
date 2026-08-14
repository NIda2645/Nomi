import { describe, expect, it } from "vitest";
import { comfyuiEndpoint, comfyuiJobCancelEndpoint, comfyuiWebSocketUrl, normalizeComfyuiBaseUrl } from "./endpointResolver";

describe("ComfyUI endpoint resolver", () => {
  it("规范化默认地址、裸 host 和尾斜杠", () => {
    expect(normalizeComfyuiBaseUrl("")).toBe("http://127.0.0.1:8188");
    expect(normalizeComfyuiBaseUrl("127.0.0.1:8188/")).toBe("http://127.0.0.1:8188");
  });

  it("保留反代子路径并正确编码任务 id", () => {
    expect(comfyuiEndpoint("https://host/comfy/", "prompt")).toBe("https://host/comfy/prompt");
    expect(comfyuiEndpoint("https://host/comfy", "history", "a/b")).toBe("https://host/comfy/history/a%2Fb");
    expect(comfyuiEndpoint("host:8188/comfy/", "objectInfo", "Custom/Node")).toBe("http://host:8188/comfy/object_info/Custom%2FNode");
  });

  it("jobs cancel 使用 /api，已带 /api 时不重复", () => {
    expect(comfyuiJobCancelEndpoint("http://h:8188", "abc")).toBe("http://h:8188/api/jobs/abc/cancel");
    expect(comfyuiJobCancelEndpoint("http://h:8188/api", "abc")).toBe("http://h:8188/api/jobs/abc/cancel");
  });

  it("ws client id 经 URLSearchParams 编码", () => {
    expect(comfyuiWebSocketUrl("https://h/comfy", "nomi a/b")).toBe("wss://h/comfy/ws?clientId=nomi+a%2Fb");
  });
});

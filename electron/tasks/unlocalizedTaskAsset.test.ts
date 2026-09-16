// 任务没有项目身份时，资产必须带 providerUrl 易失标记（绝不裸存 CDN url，让兜底链与补救本地化有据可依）。
import { describe, expect, it } from "vitest";
import { unlocalizedTaskAsset } from "./unlocalizedTaskAsset";

describe("unlocalizedTaskAsset — 无项目上下文时绝不再裸存 CDN url", () => {
  it("http(s) 结果把同一链接标进 providerUrl（易失标记）", () => {
    const asset = unlocalizedTaskAsset("video", "https://cdn.vendor.com/a.mp4");
    expect(asset.url).toBe("https://cdn.vendor.com/a.mp4");
    expect(asset.providerUrl).toBe("https://cdn.vendor.com/a.mp4");
    expect(asset.thumbnailUrl).toBeNull();
  });

  it("图片补 thumbnailUrl；非 http 链接 providerUrl 置 null", () => {
    const asset = unlocalizedTaskAsset("image", "data:image/png;base64,xx");
    expect(asset.thumbnailUrl).toBe("data:image/png;base64,xx");
    expect(asset.providerUrl).toBeNull();
  });

  it("音频脚本结果在无项目上下文时仍保留 audio 类型", () => {
    const asset = unlocalizedTaskAsset("audio", "https://cdn.vendor.com/voice.mp3");
    expect(asset).toMatchObject({
      type: "audio",
      url: "https://cdn.vendor.com/voice.mp3",
      thumbnailUrl: null,
      providerUrl: "https://cdn.vendor.com/voice.mp3",
    });
  });
});

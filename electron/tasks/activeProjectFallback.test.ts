// 「生成的视频第二天加载不出来」根因闸：projectId 空窗时主进程跳过本地化、存下会过期的
// CDN URL。锁两件事：① 活动项目注册表 set/get 语义；② 确实无项目时资产必须带 providerUrl
// 易失标记（绝不再裸存 CDN url，让兜底链与补救本地化有据可依）。
import { afterEach, describe, expect, it } from "vitest";
import {
  activeTaskProjectFallback,
  rememberActiveProjectForTasks,
  unlocalizedTaskAsset,
} from "./activeProjectFallback";

afterEach(() => rememberActiveProjectForTasks(""));

describe("活动项目注册表", () => {
  it("记住 → 读回；trim；清空即空", () => {
    rememberActiveProjectForTasks("  proj-1  ");
    expect(activeTaskProjectFallback()).toBe("proj-1");
    rememberActiveProjectForTasks("");
    expect(activeTaskProjectFallback()).toBe("");
  });

  it("非字符串输入不炸、归空", () => {
    rememberActiveProjectForTasks(undefined as unknown as string);
    expect(activeTaskProjectFallback()).toBe("");
  });
});

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

import { describe, it, expect } from "vitest";
import { buildMultiframeArgs, splitTransitionLines } from "./dreaminaCodec";

describe("splitTransitionLines", () => {
  it("按行拆 + 去空去首尾空格", () => {
    expect(splitTransitionLines("A→B\n  B→C  \n\nC→D")).toEqual(["A→B", "B→C", "C→D"]);
    expect(splitTransitionLines("")).toEqual([]);
  });
});

describe("buildMultiframeArgs（按图数变形）", () => {
  // 回归守门（P0，v1.4.14）：multiframe2video 的 --video_resolution 是 required——**任何图数下都必须发出**，
  // 否则 CLI 硬拒 `required flag(s) "video_resolution" not set`。此前档案漏声明 + buildMultiframeArgs 不发它 → 每次多帧提交必挂。
  it("required：任何图数都发 --video_resolution（720p/1080p），漏发即 CLI 硬拒", () => {
    const two = buildMultiframeArgs({ imagePaths: ["/a", "/b"], prompt: "p", transitionLines: [], videoResolution: "1080p" });
    expect(two).toContain("--video_resolution=1080p");
    const three = buildMultiframeArgs({ imagePaths: ["/a", "/b", "/c"], prompt: "p", transitionLines: ["x", "y"], videoResolution: "720p" });
    expect(three).toContain("--video_resolution=720p");
    // 缺省/非法回落 720p（多帧不支持 480p/4k）
    const missing = buildMultiframeArgs({ imagePaths: ["/a", "/b"], prompt: "p", transitionLines: [] });
    expect(missing).toContain("--video_resolution=720p");
    const bad = buildMultiframeArgs({ imagePaths: ["/a", "/b"], prompt: "p", transitionLines: [], videoResolution: "480p" });
    expect(bad).toContain("--video_resolution=720p");
  });

  it("2 图：shorthand --prompt + --duration，不发 transition", () => {
    const args = buildMultiframeArgs({ imagePaths: ["/a.png", "/b.png"], prompt: "角色转身", transitionLines: ["角色转身"], duration: 4, videoResolution: "720p" });
    expect(args).toEqual(["multiframe2video", "--images=/a.png,/b.png", "--video_resolution=720p", "--prompt=角色转身", "--duration=4", "--poll=30"]);
  });

  it("3 图：N-1=2 句 --transition-prompt，不发 --prompt/--duration", () => {
    const args = buildMultiframeArgs({ imagePaths: ["/a.png", "/b.png", "/c.png"], prompt: "白天到黄昏\n黄昏到夜晚", transitionLines: ["白天到黄昏", "黄昏到夜晚"], duration: 5, videoResolution: "1080p" });
    expect(args).toEqual([
      "multiframe2video", "--images=/a.png,/b.png,/c.png", "--video_resolution=1080p",
      "--transition-prompt=白天到黄昏", "--transition-prompt=黄昏到夜晚", "--poll=30",
    ]);
    expect(args).not.toContain("--prompt=白天到黄昏\n黄昏到夜晚");
  });

  it("3 图但过渡只给 1 句：用它补齐到 N-1=2 句", () => {
    const args = buildMultiframeArgs({ imagePaths: ["/a", "/b", "/c"], prompt: "渐变", transitionLines: ["渐变"], duration: 3, videoResolution: "720p" });
    expect(args.filter((a) => a.startsWith("--transition-prompt="))).toEqual(["--transition-prompt=渐变", "--transition-prompt=渐变"]);
  });

  it("4 图给 5 句：截断到 N-1=3 句", () => {
    const args = buildMultiframeArgs({ imagePaths: ["/a", "/b", "/c", "/d"], prompt: "p", transitionLines: ["1", "2", "3", "4", "5"], duration: 3, videoResolution: "720p" });
    expect(args.filter((a) => a.startsWith("--transition-prompt="))).toEqual(["--transition-prompt=1", "--transition-prompt=2", "--transition-prompt=3"]);
  });

  it("3 图无过渡行：用主提示当填充", () => {
    const args = buildMultiframeArgs({ imagePaths: ["/a", "/b", "/c"], prompt: "整体氛围", transitionLines: [], duration: 3, videoResolution: "720p" });
    expect(args.filter((a) => a.startsWith("--transition-prompt="))).toEqual(["--transition-prompt=整体氛围", "--transition-prompt=整体氛围"]);
  });
});

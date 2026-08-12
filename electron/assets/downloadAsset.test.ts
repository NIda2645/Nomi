// 下载另存文件名加固（2026-07-30 群反馈「下载改保存名闪退」的 defaultPath 半边）。
// Windows 原生保存对话框在 defaultPath 文件名含非法/控制字符、尾部点空格、保留设备名时会异常；
// 这些字符若进 defaultPath 就是闪退面之一。sanitizeDownloadName 是纯函数，直接钉规则。
// （另一半根因=给对话框传父窗口造成跨线程模态属主，已彻底不传；见 downloadAsset.ts 根因注释
//   与 nativeDialogParent.invariant.test.ts 的全仓结构闸。）
import { describe, expect, it } from "vitest";
import { sanitizeDownloadName } from "./downloadAsset";

describe("sanitizeDownloadName", () => {
  it("去文件系统非法字符，保留中文/连字符/数字", () => {
    expect(sanitizeDownloadName("镜头-1:图<片>2")).toBe("镜头-1图片2");
  });

  it("去控制字符（含 NUL/0x1F），不把它们带进 defaultPath", () => {
    const withControls = "a" + String.fromCharCode(0) + "b" + String.fromCharCode(31) + "c";
    expect(sanitizeDownloadName(withControls)).toBe("abc");
  });

  it("Windows：文件名不能以「.」或空格结尾", () => {
    expect(sanitizeDownloadName("镜头 1.")).toBe("镜头 1");
    expect(sanitizeDownloadName("scene   ")).toBe("scene");
    expect(sanitizeDownloadName("a. . ")).toBe("a");
  });

  it("Windows 保留设备名加前缀避开；非保留名不动", () => {
    expect(sanitizeDownloadName("CON")).toBe("_CON");
    expect(sanitizeDownloadName("nul.png")).toBe("_nul.png");
    expect(sanitizeDownloadName("com1")).toBe("_com1");
    expect(sanitizeDownloadName("console")).toBe("console"); // con 后跟 s，非保留名
  });

  it("超长截断到 120 字符", () => {
    expect(sanitizeDownloadName("镜".repeat(200))).toHaveLength(120);
  });

  it("空 / 纯非法字符 → 空串（由调用方兜底成 nomi-asset）", () => {
    expect(sanitizeDownloadName("")).toBe("");
    expect(sanitizeDownloadName('///:::"')).toBe("");
  });
});

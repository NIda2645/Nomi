import { describe, expect, it } from "vitest";
import { buildDownloadPageUrl } from "./downloadPage";

describe("buildDownloadPageUrl", () => {
  it("passes the exact Apple Silicon architecture to the website", () => {
    const url = new URL(buildDownloadPageUrl("darwin", "arm64"));
    expect(url.origin).toBe("https://nomiaqm.com");
    expect(url.searchParams.get("download")).toBe("1");
    expect(url.searchParams.get("source")).toBe("app-update");
    expect(url.searchParams.get("platform")).toBe("darwin");
    expect(url.searchParams.get("arch")).toBe("arm64");
  });

  it("keeps Intel macOS explicit instead of relying on browser detection", () => {
    const url = new URL(buildDownloadPageUrl("darwin", "x64"));
    expect(url.searchParams.get("arch")).toBe("x64");
  });
});

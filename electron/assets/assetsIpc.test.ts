import { describe, expect, it } from "vitest";
import { parseCopyFilesPayload, readClipboardFilePathsFromFormats } from "./assetsIpc";

describe("assets IPC contracts", () => {
  it("reads the first supported clipboard file format with paths", () => {
    const result = readClipboardFilePathsFromFormats(
      ["text/plain", "public.file-url"],
      (format) => Buffer.from(format === "public.file-url" ? "file:///tmp/hero.png\0" : "ignored"),
    );

    expect(result).toEqual(["/tmp/hero.png"]);
  });

  it("normalizes copy-files payloads and rejects invalid values", () => {
    expect(parseCopyFilesPayload({ projectId: "p1", paths: ["/tmp/a.png", "/tmp/a.png", 3] })).toEqual({
      projectId: "p1",
      paths: ["/tmp/a.png"],
    });
    expect(parseCopyFilesPayload({ projectId: "", paths: ["/tmp/a.png"] })).toBeNull();
    expect(parseCopyFilesPayload({ projectId: "p1", paths: [] })).toBeNull();
  });
});

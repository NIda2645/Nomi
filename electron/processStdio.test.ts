import { describe, expect, it, vi } from "vitest";
import { installProcessStdioErrorGuards } from "./processStdio";

function createStream() {
  let listener: ((error: unknown) => void) | undefined;
  const stream = {
    on: vi.fn((_event: "error", next: (error: unknown) => void) => {
      listener = next;
      return stream;
    }),
  };
  return { stream, emitError: (error: unknown) => listener?.(error) };
}

describe("installProcessStdioErrorGuards", () => {
  it("absorbs output-stream errors without writing back to console", () => {
    const stdout = createStream();
    const stderr = createStream();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    installProcessStdioErrorGuards({ stdout: stdout.stream, stderr: stderr.stream });

    expect(stdout.stream.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(stderr.stream.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(() => stdout.emitError(Object.assign(new Error("write EIO"), { code: "EIO" }))).not.toThrow();
    expect(() => stderr.emitError(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }))).not.toThrow();
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runAntigravityProcess, buildAntigravityEnv } from "./antigravityProcess";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
async function fixture(mode: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "nomi-agy-test-")); dirs.push(dir);
  return { dir, invocation: { command: process.execPath,
    args: [path.resolve("electron/ai/fixtures/antigravity.mjs"), mode, dir] } };
}

describe("Antigravity process ownership", () => {
  it("handles split NDJSON and closes stdin after one prompt; removes its workspace", async () => {
    const f = await fixture("success"); const onDelta = vi.fn();
    const result = await runAntigravityProcess({ prompt: "write a scene", onDelta }, { invocation: f.invocation });
    expect(result.text).toBe("你好");
    expect(onDelta.mock.calls.flat().join("")).toBe("你好");
    expect(JSON.parse(await readFile(path.join(f.dir, "input"), "utf8")))
      .toEqual({ event: "user", message: { content: "write a scene" } });
    const cwd = await readFile(path.join(f.dir, "cwd"), "utf8");
    await expect(stat(cwd)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("withholds the prompt when tools are enabled", async () => {
    const f = await fixture("tools");
    await expect(runAntigravityProcess({ prompt: "secret task" }, { invocation: f.invocation })).rejects.toThrow("ISOLATION");
    await expect(readFile(path.join(f.dir, "input"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it.each(["malformed", "malformed-tail", "trailing-garbage", "missing", "duplicate", "nonzero"])("rejects partial output: %s", async (mode) => {
    const f = await fixture(mode);
    await expect(runAntigravityProcess({ prompt: "test" }, { invocation: f.invocation })).rejects.toThrow();
  });
  it("distinguishes login from protocol errors", async () => {
    const f = await fixture("auth");
    await expect(runAntigravityProcess({ prompt: "test" }, { invocation: f.invocation })).rejects.toThrow("LOGIN_REQUIRED");
  });
  it("times out before init without sending a prompt", async () => {
    const f = await fixture("hang");
    await expect(runAntigravityProcess({ prompt: "test" }, { invocation: f.invocation, initTimeoutMs: 100 })).rejects.toThrow("INIT_TIMEOUT");
    await expect(readFile(path.join(f.dir, "input"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("cancels its owned child and rejects with AbortError", async () => {
    const f = await fixture("hang"); const controller = new AbortController();
    const run = runAntigravityProcess({ prompt: "test", signal: controller.signal }, { invocation: f.invocation });
    setTimeout(() => controller.abort(), 80);
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
  });
  it("enforces the overall timeout and kills a child that ignores SIGTERM", async () => {
    const f = await fixture("stuck");
    await expect(runAntigravityProcess({ prompt: "test" }, { invocation: f.invocation, timeoutMs: 2_000 }))
      .rejects.toThrow("ANTIGRAVITY_TIMEOUT");
    await expect(stat(await readFile(path.join(f.dir, "cwd"), "utf8"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("does not inherit API credentials or arbitrary app secrets", () => {
    expect(buildAntigravityEnv({ HOME: "/user", PATH: "/bin", GEMINI_API_KEY: "private", AGNES_API_KEY: "private", OTHER_SECRET: "private" }))
      .toEqual({ HOME: "/user", PATH: "/bin" });
  });
  it.skipIf(process.platform === "win32")("kills inherited-pipe descendants even after the CLI exits", async () => {
    const f = await fixture("descendant");
    await expect(runAntigravityProcess({ prompt: "test" }, { invocation: f.invocation, timeoutMs: 2_000 })).rejects.toThrow("TIMEOUT");
    const pid = Number(await readFile(path.join(f.dir, "child-pid"), "utf8"));
    expect(() => process.kill(pid, 0)).toThrow();
    await expect(stat(await readFile(path.join(f.dir, "cwd"), "utf8"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it.skipIf(process.platform === "win32").each(["success", "cancel"])("cleans silent SIGTERM-ignoring descendants on %s before returning", async (outcome) => {
    const f = await fixture("silent-descendant-" + outcome);
    const controller = new AbortController();
    const run = runAntigravityProcess({ prompt: "test", signal: controller.signal }, { invocation: f.invocation });
    const settled = run.then((value) => ({ value, error: undefined }), (error: Error) => ({ value: undefined, error }));
    let pid = 0;
    try {
      await vi.waitFor(async () => { pid = Number(await readFile(path.join(f.dir, "child-pid"), "utf8")); }, { timeout: 3_000 });
      if (outcome === "cancel") controller.abort();
      const result = await settled;
      if (outcome === "cancel") expect(result.error?.name).toBe("AbortError");
      else expect(result.value?.text).toBe("你好");
      expect(() => process.kill(pid, 0)).toThrow();
      await expect(stat(await readFile(path.join(f.dir, "cwd"), "utf8"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      controller.abort();
      if (pid) { try { process.kill(pid, "SIGKILL"); } catch { /* already reaped */ } }
      await settled;
    }
  });
  it.skipIf(process.platform === "win32")("honors cancellation during asynchronous descendant cleanup", async () => {
    const f = await fixture("silent-descendant-success"); const controller = new AbortController();
    const kill = process.kill.bind(process);
    const spy = vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid < 0 && signal === "SIGKILL") queueMicrotask(() => controller.abort());
      return kill(pid, signal);
    });
    try {
      await expect(runAntigravityProcess({ prompt: "test", signal: controller.signal }, { invocation: f.invocation }))
        .rejects.toMatchObject({ name: "AbortError" });
    } finally { spy.mockRestore(); }
  });
});

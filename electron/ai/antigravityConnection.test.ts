import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import { AntigravityConnection, parseAntigravityModels, probeAntigravity } from "./antigravityConnection";
const result = { text: "OK", conversationId: "one", usage: {} };
const discovery = { version: "1.1.21", models: [{ id: "gemini-3.7-flash-high", label: "Gemini 3.7 Flash (High)" }] };
function service(run = vi.fn().mockResolvedValue(result), probe = vi.fn().mockResolvedValue(discovery)) {
  return { run, probe, connection: new AntigravityConnection({ probe, run, bin: () => "/test/agy" }) };
}
describe("Antigravity connection state", () => {
  it("does not confuse installation/authentication with a successful model test", async () => {
    const { connection, run } = service();
    const status = await connection.status();
    expect(status.state).toBe("unverified");
    expect(status.models).toEqual([{ id: "auto", label: "Antigravity CLI" }, ...discovery.models]);
    expect(connection.canEnable()).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect((await connection.test()).state).toBe("ready");
    expect((await connection.status()).state).toBe("ready");
  });
  it("reports login failure and invalidates previously successful state", async () => {
    const { connection, probe } = service();
    await connection.test();
    probe.mockRejectedValue(new Error("ANTIGRAVITY_LOGIN_REQUIRED"));
    const status = await connection.status();
    expect(status.state).toBe("login-required");
    expect(status.models).toEqual([]);
    expect(connection.canEnable()).toBe(false);
  });
  it.each(["ANTIGRAVITY_PROFILE_UNVERIFIED", "ANTIGRAVITY_INVALID_INIT"])("keeps an invalid runtime profile limited: %s", async (code) => {
    const { connection } = service(vi.fn().mockRejectedValue(new Error(code)));
    expect((await connection.test()).state).toBe("limited");
  });
  it("clears the previous model list when a new test cannot discover the account", async () => {
    const { connection, probe } = service();
    await connection.status();
    probe.mockRejectedValue(new Error("ANTIGRAVITY_LOGIN_REQUIRED"));
    expect((await connection.test()).models).toEqual([]);
  });
  it("cancels an ongoing test and rejects its late result as readiness evidence", async () => {
    let resolve!: (value: typeof result) => void;
    const { connection } = service(vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; })));
    const pending = connection.test();
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    connection.cancel(); resolve(result);
    expect((await pending).state).not.toBe("ready");
    expect(connection.canEnable()).toBe(false);
  });
});

describe("official CLI model discovery TSV", () => {
  it("closes unused stdin so model discovery can terminate", async () => {
    const found = await probeAntigravity(undefined, {
      invocation: { command: process.execPath, args: [path.resolve("electron/ai/fixtures/antigravity.mjs"), "discovery", "."] },
      env: process.env,
    });
    expect(found).toEqual(discovery);
  });
  it("preserves returned IDs and labels without inferring capabilities or account eligibility", () => {
    expect(parseAntigravityModels("gemini-3.7-flash-high\tGemini 3.7 Flash (High)\r\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\r\n"))
      .toEqual([...discovery.models, { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)" }]);
  });
  it.each(["", "[]", "Please sign in", "id\t", "--model\tLabel", "one\tLabel\textra", "one\tA\none\tB", "one\tBad\u0000label"])("rejects malformed discovery: %j", (text) => {
    expect(() => parseAntigravityModels(text)).toThrow("ANTIGRAVITY_MODELS_INVALID");
  });
});

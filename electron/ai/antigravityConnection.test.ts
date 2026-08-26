import { describe, expect, it, vi } from "vitest";
import { AntigravityConnection } from "./antigravityConnection";
const result = { text: "OK", conversationId: "one", usage: {} };
function service(run = vi.fn().mockResolvedValue(result), probe = vi.fn().mockResolvedValue("1.1.21")) {
  return { run, probe, connection: new AntigravityConnection({ probe, run, bin: () => "/test/agy" }) };
}
describe("Antigravity connection state", () => {
  it("does not confuse installation/authentication with a successful model test", async () => {
    const { connection, run } = service();
    expect((await connection.status()).state).toBe("unverified");
    expect(run).not.toHaveBeenCalled();
    expect((await connection.test()).state).toBe("ready");
    expect((await connection.status()).state).toBe("ready");
  });
  it("reports login failure and invalidates previously successful state", async () => {
    const { connection, probe } = service();
    await connection.test();
    probe.mockRejectedValue(new Error("ANTIGRAVITY_LOGIN_REQUIRED"));
    expect((await connection.status()).state).toBe("login-required");
    expect(connection.canEnable()).toBe(false);
  });
  it("does not turn protocol isolation failure into a ready connection", async () => {
    const { connection } = service(vi.fn().mockRejectedValue(new Error("ANTIGRAVITY_TEXT_ISOLATION_UNVERIFIED")));
    expect((await connection.test()).state).toBe("limited");
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

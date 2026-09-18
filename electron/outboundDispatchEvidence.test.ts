import { describe, expect, it } from "vitest";

import { describeOutboundFailure, outboundRequestWasNeverWritten } from "./outboundDispatchEvidence";

/** undici 的 SocketError 形状：带 code 与这条连接的字节计数。 */
function socketError(message: string, bytesWritten: number | undefined, bytesRead: number | undefined) {
  return Object.assign(new Error(message), {
    name: "SocketError",
    code: "UND_ERR_SOCKET",
    socket: { bytesWritten, bytesRead },
  });
}

/** `fetch()` 抛出来的真实形状：外壳恒为 `TypeError: fetch failed`，真相在 cause 里。 */
function fetchFailed(cause: unknown) {
  return Object.assign(new TypeError("fetch failed"), { cause });
}

describe("outboundRequestWasNeverWritten", () => {
  it("从连接池取到一条对面已关的 keep-alive 连接 = 可证明没写出去", () => {
    // 这正是 2026-09-18 C9 那条红的现场：服务端按 5s keep-alive 干净关掉空闲连接，
    // 客户端下一次请求写在这条连接上，两边字节计数都是 0。
    expect(outboundRequestWasNeverWritten(fetchFailed(socketError("other side closed", 0, 0)))).toBe(true);
  });

  it("写出去之后才断 = 结果未知，绝不算没写出去", () => {
    expect(outboundRequestWasNeverWritten(fetchFailed(socketError("other side closed", 512, 0)))).toBe(false);
    expect(outboundRequestWasNeverWritten(fetchFailed(socketError("other side closed", 512, 128)))).toBe(false);
  });

  it("字节计数缺失时 fail-closed：拿不出证据就是 unknown", () => {
    expect(outboundRequestWasNeverWritten(fetchFailed(socketError("other side closed", undefined, undefined)))).toBe(false);
    expect(outboundRequestWasNeverWritten(fetchFailed(socketError("other side closed", 0, undefined)))).toBe(false);
  });

  it("建连阶段失败（connect / DNS / 建连超时）= 可证明没写出去", () => {
    expect(outboundRequestWasNeverWritten(fetchFailed(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), { code: "ECONNREFUSED", syscall: "connect" })))).toBe(true);
    expect(outboundRequestWasNeverWritten(fetchFailed(Object.assign(new Error("getaddrinfo ENOTFOUND x"), { code: "ENOTFOUND", syscall: "getaddrinfo" })))).toBe(true);
    expect(outboundRequestWasNeverWritten(fetchFailed(Object.assign(new Error("Connect Timeout Error"), { code: "UND_ERR_CONNECT_TIMEOUT" })))).toBe(true);
  });

  it("响应头超时 = 请求已经写出去了，只是没等到回音 ⇒ unknown", () => {
    expect(outboundRequestWasNeverWritten(fetchFailed(Object.assign(new Error("Headers Timeout Error"), { code: "UND_ERR_HEADERS_TIMEOUT" })))).toBe(false);
  });

  it("读响应体读一半断（已经收到过响应头）⇒ unknown", () => {
    expect(outboundRequestWasNeverWritten(Object.assign(new Error("terminated"), { code: "UND_ERR_BODY_TIMEOUT" }))).toBe(false);
  });

  it("没有 cause、非 Error、成环的 cause 都不会把它判成 not_written 或卡死", () => {
    expect(outboundRequestWasNeverWritten(new TypeError("fetch failed"))).toBe(false);
    expect(outboundRequestWasNeverWritten("fetch failed")).toBe(false);
    expect(outboundRequestWasNeverWritten(null)).toBe(false);
    const looped: { cause?: unknown; code?: string } = {};
    looped.cause = looped;
    expect(outboundRequestWasNeverWritten(looped)).toBe(false);
  });

  it("describeOutboundFailure 把 cause 链摊平，不再只剩一句 fetch failed", () => {
    const described = describeOutboundFailure(fetchFailed(socketError("other side closed", 0, 0)));
    expect(described).toBe("TypeError: fetch failed ← SocketError UND_ERR_SOCKET: other side closed");
  });

  it("describeOutboundFailure 只取 name/code/message，不带 socket 地址端口进日志", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED", syscall: "connect", address: "10.0.0.9", port: 443,
    });
    const described = describeOutboundFailure(fetchFailed(cause));
    expect(described).not.toContain("10.0.0.9");
    expect(described).not.toContain("443");
    expect(described).toContain("ECONNREFUSED");
  });
});

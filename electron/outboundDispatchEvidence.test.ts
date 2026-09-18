import { describe, expect, it } from "vitest";

import { describeOutboundFailure, outboundRequestWasNeverWritten } from "./outboundDispatchEvidence";

/**
 * undici 的 SocketError 形状。字节计数**刻意带上**：它们是整条连接累计的，
 * keep-alive 复用时永远不是 0——判据不许再去看它们（第一版看了，CI 当场证伪）。
 */
function socketError(message: string, bytesWritten = 4096, bytesRead = 2048) {
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
  it("从连接池取到一条对面已关的 keep-alive 连接 = 没写出去（2026-09-18 CI 上的真实错误）", () => {
    // 现场：服务端按 5s keep-alive 干净关掉空闲连接，客户端下一次请求写在这条连接上，
    // `fetch()` 抛 TypeError: fetch failed ← SocketError UND_ERR_SOCKET: other side closed。
    expect(outboundRequestWasNeverWritten(fetchFailed(socketError("other side closed")))).toBe(true);
  });

  it("判据不看字节计数：那是整条连接累计的，复用时永远不是 0（第一版看了，被 CI 证伪）", () => {
    expect(outboundRequestWasNeverWritten(fetchFailed(socketError("other side closed", 4096, 2048)))).toBe(true);
    expect(outboundRequestWasNeverWritten(fetchFailed(socketError("other side closed", 0, 0)))).toBe(true);
    expect(outboundRequestWasNeverWritten(fetchFailed(socketError("other side closed", undefined, undefined)))).toBe(true);
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

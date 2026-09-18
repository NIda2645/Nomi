/**
 * 「这次出站请求，到底有没有发出去过？」——**唯一**回答它的地方。
 *
 * 一次付费提交失败只有两种性质完全不同的可能：**一个字节都没写出去**（连不上、DNS 解不出、
 * 从连接池里取到一条对面已经关掉的 keep-alive 连接）——供应商那边什么都没发生；
 * 或者**写出去了但结果不知道**（写完才断、响应头等超时）——可能已经收下并扣费。
 * 两者在 `fetch()` 抛出来时长得一模一样（`TypeError: fetch failed`），真相全在 `error.cause` 里。
 *
 * 判据**只许拿得出证据才说没写出去**，其余一律 `unknown`：判错成「没写出去」的代价是重复扣一次钱，
 * 反过来只是多一次人工对账。两边不对称，所以闸门偏向不重发。
 *
 * 只用在 `fetch()` **自己抛出**的那条路上（此时根本没有 Response，也就不可能收到过响应头）；
 * 读响应体读到一半失败已经收到过响应头，永远是 `unknown`。
 *
 * 由来与现场证据见 `docs/fixes/2026-09-18-submission-not-dispatched.root-cause.json`。
 */

type ErrorLike = {
  code?: unknown;
  syscall?: unknown;
  cause?: unknown;
  message?: unknown;
  name?: unknown;
};

/** DNS 解析失败：连接从未建立，请求不可能写出去。 */
const DNS_CODES = new Set(["ENOTFOUND", "EAI_AGAIN"]);

/** undici 建连阶段就超时/失败：同上。 */
const CONNECT_CODES = new Set(["UND_ERR_CONNECT_TIMEOUT", "ERR_SOCKET_CONNECTION_TIMEOUT"]);

function asErrorLike(value: unknown): ErrorLike | null {
  return value && typeof value === "object" ? (value as ErrorLike) : null;
}

/** 把 `error.cause` 链摊平（最多 5 层，防自引用成环）。 */
function causeChain(error: unknown): ErrorLike[] {
  const chain: ErrorLike[] = [];
  let current = asErrorLike(error);
  while (current && !chain.includes(current) && chain.length < 5) {
    chain.push(current);
    current = asErrorLike(current.cause);
  }
  return chain;
}

function provesNotWritten(node: ErrorLike): boolean {
  const code = typeof node.code === "string" ? node.code : "";
  // 建连阶段失败（`syscall: "connect"` 覆盖 ECONNREFUSED / EHOSTUNREACH / ENETUNREACH / 连接 ETIMEDOUT）。
  if (node.syscall === "connect") return true;
  if (DNS_CODES.has(code) || CONNECT_CODES.has(code)) return true;
  // undici 的 SocketError：对面在**没有给出任何响应字节**的情况下把连接关了。
  //
  // 为什么不看 `socket.bytesWritten/bytesRead`（第一版看了，CI 当场证伪）：那两个计数是
  // **整条连接累计**的。keep-alive 复用的连接上一次请求早就写过字节，所以复用场景下它们
  // 永远不是 0，按它判会把真正的「没写出去」判成 unknown——2026-09-18 PR #810 第一轮 CI
  // 拿到的真实错误就是这样（`SocketError UND_ERR_SOCKET: other side closed`，计数无从归属）。
  //
  // 真正的判据是这条路本身：本函数只用在 `fetch()` **自己抛出**的那一刻，此时连 Response
  // 都没有，也就不可能收到过任何响应头；而对面是在 keep-alive 边界上主动关的连接。
  // HTTP/1.1 对这一幕有明确规定（RFC 9112 §9.6 连接关闭与重试）：这样关掉的连接上，
  // 请求没有被处理，客户端可以在新连接上重试。
  if (code === "UND_ERR_SOCKET") return true;
  return false;
}

/**
 * 这次 `fetch()` 的失败，能不能**证明**请求一个字节都没写出去？证明不了就是 false。
 */
export function outboundRequestWasNeverWritten(error: unknown): boolean {
  return causeChain(error).some(provesNotWritten);
}

/**
 * 把 cause 链摊成一句可记日志的话。
 *
 * 为什么非有不可：undici 外壳永远只说 `fetch failed`，真正的原因全在 cause 里。
 * 用户看到的、日志里留下的、我们排查时唯一能拿到的那句话，此前就是这四个字——
 * 2026-09-18 那条红烧掉了整整三轮 CI 才把 cause 挖出来。
 *
 * 只取 `name` / `code` / `message`：cause 上还挂着 socket 地址端口这类东西，
 * 不该进日志（日志脱敏的规矩见 `logging/redact.ts`）。
 */
export function describeOutboundFailure(error: unknown): string {
  return causeChain(error)
    .map((node) => {
      const name = typeof node.name === "string" && node.name ? node.name : "Error";
      const code = typeof node.code === "string" && node.code ? ` ${node.code}` : "";
      const message = typeof node.message === "string" ? node.message : "";
      return `${name}${code}${message ? `: ${message}` : ""}`;
    })
    .join(" ← ");
}

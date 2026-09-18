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
  socket?: { bytesWritten?: unknown; bytesRead?: unknown } | null;
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
  // undici 的 SocketError 会带上这条 socket 的字节计数。两边都是 0 = 这条连接上
  // 我们一个字节都没写、也一个字节都没读——典型形态就是从池里取到一条对面已经关掉的
  // keep-alive 连接（`other side closed`）。计数缺失时**不算证据**（fail-closed）。
  if (code === "UND_ERR_SOCKET") {
    const written = node.socket?.bytesWritten;
    const read = node.socket?.bytesRead;
    return written === 0 && read === 0;
  }
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

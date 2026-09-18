/**
 * 「这次出站请求，到底有没有发出去过？」——**唯一**回答它的地方。
 *
 * ── 为什么需要它（2026-09-18 · C9 间歇红的根因第一层）───────────────────────────
 *
 * 一次付费提交失败时，只有两种性质完全不同的失败：
 *   · **一个字节都没写出去**（连不上、DNS 解不出、从连接池里取到一条对面已经关掉的
 *     keep-alive 连接）——供应商那边什么都没发生，账本可以如实记成「这次没提交」；
 *   · **写出去了，但结果不知道**（写完了才断、响应头等超时）——供应商可能已经收下并开始扣费，
 *     只能等人去对账，绝不能自动再发一次。
 *
 * 这两者在 `fetch()` 抛出来时长得一模一样：`TypeError: fetch failed`，真相全在 `error.cause` 里。
 * 在这之前没有任何一层看 cause，于是两者一律被当成第二种：
 * 提交被写成 `submission_unknown`（「供应商可能已经接受任务，Nomi 不会自动重提」），
 * 这一镜从此只能人工对账，整条批次驱动跟着死掉。实测现场（CI run 35322059157）是
 * 第一种：夹具那侧的连接账本证明**那段时间服务端一个请求都没收到**，
 * 而服务端刚按 keep-alive 超时（Node 默认 5s）干净关掉了两条空闲连接。
 *
 * ── 判据为什么是这几条，以及为什么 fail-closed ───────────────────────────────────
 *
 * 「没写出去」必须是**能证明**的，不是「看起来像」。所以只有下面四类算证据，
 * 其余一律算 `unknown`——把「不知道」误判成「没发出去」的代价是重复扣一次钱，
 * 反过来的代价只是多一次人工对账。两边不对称，所以闸门偏向不重发。
 *
 * 另：本函数只该用在 `fetch()` **自己抛出**的那条路上（此时根本没有 Response，
 * 也就不可能收到过响应头）。读响应体读到一半失败是另一回事，那已经收到过响应头，
 * 永远是 `unknown`。
 */

/** 出站失败的两种性质。`not_written` 是**可证明**的那一种，其余一律 `unknown`（fail-closed）。 */
export type OutboundDispatchEvidence = "not_written" | "unknown";

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
  const seen = new Set<unknown>();
  while (current && !seen.has(current) && chain.length < 5) {
    seen.add(current);
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
 * 判定一次 `fetch()` 抛出的异常属于哪一种。只有拿得出证据才回 `not_written`。
 */
export function outboundDispatchEvidence(error: unknown): OutboundDispatchEvidence {
  return causeChain(error).some(provesNotWritten) ? "not_written" : "unknown";
}

/** `outboundDispatchEvidence(error) === "not_written"` 的可读别名（调用点读起来像句人话）。 */
export function outboundRequestWasNeverWritten(error: unknown): boolean {
  return outboundDispatchEvidence(error) === "not_written";
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

/**
 * 对等测试矩阵 · 出站报文的记录、归一化与逐字段差异。
 *
 * ── 为什么断「报文」而不是断「结果」 ────────────────────────────────────────────
 * 两条路各自出了一张图，不证明它们汇到了同一个编译器；只有**发给供应商的那串字节**
 * 逐字段相同才证明。2026-09-21 真机实测的那条（付款卡上选 2K、供应商收到 1k）在
 * 「有没有出图」这个判据下完全看不出来——两边都出了一张图。
 *
 * ── 归一化清单（只许删，加一项必须在这里写明理由）──────────────────────────────
 * 归一化只去掉**每次调用必然不同、且供应商不据此产出不同结果**的位：
 *   · `authorization` 头的密钥部分 → 只留「头名 + 方案词」的形状（密钥本就不许进断言/日志）；
 *   · body 里的幂等键 / requestId / nonce / 时间戳字段（见 VOLATILE_BODY_KEYS）。
 * **不归一化**任何参数值、模型串、提示词、参考图 URL——那些正是分裂会发生的地方。
 */

export type OutboundRecord = {
  /** 出站成功时的报文；入口今天根本发不出去时为 undefined，由 `failure` 说明。 */
  request?: {
    method: string;
    origin: string;
    path: string;
    /** 鉴权头的**形状**，永不含密钥：`Authorization: Bearer <redacted>`。 */
    authorization: string;
    contentType: string;
    body: unknown;
  };
  /** 这条入口今天走不到出站（抛错 / 被闸拒）时的机读失败身份。 */
  failure?: { code: string; message: string };
  /** 供诊断的附加事实（例如合同里被丢掉的字段），不进相等判据。 */
  notes?: Record<string, unknown>;
};

const VOLATILE_BODY_KEYS = new Set([
  "idempotencyKey", "idempotency_key", "requestId", "request_id",
  "nonce", "timestamp", "created_at", "createdAt", "traceId", "trace_id",
]);

/** 把密钥换成 `<redacted>`，只留「头名 + 方案词」的形状。 */
export function redactAuthorization(headers: Record<string, string>): string {
  const entry = Object.entries(headers).find(([key]) => {
    const lower = key.toLowerCase();
    return lower === "authorization" || lower === "x-api-key" || lower.endsWith("-api-key");
  });
  if (!entry) return "(none)";
  const [name, value] = entry;
  const scheme = /^([A-Za-z][A-Za-z0-9._-]*)\s+\S/.exec(value.trim());
  return `${name.toLowerCase()}: ${scheme ? `${scheme[1]} ` : ""}<redacted>`;
}

function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (VOLATILE_BODY_KEYS.has(key)) continue;
      out[key] = stripVolatile(child);
    }
    return out;
  }
  return value;
}

export function normalizeBody(body: unknown): unknown {
  return stripVolatile(body);
}

function flatten(value: unknown, prefix: string, sink: Map<string, unknown>): void {
  if (value !== null && typeof value === "object") {
    const entries = Array.isArray(value)
      ? value.map((child, index) => [String(index), child] as const)
      : Object.entries(value as Record<string, unknown>);
    if (!entries.length) sink.set(prefix, Array.isArray(value) ? "[]" : "{}");
    for (const [key, child] of entries) flatten(child, prefix ? `${prefix}.${key}` : key, sink);
    return;
  }
  sink.set(prefix, value);
}

export type FieldDifference = {
  /** 例如 `body.resolution` / `path` / `authorization` / `failure.code`。 */
  field: string;
  baseline: unknown;
  actual: unknown;
};

/** 摊平成可读的字段图，供逐条列差异（而不是只报「不等」）。 */
export function recordFields(record: OutboundRecord): Map<string, unknown> {
  const sink = new Map<string, unknown>();
  if (record.failure) {
    sink.set("failure.code", record.failure.code);
    return sink;
  }
  const request = record.request;
  if (!request) {
    sink.set("failure.code", "no_outbound_request");
    return sink;
  }
  sink.set("method", request.method);
  sink.set("origin", request.origin);
  sink.set("path", request.path);
  sink.set("authorization", request.authorization);
  sink.set("contentType", request.contentType);
  flatten(normalizeBody(request.body), "body", sink);
  return sink;
}

/** 以 baseline 为基准逐字段比，差异**逐条列出**（缺字段记为 `undefined`）。 */
export function diffRecords(baseline: OutboundRecord, actual: OutboundRecord): FieldDifference[] {
  const left = recordFields(baseline);
  const right = recordFields(actual);
  const fields = [...new Set([...left.keys(), ...right.keys()])].sort();
  const differences: FieldDifference[] = [];
  for (const field of fields) {
    const a = left.get(field);
    const b = right.get(field);
    if (Object.is(a, b)) continue;
    differences.push({ field, baseline: a, actual: b });
  }
  return differences;
}

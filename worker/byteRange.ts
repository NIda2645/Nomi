/**
 * Byte-range serving for static assets (RFC 9110 §14).
 *
 * Cloudflare's asset server answers every GET with the whole file — it only knows
 * 200/304/404 (workers-shared asset-worker/src/handler.ts). Safari and every iOS
 * browser refuse to play media from a server that ignores Range, so the site worker
 * owns ranges for everything it proxies from ASSETS. Semantics follow `send` /
 * `range-parser`: one range is served as 206, forms we do not serve (multiple ranges,
 * other units, malformed specs, a stale If-Range) fall back to the whole file, and a
 * range that starts past the end is 416.
 *
 * The runtime keeps a body's length on the stream, not in `Content-Length`, so the
 * length comes from the bytes themselves: counted once per ETag (the asset's content
 * hash, so a remembered length can never belong to other bytes).
 */

export type ByteRange = { start: number; end: number };
export type AssetsFetcher = { fetch(request: Request): Promise<Response> };
/** The Workers runtime's FixedLengthStream: sets Content-Length on a streamed body. */
export type FixedLengthStreamFactory = (length: number) => TransformStream<Uint8Array, Uint8Array>;

const lengthByETag = new Map<string, number>();

export function parseByteRange(header: string, size: number): ByteRange | "unsatisfiable" | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, first, last] = match;
  if (first === "" && last === "") return null;
  if (first === "") {
    const suffix = Number(last);
    if (suffix === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(first);
  if (last !== "" && Number(last) < start) return null;
  if (start >= size) return "unsatisfiable";
  return { start, end: last === "" ? size - 1 : Math.min(Number(last), size - 1) };
}

/** Length of the asset behind `etag`, or null when the bytes changed underneath us. */
async function assetLength(request: Request, etag: string, assets: AssetsFetcher): Promise<number | null> {
  const known = lengthByETag.get(etag);
  if (known !== undefined) return known;
  const whole = await assets.fetch(new Request(request.url));
  if (whole.status !== 200 || whole.headers.get("ETag") !== etag || whole.body === null) {
    await whole.body?.cancel();
    return null;
  }
  let length = 0;
  const reader = whole.body.getReader();
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) length += chunk.value.byteLength;
  lengthByETag.set(etag, length);
  return length;
}

function sliceBody(body: ReadableStream<Uint8Array>, { start, end }: ByteRange): ReadableStream<Uint8Array> {
  let offset = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const chunkStart = offset;
        offset += chunk.byteLength;
        if (offset <= start || chunkStart > end) return;
        controller.enqueue(chunk.subarray(Math.max(0, start - chunkStart), Math.min(chunk.byteLength, end + 1 - chunkStart)));
        if (offset > end) controller.terminate();
      },
    }),
  );
}

export async function serveAssetWithRanges(
  request: Request,
  assets: AssetsFetcher,
  fixedLength: FixedLengthStreamFactory,
): Promise<Response> {
  const response = await assets.fetch(request);
  const etag = response.headers.get("ETag");
  // Ranges address the stored bytes: only a whole, unencoded, identifiable file qualifies.
  if (response.status !== 200 || etag === null || response.headers.has("Content-Encoding")) return response;

  const headers = new Headers(response.headers);
  headers.set("Accept-Ranges", "bytes");
  const body = response.body;
  // Range is defined for GET only (RFC 9110 §14.2); HEAD and the rest get the plain answer.
  const rangeHeader = request.method === "GET" && body !== null ? request.headers.get("Range") : null;
  const ifRange = request.headers.get("If-Range");
  const size = rangeHeader === null || (ifRange !== null && ifRange !== etag) ? null : await assetLength(request, etag, assets);
  const range = rangeHeader === null || size === null ? null : parseByteRange(rangeHeader, size);

  if (body === null || size === null || range === null) return new Response(body, { status: 200, headers });

  if (range === "unsatisfiable") {
    await body.cancel();
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }

  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  const partial = sliceBody(body, range).pipeThrough(fixedLength(range.end - range.start + 1));
  return new Response(partial, { status: 206, headers });
}

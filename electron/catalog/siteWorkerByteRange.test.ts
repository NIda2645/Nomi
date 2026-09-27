import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type WorkerEnv } from "../../worker";

// Cloudflare's asset server answers every GET with the whole file (200/304/404 only),
// so the site worker owns byte ranges for what it proxies. These tests drive the real
// worker entry with an ASSETS binding that behaves like that asset server — including
// what `wrangler dev` showed: the runtime keeps the length on the body, so the asset
// response carries no Content-Length header.

const FILM = "https://nomiaqm.com/assets/video/nomi-0.22-film.mp4";
const BYTES = Uint8Array.from({ length: 64 }, (_, i) => i);
const ETAG = '"film-etag"';

function assetResponse(etag = ETAG, chunkSize = 7): Response {
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= BYTES.length) {
        controller.close();
        return;
      }
      controller.enqueue(BYTES.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=3600, must-revalidate",
      ETag: etag,
    },
  });
}

function envServing(response: () => Response): WorkerEnv {
  return { ASSETS: { fetch: async () => response() } };
}

async function get(headers: Record<string, string>, env = envServing(() => assetResponse())) {
  return worker.fetch(new Request(FILM, { headers }), env);
}

// The Workers runtime provides FixedLengthStream; this stand-in keeps its contract:
// it errors unless exactly `length` bytes pass through.
class FixedLengthStreamStandIn extends TransformStream<Uint8Array, Uint8Array> {
  static lengths: number[] = [];
  constructor(length: number) {
    let seen = 0;
    super({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > length) throw new Error(`FixedLengthStream overflow: ${seen} > ${length}`);
        controller.enqueue(chunk);
      },
      flush() {
        if (seen !== length) throw new Error(`FixedLengthStream underflow: ${seen} !== ${length}`);
      },
    });
    FixedLengthStreamStandIn.lengths.push(length);
  }
}

beforeEach(() => {
  FixedLengthStreamStandIn.lengths = [];
  vi.stubGlobal("FixedLengthStream", FixedLengthStreamStandIn);
});
afterEach(() => vi.unstubAllGlobals());

describe("site worker byte ranges (Safari/iOS media playback)", () => {
  it("answers Safari's two-byte probe with 206 and exactly those bytes", async () => {
    const response = await get({ Range: "bytes=0-1" });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-1/64");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([0, 1]);
    expect(FixedLengthStreamStandIn.lengths).toEqual([2]);
  });

  it("serves a range that starts and ends inside different chunks", async () => {
    const response = await get({ Range: "bytes=5-20" });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 5-20/64");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual(Array.from(BYTES.slice(5, 21)));
  });

  it("serves open-ended and suffix ranges, clamping the end to the file", async () => {
    const open = await get({ Range: "bytes=60-" });
    expect(open.headers.get("content-range")).toBe("bytes 60-63/64");
    expect(Array.from(new Uint8Array(await open.arrayBuffer()))).toEqual([60, 61, 62, 63]);

    const suffix = await get({ Range: "bytes=-3" });
    expect(suffix.headers.get("content-range")).toBe("bytes 61-63/64");
    expect(Array.from(new Uint8Array(await suffix.arrayBuffer()))).toEqual([61, 62, 63]);

    const past = await get({ Range: "bytes=10-999" });
    expect(past.headers.get("content-range")).toBe("bytes 10-63/64");
    expect((await past.arrayBuffer()).byteLength).toBe(54);
  });

  it("keeps the asset's own headers on a partial response", async () => {
    const response = await get({ Range: "bytes=0-1" });
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600, must-revalidate");
    expect(response.headers.get("etag")).toBe(ETAG);
  });

  it("answers an unsatisfiable range with 416 and the full size", async () => {
    const response = await get({ Range: "bytes=64-" });
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */64");
    expect(await response.text()).toBe("");
  });

  it("advertises ranges on a plain GET and returns the whole file", async () => {
    const response = await get({});
    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect((await response.arrayBuffer()).byteLength).toBe(64);
  });

  it("falls back to the whole file for range forms it does not serve", async () => {
    for (const range of ["bytes=0-1,4-5", "items=0-1", "bytes=9-3", "bytes=-"]) {
      const response = await get({ Range: range });
      expect(response.status, range).toBe(200);
      expect((await response.arrayBuffer()).byteLength, range).toBe(64);
    }
  });

  it("honours If-Range: a stale validator gets the whole file", async () => {
    const stale = await get({ Range: "bytes=0-1", "If-Range": '"old-etag"' });
    expect(stale.status).toBe(200);
    const fresh = await get({ Range: "bytes=0-1", "If-Range": ETAG });
    expect(fresh.status).toBe(206);
  });

  it("passes through responses it cannot slice", async () => {
    const notModified = await get(
      { Range: "bytes=0-1" },
      envServing(() => new Response(null, { status: 304, headers: { ETag: ETAG } })),
    );
    expect(notModified.status).toBe(304);

    const missing = await get({ Range: "bytes=0-1" }, envServing(() => new Response(null, { status: 404 })));
    expect(missing.status).toBe(404);

    const encoded = await get(
      { Range: "bytes=0-1" },
      envServing(() => {
        const response = assetResponse();
        response.headers.set("Content-Encoding", "br");
        return response;
      }),
    );
    expect(encoded.status).toBe(200);
    expect(encoded.headers.get("accept-ranges")).toBeNull();
  });

  it("ignores Range on HEAD but still advertises it", async () => {
    const response = await worker.fetch(
      new Request(FILM, { method: "HEAD", headers: { Range: "bytes=0-1" } }),
      envServing(() => new Response(null, { status: 200, headers: { ETag: ETAG } })),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
  });

  it("counts a file's length once per ETag and reuses it", async () => {
    const etag = '"counted-once"';
    let fetches = 0;
    const env: WorkerEnv = { ASSETS: { fetch: async () => { fetches += 1; return assetResponse(etag); } } };
    expect((await get({ Range: "bytes=0-1" }, env)).status).toBe(206);
    expect(fetches).toBe(2); // the response itself + one full read to learn the length
    expect((await get({ Range: "bytes=2-3" }, env)).headers.get("content-range")).toBe("bytes 2-3/64");
    expect(fetches).toBe(3);
  });

  it("serves the whole file when the bytes change while their length is counted", async () => {
    let fetches = 0;
    const env: WorkerEnv = {
      ASSETS: { fetch: async () => assetResponse(fetches++ === 0 ? '"before-deploy"' : '"after-deploy"') },
    };
    const response = await get({ Range: "bytes=0-1" }, env);
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(64);
  });
});

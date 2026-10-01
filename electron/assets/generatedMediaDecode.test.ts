import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveFfmpegPath } from "../export/ffmpegRunner";
import { matchNomiErrorCode } from "../shared/nomiErrorCodes";

const logged = vi.hoisted(() => ({ info: [] as unknown[][], warn: [] as unknown[][] }));
vi.mock("../logging/logger", async (importOriginal) => ({
  ...await importOriginal<typeof import("../logging/logger")>(),
  logInfo: (...args: unknown[]) => { logged.info.push(args); },
  logWarn: (...args: unknown[]) => { logged.warn.push(args); },
}));

const {
  DECODE_TIMEOUT_BASE_MS,
  DECODE_TIMEOUT_CAP_MS,
  decodeInvocation,
  decodeTimeoutMs,
  interpretDecodeRun,
  verifyGeneratedMediaDecodes,
} = await import("./generatedMediaDecode");

const work = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-decode-verdict-"));
afterAll(() => fs.rmSync(work, { recursive: true, force: true }));
beforeEach(() => { logged.info.length = 0; logged.warn.length = 0; });

/** 真编码器（随包 ffmpeg 自己的 mjpeg / png / libwebp）产出的图，不是手写的字节。 */
function encode(name: string, extra: string[] = []): Buffer {
  const output = path.join(work, name);
  const result = spawnSync(resolveFfmpegPath(), [
    "-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=512x512:rate=1", "-frames:v", "1", ...extra, output,
  ], { timeout: 30_000, maxBuffer: 1 << 20 });
  if (result.status !== 0) throw new Error(`fixture ffmpeg failed: ${result.stderr?.toString() || "unknown"}`);
  return fs.readFileSync(output);
}

let jpeg: Buffer;
let png: Buffer;
let webp: Buffer;
beforeAll(() => {
  jpeg = encode("base.jpg", ["-q:v", "3"]);
  png = encode("base.png");
  webp = encode("base.webp");
});

const decodes = (kind: "image" | "video" | "audio", bytes: Buffer, contentType: string) =>
  verifyGeneratedMediaDecodes({ kind, bytes, contentType });

function insertAfterSoi(jpegBytes: Buffer, segment: Buffer): Buffer {
  return Buffer.concat([jpegBytes.subarray(0, 2), segment, jpegBytes.subarray(2)]);
}
function appSegment(marker: number, body: Buffer): Buffer {
  const length = body.length + 2;
  return Buffer.concat([Buffer.from([0xff, marker, length >> 8, length & 255]), body]);
}

describe("verdict = a picture came out (not: the decoder had nothing to say)", () => {
  it.each([
    ["JPEG", () => jpeg, "image/jpeg"],
    ["PNG", () => png, "image/png"],
    ["WebP", () => webp, "image/webp"],
  ] as const)("a real %s decodes with real dimensions", (_label, bytes, contentType) => {
    const verdict = decodes("image", bytes(), contentType);
    expect(verdict).toMatchObject({ verdict: "decodable", width: 512, height: 512 });
  });

  // 类的一头（红：旧判定 `-xerror` 把它判失败）：完整可显示的 PNG，IEND 之后多了字节。
  // 产物被水印 / 元数据 / CDN 补丁追加尾数据是常态，图本身一点没坏。
  it("a complete PNG with extra bytes after IEND is a picture — the old zero-warning verdict rejected it", () => {
    const withTrailer = Buffer.concat([png, Buffer.alloc(100, 0x41)]);
    expect(decodes("image", withTrailer, "image/png")).toMatchObject({ verdict: "decodable", width: 512, height: 512 });
  });

  it.each([
    ["a malformed EXIF APP1 segment", () => insertAfterSoi(jpeg, appSegment(0xe1, Buffer.from("Exif\0\0MM\0*\0\0\0\xff\xff\xff\xff junk", "binary")))],
    ["AIGC-label JSON in an APP11 segment", () => insertAfterSoi(jpeg, appSegment(0xeb, Buffer.from('{"AIGC":{"Label":"1","ProduceID":"abc"}}')))],
    ["an XMP APP1 packet", () => insertAfterSoi(jpeg, appSegment(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF/></x:xmpmeta>')))],
    ["trailing garbage after EOI", () => Buffer.concat([jpeg, Buffer.alloc(200, 0x41)])],
    ["trailing zero padding", () => Buffer.concat([jpeg, Buffer.alloc(4096)])],
  ] as const)("a JPEG with %s still decodes", (_label, bytes) => {
    expect(decodes("image", bytes(), "image/jpeg").verdict).toBe("decodable");
  });

  it.each([
    ["random bytes wearing a JPEG signature", () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(Array.from({ length: 5000 }, (_, index) => (index * 131 + 7) & 255))]), "image/jpeg"],
    ["a PNG with a flipped byte inside its pixel data", () => { const copy = Buffer.from(png); copy[copy.indexOf(Buffer.from("IDAT", "ascii")) + 20] ^= 0xff; return copy; }, "image/png"],
    ["a WebP cut in half", () => webp.subarray(0, Math.floor(webp.length * 0.4)), "image/webp"],
  ] as const)("%s cannot be decoded: the error carries the machine code, not vendor blame", (_label, bytes, contentType) => {
    let thrown: unknown;
    try { decodes("image", bytes(), contentType); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(matchNomiErrorCode(message)).toBe("output-unreadable");
    expect(message).toContain("decode_failed");
    // ffmpeg 自己怎么说的（原话）进了日志，供排查；判决不看措辞，但日志留证。
    const rejected = logged.warn.find((entry) => entry[1] === "generated-media-decode-rejected");
    expect(rejected?.[2]).toMatchObject({ kind: "image", verdict: "undecodable", contentType });
    expect(String((rejected?.[2] as { decoderMessage?: string }).decoderMessage)).not.toBe("");
  });

  it("the invocation asks for a frame and does not treat decoder complaints as failure", () => {
    const args = decodeInvocation("image", "/tmp/x.png");
    expect(args).not.toContain("-xerror");
    expect(args).not.toContain("explode");
    expect(args).toEqual(expect.arrayContaining(["-frames:v", "1", "-f", "framehash"]));
    expect(decodeInvocation("audio", "/tmp/x.wav")).toEqual(expect.arrayContaining(["-map", "0:a:0", "-t", "1"]));
  });
});

describe("interpretDecodeRun — a fact about what came out", () => {
  const frame = "#format: frame checksums\n#dimensions 0: 1024x768\n0, 0, 0, 1, 2359296, 0a1b2c3d\n";
  it.each([
    ["one frame with dimensions", { status: 0, stdout: frame, stderr: "" }, { verdict: "decodable", width: 1024, height: 768 }],
    ["one frame although the decoder complained", { status: 0, stdout: frame, stderr: "[png @ 0x1] Invalid PNG signature 0x4141." }, { verdict: "decodable", width: 1024, height: 768 }],
    ["ffmpeg exit 1", { status: 1, stdout: "", stderr: "No JPEG data found" }, { verdict: "undecodable", reason: "decoder_exit" }],
    ["exit 0 but no frame line", { status: 0, stdout: "#format: frame checksums\n", stderr: "" }, { verdict: "undecodable", reason: "no_frame" }],
    ["a frame with a zero dimension", { status: 0, stdout: "#dimensions 0: 0x0\n0, 0, 0, 1, 0, 00000000\n", stderr: "" }, { verdict: "undecodable", reason: "no_dimensions" }],
    ["stderr overflow", { status: null, stdout: "", stderr: "", error: { code: "ENOBUFS" } }, { verdict: "undecodable" }],
    ["our own timeout", { status: null, signal: "SIGTERM", stdout: "", stderr: "", error: { code: "ETIMEDOUT" } }, { verdict: "unverified", reason: "timeout" }],
    ["ffmpeg could not start", { status: null, stdout: "", stderr: "", error: { code: "ENOENT", message: "spawn ffmpeg ENOENT" } }, { verdict: "unverified", reason: "decoder_unavailable" }],
  ] as const)("%s", (_label, run, expected) => {
    expect(interpretDecodeRun("image", { signal: null, ...run } as Parameters<typeof interpretDecodeRun>[1])).toMatchObject(expected);
  });

  it("audio needs a frame but no dimensions", () => {
    expect(interpretDecodeRun("audio", { status: 0, signal: null, stdout: "#sample_rate 0: 44100\n0, 0, 0, 1024, 4096, 0a1b2c3d\n", stderr: "" }).verdict).toBe("decodable");
  });
});

describe("the timeout scales with the file instead of being one fixed wall", () => {
  it("keeps the old base for small files, grows with size, and is capped", () => {
    expect(decodeTimeoutMs(0)).toBe(DECODE_TIMEOUT_BASE_MS);
    expect(decodeTimeoutMs(1024)).toBeLessThanOrEqual(DECODE_TIMEOUT_BASE_MS + 1);
    expect(decodeTimeoutMs(20 * 1024 * 1024)).toBeGreaterThan(decodeTimeoutMs(2 * 1024 * 1024));
    expect(decodeTimeoutMs(10 ** 12)).toBe(DECODE_TIMEOUT_CAP_MS);
    expect(decodeTimeoutMs(Number.NaN)).toBe(DECODE_TIMEOUT_BASE_MS);
  });

  it("the run really receives the scaled timeout, and a timeout is 'not verified', not 'unreadable'", () => {
    const seen: number[] = [];
    const timedOut = { status: null, signal: "SIGTERM", stdout: "", stderr: "", error: { code: "ETIMEDOUT" } } as const;
    for (const size of [1024, 30 * 1024 * 1024]) {
      let thrown: unknown;
      try {
        verifyGeneratedMediaDecodes(
          { kind: "image", bytes: Buffer.alloc(size, 1), contentType: "image/png" },
          { run: (_command, _args, options) => { seen.push(options.timeout); return timedOut; }, resolveFfmpeg: () => "ffmpeg" },
        );
      } catch (error) { thrown = error; }
      expect((thrown as Error).message).toContain("decode_unverified");
      expect(matchNomiErrorCode((thrown as Error).message)).toBe("output-unreadable");
    }
    expect(seen).toEqual([decodeTimeoutMs(1024), decodeTimeoutMs(30 * 1024 * 1024)]);
    expect(seen[1]).toBeGreaterThan(seen[0]);
    expect(logged.warn.map((entry) => entry[2])).toEqual([
      expect.objectContaining({ verdict: "unverified", reason: "timeout" }),
      expect.objectContaining({ verdict: "unverified", reason: "timeout" }),
    ]);
  });

  it("a missing decoder is 'not verified' too", () => {
    expect(() => verifyGeneratedMediaDecodes({ kind: "image", bytes: png, contentType: "image/png" }, { resolveFfmpeg: () => "" }))
      .toThrow(/decode_unverified/);
  });
});

describe("ffmpeg's own words are recorded, not judged", () => {
  it("a picture that decoded with complaints is accepted and the raw message lands in the log", () => {
    const stdout = "#format: frame checksums\n#dimensions 0: 512x512\n0, 0, 0, 1, 786432, 0a1b2c3d\n";
    const verdict = verifyGeneratedMediaDecodes(
      { kind: "image", bytes: png, contentType: "image/png" },
      { run: () => ({ status: 0, signal: null, stdout, stderr: "[mjpeg @ 0x1] overread 8\n[mjpeg @ 0x1] unable to decode APP fields" }), resolveFfmpeg: () => "ffmpeg" },
    );
    expect(verdict.verdict).toBe("decodable");
    expect(logged.warn).toEqual([]);
    expect(logged.info).toHaveLength(1);
    expect(logged.info[0][1]).toBe("generated-media-decoded-with-warnings");
    expect(logged.info[0][2]).toMatchObject({ kind: "image", bytes: png.length, decoderMessage: expect.stringContaining("overread 8") });
  });

  it("a clean decode writes nothing", () => {
    decodes("image", png, "image/png");
    expect(logged.info).toEqual([]);
    expect(logged.warn).toEqual([]);
  });
});

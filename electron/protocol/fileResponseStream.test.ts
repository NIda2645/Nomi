import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOwnedFileStream } from "./fileResponseStream";

let dir = "";
let filePath = "";
const SIZE = 512 * 1024;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-owned-stream-"));
  filePath = path.join(dir, "clip.mp4");
  fs.writeFileSync(filePath, Buffer.alloc(SIZE, 7));
});

afterAll(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

async function drain(stream: ReadableStream<Uint8Array>): Promise<number> {
  const reader = stream.getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
  }
  return total;
}

/** 捕获「无人接管的异常」——本病的全部危害就在这里：它不走 promise，只能这样观测。 */
async function collectUncaught(run: () => Promise<void>): Promise<NodeJS.ErrnoException[]> {
  const seen: NodeJS.ErrnoException[] = [];
  const onUncaught = (error: NodeJS.ErrnoException): void => {
    seen.push(error);
  };
  // vitest 默认会把 uncaughtException 当作测试失败；先摘掉它的监听，跑完再装回去，
  // 否则我们想「观测」的那一抛会直接把整个测试文件带走，看不到断言。
  const previous = process.listeners("uncaughtException");
  for (const listener of previous) process.off("uncaughtException", listener);
  process.on("uncaughtException", onUncaught);
  try {
    await run();
    // 延迟 close 是 queueMicrotask 排的，必须多等几拍才敢说"没抛"。
    await new Promise((resolve) => setTimeout(resolve, 120));
  } finally {
    process.off("uncaughtException", onUncaught);
    for (const listener of previous) process.on("uncaughtException", listener as never);
  }
  return seen;
}

describe("createOwnedFileStream", () => {
  it("整文件读出的字节数与磁盘一致", async () => {
    expect(await drain(createOwnedFileStream(filePath))).toBe(SIZE);
  });

  it("闭区间 range 读出的字节数与 Range 语义一致（含 end 那个字节）", async () => {
    expect(await drain(createOwnedFileStream(filePath, { start: 100, end: 599 }))).toBe(500);
  });

  it("内容正确——不是靠丢字节换来的干净", async () => {
    const reader = createOwnedFileStream(filePath, { start: 0, end: 3 }).getReader();
    const { value } = await reader.read();
    await reader.cancel();
    expect(Array.from(value!)).toEqual([7, 7, 7, 7]);
  });

  it("读到一半取消：不抛无人接管的 ERR_INVALID_STATE（本模块存在的理由）", async () => {
    const seen = await collectUncaught(async () => {
      for (let i = 0; i < 120; i++) {
        const reader = createOwnedFileStream(filePath).getReader();
        void reader.read();
        // 每隔一拍换一种时序，覆盖「pull 在飞行中」与「pull 已落地」两种取消时机。
        if (i % 3) await new Promise((resolve) => setImmediate(resolve));
        await reader.cancel();
      }
    });
    expect(seen.map((error) => error.code)).toEqual([]);
  });

  it("取消后底层文件句柄被销毁——不泄漏 fd", async () => {
    const stream = createOwnedFileStream(filePath);
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 50));
    // destroy() 之后再读只会得到终态，不会继续吐数据。
    await expect(reader.read()).resolves.toMatchObject({ done: true });
  });

  it("文件不存在时以 error 收场，而不是抛到 uncaughtException", async () => {
    const seen = await collectUncaught(async () => {
      const reader = createOwnedFileStream(path.join(dir, "missing.mp4")).getReader();
      await reader.read().catch(() => undefined);
    });
    expect(seen.map((error) => error.code)).toEqual([]);
  });
});

/**
 * 这一条不测我们的代码，测的是**我们为什么必须绕开 undici**——
 * 把「异步可迭代」交给 `new Response()`，undici 会转交 ReadableStreamFrom，
 * 其 pull 在 done 时用 queueMicrotask 裸调 controller.close()、cancel() 又不置任何标记，
 * 于是「取消 → in-flight 的 pull 才解析出 done」必然把 close 打在已关闭的 controller 上。
 *
 * 留着它当**回归哨兵**：哪天 undici 把这个补上了，本条会变红，那时才谈得上「可以直接用 new Response(流)」。
 */
describe("undici ReadableStreamFrom 的无保护延迟 close（上游现状，非本仓代码）", () => {
  it("把异步可迭代交给 new Response() 后，取消会抛出 call site 接不住的 ERR_INVALID_STATE", async () => {
    let resolveNext: ((result: IteratorResult<Uint8Array>) => void) | undefined;
    const iterable = {
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<Uint8Array>>((resolve) => { resolveNext = resolve; }),
        return: () => Promise.resolve({ done: true, value: undefined } as IteratorResult<Uint8Array>),
      }),
    };

    let caughtAtCallSite: unknown = null;
    const seen = await collectUncaught(async () => {
      try {
        const reader = new Response(iterable as unknown as BodyInit).body!.getReader();
        void reader.read().catch((error) => { caughtAtCallSite = error; });
        await new Promise((resolve) => setImmediate(resolve));
        await reader.cancel();
        resolveNext?.({ done: true, value: undefined });
      } catch (error) {
        caughtAtCallSite = error;
      }
    });

    expect(seen.map((error) => error.code)).toEqual(["ERR_INVALID_STATE"]);
    // 这才是它致命的地方：call site 什么都没接到，所以「加个 try/catch」根本不是解法。
    expect(caughtAtCallSite).toBeNull();
  });
});

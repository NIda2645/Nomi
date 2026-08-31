// 本地资产的响应体：**我们自己拥有的** ReadableStream。
//
// 为什么不能图省事写 `new Response(fs.createReadStream(path))`（2026-08-24 用户回报的弹框根因）：
// undici 的 extractBody 见到「异步可迭代」（Node Readable 就是）会把它转交给 ReadableStreamFrom，
// 于是流的关闭权归了 undici。而那段代码是这样的：
//
//     pull(controller) {
//       return iterator.next().then(({ done }) => {
//         if (done) return queueMicrotask(() => { controller.close() })   // ← 裸调用，无保护
//     cancel() { return iterator.return() }                              // ← 不置任何标记
//
// 播放器一 seek/卸载就取消流：controller 先进入 closed，**先前那次 in-flight 的 pull** 才解析出
// done、把延迟 close 打在已关闭的 controller 上 → 抛 ERR_INVALID_STATE。抛点在 microtask 里、
// promise 早已 settle，**call site 的 try/catch 一律接不住**，直接进 uncaughtException 弹框。
//
// 该缺陷在 undici 6.19.8（Electron 31）/ 7.29.0（Electron 42、43）/ 8.10.0 / main 中**一模一样地存在**，
// 升 Electron 修不掉（已逐版本读源码核对）。唯一的解就是**别把流交出去**：自己 new ReadableStream，
// 用一个同步置位的 closed 闸让 close 与 cancel 不可能互相竞争。
//
// 完整证据链见 docs/plan/2026-08-24-local-protocol-stream-ownership.md。
// 门岗：scripts/check-heavy-path.mjs 的 node-stream-into-response 规则会拦住写回去的尝试。
import fs from "node:fs";

/** fs.createReadStream 的闭区间（含 end 那个字节），与 Range 头语义一致。 */
export type FileByteRange = { start: number; end: number };

/**
 * 按需读文件，产出一个**关闭权在我们手里**的 ReadableStream。
 *
 * 关键不是「读文件」，是那个 `closed` 闸：它在 cancel() 里**同步**置位，
 * 因此任何后到的 close/error 都会被 settle() 挡掉——竞态在结构上不成立，而不是靠 try/catch 兜。
 */
export function createOwnedFileStream(filePath: string, range?: FileByteRange): ReadableStream<Uint8Array> {
  const nodeStream = fs.createReadStream(filePath, range);
  let closed = false;

  // 只允许终结一次。try/catch 是第二层保险：即使消费方以我们没预料的顺序拆流，
  // 也只是静默收场，绝不能从这里抛进 microtask（那正是我们要根治的病）。
  const settle = (finish: () => void): void => {
    if (closed) return;
    closed = true;
    try {
      finish();
    } catch {
      /* 流已被消费方关掉：本来就是我们想要的终态，不必也不能再抛 */
    }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk) => {
        if (closed) return;
        // chunk 是 Buffer，本身就是 Uint8Array 子类；直接入队是零拷贝。
        // fs 流默认 highWaterMark 64KB > Buffer 池阈值（4KB），allocUnsafe 走独立分配，
        // 不存在「池内存被下一次读覆盖」的别名问题，所以不需要复制一份。
        controller.enqueue(chunk as Uint8Array);
        // 默认排队策略 highWaterMark=1：入队一块后 desiredSize 即 <=0，就地背压，
        // 别把整个视频读进内存（这条路上跑的是几百 MB 的片子）。
        if ((controller.desiredSize ?? 1) <= 0) nodeStream.pause();
      });
      nodeStream.on("end", () => settle(() => controller.close()));
      nodeStream.on("error", (error) => settle(() => controller.error(error)));
      // 挂上 "data" 会立刻进 flowing 模式；先按住，等消费方 pull 再放。
      nodeStream.pause();
    },
    pull() {
      if (!closed) nodeStream.resume();
    },
    cancel() {
      // 同步置位**先于** destroy：destroy 会同步触发 'error'/'close'，
      // 闸必须在那之前就合上，否则又回到「关两次」的老路。
      closed = true;
      nodeStream.destroy();
    },
  });
}

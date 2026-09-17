/**
 * preload 侧的三个 IPC 小工具：同步调用、信封拆封、读写成对的设置项。
 *
 * 从 electron/preload.ts 抽出来（R9：preload.ts 顶着 800 行硬上限）。行为逐字不变，
 * preload.ts 与 electron/preload/*.ts 共用这一份，不允许再出现第二份拆信封的写法。
 */
import { ipcRenderer } from "electron";

export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function unwrapIpcResult<T>(result: IpcResult<T>, channel: string): T {
  if (!result || result.ok !== true) {
    throw new Error(result?.error || `Desktop IPC failed: ${channel}`);
  }
  return result.value;
}

export function invokeSync<T>(channel: string, ...args: unknown[]): T {
  return unwrapIpcResult(ipcRenderer.sendSync(channel, ...args) as IpcResult<T>, channel);
}

/**
 * 设置区里绝大多数条目是**同一种形状**：一条读、一条写、写完回读归一后的值。
 * 这里把那一种形状收成一处，理由不是省行数，是让「多一个偏好」只需要写一行、
 * 不可能写出「读的是 A、写的是 B」那种手抄错位。两条频道名仍然逐字写出来
 * （不拼字符串）——频道名是跨进程合同，grep 得到才追得动。
 */
export function getSetChannels(getChannel: string, setChannel: string) {
  return {
    get: () => ipcRenderer.invoke(getChannel),
    set: (payload: unknown) => ipcRenderer.invoke(setChannel, payload),
  };
}

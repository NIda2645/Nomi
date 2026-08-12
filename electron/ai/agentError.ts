/**
 * Honest error surfacing for the agent chat / text-stream paths.
 *
 * Two failure modes were silently swallowed before:
 *   1) An upstream relay returns HTTP 4xx/5xx with a USEFUL business message in
 *      the response body (e.g. dm-fox: "官方算力限制，请等待…"), but the AI SDK's
 *      thrown `APICallError.message` is only the bare status text ("Bad Request").
 *      We were showing that bare text and discarding the body. → describeAgentError
 *      digs the human message out of `responseBody`.
 *   2) A weak agent model (e.g. moonshot-v1 vision) tries to deliver its answer
 *      as a write-tool JSON argument, hits the max_tokens cap mid-argument
 *      (finishReason "length"), and emits neither a valid tool call nor any text.
 *      We were showing "（空响应：AI 没有返回文本）" which tells the user nothing.
 *      → describeEmptyAgentReply explains the cause and steers to a stronger model.
 *
 * Electron-free so it can be unit-tested offline (agentError.test.ts).
 */
import { encodeVendorErrorMessage } from "../vendor/vendorHttp";
import { vendorErrorFromAiSdkError, type AiSdkErrorContext } from "./aiSdkVendorError";

/**
 * Turn any agent error into a message worth showing the user.
 *
 * 这是文本侧**所有**错误的唯一漏斗（streamText onError / 流的 error 块 / 流抛出中断 /
 * textStreamIpc catch 四条入口都过这里），所以结构化也收口在这一层：厂商请求失败先映射成
 * VendorRequestError，带 `NOMI_VENDOR_ERR_B64::` 标记编码后穿 IPC —— 渲染层
 * classifyGenerationError 于是走「源头保留的事实」分支，而不是拿关键词正则猜 category
 * （治「又漏了一类」的按类复发，来龙去脉见 aiSdkVendorError.ts 文件头）。
 *
 * 映射不到的（工具报错 / 没配文本模型 / 空响应截断 / 用户点停止）返回裸字符串走 legacy 兜底——
 * 那几类的判据是**我们自己的固定文案**，不是猜厂商的话，本来就不该结构化。
 *
 * 展示串一字未变：标记段在渲染层由 stripVendorErrorMarker 剥掉，用户看到的仍是
 * 「（HTTP 400）官方算力限制，请等待一段时间后再进行使用」。
 */
export function describeAgentError(error: unknown, ctx: AiSdkErrorContext = {}): string {
  const vendorError = vendorErrorFromAiSdkError(error, ctx);
  if (vendorError) return encodeVendorErrorMessage(vendorError);
  if (error instanceof Error) return error.message;
  return String(error);
}

export type EmptyReplyModelInfo = {
  modelLabel: string;
  agentSuitability?: "good" | "acceptable" | "poor";
  agentNote?: string;
};

/**
 * Explain a turn that finished with NO text — but only when the finishReason is
 * a recognized failure. Returns "" for ambiguous reasons (stop / tool-calls with
 * empty text), so callers keep their generic handling for those.
 */
export function describeEmptyAgentReply(finishReason: string, info: EmptyReplyModelInfo): string {
  const reason = String(finishReason || "").toLowerCase();
  if (reason === "length") {
    const parts = [`模型「${info.modelLabel}」这一轮达到了输出长度上限，内容被截断，没能完整返回。`];
    if (info.agentNote) parts.push(info.agentNote);
    else if (info.agentSuitability === "poor") parts.push("该模型做 Agent 工具调用本就不可靠。");
    // 截断是确定性的——原样重试必再撞。给真动作：缩短这轮任务，或换单轮输出上限更大的模型。
    parts.push("原样重试会再次截断。请缩短这一轮的任务量（如剧本分段拆镜头、减少镜头数），或换用单轮输出上限更大的模型（如 GPT-4o / Claude / Gemini）。");
    return parts.join("\n");
  }
  if (reason === "content-filter") {
    return `模型「${info.modelLabel}」因内容安全策略拦截，没有返回结果。换个说法或换模型再试。`;
  }
  return "";
}

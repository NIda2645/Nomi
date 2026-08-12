// 自定义调用脚本执行器（主进程）。脚本=用户数据里的一段 async 函数体，new Function 注入
// customCallContract 声明的变量后执行——本地信任模型（用户自己机器上跑自己粘贴的代码），
// 不做沙箱；绝不自动安装远程脚本（plan §10）。
//
// 网络全走 vendorHttp.requestJson/requestMultipart（与主路径同核）：代理/SOCKS、逻辑错误检测、
// 结构化 VendorRequestError 免费继承。**刻意不做 SSRF 私网拦截**——地址是用户显式写的，
// LAN 中转合法（与资产回捞 assertSafeUrl 的“被动跟随响应”场景不同）。
//
// transcript：http/request 每次调用记一条（Authorization/apiKey 脱敏），试跑面板摊开
// 「实际发了什么」——参考图第三闸对脚本失明的补偿（plan §10）。
import { isJsonRecord, type JsonRecord } from "../jsonUtils";
import { requestJson, requestMultipart } from "../vendor/vendorHttp";
import { CUSTOM_CALL_INJECTED_KEYS } from "./customCallContract";
import type { Model, Vendor } from "./types";

export type CustomCallTranscriptEntry = {
  method: string;
  url: string;
  status: "ok" | "error";
  durationMs: number;
  requestPreview?: string;
  responsePreview?: string;
  errorMessage?: string;
};

export type CustomCallScriptResult = {
  /** 归一后的产物（URL 或 dataURL）。 */
  assets: string[];
  /**
   * 文本产出。文本模型的脚本 `return { text: '…' }` 走这里——它不是资产，不能塞进 assets
   * （塞进去下游会把整段文字当 URL 去下载）。见 collectCustomCallText。
   */
  text?: string;
  transcript: CustomCallTranscriptEntry[];
};

const PREVIEW_LIMIT = 2000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function preview(value: unknown, redact: (s: string) => string): string | undefined {
  if (value === undefined || value === null) return undefined;
  let text: string;
  if (typeof value === "string") text = value;
  else if (typeof FormData !== "undefined" && value instanceof FormData) {
    text = `FormData(${[...value.keys()].join(", ")})`;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  return redact(text).slice(0, PREVIEW_LIMIT);
}

/**
 * 脚本返回值 → 文本产出。只认**显式**的文本形状（字符串 text/content/output_text 字段），
 * 不把裸字符串当文本——裸字符串是资产 URL 的既有约定，两者抢同一个形状会让图片模型的
 * URL 被当成正文。文本模型请 `return { text: '…' }`。
 */
export function collectCustomCallText(result: unknown): string | undefined {
  if (!isJsonRecord(result)) return undefined;
  const record = result as JsonRecord;
  for (const key of ["text", "content", "output_text"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

/** 脚本返回值 → 产物列表。宽松归一（与 infinite-canvas 同精神），空产出=人话报错。 */
export function collectCustomCallAssets(result: unknown): string[] {
  const items = Array.isArray(result) ? result : [result];
  const out: string[] = [];
  for (const item of items) {
    if (typeof item === "string" && item.trim()) {
      out.push(item.trim());
      continue;
    }
    if (!isJsonRecord(item)) continue;
    const record = item as JsonRecord;
    const single = [record.url, record.video_url, record.image_url, record.dataUrl].find(
      (v) => typeof v === "string" && v.trim(),
    );
    if (typeof single === "string") {
      out.push(single.trim());
      continue;
    }
    if (typeof record.b64_json === "string" && record.b64_json.trim()) {
      out.push(`data:image/png;base64,${record.b64_json.trim()}`);
      continue;
    }
    if (Array.isArray(record.urls)) {
      for (const u of record.urls) if (typeof u === "string" && u.trim()) out.push(u.trim());
    }
  }
  return out;
}

/**
 * 供应商「自定义配置」→ 注入给脚本的 config。住 vendor.meta.customConfig，只收字符串值
 * （用户手填的东西，别让脏类型漏进脚本）。空表也给 {}，脚本里 config.x 取不到就是 undefined，
 * 不用先判空。
 */
export function customConfigOf(vendor: Vendor): Record<string, string> {
  const meta = vendor.meta && typeof vendor.meta === "object" ? (vendor.meta as JsonRecord) : {};
  const raw = meta.customConfig;
  if (!isJsonRecord(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const name = key.trim();
    if (!name) continue;
    if (typeof value === "string") out[name] = value;
    else if (typeof value === "number" || typeof value === "boolean") out[name] = String(value);
  }
  return out;
}

/** params 里的标准参考键 → 便捷视图（键名与 archetypeInput 标准键一一对应，单源在那边）。 */
export function referencesViewFromParams(params: JsonRecord): {
  firstFrame?: string;
  lastFrame?: string;
  images: string[];
  videos: string[];
  audios: string[];
} {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);
  return {
    firstFrame: str(params.first_frame_url),
    lastFrame: str(params.last_frame_url),
    images: arr(params.reference_image_urls).length ? arr(params.reference_image_urls) : arr(params.reference_images),
    videos: arr(params.reference_video_urls),
    audios: arr(params.reference_audio_urls),
  };
}

function joinUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

export async function runCustomCallScript(input: {
  vendor: Vendor;
  model: Model;
  apiKey: string;
  script: string;
  prompt: string;
  params: JsonRecord;
  signal?: AbortSignal;
  timeoutMs?: number;
  /**
   * 把脚本拿到的二进制落成本地资产，返回可用的 URL（注入避免 ↔ runtime 循环依赖，同 localizeTaskAsset）。
   * 没有它，「上游只给字节流不给 URL」那类模型（Sora 的下载端点、Stability v2beta）只能转成
   * data URL —— 图片尚可，几十 MB 的视频就离谱了。缺省不注入时脚本里没有 saveFile。
   */
  saveFile?: (bytes: Buffer, ext: string, contentType: string) => Promise<string>;
}): Promise<CustomCallScriptResult> {
  const { vendor, apiKey } = input;
  const baseUrl = String(vendor.baseUrlHint || "").replace(/\/+$/, "");
  const transcript: CustomCallTranscriptEntry[] = [];
  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(new Error(`自定义调用脚本超时（${Math.round(timeoutMs / 1000)}s）`)), timeoutMs);
  if (input.signal) {
    if (input.signal.aborted) controller.abort(input.signal.reason);
    else input.signal.addEventListener("abort", () => controller.abort(input.signal?.reason), { once: true });
  }
  const redact = (text: string): string => {
    if (!apiKey) return text;
    return text.split(apiKey).join("•••");
  };

  const record = async <T>(method: string, url: string, body: unknown, run: () => Promise<T>): Promise<T> => {
    if (controller.signal.aborted) throw controller.signal.reason instanceof Error ? controller.signal.reason : new Error("aborted");
    const started = Date.now();
    try {
      const response = await run();
      transcript.push({
        method: method.toUpperCase(),
        url: redact(url),
        status: "ok",
        durationMs: Date.now() - started,
        requestPreview: preview(body, redact),
        responsePreview: preview(response, redact),
      });
      return response;
    } catch (error) {
      transcript.push({
        method: method.toUpperCase(),
        url: redact(url),
        status: "error",
        durationMs: Date.now() - started,
        requestPreview: preview(body, redact),
        errorMessage: redact(error instanceof Error ? error.message : String(error)).slice(0, PREVIEW_LIMIT),
      });
      throw error;
    }
  };

  type HttpOpts = { headers?: Record<string, string>; query?: Record<string, unknown> };
  const doRequest = (init: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    query?: Record<string, unknown>;
    body?: unknown;
  }) => {
    const url = joinUrl(baseUrl, String(init.url || ""));
    const headers = init.headers || {};
    const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
    return record(init.method, url, init.body, () =>
      isForm
        ? requestMultipart(vendor, apiKey, url, headers, init.query || {}, init.body as FormData)
        : requestJson(vendor, apiKey, String(init.method || "POST"), url, headers, init.query || {}, init.body),
    );
  };
  const http = {
    url: (path: string) => joinUrl(baseUrl, path),
    post: (path: string, body?: unknown, opts?: HttpOpts) =>
      doRequest({
        method: "POST",
        url: path,
        body,
        query: opts?.query,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...opts?.headers },
      }),
    get: (path: string, opts?: HttpOpts) =>
      doRequest({
        method: "GET",
        url: path,
        query: opts?.query,
        headers: { Authorization: `Bearer ${apiKey}`, ...opts?.headers },
      }),
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      if (controller.signal.aborted) return reject(abortError(controller));
      const t = setTimeout(resolve, Math.max(0, Number(ms) || 0));
      controller.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(abortError(controller));
        },
        { once: true },
      );
    });

  const poll = async <T, R>(
    fn: () => Promise<T>,
    extract: (value: T) => R | null | undefined | false,
    opts?: { intervalMs?: number; timeoutMs?: number },
  ): Promise<R> => {
    const intervalMs = Math.max(500, Number(opts?.intervalMs) || 2500);
    const pollTimeout = Math.max(1000, Number(opts?.timeoutMs) || DEFAULT_TIMEOUT_MS);
    const deadline = Date.now() + pollTimeout;
    for (;;) {
      const value = extract(await fn());
      if (value !== null && value !== undefined && value !== false) return value;
      if (Date.now() >= deadline) throw new Error(`轮询超时（${Math.round(pollTimeout / 1000)}s）——上游任务未在限时内完成`);
      await sleep(intervalMs);
    }
  };

  const references = referencesViewFromParams(input.params);
  const modelId = String(input.model.modelAlias || input.model.modelKey);
  // 形参顺序 = CUSTOM_CALL_INJECTED_KEYS（契约单源；对账单测锁死两边一致）。
  const argValues: Record<string, unknown> = {
    prompt: input.prompt,
    params: input.params,
    references,
    model: modelId,
    baseUrl,
    apiKey,
    // 用户在「自定义配置」里填的任意键值。Nomi 只准备了一个密钥槽，而腾讯要 SecretId+SecretKey、
    // Kling 要 AK+SK 每 30 分钟重签——与其我们一个个猜着加字段（永远追不上），不如给一张空白表。
    config: customConfigOf(input.vendor),
    http,
    request: doRequest,
    poll,
    // 二进制落地。没注入时给一个会说人话的桩，别让脚本撞上 "saveFile is not a function"
    // 这种对用户毫无意义的报错（试跑面板走的就是这条路）。
    saveFile: input.saveFile
      ? async (bytes: unknown, ext: unknown, contentType?: unknown) =>
          input.saveFile!(
            Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as ArrayBuffer),
            typeof ext === "string" && ext.trim() ? ext.trim().replace(/^\./, "") : "bin",
            typeof contentType === "string" && contentType.trim() ? contentType : "application/octet-stream",
          )
      : async () => {
          throw new Error("saveFile 在这里不可用（试跑不落盘）——先 return 一个 URL 或 dataURL 验证脚本能跑通");
        },
    sleep,
    signal: controller.signal,
  };
  let runner: (...args: unknown[]) => Promise<unknown>;
  try {
    runner = new Function(
      ...CUSTOM_CALL_INJECTED_KEYS,
      `"use strict"; return (async () => {\n${input.script}\n})();`,
    ) as (...args: unknown[]) => Promise<unknown>;
  } catch (error) {
    clearTimeout(timer);
    throw new Error(`自定义调用脚本语法错误：${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  try {
    const raw = await Promise.race([
      runner(...CUSTOM_CALL_INJECTED_KEYS.map((key) => argValues[key])),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener("abort", () => reject(abortError(controller)), { once: true }),
      ),
    ]);
    // 文本先看：文本模型 return { text } 不产出资产，走 assets 那条会被当成 URL 去下载。
    const text = collectCustomCallText(raw);
    if (text) return { assets: [], text, transcript };
    const assets = collectCustomCallAssets(raw);
    if (assets.length === 0)
      throw new Error("自定义调用脚本没有返回产物（资产请 return URL / dataURL / 它们的数组；文本模型请 return { text: '…' }）");
    return { assets, transcript };
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error));
    throw new CustomCallScriptError(message, transcript, error);
  } finally {
    clearTimeout(timer);
  }
}

function abortError(controller: AbortController): Error {
  return controller.signal.reason instanceof Error ? controller.signal.reason : new Error("自定义调用已取消");
}

/** 带 transcript 的失败：试跑面板要摊开「发了什么、错在哪」。cause 保留原始错误
 *  （VendorRequestError 的结构化分类信息），runtime 派发点会解包重抛给渲染层分类器。 */
export class CustomCallScriptError extends Error {
  transcript: CustomCallTranscriptEntry[];
  causeError: unknown;
  constructor(message: string, transcript: CustomCallTranscriptEntry[], causeError?: unknown) {
    super(message);
    this.name = "CustomCallScriptError";
    this.transcript = transcript;
    this.causeError = causeError;
  }
}

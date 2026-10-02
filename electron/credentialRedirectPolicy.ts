// 凭据请求重定向策略的唯一 owner（electron-free：appFetch 与单测的传输替身都消费它）。
//
// 病根：fetch 默认跟随 3xx，而跨域跳转只会去掉 `Authorization`——供应商自取名的鉴权头
// （`x-api-key`、中转站自己的头）和 307/308 的 POST 正文会原样带去第二个网站。
// 规则：带凭据的请求不跟随跳转，用原生 `redirect: "error"`，不自己写任何跟随逻辑。
// 判据：请求带了标准头之外的**任何**头就算带凭据——供应商的鉴权头名是配置出来的，按名字拦
// 一张黑名单永远漏下一个；不认识的头按带凭据处理（fail closed）。
// 调用方自己指定了 `redirect`（hardenedFetch 手动逐跳去头、模型列表分页 manual + 校验）就尊重它。

const NativeRequest = globalThis.Request;

const PLAIN_HEADERS = new Set([
  'accept', 'accept-encoding', 'accept-language', 'cache-control', 'connection', 'content-length',
  'content-type', 'host', 'if-modified-since', 'if-none-match', 'pragma', 'range', 'referer', 'user-agent',
]);

/** True when the request has a header outside the plain set (auth, cookie, API key, custom gateway header). */
export function requestCarriesCredentials(input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit): boolean {
  try {
    const names = [
      ...(input instanceof NativeRequest ? input.headers.keys() : []),
      ...(init?.headers ? new Headers(init.headers).keys() : []),
    ];
    return names.some((name) => !PLAIN_HEADERS.has(name.toLowerCase()));
  } catch {
    return true;
  }
}

/** The one place the policy is applied: returns `init` with `redirect: "error"` added for credentialed requests. */
export function withCredentialRedirectPolicy(input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit): RequestInit | undefined {
  if (init?.redirect !== undefined || !requestCarriesCredentials(input, init)) return init;
  return { ...init, redirect: 'error' };
}

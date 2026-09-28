/** Stable error contract shared by the APIMart provider and its pure helpers. */
export class ApimartGenerationProviderError extends Error {
  readonly code = "apimart_provider_error" as const;

  /**
   * `cause` 必须原样带上：出站失败时它就是 undici 那条 cause 链，而
   * 「这次请求到底写出去没有」只能从那条链上读出来（见 `outboundDispatchEvidence.ts`）。
   * 2026-09-18 C9 那条红之所以三轮 CI 才定位，就是因为这里把 cause 丢了、
   * 只剩外壳那句 `fetch failed`。
   */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ApimartGenerationProviderError";
  }
}

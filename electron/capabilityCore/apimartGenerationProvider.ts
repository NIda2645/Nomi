import type { ResolvedTaskRequestV1, GenerationProvider } from "./generationRuntimeAdapter";

export type ApimartGenerationProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export class ApimartGenerationProviderError extends Error {
  readonly code = "apimart_provider_error" as const;

  constructor(message: string) {
    super(message);
    this.name = "ApimartGenerationProviderError";
  }
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApimartGenerationProviderError(`APIMart ${label} response is invalid`);
  return value as JsonRecord;
}

function baseUrl(value: string | undefined): string {
  return (value || "https://api.apimart.ai").trim().replace(/\/+$/, "");
}

function parameter(parameters: Record<string, unknown>, ...keys: string[]): unknown {
  return keys.map((key) => parameters[key]).find((value) => value !== undefined && value !== null && value !== "");
}

function buildImageRequest(input: ResolvedTaskRequestV1): JsonRecord {
  const parameters = input.parameters;
  const body: JsonRecord = {
    model: input.modelId,
    prompt: input.prompt,
    size: parameter(parameters, "size", "aspect_ratio", "aspectRatio"),
    resolution: parameter(parameters, "resolution"),
    n: parameter(parameters, "n") ?? 1,
  };
  for (const key of ["negative_prompt", "negativePrompt", "seed", "quality", "background", "image_urls", "input_urls"]) {
    const value = parameters[key];
    if (value !== undefined) body[key === "negativePrompt" ? "negative_prompt" : key === "input_urls" ? "image_urls" : key] = value;
  }
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
}

async function readJson(response: Response): Promise<JsonRecord> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApimartGenerationProviderError(`APIMart response was not JSON (HTTP ${response.status})`);
  }
  return record(payload, "");
}

function providerMessage(payload: JsonRecord): string {
  const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data) ? payload.data as JsonRecord : undefined;
  const error = payload.error && typeof payload.error === "object" && !Array.isArray(payload.error) ? payload.error as JsonRecord : undefined;
  return String(error?.message ?? data?.error ?? payload.message ?? payload.msg ?? "request rejected").slice(0, 256);
}

export function createApimartGenerationProvider(options: ApimartGenerationProviderOptions): GenerationProvider {
  const apiKey = options.apiKey.trim();
  const root = baseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const request = async (url: string, init: RequestInit, context: string): Promise<JsonRecord> => {
    if (!apiKey) throw new ApimartGenerationProviderError("APIMart credential is missing");
    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      throw new ApimartGenerationProviderError(`APIMart ${context} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const payload = await readJson(response);
    const code = payload.code;
    if (!response.ok || (code !== undefined && code !== 200 && code !== 0)) {
      throw new ApimartGenerationProviderError(`APIMart ${context} rejected the request: ${providerMessage(payload)}`);
    }
    return payload;
  };
  const queryTask = async (providerTaskId: string) => {
    const taskId = providerTaskId.trim();
    if (!taskId) throw new ApimartGenerationProviderError("APIMart task id is missing");
    const payload = await request(`${root}/v1/tasks/${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    }, "task query");
    const data = record(payload.data, "task query");
    const status = typeof data.status === "string" ? data.status : "unknown";
    return { status, raw: payload };
  };
  return {
    providerId: "apimart",
    capabilities: { submitIdempotency: false, query: true, reconcile: true, cancel: false },
    buildRequest: buildImageRequest,
    async submit(providerRequest) {
      const payload = await request(`${root}/v1/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(record(providerRequest, "submit")),
      }, "image submission");
      const first = Array.isArray(payload.data) ? payload.data[0] : undefined;
      const taskId = first && typeof first === "object" && !Array.isArray(first) ? (first as JsonRecord).task_id : undefined;
      if (typeof taskId !== "string" || !taskId.trim()) throw new ApimartGenerationProviderError("APIMart submission did not return a task id");
      return { providerTaskId: taskId.trim(), raw: payload };
    },
    query: queryTask,
    async reconcile(input) {
      if (!input.providerTaskId?.trim()) return { found: false };
      const result = await queryTask(input.providerTaskId);
      return { found: Boolean(result), providerTaskId: input.providerTaskId, raw: result?.raw };
    },
  };
}

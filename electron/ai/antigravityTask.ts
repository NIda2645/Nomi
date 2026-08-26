import { readNomiLocalAsset } from "../assets/localAssetFile";
import { hardenedFetch } from "../hardenedFetch";
import { antigravityConnection, prepareAntigravity, type PreparedAntigravity } from "./antigravityConnection";
import { readAntigravityEvidence } from "./antigravityEvidenceStore";
import { runAntigravityProcess, type AntigravityRunOptions } from "./antigravityProcess";
import { assertAntigravityMediaInput, prepareAntigravityImageInput, type AntigravityImageInput } from "./antigravityMedia";
import type { AntigravityCapability } from "../shared/antigravity";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw Object.assign(new Error("ANTIGRAVITY_CANCELLED"), { name: "AbortError" });
}
export async function loadAntigravityImage(url: string, signal?: AbortSignal): Promise<AntigravityImageInput> {
  checkAbort(signal);
  let bytes: Uint8Array; let mimeType: string;
  if (url.startsWith("nomi-local://")) {
    const asset = readNomiLocalAsset(url, { maxBytes: MAX_IMAGE_BYTES });
    if (!asset) throw new Error("ANTIGRAVITY_IMAGE_SOURCE_INVALID");
    bytes = asset.bytes; mimeType = asset.contentType;
  } else if (url.startsWith("data:")) {
    if (url.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64) throw new Error("ANTIGRAVITY_IMAGE_SOURCE_INVALID");
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
    if (!match || match[2].length % 4 !== 0) throw new Error("ANTIGRAVITY_IMAGE_SOURCE_INVALID");
    bytes = Buffer.from(match[2], "base64"); mimeType = match[1];
  } else if (/^https?:\/\//i.test(url)) {
    const response = await hardenedFetch(url, { signal, maxBytes: MAX_IMAGE_BYTES, timeoutMs: 20_000,
      allowContentTypes: ["image/png", "image/jpeg", "image/webp"], allowRedirect: false });
    bytes = response.bytes; mimeType = response.contentType.split(";")[0].trim().toLowerCase();
  } else throw new Error("ANTIGRAVITY_IMAGE_SOURCE_INVALID");
  checkAbort(signal);
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || !["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
    throw new Error("ANTIGRAVITY_IMAGE_SOURCE_INVALID");
  }
  // The process runner fully decodes and copies these bytes into its private task directory.
  return { bytes, mimeType };
}

export type PreparedAntigravityTask = PreparedAntigravity & {
  capability: AntigravityCapability;
  modelId: string;
  prompt: string;
  model?: string;
  images: AntigravityImageInput[];
};

export async function prepareAntigravityTask(input: {
  prompt: string;
  model?: string;
  capability: AntigravityCapability;
  imageUrls?: unknown[];
  signal?: AbortSignal;
}): Promise<PreparedAntigravityTask> {
  checkAbort(input.signal);
  if (!input.prompt.trim()) throw new Error("ANTIGRAVITY_EMPTY_PROMPT");
  const imageUrls = input.imageUrls ?? [];
  if (imageUrls.length > 4 || imageUrls.some((url) => typeof url !== "string" || !url.trim())
    || ((input.capability === "vision" || input.capability === "edit") ? !imageUrls.length : imageUrls.length > 0)) {
    throw new Error("ANTIGRAVITY_INVALID_IMAGES");
  }
  const images: AntigravityImageInput[] = [];
  for (const url of imageUrls) {
    images.push(await prepareAntigravityImageInput(await loadAntigravityImage(url as string, input.signal), input.signal));
  }
  const prepared = await prepareAntigravity(input.signal);
  checkAbort(input.signal);
  assertAntigravityMediaInput(input.capability, images, prepared.discovery.version);
  const modelId = input.model || "auto";
  if (modelId !== "auto" && !prepared.discovery.models.some((model) => model.id === modelId)) {
    throw new Error("ANTIGRAVITY_MODEL_UNAVAILABLE");
  }
  // Lazy, idempotent restart restore. Discovery and the historical evidence are
  // both main-owned; renderer/catalog metadata never grants execution.
  antigravityConnection.restore(readAntigravityEvidence());
  const passed = antigravityConnection.hasPassed({ capability: input.capability, modelId }, prepared.discovery.version)
    || (input.capability === "text"
      && antigravityConnection.hasPassed({ capability: "vision", modelId }, prepared.discovery.version));
  if (!passed) throw new Error("ANTIGRAVITY_TEST_REQUIRED");
  return { ...prepared, capability: input.capability, modelId, prompt: input.prompt, model: input.model, images };
}

export function runPreparedAntigravityTask(prepared: PreparedAntigravityTask,
  options: Pick<AntigravityRunOptions, "signal" | "onDelta"> = {}) {
  checkAbort(options.signal);
  return runAntigravityProcess({ prompt: prepared.prompt, model: prepared.model, capability: prepared.capability,
    images: prepared.images, signal: options.signal, onDelta: options.onDelta, cliVersion: prepared.discovery.version },
  { preparedInvocation: prepared });
}

export async function runAntigravityTask(input: Omit<AntigravityRunOptions, "images" | "cliVersion"> & { imageUrls?: string[] }) {
  const capability = input.capability ?? ((input.imageUrls?.length ?? 0) ? "vision" : "text");
  const prepared = await prepareAntigravityTask({ prompt: input.prompt, model: input.model, capability,
    imageUrls: input.imageUrls, signal: input.signal });
  return runPreparedAntigravityTask(prepared, { signal: input.signal, onDelta: input.onDelta });
}

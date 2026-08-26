import { readNomiLocalAsset } from "../assets/localAssetFile";
import { hardenedFetch } from "../hardenedFetch";
import { antigravityConnection, antigravityEnvironment, probeAntigravity } from "./antigravityConnection";
import { readAntigravityEvidence } from "./antigravityEvidenceStore";
import { runAntigravityProcess, type AntigravityRunOptions } from "./antigravityProcess";
import type { AntigravityImageInput } from "./antigravityMedia";

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

export async function runAntigravityTask(input: Omit<AntigravityRunOptions, "images" | "cliVersion"> & { imageUrls?: string[] }) {
  checkAbort(input.signal);
  if ((input.imageUrls?.length ?? 0) > 4) throw new Error("ANTIGRAVITY_INVALID_IMAGES");
  const env = await antigravityEnvironment();
  const discovery = await probeAntigravity(input.signal, { env });
  checkAbort(input.signal);
  if (input.model && input.model !== "auto" && !discovery.models.some((model) => model.id === input.model)) {
    throw new Error("ANTIGRAVITY_MODEL_UNAVAILABLE");
  }
  const images: AntigravityImageInput[] = [];
  for (const url of input.imageUrls ?? []) images.push(await loadAntigravityImage(url, input.signal));
  const capability = input.capability ?? (images.length ? "vision" : "text");
  const modelId = input.model || "auto";
  // Lazy, idempotent restart restore. The probed CLI version is the authority boundary;
  // renderer/catalog metadata is never accepted as verification evidence.
  antigravityConnection.restore(readAntigravityEvidence());
  const passed = antigravityConnection.hasPassed({ capability, modelId }, discovery.version)
    || (capability === "text"
      && antigravityConnection.hasPassed({ capability: "vision", modelId }, discovery.version));
  if (!passed) throw new Error("ANTIGRAVITY_TEST_REQUIRED");
  return runAntigravityProcess({ prompt: input.prompt, model: input.model, capability, images,
    signal: input.signal, onDelta: input.onDelta, cliVersion: discovery.version }, { env });
}

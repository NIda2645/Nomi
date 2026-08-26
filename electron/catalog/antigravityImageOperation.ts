import { consumePreparedAntigravityTask, runPreparedAntigravityTask } from "../ai/antigravityTask";
import type { AntigravityResult } from "../ai/antigravityProtocol";
import { LocalTaskJobs } from "../tasks/localTaskJobs";
import type { ProcessOperationInput } from "./processOperation";
import { isJsonRecord } from "../jsonUtils";

export const antigravityImageJobs = new LocalTaskJobs<AntigravityResult>();
export async function executeAntigravityImageOperation(input: ProcessOperationInput) {
  if (input.process.args.length !== 1) throw new Error("ANTIGRAVITY_INVALID_CAPABILITY");
  const writeAsset = input.writeDeterministicAsset;
  if (!writeAsset) throw new Error("ANTIGRAVITY_ASSET_WRITER_REQUIRED");
  const request = isJsonRecord(input.context.request) ? input.context.request : {};
  const params = isJsonRecord(request.params) ? request.params : {};
  const provider = isJsonRecord(input.context.providerMeta) ? input.context.providerMeta : {};
  if (input.process.args[0] === "query_result") {
    const taskId = String(provider.task_id ?? provider.query_id ?? "");
    const response = antigravityImageJobs.query(taskId, input.projectId, (result) => {
      if (result.artifacts?.length !== 1) throw new Error("ANTIGRAVITY_IMAGE_MISSING");
      const artifact = result.artifacts[0];
      const written = writeAsset(input.projectId, Buffer.from(artifact.bytes), artifact.filename, artifact.mimeType,
        { kind: "generated", provider: "antigravity-cli", conversationId: result.conversationId, localTaskId: taskId,
          width: artifact.width, height: artifact.height }, `antigravity:${taskId}`) as { data?: { url?: string } };
      return written.data?.url ? [written.data.url] : [];
    });
    return { response, request: { transport: "antigravity-cli", operation: "query", taskId } };
  }
  const mode = input.process.args[0];
  if (mode !== "text_to_image" && mode !== "image_edit") throw new Error("ANTIGRAVITY_INVALID_CAPABILITY");
  if (!input.antigravityPreflight) throw new Error("ANTIGRAVITY_PREFLIGHT_REQUIRED");
  const refs = params.reference_images;
  const imageUrls = refs == null ? [] : typeof refs === "string" ? [refs] : Array.isArray(refs) ? refs : [null];
  if (imageUrls.some((url) => typeof url !== "string" || !url.trim()) || imageUrls.length > 4
    || (mode === "image_edit" ? !imageUrls.length : imageUrls.length > 0)) throw new Error("ANTIGRAVITY_INVALID_IMAGES");
  const prompt = typeof request.prompt === "string" ? request.prompt : "";
  if (!prompt.trim()) throw new Error("ANTIGRAVITY_EMPTY_PROMPT");
  consumePreparedAntigravityTask(input.antigravityPreflight, { prompt, modelId: "auto",
    capability: mode === "image_edit" ? "edit" : "image", imageUrls: imageUrls as string[] });
  const taskId = antigravityImageJobs.start(input.projectId, async (signal) => {
    return runPreparedAntigravityTask(input.antigravityPreflight!, { signal });
  }, input.signal);
  return { response: { task_id: taskId, status: "queued", image_urls: [] },
    request: { transport: "antigravity-cli", operation: mode, referenceCount: imageUrls.length } };
}

import { assertPreparedAntigravityTaskMatches, prepareAntigravityTask,
  type PreparedAntigravityTask } from "../ai/antigravityTask";
import { assertCanonicalAntigravityOperation } from "./antigravityCatalog";
import type { HttpOperation, ProfileKind } from "./types";
import { taskTemplateParams, type TaskParamsInput } from "./taskParams";

/** Await the main-owned proof and exact executable identity before spend/admission. */
export async function prepareAntigravityCreateOperation(input: {
  vendorKey: string;
  modelKey?: string;
  taskKind: ProfileKind;
  operation: HttpOperation;
  request: TaskParamsInput & { prompt: string };
}): Promise<PreparedAntigravityTask | undefined> {
  if (input.operation.process?.parser !== "antigravity-cli-image") return undefined;
  assertCanonicalAntigravityOperation({ ...input, stage: "create" });
  const selected = { vendorKey: input.vendorKey, modelKey: input.modelKey };
  const references = taskTemplateParams(input.request, selected).reference_images;
  const imageUrls = Array.isArray(references) ? references : [];
  const capability = input.taskKind === "image_edit" ? "edit" : "image";
  const prepared = await prepareAntigravityTask({
    prompt: input.request.prompt,
    model: "auto",
    capability,
    imageUrls,
  });
  const currentReferences = taskTemplateParams(input.request, selected).reference_images;
  assertPreparedAntigravityTaskMatches(prepared, { prompt: input.request.prompt, modelId: "auto", capability,
    imageUrls: Array.isArray(currentReferences) ? currentReferences as string[] : [] });
  return prepared;
}

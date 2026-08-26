import { prepareAntigravityTask, type PreparedAntigravityTask } from "../ai/antigravityTask";
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
  const references = taskTemplateParams(input.request).reference_images;
  return prepareAntigravityTask({
    prompt: input.request.prompt,
    model: "auto",
    capability: input.taskKind === "image_edit" ? "edit" : "image",
    imageUrls: Array.isArray(references) ? references : [],
  });
}

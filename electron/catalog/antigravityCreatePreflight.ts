import { prepareAntigravityTask, type AntigravityTaskPreflight } from "../ai/antigravityTask";
import { assertCanonicalAntigravityOperation } from "./antigravityCatalog";
import type { HttpOperation, ProfileKind } from "./types";

/** Await the main-owned proof and exact executable identity before spend/admission. */
export async function prepareAntigravityCreateOperation(input: {
  vendorKey: string;
  modelKey?: string;
  taskKind: ProfileKind;
  operation: HttpOperation;
}): Promise<AntigravityTaskPreflight | undefined> {
  if (input.operation.process?.parser !== "antigravity-cli-image") return undefined;
  assertCanonicalAntigravityOperation({ ...input, stage: "create" });
  return prepareAntigravityTask({
    model: "auto",
    capability: input.taskKind === "image_edit" ? "edit" : "image",
  });
}

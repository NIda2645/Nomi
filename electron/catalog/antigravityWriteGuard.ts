import { ANTIGRAVITY_VENDOR_KEY, ANTIGRAVITY_IMAGE_MODEL_KEY, type AntigravityTestRequest } from "../shared/antigravity";
import { isJsonRecord } from "../jsonUtils";
import type { Model, Vendor } from "./types";
import type { Mapping } from "./types";
import { assertCanonicalAntigravityImageMapping, usesAntigravityImageParser } from "./antigravityCatalog";
type Proof = (request?: AntigravityTestRequest) => boolean;
export function guardAntigravityVendorWrite(raw: Record<string, unknown>, existing: Vendor | undefined, proof: Proof): void {
  if (String(raw.key ?? "").trim() !== ANTIGRAVITY_VENDOR_KEY) return;
  if ((raw.authType !== undefined && raw.authType !== "none")
    || (raw.baseUrlHint !== undefined && raw.baseUrlHint !== "local://antigravity")) throw new Error("ANTIGRAVITY_INVALID_CONFIG");
  if (raw.enabled !== false && !existing?.enabled && !proof()) throw new Error("ANTIGRAVITY_TEST_REQUIRED");
}
export function guardAntigravityModelWrite(raw: Record<string, unknown>, existing: Model | undefined, proof: Proof): void {
  if (String(raw.vendorKey ?? "").trim() !== ANTIGRAVITY_VENDOR_KEY) return;
  const modelId = String(raw.modelKey ?? "").trim();
  const image = modelId === ANTIGRAVITY_IMAGE_MODEL_KEY;
  const meta = isJsonRecord(raw.meta) ? raw.meta : {};
  if (raw.customCall || meta.supportsToolCalls === true
    || (raw.kind !== undefined && raw.kind !== (image ? "image" : "text"))) throw new Error("ANTIGRAVITY_INVALID_CONFIG");
  if (raw.enabled !== false && !existing?.enabled) {
    const ready = image
      ? proof({ capability: "image", modelId: "auto" }) || proof({ capability: "edit", modelId: "auto" })
      : proof({ capability: "text", modelId }) || proof({ capability: "vision", modelId });
    if (!ready) throw new Error("ANTIGRAVITY_TEST_REQUIRED");
  }
}

export function guardAntigravityMappingWrite(mapping: Mapping, proof: Proof): void {
  const reserved = usesAntigravityImageParser(mapping);
  if (!reserved && mapping.vendorKey !== ANTIGRAVITY_VENDOR_KEY) return;
  assertCanonicalAntigravityImageMapping(mapping);
  if (!mapping.enabled) return;
  const capability = mapping.taskKind === "image_edit" ? "edit" : "image";
  if (!proof({ capability, modelId: "auto" })) throw new Error("ANTIGRAVITY_TEST_REQUIRED");
}

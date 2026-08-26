export const ANTIGRAVITY_VENDOR_KEY = "antigravity-cli";
export const ANTIGRAVITY_IMAGE_MODEL_KEY = "generate_image";
export const ANTIGRAVITY_CAPABILITIES = ["text", "vision", "image", "edit"] as const;
export type AntigravityCapability = typeof ANTIGRAVITY_CAPABILITIES[number];
export type AntigravityTestRequest = { capability: AntigravityCapability; modelId: string };
export type AntigravityCheck = AntigravityTestRequest & {
  state: "passed" | "failed" | "cancelled";
  checkedAt: number;
  version: string;
  code?: string;
};
export type AntigravityConnectionStatus = {
  state: "missing" | "login-required" | "unverified" | "ready" | "limited" | "error";
  version?: string;
  code?: string;
  checkedAt: number;
  loginCommand: string;
  models: Array<{ id: string; label: string }>;
  /** Per-model/per-capability evidence. Discovery alone never adds a passed check. */
  checks?: AntigravityCheck[];
};

export function parseAntigravityTestRequest(value: unknown): AntigravityTestRequest {
  if (value === undefined) return { capability: "text", modelId: "auto" };
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ANTIGRAVITY_INVALID_TEST");
  const input = value as Record<string, unknown>;
  if (!ANTIGRAVITY_CAPABILITIES.includes(input.capability as AntigravityCapability)
    || typeof input.modelId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(input.modelId)
    || Object.keys(input).some((key) => key !== "capability" && key !== "modelId")
    || (["image", "edit"].includes(String(input.capability)) && input.modelId !== "auto")) {
    throw new Error("ANTIGRAVITY_INVALID_TEST");
  }
  return { capability: input.capability as AntigravityCapability, modelId: input.modelId };
}

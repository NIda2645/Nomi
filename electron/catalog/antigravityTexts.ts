import { ANTIGRAVITY_VENDOR_KEY } from "../shared/antigravity";

export const ANTIGRAVITY_VENDOR_SEED = {
  key: ANTIGRAVITY_VENDOR_KEY, name: "Antigravity CLI", baseUrl: "local://antigravity",
  authType: "none", authHeader: null, enabled: false,
} as const;
export const ANTIGRAVITY_TEXT_MODELS = [{
  modelKey: "auto", labelZh: "Antigravity CLI", kind: "text" as const,
  meta: { supportsToolCalls: false, supportsImageInput: false, supportsPdfInput: false },
}];

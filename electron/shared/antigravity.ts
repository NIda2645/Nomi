export const ANTIGRAVITY_VENDOR_KEY = "antigravity-cli";
export type AntigravityConnectionStatus = {
  state: "missing" | "login-required" | "unverified" | "ready" | "limited" | "error";
  version?: string;
  code?: string;
  checkedAt: number;
  loginCommand: string;
  models: Array<{ id: string; label: string }>;
};

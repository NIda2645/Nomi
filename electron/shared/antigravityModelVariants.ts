export type AntigravityModelVariant = Readonly<{
  familyKey: string;
  familyLabel: string;
  variantLabel: string;
  defaultVariant: boolean;
}>;

// Display metadata only. Execution, enablement and verification keep the exact wire ID.
// Unknown IDs stay independent; never strip arbitrary suffixes to infer a family.
const variants = new Map<string, AntigravityModelVariant>();
for (const version of ["3.7", "3.6", "3.5"]) {
  for (const [tier, label] of [["low", "Low"], ["medium", "Medium"], ["high", "High"]]) {
    const familyKey = `gemini-${version}-flash`;
    variants.set(`${familyKey}-${tier}`, Object.freeze({
      familyKey, familyLabel: `Gemini ${version} Flash`, variantLabel: label, defaultVariant: tier === "medium",
    }));
  }
}
for (const [tier, label] of [["low", "Low"], ["high", "High"]]) {
  variants.set(`gemini-3.1-pro-${tier}`, Object.freeze({
    familyKey: "gemini-3.1-pro", familyLabel: "Gemini 3.1 Pro", variantLabel: label, defaultVariant: tier === "high",
  }));
}
for (const [id, familyKey, familyLabel, variantLabel] of [
  ["claude-sonnet-4-6", "claude-sonnet-4-6", "Claude Sonnet 4.6", "Thinking"],
  ["claude-opus-4-6-thinking", "claude-opus-4-6", "Claude Opus 4.6", "Thinking"],
  ["gpt-oss-120b-medium", "gpt-oss-120b", "GPT-OSS 120B", "Medium"],
]) {
  variants.set(id, Object.freeze({ familyKey, familyLabel, variantLabel, defaultVariant: true }));
}

export function getAntigravityModelVariant(modelKey: string): AntigravityModelVariant | undefined {
  return variants.get(modelKey);
}

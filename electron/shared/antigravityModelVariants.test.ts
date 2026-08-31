import { describe, expect, it } from "vitest";
import { getAntigravityModelVariant } from "./antigravityModelVariants";

describe("Antigravity model families", () => {
  it("projects fourteen exact IDs into seven families with one default each", () => {
    const ids = [
      ...["3.7", "3.6", "3.5"].flatMap(version =>
        ["low", "medium", "high"].map(tier => `gemini-${version}-flash-${tier}`)),
      "gemini-3.1-pro-low", "gemini-3.1-pro-high",
      "claude-sonnet-4-6", "claude-opus-4-6-thinking", "gpt-oss-120b-medium",
    ];
    const variants = ids.map(id => getAntigravityModelVariant(id));
    expect(variants.every(Boolean)).toBe(true);
    expect(new Set(variants.map(variant => variant?.familyKey)).size).toBe(7);
    for (const familyKey of new Set(variants.map(variant => variant?.familyKey))) {
      expect(variants.filter(variant => variant?.familyKey === familyKey && variant?.defaultVariant)).toHaveLength(1);
    }
    expect(getAntigravityModelVariant("gemini-3.7-flash-medium")).toEqual({
      familyKey: "gemini-3.7-flash", familyLabel: "Gemini 3.7 Flash", variantLabel: "Medium", defaultVariant: true,
    });
    expect(getAntigravityModelVariant("gemini-3.1-pro-high")?.defaultVariant).toBe(true);
    expect(getAntigravityModelVariant("claude-sonnet-4-6")).toEqual({
      familyKey: "claude-sonnet-4-6", familyLabel: "Claude Sonnet 4.6", variantLabel: "Thinking", defaultVariant: true,
    });
  });

  it.each(["auto", "generate_image", "gemini-3.7-flash", "gemini-3.7-flash-turbo", "gemini-3.1-pro-medium", "future-high", "Gemini-3.7-flash-high", "toString"])(
    "does not infer identity for unknown ID %s", id => {
      expect(getAntigravityModelVariant(id)).toBeUndefined();
    },
  );
});

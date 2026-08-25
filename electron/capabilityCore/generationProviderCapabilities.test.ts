import { describe, expect, it } from "vitest";
import {
  assertGenerationProviderCanSubmit,
  classifyGenerationProviderCapabilities,
  type GenerationProviderCapabilityInput,
} from "./generationProviderCapabilities";

const profiles: Array<[string, GenerationProviderCapabilityInput, string]> = [
  ["full", { submitIdempotency: true, query: true, reconcile: true, cancel: true }, "full_recovery"],
  ["observe", { submitIdempotency: false, query: true, reconcile: true, cancel: false }, "observe_only"],
  ["submit", { submitIdempotency: false, query: false, reconcile: false, cancel: false }, "submit_only"],
];

describe("generation provider capability profiles", () => {
  it.each(profiles)("classifies %s without requiring all recovery features", (_name, input, expected) => {
    expect(classifyGenerationProviderCapabilities(input)).toBe(expected);
  });

  it("allows a provider with a submit function even when recovery capabilities are absent", () => {
    expect(() => assertGenerationProviderCanSubmit({
      providerId: "apimart",
      submit: async () => ({ providerTaskId: "task-1" }),
    })).not.toThrow();
  });

  it("blocks only a provider without an executable submit function", () => {
    expect(() => assertGenerationProviderCanSubmit({ providerId: "broken", submit: undefined })).toThrow("submit");
  });
});

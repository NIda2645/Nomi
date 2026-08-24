export type GenerationProviderCapabilityInput = {
  submitIdempotency: boolean;
  query: boolean;
  reconcile: boolean;
  cancel: boolean;
};

export type GenerationProviderCapabilityProfile =
  | "full_recovery"
  | "observe_only"
  | "submit_only";

export class GenerationProviderSubmitUnsupportedError extends Error {
  readonly code = "provider_submit_unsupported" as const;

  constructor(providerId: string) {
    super(`Provider ${providerId} does not expose an executable submit operation`);
    this.name = "GenerationProviderSubmitUnsupportedError";
  }
}

export function classifyGenerationProviderCapabilities(
  input: GenerationProviderCapabilityInput,
): GenerationProviderCapabilityProfile {
  if (input.submitIdempotency && input.query && input.reconcile && input.cancel) return "full_recovery";
  if (input.query || input.reconcile) return "observe_only";
  return "submit_only";
}

export function assertGenerationProviderCanSubmit(input: {
  providerId: string;
  submit?: unknown;
}): void {
  if (typeof input.submit !== "function") throw new GenerationProviderSubmitUnsupportedError(input.providerId);
}

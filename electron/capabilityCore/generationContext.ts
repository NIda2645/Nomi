export type GenerationContextAsset = {
  assetId: string;
  contentHash: string;
  version: number;
  kind: string;
};

export type GenerationContextProviderProfile = {
  providerId: string;
  modelIds: string[];
};

export type GenerationContext = {
  projectId: string;
  immutableProjectUuid: string;
  projectGeneration: number;
  assets: GenerationContextAsset[];
  providerProfiles: GenerationContextProviderProfile[];
};

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export function createGenerationContext(input: GenerationContext): Readonly<GenerationContext> {
  if (!input.projectId.trim() || !input.immutableProjectUuid.trim() || !Number.isInteger(input.projectGeneration) || input.projectGeneration < 0) {
    throw new Error("Generation context project identity is invalid");
  }
  return deepFreeze(structuredClone(input));
}


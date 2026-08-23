import { parseModuleManifest, type ModuleManifest, type ModelProfile, type ProviderProfile } from "./moduleManifest";

export class ModuleRegistryError extends Error {
  readonly code = "unsupported_capability" as const;

  constructor(message: string) {
    super(message);
    this.name = "ModuleRegistryError";
  }
}

export type ModuleResolveInput = {
  moduleId: string;
  providerId: string;
  modelId: string;
  mode: string;
};

export type ResolvedModule = {
  moduleId: string;
  version: string;
  providerId: string;
  modelId: string;
  mode: string;
  inputKinds: readonly string[];
  outputKinds: readonly string[];
  parameterSchema: ModuleManifest["parameterSchema"];
  assetInputSchema: ModuleManifest["assetInputSchema"];
  capabilities: ModelProfile["capabilities"];
};

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export function createModuleRegistry(input: readonly unknown[]) {
  const manifests = input.map(parseModuleManifest);
  const ids = new Set<string>();
  for (const manifest of manifests) {
    if (ids.has(manifest.moduleId)) throw new ModuleRegistryError(`Duplicate module: ${manifest.moduleId}`);
    ids.add(manifest.moduleId);
  }
  const snapshot = deepFreeze(structuredClone(manifests)) as readonly ModuleManifest[];

  function resolve(request: ModuleResolveInput): ResolvedModule {
    const manifest = snapshot.find((candidate) => candidate.moduleId === request.moduleId);
    if (!manifest) throw new ModuleRegistryError(`Unknown module: ${request.moduleId}`);
    if (!manifest.modes.includes(request.mode)) throw new ModuleRegistryError(`Unsupported mode: ${request.mode}`);
    const provider: ProviderProfile | undefined = manifest.providers.find((candidate) => candidate.providerId === request.providerId);
    if (!provider) throw new ModuleRegistryError(`Unknown provider: ${request.providerId}`);
    const model = provider.models.find((candidate) => candidate.modelId === request.modelId);
    if (!model) throw new ModuleRegistryError(`Unknown model: ${request.modelId}`);
    if (!model.modes.includes(request.mode)) throw new ModuleRegistryError(`Model ${request.modelId} does not support mode ${request.mode}`);
    return {
      moduleId: manifest.moduleId,
      version: manifest.version,
      providerId: provider.providerId,
      modelId: model.modelId,
      mode: request.mode,
      inputKinds: manifest.inputKinds,
      outputKinds: manifest.outputKinds,
      parameterSchema: { ...manifest.parameterSchema, ...model.parameterSchema },
      assetInputSchema: manifest.assetInputSchema,
      capabilities: model.capabilities,
    };
  }

  return {
    snapshot: () => snapshot,
    resolve,
  };
}


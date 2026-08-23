import type { ProductionExecutionBinding } from "../productionRun/productionExecutionBinding";
import type { ExecutionContractV1 } from "./executionContract";
import { assertGenerationProviderCanSubmit } from "./generationProviderCapabilities";

export type ResolvedTaskRequestV1 = {
  moduleId: string;
  providerId: string;
  modelId: string;
  variantId?: string;
  mode: string;
  prompt: string;
  parameters: Record<string, unknown>;
  references: ExecutionContractV1["references"];
  contractHash: string;
  idempotencyKey: string;
  requestFingerprint: string;
  executionBinding: ProductionExecutionBinding;
};

export type GenerationProviderCapabilities = {
  submitIdempotency: boolean;
  query: boolean;
  reconcile: boolean;
  cancel: boolean;
};

export type GenerationProvider = {
  providerId: string;
  capabilities: GenerationProviderCapabilities;
  buildRequest: (input: ResolvedTaskRequestV1) => unknown;
  submit: (request: unknown, idempotencyKey: string) => Promise<{ providerTaskId: string; raw?: unknown }>;
  query?: (providerTaskId: string) => Promise<{ status: string; raw?: unknown }>;
  reconcile?: (input: { idempotencyKey: string; providerTaskId?: string }) => Promise<{ found: boolean; providerTaskId?: string; raw?: unknown }>;
  cancel?: (providerTaskId: string) => Promise<{ status: "cancelled_remote" | "too_late" | "detached"; raw?: unknown }>;
};

export class GenerationProviderCapabilityError extends Error {
  readonly code = "provider_capability_missing" as const;

  constructor(providerId: string, missing: string[]) {
    super(`Provider ${providerId} lacks required recovery capabilities: ${missing.join(", ")}`);
    this.name = "GenerationProviderCapabilityError";
  }
}

export class GenerationRuntimeBindingError extends Error {
  readonly code = "execution_binding_mismatch" as const;

  constructor(message: string) {
    super(message);
    this.name = "GenerationRuntimeBindingError";
  }
}

export function assertGenerationProviderCapabilities(provider: GenerationProvider): void {
  const missing = (["submitIdempotency", "query", "reconcile", "cancel"] as const)
    .filter((capability) => !provider.capabilities[capability]);
  if (missing.length > 0) throw new GenerationProviderCapabilityError(provider.providerId, missing);
}

export function resolveExecutionContract(contract: ExecutionContractV1, binding: ProductionExecutionBinding): ResolvedTaskRequestV1 {
  if (contract.contractHash !== binding.contractHash) throw new GenerationRuntimeBindingError("Contract hash does not match the sealed execution binding");
  if (contract.providerId !== binding.providerNamespace) throw new GenerationRuntimeBindingError("Provider namespace does not match the sealed execution binding");
  return {
    moduleId: contract.moduleId,
    providerId: contract.providerId,
    modelId: contract.modelId,
    ...(contract.variantId ? { variantId: contract.variantId } : {}),
    mode: contract.mode,
    prompt: contract.prompt,
    parameters: structuredClone(contract.parameters),
    references: structuredClone(contract.references),
    contractHash: contract.contractHash,
    idempotencyKey: binding.providerIdempotencyKey,
    requestFingerprint: binding.requestFingerprint,
    executionBinding: structuredClone(binding),
  };
}

export function createGenerationRuntimeAdapter(deps: { providers: readonly GenerationProvider[] }) {
  const providers = new Map<string, GenerationProvider>();
  for (const provider of deps.providers) {
    if (providers.has(provider.providerId)) throw new Error(`Duplicate generation provider: ${provider.providerId}`);
    providers.set(provider.providerId, provider);
  }

  async function submit(input: { contract: ExecutionContractV1; binding: ProductionExecutionBinding }): Promise<{ providerTaskId: string; raw?: unknown; request: ResolvedTaskRequestV1 }> {
    const request = resolveExecutionContract(input.contract, input.binding);
    const provider = providers.get(request.providerId);
    if (!provider) throw new GenerationProviderCapabilityError(request.providerId, ["registered_provider"]);
    assertGenerationProviderCanSubmit(provider);
    const providerRequest = provider.buildRequest(request);
    const result = await provider.submit(providerRequest, request.idempotencyKey);
    if (!result.providerTaskId.trim()) throw new Error("Provider returned an empty task id");
    return { ...result, request };
  }

  return { submit };
}

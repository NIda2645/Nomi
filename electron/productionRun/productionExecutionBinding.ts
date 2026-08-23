import { z } from "zod";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const productionExecutionBindingSchema = z.object({
  immutableProjectUuid: z.string().trim().min(1),
  projectGeneration: z.number().int().nonnegative(),
  runId: z.string().trim().min(1),
  shotId: z.string().trim().min(1),
  contractHash: hashSchema,
  runtimeTaskId: z.string().trim().min(1),
  providerNamespace: z.string().trim().min(1),
  providerIdempotencyKey: z.string().trim().min(1),
  requestFingerprint: hashSchema,
  runtimeEnvelopeRef: z.string().trim().min(1),
  fencingEpoch: z.number().int().nonnegative(),
}).strict();

export type ProductionExecutionBinding = z.infer<typeof productionExecutionBindingSchema>;

export class ProductionExecutionBindingError extends Error {
  readonly code = "execution_binding_invalid" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProductionExecutionBindingError";
  }
}

export function validateProductionExecutionBinding(value: unknown): ProductionExecutionBinding {
  try {
    return productionExecutionBindingSchema.parse(value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ProductionExecutionBindingError(error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
    }
    throw error;
  }
}

export function createProductionExecutionBinding(input: ProductionExecutionBinding): ProductionExecutionBinding {
  return validateProductionExecutionBinding(structuredClone(input));
}


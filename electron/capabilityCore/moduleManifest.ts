import { z } from "zod";

const parameterFieldSchema = z.object({
  type: z.enum(["string", "number", "integer", "boolean", "enum", "object", "array"]),
  required: z.boolean().optional(),
  enum: z.array(z.string()).min(1).optional(),
  description: z.string().optional(),
}).strict();

const recoveryCapabilitiesSchema = z.object({
  submitIdempotency: z.boolean(),
  query: z.boolean(),
  reconcile: z.boolean(),
  cancel: z.boolean(),
}).strict();

const modelProfileSchema = z.object({
  modelId: z.string().trim().min(1),
  modes: z.array(z.string().trim().min(1)).min(1),
  parameterSchema: z.record(parameterFieldSchema),
  capabilities: recoveryCapabilitiesSchema,
}).strict();

const providerProfileSchema = z.object({
  providerId: z.string().trim().min(1),
  models: z.array(modelProfileSchema).min(1),
}).strict();

export const moduleManifestSchema = z.object({
  moduleId: z.string().trim().min(1),
  version: z.string().trim().min(1),
  inputKinds: z.array(z.string().trim().min(1)).min(1),
  outputKinds: z.array(z.string().trim().min(1)).min(1),
  modes: z.array(z.string().trim().min(1)).min(1),
  parameterSchema: z.record(parameterFieldSchema),
  assetInputSchema: z.record(z.object({
    kind: z.string().trim().min(1),
    max: z.number().int().positive().optional(),
    required: z.boolean().optional(),
  }).strict()),
  providers: z.array(providerProfileSchema).min(1),
}).strict();

export type ParameterField = z.infer<typeof parameterFieldSchema>;
export type ProviderRecoveryCapabilities = z.infer<typeof recoveryCapabilitiesSchema>;
export type ModelProfile = z.infer<typeof modelProfileSchema>;
export type ProviderProfile = z.infer<typeof providerProfileSchema>;
export type ModuleManifest = z.infer<typeof moduleManifestSchema>;

export class ModuleManifestValidationError extends Error {
  readonly code = "module_manifest_invalid" as const;

  constructor(message: string) {
    super(message);
    this.name = "ModuleManifestValidationError";
  }
}

export function parseModuleManifest(value: unknown): ModuleManifest {
  try {
    return moduleManifestSchema.parse(value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ModuleManifestValidationError(error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
    }
    throw error;
  }
}


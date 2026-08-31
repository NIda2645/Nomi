import { z } from "zod";

const assetLeaseSchema = z.object({
  assetId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  immutableProjectUuid: z.string().trim().min(1),
  projectGeneration: z.number().int().nonnegative(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  version: z.number().int().positive(),
  privacy: z.enum(["project-only", "private", "public"]),
  issuedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();

export type AssetLease = z.infer<typeof assetLeaseSchema>;

export class AssetLeaseError extends Error {
  readonly code = "asset_lease_invalid" as const;

  constructor(message: string) {
    super(message);
    this.name = "AssetLeaseError";
  }
}

export function createAssetLease(value: unknown): AssetLease {
  try {
    return assetLeaseSchema.parse(value);
  } catch (error) {
    if (error instanceof z.ZodError) throw new AssetLeaseError(error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
    throw error;
  }
}

export function assertAssetLeaseUsable(
  value: unknown,
  expected: Partial<Pick<AssetLease, "projectId" | "immutableProjectUuid" | "projectGeneration" | "contentHash" | "version">>,
  now: string,
): AssetLease {
  const lease = createAssetLease(value);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue !== undefined && lease[key as keyof AssetLease] !== expectedValue) {
      throw new AssetLeaseError(`Asset lease ${key} does not match the current project`);
    }
  }
  if (Date.parse(now) >= Date.parse(lease.expiresAt)) throw new AssetLeaseError("Asset lease has expired");
  if (Date.parse(lease.issuedAt) > Date.parse(now)) throw new AssetLeaseError("Asset lease is not active yet");
  return lease;
}


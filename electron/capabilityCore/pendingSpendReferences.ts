import { iterateProjectAssets } from '../assets/assetReferenceIdentity';
import { spendReferenceInputSchema, type PendingSpendConfirm } from '../shared/contracts/pendingSpendConfirm';
import { generationReferenceSchema, type GenerationReference } from '../shared/agentCapabilities/generationPlanSchemas';
import { listProjectAssets, resolveProjectAssetReferenceIdentity, importRemoteAsset } from '../assets/projectAssetStore';
import type { ProjectBinding } from '../shared/projectBinding';

type IndexedAsset = { id: string; data: Record<string, unknown> };
export type SpendReferenceAssets = Readonly<{
  list: (projectId: string) => readonly IndexedAsset[];
  identity: (projectId: string, assetId: string) => Readonly<{ contentHash: string; version: number }> | undefined;
  import: (projectId: string, url: string, binding: ProjectBinding, assertCurrent: () => void) => Promise<unknown>;
}>;
export const projectSpendReferenceAssets: SpendReferenceAssets = {
  list: projectId => [...iterateProjectAssets(cursor => listProjectAssets({ projectId, limit: 500, cursor }))],
  identity: resolveProjectAssetReferenceIdentity,
  import: (projectId, url, projectBinding, assertCurrent) => importRemoteAsset({ projectId, url, projectBinding,
    sourceEvidence: /^https?:/i.test(url)
      ? { source: 'browser', pageUrl: url, capturedAt: new Date().toISOString(), usageStatus: 'reference_only' }
      : { source: 'user', capturedAt: new Date().toISOString(), usageStatus: 'reference_only' },
  }, { assertCurrent }),
};

export function withSpendReferencePreviews(pending: PendingSpendConfirm, assets: SpendReferenceAssets): PendingSpendConfirm {
  if (!pending.shots.some(shot => shot.references?.length)) return pending;
  const indexed = assets.list(pending.projectId);
  return { ...pending, shots: pending.shots.map(shot => ({ ...shot, references: shot.references?.map(reference => {
    const asset = indexed.find(asset => asset.id === reference.assetId);
    const url = asset?.data.url;
    return { ...reference, ...(typeof url === 'string' ? { url } : {}) };
  }) })) };
}

/** Resolve semantic UI input once at the existing project asset owner, before revising a run. */
export async function resolveSpendReferenceInputs(input: {
  projectId: string; binding: ProjectBinding; values: unknown;
  existing: readonly GenerationReference[]; assets: SpendReferenceAssets; assertCurrent: () => void;
}): Promise<GenerationReference[]> {
  if (!Array.isArray(input.values)) throw new Error('generation_reference_invalid');
  const resolved: GenerationReference[] = [];
  for (const raw of input.values) {
    input.assertCurrent();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('generation_reference_invalid');
    const value = spendReferenceInputSchema.parse(raw);
    if ('reference' in value) {
      const reference = generationReferenceSchema.parse(value.reference);
      const existing = input.existing.find(item => item.assetId === reference.assetId && item.contentHash === reference.contentHash
        && item.version === reference.version && item.kind === reference.kind && item.role === reference.role);
      if (!existing) throw new Error('generation_reference_identity_changed');
      resolved.push({ ...existing });
      continue;
    }
    if (typeof value.url !== 'string' || !value.url.trim() || !['image', 'video', 'audio'].includes(value.kind)) throw new Error('generation_reference_invalid');
    let asset = input.assets.list(input.projectId).find(asset => asset.data.url === value.url);
    if (!asset) {
      const imported = await input.assets.import(input.projectId, value.url, input.binding, input.assertCurrent);
      input.assertCurrent();
      const id = imported && typeof imported === 'object' && 'id' in imported ? imported.id : undefined;
      asset = input.assets.list(input.projectId).find(asset => asset.id === id);
    }
    // Local workspace paths outside the indexed asset owner are not silently promoted or trusted.
    if (!asset) throw new Error('generation_reference_asset_unsupported');
    const contentType = asset.data.contentType;
    if (typeof contentType !== 'string' || !contentType.startsWith(`${value.kind}/`)) throw new Error('generation_reference_kind_mismatch');
    const identity = input.assets.identity(input.projectId, asset.id);
    if (!identity) throw new Error('generation_reference_asset_unavailable');
    resolved.push(generationReferenceSchema.parse({ assetId: asset.id, ...identity, kind: value.kind, ...(value.role ? { role: value.role } : {}) }));
  }
  input.assertCurrent();
  return resolved;
}

/** Read-only URL projection; validates the pinned version against the existing asset index. */
export function resolveIndexedReferencePreview(projectId:string,reference:GenerationReference,assets:SpendReferenceAssets=projectSpendReferenceAssets):string {
  const identity=assets.identity(projectId,reference.assetId)
  const asset=assets.list(projectId).find(value=>value.id===reference.assetId)
  if (!identity || identity.contentHash!==reference.contentHash || identity.version!==reference.version || typeof asset?.data.url!=='string') throw new Error('storyboard_reference_asset_unavailable')
  return asset.data.url
}

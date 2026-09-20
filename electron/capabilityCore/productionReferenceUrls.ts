import { readCatalog } from '../catalog/catalogStore';
import { localizeAssetsForVendor } from '../catalog/assetLocalization';
import { assetIngestionResolver, assetLocalizationOptions } from '../catalog/assetTransportRuntime';
import { readNomiLocalAsset, postJsonForAssetUpload, postMultipartForAssetUpload, putBinaryForAssetUpload } from '../assets/localAssetFile';
import { projectSpendReferenceAssets, type SpendReferenceAssets } from './pendingSpendReferences';
import { spendReferenceKey } from '../shared/contracts/pendingSpendConfirm';
import type { GenerationReference } from '../shared/agentCapabilities/generationPlanSchemas';

/** Existing asset transport performs uploads before the deterministic request seal. */
async function localize(providerId: string, urls: readonly string[]): Promise<readonly string[]> {
  const catalog = readCatalog();
  const vendor = catalog.vendors.find(vendor => vendor.key === providerId);
  if (!vendor) throw new Error('generation_reference_provider_unavailable');
  const result = await localizeAssetsForVendor({ urls }, assetIngestionResolver(vendor, catalog),
    readNomiLocalAsset, postJsonForAssetUpload, postMultipartForAssetUpload,
    assetLocalizationOptions(undefined), putBinaryForAssetUpload);
  const values = (result.value as { urls?: unknown }).urls;
  if (!Array.isArray(values) || values.length !== urls.length || values.some(value => typeof value !== 'string' || !/^https?:\/\//.test(value))) {
    throw new Error('generation_reference_url_unavailable');
  }
  return values;
}

export async function resolveProductionReferenceUrls(input: Readonly<{
  projectId: string;
  providerId: string;
  references: readonly GenerationReference[];
  assertCurrent: () => void;
}>, deps: Readonly<{
  assets: SpendReferenceAssets;
  localize: typeof localize;
}> = { assets: projectSpendReferenceAssets, localize }): Promise<Readonly<Record<string, string>>> {
  input.assertCurrent();
  if (input.references.length === 0) return {};
  const indexed = deps.assets.list(input.projectId);
  const verify = (reference: GenerationReference): void => {
    const identity = deps.assets.identity(input.projectId, reference.assetId);
    if (!identity || identity.contentHash !== reference.contentHash || identity.version !== reference.version) {
      throw new Error('generation_reference_identity_changed');
    }
  };
  const urls = input.references.map(reference => {
    verify(reference);
    const asset = indexed.find(asset => asset.id === reference.assetId);
    if (!asset || typeof asset.data.url !== 'string') throw new Error('generation_reference_asset_unavailable');
    if (reference.kind && (typeof asset.data.contentType !== 'string' || !asset.data.contentType.startsWith(`${reference.kind}/`))) {
      throw new Error('generation_reference_kind_mismatch');
    }
    return asset.data.url;
  });
  const localized = await deps.localize(input.providerId, urls);
  input.assertCurrent();
  input.references.forEach(verify);
  if (localized.length !== input.references.length) throw new Error('generation_reference_url_unavailable');
  return Object.fromEntries(input.references.map((reference, index) => [spendReferenceKey(reference), localized[index]]));
}

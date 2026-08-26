import { endpoint } from '../vendorEndpoint';
import { extractVendorExtraHeaders, normalizeProviderKind } from '../catalog/catalogStore';
import type { Model, Vendor } from '../catalog/types';

/** Catalog connection rules shared by pi Agent and the non-Agent AI4 tasks. */
export function vendorModelConnection(vendor: Vendor, model: Model, apiKey: string) {
  const kind = normalizeProviderKind(vendor.providerKind);
  const headers = extractVendorExtraHeaders(vendor);
  return {
    kind,
    baseURL: kind === 'anthropic'
      ? (vendor.baseUrlHint || '').trim() || 'https://api.anthropic.com/v1'
      : endpoint(vendor, '/v1'),
    apiKey,
    authType: vendor.authType,
    modelId: (model.modelAlias || model.modelKey).trim(),
    ...(headers ? { headers } : {}),
  };
}

import { resolveHostVendorKey } from "../catalog/connectionVendorKey";
import { normalizeProviderProxyUrl } from "../providerNetwork";
import type { ProviderAdapterCatalogPort } from "./serviceCatalog";
import type {
  ProviderAdapterConnectionInput,
  ProviderAdapterRegisterInput,
  ProviderAdapterRegistration,
} from "./types";

type NormalizePurpose = "register" | "verify";

export function normalizeProviderAdapterInput<T extends ProviderAdapterConnectionInput>(
  rawInput: T,
  purpose: NormalizePurpose,
): T {
  const baseUrl = String(rawInput.baseUrl || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error("Provider base URL must begin with http:// or https://");
  const apiKey = String(rawInput.apiKey || "").trim();
  const proxyUrl = normalizeProviderProxyUrl(rawInput.proxyUrl);
  const mayKeepCredential = purpose === "register" &&
    (rawInput as ProviderAdapterRegisterInput).preserveExistingCredential === true;
  if (rawInput.authType !== "none" && !apiKey && !mayKeepCredential) throw new Error("API key is required");
  const seen = new Set<string>();
  const models = (Array.isArray(rawInput.models) ? rawInput.models : [])
    .map((model) => ({
      ...model,
      modelKey: String(model?.modelKey || "").trim(),
      labelZh: model?.labelZh?.trim(),
    }))
    .filter((model) => model.modelKey && !seen.has(model.modelKey) && seen.add(model.modelKey));
  if (purpose === "verify" && models.length === 0) throw new Error("Select at least one model to verify");
  return { ...rawInput, baseUrl, apiKey, ...(proxyUrl ? { proxyUrl } : {}), models };
}

export function registerProviderConnection(input: {
  rawInput: ProviderAdapterRegisterInput;
  catalog: ProviderAdapterCatalogPort;
  now: () => string;
}): ProviderAdapterRegistration {
  const normalized = normalizeProviderAdapterInput(input.rawInput, "register");
  // 这里只解析到「这一族的 root」。落在哪条兄弟连接上（#831：同域名可以有多条）由目录写入侧
  // 的 `defaultCatalog.register` 按「域名 + 连接名」决定 —— 身份判据只许有一个 owner，
  // 而它必须是**读得到目录**的那一层。
  const vendorKey = resolveHostVendorKey({
    baseUrl: normalized.baseUrl,
    catalogVendorKey: normalized.catalogVendorKey,
  });
  const savedAt = input.now();
  const registered = input.catalog.register({ ...normalized, vendorKey, savedAt });
  return {
    vendorKey: registered.vendor.key,
    vendorName: registered.vendor.name,
    state: "configured",
    selectedModelKeys: normalized.models.map((model) => model.modelKey),
    models: normalized.models.map((candidate) => {
      const active = registered.models.find((model) => model.modelKey === candidate.modelKey);
      return {
        modelKey: candidate.modelKey,
        labelZh: candidate.labelZh || active?.labelZh || candidate.modelKey,
        kind: candidate.kind,
        state: "unverified",
      };
    }),
    savedAt,
  };
}

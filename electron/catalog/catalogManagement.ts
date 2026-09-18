import { isJsonRecord, type JsonRecord } from "../jsonUtils";
import {
  deleteModelCatalogModel,
  deleteModelCatalogVendor,
  readCatalog,
  upsertModelCatalogVendor,
} from "./catalogStore";

/** Public management boundary: keys stay in the trusted credential page. */
export function manageModelCatalogConnection(input: unknown): unknown {
  if (!isJsonRecord(input)) throw new Error("Invalid integration management request");
  const action = String(input.action || "");
  const vendorKey = String(input.vendorKey || "").trim();
  if (!vendorKey) throw new Error("vendorKey is required");
  const catalog = readCatalog();
  const vendor = catalog.vendors.find((item) => item.key === vendorKey);
  if (!vendor) throw new Error(`Integration vendor not found: ${vendorKey}`);
  if (action === "update_vendor") {
    // 「key 去哪、怎么放」不是这扇门能改的东西（2026-09-18，docs/plan/2026-09-18-agent-model-onboarding.md §6.1）。
    // 曾经这里逐字段 patch baseUrlHint / authType / authHeader / authQueryParam —— 而已保存的密钥原样留着，
    // 于是一段**未签名的对话文本**就能把用户的密钥改寄到别的地址（Cherry Studio 那条铁律的反面：
    // "unsigned data must never control credential destinations"）。九家先例里没有一家允许
    // Agent 改一条已存 key 连接的地址。这条路只留展示名，地址与鉴权放法只能在贴 key 页上重走一次。
    const patch: JsonRecord = { key: vendorKey };
    for (const key of ["name", "providerKind"] as const) {
      if (input[key] !== undefined) patch[key] = input[key];
    }
    for (const forbidden of ["baseUrl", "baseUrlHint", "authType", "authHeader", "authQueryParam", "authScheme", "proxyUrl"] as const) {
      if (input[forbidden] !== undefined) {
        throw new Error(
          `${forbidden} cannot be changed here: where a saved key is sent is bound when the user saves it on Nomi's credential page. Reopen that page to change it.`,
        );
      }
    }
    return { action, vendor: upsertModelCatalogVendor(patch) };
  }
  if (action === "delete_vendor") {
    deleteModelCatalogVendor(vendorKey);
    return { action, vendorKey, deleted: true };
  }
  if (action === "delete_model") {
    const modelKey = String(input.modelKey || "").trim();
    if (!modelKey) throw new Error("modelKey is required for delete_model");
    if (!catalog.models.some((model) => model.vendorKey === vendorKey && model.modelKey === modelKey))
      throw new Error(`Integration model not found: ${vendorKey}/${modelKey}`);
    deleteModelCatalogModel(vendorKey, modelKey);
    return { action, vendorKey, modelKey, deleted: true };
  }
  if (action === "set_proxy") {
    if (typeof input.enabled !== "boolean") throw new Error("enabled is required for set_proxy");
    if (input.enabled && !vendor.network?.proxyUrl) throw new Error("No secure proxy is configured for this connection");
    const updated = upsertModelCatalogVendor({ key: vendorKey, network: { proxyEnabled: input.enabled } });
    return { action, vendorKey, enabled: input.enabled, vendor: updated };
  }
  throw new Error(`Unknown integration management action: ${action}`);
}

// 目录身份指纹 —— 「这次批准的是哪一份目录」冻结成一个哈希。
//
// 从 `apimartGenerationProvider.ts` 抽出来（2026-09-22 总合并按 800 行门岗拆分，R9）：它是纯函数，
// 只认目录的三张表，不认 fetch、不认运行时。**收进这一处的理由不只是行数**——这份指纹决定了
// 「用户批准之后有人改了目录，还能不能照旧发出去」，它散在 provider 那个大壳里时没人看得见它守的是什么。
//
// 命名沿用 `apimartGeneration*` 前缀：这一族改名成 `catalogGeneration*` 是登记过的一条
// （`docs/roadmap/TODO.md` T-QA-25，卡在「纯改名缺门岗豁免」上），改名时这一份跟着一起走。
import { ApimartGenerationProviderError as CatalogGenerationProviderError } from "./apimartGenerationErrors";
import { productionGenerationPayloadHash } from "../productionRun/productionGenerationAuthorization";
import type { Mapping, Model, Vendor } from "../catalog/types";

export function catalogFingerprint(selection: { vendor: Vendor; model: Model; mapping: Mapping }, extraHeaders: Record<string, string> | undefined, vendorKey: string): string {
  try {
    return productionGenerationPayloadHash({
      vendor: {
        key: selection.vendor.key,
        enabled: selection.vendor.enabled,
        baseUrlHint: selection.vendor.baseUrlHint,
        authType: selection.vendor.authType,
        authHeader: selection.vendor.authHeader,
        // 方案词是出站身份的一部分（Higgsfield 的 `Authorization: Key …`）：授权之后有人把它
        // 从 Key 改成 Bearer，必须当成「目录变了」重建请求，而不是照着旧批准发出去。
        authScheme: selection.vendor.authScheme,
        authQueryParam: selection.vendor.authQueryParam,
        providerKind: selection.vendor.providerKind,
        // Extra headers are part of the effective transport identity. They
        // must be frozen with the model/base URL so a header change after
        // approval cannot silently alter the paid request.
        extraHeaders,
      },
      model: {
        vendorKey: selection.model.vendorKey,
        modelKey: selection.model.modelKey,
        modelAlias: selection.model.modelAlias,
        kind: selection.model.kind,
        enabled: selection.model.enabled,
        meta: selection.model.meta,
      },
      mapping: {
        id: selection.mapping.id,
        vendorKey: selection.mapping.vendorKey,
        modelKey: selection.mapping.modelKey,
        taskKind: selection.mapping.taskKind,
        enabled: selection.mapping.enabled,
        create: selection.mapping.create,
        query: selection.mapping.query,
        statusMapping: selection.mapping.statusMapping,
      },
    });
  } catch {
    throw new CatalogGenerationProviderError(`${vendorKey} catalog identity is not serializable`);
  }
}

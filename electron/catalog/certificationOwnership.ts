/**
 * 「这条连接归不归认证适配器管」——全仓唯一一份判据（2026-09-29，A10b 结构修复）。
 *
 * 盘上的标记是 `meta.adapter`：认证晋升、自检、声明卡、渲染层新建的模型都会在**模型行**上写它，
 * 意思是「这一行的执行由认证契约说了算」。「这条连接归不归认证管」此前在 4 个文件里各抄一份
 * （Agent 生成器装配 / 取连接、生成器出请求、内置家发布、设置页改连接），而且都把「这家名下任何一行
 * 带标记」当成「整条连接归认证管」。于是报错用户在内置 APIMart 上点「继续验证」手加一个模型去自检，
 * Agent 那条生成路就对整家 APIMart 关门（画布那条路不查，照样出图），设置页也把整条连接锁住。
 *
 * 判据（谁能让一条连接归认证管）：
 *   · 连接本身（vendor 行）带标记 → 归；
 *   · 内置家（有代码种子）：只有**内置目录里的模型**（curated 登记表里的那些）带标记才归——
 *     那是代码拥有的契约被认证接管了；用户自己加、自己自检的模型只管它自己；
 *   · 非内置家（AI 接入 / 声明卡 / 手接的中转）：它的每一行都来自认证或声明，任何一行带标记都归。
 *
 * 「只管它自己」那一半由模型级的发布判据接着管（`shared/modelPublication` 按那一行自己的 adapter
 * 决定它发布哪些模式），不在这里。任何需要回答「这条连接归不归认证管」的地方只许 import 这里；
 * 登记在 docs/engineering/concept-owners.json（`catalog.connection.certification-ownership`）。
 */
import type { CatalogState } from "./types";
import { builtinVendorSeed } from "./builtinVendorSeeds";
import { builtinCatalogModelKeys } from "./seedBuiltins";

/** 这一行（连接或模型）的 meta 上有没有认证标记。只认有没有 `adapter` 这一格，不解读它的内容。 */
export function carriesCertificationMark(meta: unknown): boolean {
  return Boolean(meta && typeof meta === "object" && !Array.isArray(meta)
    && Object.prototype.hasOwnProperty.call(meta, "adapter"));
}

/** 这条连接归不归认证适配器管（见文件头的三条）。 */
export function isCertificationOwnedConnection(
  state: Pick<CatalogState, "vendors" | "models">,
  vendorKey: string,
): boolean {
  const vendor = state.vendors.find((candidate) => candidate.key === vendorKey);
  if (carriesCertificationMark(vendor?.meta)) return true;
  const builtinModels = builtinVendorSeed(vendorKey) ? builtinCatalogModelKeys(vendorKey) : null;
  return state.models.some((model) => model.vendorKey === vendorKey
    && carriesCertificationMark(model.meta)
    && (builtinModels === null || builtinModels.has(model.modelKey)));
}

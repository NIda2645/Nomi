import type { AuthType, VendorAuthSpec } from "../ai/requestPipeline";
import { resolveHostVendorKey } from "./connectionVendorKey";
import { builtinVendorKeyOfKey } from "../shared/builtinVendorIdentity";
import { readCatalog } from "./catalogStore";
import type { Vendor } from "./types";

/**
 * 「由连接记录得到鉴权头」的唯一来源。
 *
 * 类根因（2026-09-21）：`authScheme` 存得进 Vendor（2026-09-18 为 Higgsfield 的
 * `Authorization: Key id:secret` 加的），写路也收全了，但**读路**上「由一条已保存的连接得到鉴权头」
 * 这件事被至少四个地方各答了一遍——生成走 runtime、健康检查走 vendorHealth、自检走 selfCheck、
 * 而接入向导列模型 / 模型发现 / 凭证页测连接这三处压根没有把 scheme 传下去。于是同一把 key
 * 生成能跑、列模型 401：用户看到的是「key 是对的啊，生成都能跑，这里怎么说连不上」。
 *
 * 这个模块把那件事收成一个答案：**这四个字段永远一起走**。加第五个鉴权维度时，只改这里 +
 * `VendorAuthSpec`，编译器会在全部消费点报红。
 */
export function vendorAuthSpec(
  vendor: Pick<Vendor, "authType" | "authHeader" | "authScheme" | "authQueryParam">,
): VendorAuthSpec {
  return {
    authType: (vendor.authType || "bearer") as AuthType,
    ...(vendor.authHeader ? { headerName: vendor.authHeader } : {}),
    ...(vendor.authScheme ? { scheme: vendor.authScheme } : {}),
    ...(vendor.authQueryParam ? { queryParam: vendor.authQueryParam } : {}),
  };
}

/**
 * 接入会话这一侧：用户正在编辑的 authType / 头名 / query 参数名以会话为准（那是他刚填的），
 * 而**方案词只可能来自已保存的那条连接**——接入向导没有让人填方案词的格子，它是档案声明的
 * （`declarationCard.ts`）。找不到已保存的连接 = 全新接入，这时确实还没有方案词，缺省 Bearer。
 */
export function connectionAuthSpec(input: {
  baseUrl: string;
  authType: AuthType;
  authHeader?: string;
  authQueryParam?: string;
}): VendorAuthSpec {
  const saved = savedVendorForBaseUrl(input.baseUrl);
  return {
    authType: input.authType,
    ...(input.authHeader ? { headerName: input.authHeader } : {}),
    ...(saved?.authScheme ? { scheme: saved.authScheme } : {}),
    ...(input.authQueryParam ? { queryParam: input.authQueryParam } : {}),
  };
}

/**
 * 按 baseUrl 找那条已保存的连接（与模型发现用的是同一个推导，不另起一份）。
 *
 * #831：同一个域名可以有多条连接（满血组 / 特价组各一把 Key），所以「这条地址的那条连接」
 * 不再等于 hostname 推出来的那一个 key。这里只拿得到 baseUrl、拿不到连接名——所以按**那一族**
 * 找：root 那条优先（它就是第一条连接），没有 root 时退回族里的第一条兄弟连接。
 * 拿得到连接名的调用点该用 `resolveConnectionVendorKey`，它答得更准。
 */
export function savedVendorForBaseUrl(baseUrl: string): Vendor | undefined {
  if (!baseUrl) return undefined;
  const vendors = readCatalog().vendors;
  const root = resolveHostVendorKey({ baseUrl });
  if (!root) return undefined;
  return vendors.find((candidate) => candidate.key === root)
    ?? vendors.find((candidate) => builtinVendorKeyOfKey(candidate.key) === root);
}

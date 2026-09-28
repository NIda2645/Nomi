/**
 * 「这个接入会话落在哪条连接上」——#831 之后身份 = 域名 + 连接名，反查必须带连接名，
 * 否则同域名的多条连接会全部落到 host 那条（读错 Key / 写错行）。
 *
 * 住在 integrationSession.ts 外面是刻意的：那份文件是白名单巨壳（`check:filesize` 基线 1394），
 * 只可减不可增；而这条判据本来就该有自己的名字。
 */
import { resolveConnectionVendorKey } from "../catalog/connectionVendorKey";

export function sessionVendorKey(
  session: { config: { baseUrl?: string; name: string } },
  vendors: readonly { key: string }[],
): string {
  return resolveConnectionVendorKey({ baseUrl: session.config.baseUrl, name: session.config.name, vendors });
}

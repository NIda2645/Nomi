// Replicate 供应商种子（key/鉴权/本地图吞入声明）。原「元素拆解」入口 2026-10-03 随节点浮条瘦身删除，只留供应商目录条目（用户已保存的连接不动）。
import type { AssetIngestion } from "./types";

/**
 * Replicate 供应商种子（裸 baseUrl 到 /v1 + bearer + 文件 API 吞本地图）。
 *
 * `bespokeExecution`：这家的执行契约是**多输出**的，刻意不套单结果 mapping runtime（见顶注），
 * 所以它没有 curated mapping。但它同样是代码拥有、2026-06-28 真生成实测固化过的契约——
 * 发布判据必须认这一种形态，否则「元素拆解」填了 key 也永远点不亮
 * （decomposeLayers.ts 要求 `vendors.find(v => v.key === 'replicate' && v.enabled)`）。
 * 为它编一条没人消费的假 mapping 是更差的那条路：那会让它出现在图片模型选择器里、点了就坏。
 */
export const REPLICATE_VENDOR_SEED = {
  key: "replicate",
  name: "Replicate",
  baseUrl: "https://api.replicate.com/v1",
  authType: "bearer" as const,
  authHeader: "Authorization",
  bespokeExecution: {
    capability: "decompose-layers",
    path: "electron/image/decomposeLayers.ts", // 该主进程路径已随「拆解元素」入口删除；声明留着，只为 replicate 的发布判据（hasBuiltinCuratedExecution）不变
  },
  /** 本地素材（nomi-local://）→ 传 Replicate 文件 API 拿可达 URL（multipart field "content"，取 urls.get）。 */
  assetIngestion: {
    strategy: "upload-multipart",
    endpoint: "https://api.replicate.com/v1/files",
    fileField: "content",
    urlPath: "urls.get",
    authType: "bearer",
    accepts: ["image", "video", "audio"],
  } as AssetIngestion,
} as const;

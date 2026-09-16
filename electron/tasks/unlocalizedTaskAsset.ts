// 任务没有项目身份（无窗口、无头调用、明确的「不属于任何项目」）时生成结果的资产形状。
// 项目身份只来自提交那一刻随任务固定的 projectId，主进程不再记「当前活动项目」来兜底——
// 兜底会把切项目之后才完成的结果落进另一个项目。
/**
 * 无项目身份时的资产形状：
 * 绝不再「只存 url」——把厂商临时链接同时写进 providerUrl，明确标记「这是易失的 CDN 链接」，
 * 让播放/参考侧的 url→providerUrl 兜底链有链可退、渲染层的补救本地化认得出它。
 */
export function unlocalizedTaskAsset(
  type: "image" | "video" | "audio" | "model3d",
  url: string,
): { type: typeof type; url: string; thumbnailUrl: string | null; providerUrl: string | null } {
  return {
    type,
    url,
    thumbnailUrl: type === "image" ? url : null,
    providerUrl: /^https?:\/\//i.test(url) ? url : null,
  };
}

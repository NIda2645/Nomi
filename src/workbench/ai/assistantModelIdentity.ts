// 助手模型选择器的「模型身份」——纯函数，单一真相源。
//
// 根因（2026-08-12 用户反馈「右侧 agent 显示的模型不是真实模型」）：模型的真实身份是
// **(vendorKey, modelKey) 两段**，偏好里也一直是这么存的；但选择器只拿 modelKey 当 option value
// 和匹配依据。同一个 modelKey 挂在多个供应商下是常态（从 APIMart 加了 gpt-5.2，又从自建中转
// 加了一个同名的），于是：
//   · 下拉里出现重复 value → 显示的是**第一条**，可能根本不是偏好里存的那个供应商的；
//   · 选中时 find(m => m.modelKey === next) 也只找第一条 → 静默绑到**另一个供应商**去。
// 身份从 derive 而来、不再用半截 key 凑合，这类「显示/绑定张冠李戴」才不会换个入口又复发。

export type ModelIdentity = { vendorKey: string; modelKey: string };

/** 两段身份 → DOM 安全且可逆的 option value。用 encodeURIComponent 是因为 vendorKey 是从
 *  baseUrl 派生的串，什么字符都可能有，随便挑个分隔符迟早撞上。 */
export function encodeModelIdentity(identity: ModelIdentity): string {
  return `${encodeURIComponent(identity.vendorKey)}/${encodeURIComponent(identity.modelKey)}`;
}

export function decodeModelIdentity(value: string): ModelIdentity | null {
  const slash = value.indexOf("/");
  if (slash < 0) return null;
  try {
    return {
      vendorKey: decodeURIComponent(value.slice(0, slash)),
      modelKey: decodeURIComponent(value.slice(slash + 1)),
    };
  } catch {
    return null;
  }
}

/**
 * 只在**真有歧义**时才把供应商名缀到标签上（同一个 modelKey 挂了多个供应商）。
 * 不无条件缀：绝大多数人只接一家，凭空多出「· 某某」是噪音（P2 用户视角 + 极简）。
 * 供应商名取 catalog 里的 name；取不到才退回 key（派生串不好看，但总比分不清哪个强）。
 */
export function labelForModel(
  model: { modelKey: string; labelZh?: string; vendorKey: string },
  allModels: ReadonlyArray<{ modelKey: string }>,
  vendorNameByKey: Readonly<Record<string, string>>,
): string {
  const base = model.labelZh || model.modelKey;
  const duplicated = allModels.filter((item) => item.modelKey === model.modelKey).length > 1;
  if (!duplicated) return base;
  return `${base} · ${vendorNameByKey[model.vendorKey] || model.vendorKey}`;
}

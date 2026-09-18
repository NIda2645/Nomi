/**
 * 「保存一次连接就静默丢字段」的类闭包（P2/R21，2026-09-18）。
 *
 * **旧写法（白名单式保留）**：`apply*Upsert` 重建记录时按名字逐个搬字段。没被列举的字段
 * 保存之后就不见了，而且**没有任何人会报错**——给 `Vendor` / `Model` / `Mapping` 加一个字段、
 * 忘了同步改那一坨字面量，就是一次静默的数据丢失。已经这样掉过的：`Vendor.assetIngestion`
 * （这家怎么传参考图）、`Vendor.authScheme`（`Authorization: Key …` 退回 `Bearer` ⇒ 401）、
 * `Mapping.delivery` / `Mapping.abandon`（导入的传输契约，落盘即丢）。用户镜头里因果隔着几天：
 * 他只是回设置页改了个名字，几天后参考图不生效，永远连不起来。
 *
 * **新写法（白名单式覆写）**：`UpsertDraft<T>` 的 `-?` 抹掉全部可选性 ⇒ 目标类型的**每个**
 * 字段都必须在草稿里写出一条裁决：怎么从 `raw` + `existing` 派生，或者显式写 `undefined`
 * 并在旁边说明「由谁派生 / 为什么不落盘」。给 `Vendor` 加字段而不改这里 ⇒ TypeScript 直接
 * 报 missing property，编译红。
 *
 * R17「防线建在最早能拦住的那层」：这是**类型**拦，不是门岗拦，也不是测试拦——写不出来就编译不过。
 * 同一手法在 `credentialConfigFields.ts` 已经用 `Record<keyof Vendor, …>` 跑通（凭据分级穷尽），
 * 这里是它在「写路径完整性」这一轴上的对偶。
 */

/** `T` 的全部键（含可选键）收成一个联合。`-?` 只用来凑齐键名，不参与值类型。 */
type AllFieldsOf<T> = { [K in keyof T]-?: K }[keyof T];

/**
 * 目标记录的完整草稿：每个字段都必须出现，派生/不落盘的显式写 `undefined`。
 *
 * 为什么不直接写 `{ [K in keyof T]-?: T[K] | undefined }`：同一个映射类型上的 `-?`
 * 会顺手把值类型里的 `undefined` 也剥掉（TS 的 `-?` 语义），于是「显式写 undefined」反而编译不过。
 * 先用 `AllFieldsOf` 把键union 取出来，再在一个**非同态**映射里给值补 `undefined`，两件事就分开了。
 */
export type UpsertDraft<T> = { [K in AllFieldsOf<T>]: T[K] | undefined };

/**
 * 把草稿收成真记录：值为 `undefined` 的键**整个不落盘**（等价旧写法里那些
 * `...(x ? { x } : {})` 条件展开，JSON 里不留 `null` 洞，读回来的形状逐字不变）。
 */
export function sealUpsertDraft<T extends object>(draft: UpsertDraft<T>): T {
  return Object.fromEntries(Object.entries(draft).filter(([, value]) => value !== undefined)) as T;
}

# 先查别人：「重建一条记录时怎么保证不漏字段」+「已损坏数据怎么修」

> 状态：已完成（2026-09-18）
> 服务于 `docs/plan/2026-09-18-vendor-upsert-completeness.md`；结论抄进那份方案的「## 先查别人」节。

问的两个问题：
1. 部分更新（partial update）的语义有没有既成标准？我们要不要自造一套？
2. 「重建记录时漏字段」这类问题，别人是靠什么拦的？TypeScript 能不能在编译期拦住？
3. 已经被写坏的存量数据，一次性迁移 vs 加载时补齐，生态里怎么选？

## ① 依赖：TypeScript 的映射修饰符 `-?` 到底做了什么

- TS 2.8 发布说明「Improved control over mapped type modifiers」：
  <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-8.html>
  原话：在 `strictNullChecks` 下，**homomorphic** 映射类型移除 `?` 时，**同时会把 `undefined` 从该属性类型里移除**
  （例：`type Foo = { a?: string }` ⇒ `Required<Foo>` 等于 `{ a: string }`）。
- 这解释了我们第一版写法为什么编译不过：`{ [K in keyof T]-?: T[K] | undefined }` 是 homomorphic 的，
  `-?` 把我们手写的 `| undefined` 一起剥掉了，于是「显式写 undefined 表示派生/不落盘」反而报
  `TS2322: Type 'undefined' is not assignable to type 'boolean'`（本仓实测，见方案「实测记录」）。
- 解法也来自同一条规则：**先取键 union，再用非同态映射补 `undefined`**，`-?` 就只参与凑键、不碰值类型。
  `UpsertDraft<T>` 现在的形状即此（`electron/catalog/upsertDraft.ts:37`）。
- 反例提醒：`Required<T>` 的手册页（<https://www.typescriptlang.org/docs/handbook/utility-types.html>）
  只讲「去掉可选」，不提 `undefined`；只看它会得到相反的结论。**以 2.8 发布说明那条为准，且我们用编译器
  实测复核过**（两次变异都拿到 TS2345/TS2322 的真实报错）。

## ② 标准：部分更新的语义有没有现成规范

- RFC 7396 JSON Merge Patch：<https://www.rfc-editor.org/rfc/rfc7396.txt>
  - 缺席的成员 ⇒ 目标不变（算法不处理它）；
  - `null` ⇒ 「if Value is null: if Name exists in Target: remove the Name/Value pair from Target」；
  - 有值 ⇒ 替换/递归合并。
- 结论：**三态语义（不带该键=保留 / 显式 null=清除 / 有值=替换）是既成标准，不是我们发明的**。
  本仓早就在用同一套，只是没写出处：`Model.customCall` 的注释「undefined=保留，null=显式删除」
  （`electron/catalog/types.ts:300`）。本刀把 `Vendor.assetIngestion` 也按这条对齐，不另造第四种约定。
- 我们与规范的偏差：只在**顶层**做合并，不递归（`meta` 是不透明袋子，递归合并会让「清空 meta」表达不出来）。
  理由是领域约束（凭据剥离与 v8→v9 / v11→v12 的「明文清干净了吗」判据都按整键覆写来判），不是图省事。

## ③ 仓库：这条不变量本仓已经有一半了

- `electron/catalog/credentialConfigFields.ts:32` —— `Record<keyof Vendor, VendorConfigFieldClass>`，
  文件头原话：「将来给 `Vendor` 加任何新字段，不在这里分级就编译不过（type guard）」。
  **同一手法、同一类型、另一根轴**（那根轴问「是不是凭据」，本刀这根问「保存时怎么裁决」）。
  本刀实测：给 `Vendor` 加一个从未被引用的字段，两张表**同时**报红。
- `electron/catalog/credentialConfigFields.test.ts:18` —— `satisfies Required<Vendor>` 的全量样本，
  作为运行期对偶。本刀的 `vendorUpsertFieldPreservation.test.ts` 直接照搬这个手法。
- 反例（为什么不能只靠人记得）：`Model.customCall` / `tokenPricing` / `free` 都是**事后**被单独补回
  `applyModelUpsert` 清单的补丁（`electron/catalog/catalogStore.ts:550`），每一次都是同一个洞的再犯。

## ④ 生态：一次性迁移 vs 加载时补齐

- `electron-store` 的 `migrations`：<https://github.com/sindresorhus/electron-store>
  「The `migrations` object should consist of a key-value pair of `'version': handler`」——**按版本号键控、
  存量版本落后才跑、跑完推进版本**。生态里修存量数据的默认形状就是「带版本号的一次性迁移」，
  不是「每次启动都对一遍」。
- 本仓自己的先例更强：`migrateCatalogForward` 的 v1→v12 十一级阶梯
  （`electron/catalog/catalogStore.ts:125`），其中 v5→v6→v7 那组还专门记了「迁移幂等，靠 bump 强制重跑」
  ——即**要重跑就显式加一级版本**，而不是让它常驻。
- 反例：`seedBuiltins.seedVendor`（`electron/catalog/seedBuiltins.ts:416`）是常驻的加载时对账，
  它的注释写明只迁移「仍指向我们旧默认值」的记录、**用户改过就绝不覆盖**——即使是常驻补齐，
  也必须有一条「什么时候不许碰用户的值」的判据。本刀的判据是 `!(field in vendor)`（键不存在才补）。

## 结论（抄进方案）

1. 三态语义照 RFC 7396，不自造；本仓 `Model.customCall` 已是同一套，对齐即可。
2. 编译期穷尽用「键 union + 非同态映射」，不用 homomorphic `-?`（TS 2.8 发布说明那条是根因）。
   手法本仓已有先例（`credentialConfigFields.ts`），本刀是它在写路径轴上的对偶，不是新发明。
3. 存量修复做成带版本号的一次性迁移（v12→v13），与生态默认形状和本仓十一级阶梯一致；
   常驻补齐只在「有明确的不许覆盖判据」时才可取，而我们这条不变量已被类型闭合，不需要常驻守卫。

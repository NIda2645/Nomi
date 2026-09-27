# 参考图标记误判修复：先查别人（2026-09-28）

## 依赖里已有？

- Node `TextDecoder` 是现有运行时能力；`electron/assets/mediaTypes.ts` 已有 `contentTypeFromMagicBytes` 和 `MEDIA_TYPES`，不需要新增依赖或另建解码器。
- 结论：用已有运行时和媒体类型 owner。

## 仓库里已有？

- `electron/assets/mediaTypes.ts:25` 负责字节到媒体类型的魔数判定。
- `electron/assets/projectAssetStore.ts:115`、`electron/catalog/assetLocalization.ts:180`、`electron/providerAdapter/certificationMedia.ts:218` 是同类校验边界；修复把它们改为消费同一个 `isMarkupMasquerade`，不再复制正则。
- 结论：收敛到已有 owner，调用方只消费。

## 生态里已有？

- [C2PA Specification 2.1](https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html)：PNG 的 `caBX` JUMBF 区块可以承载清单和图标等元数据，因此合法栅格文件的前缀窗口可能出现 SVG 文本。
- [W3C PNG 3，iTXt chunks](https://www.w3.org/TR/png-3/#11iTXt)：PNG 的 iTXt 可承载 XMP/XML 文本；这类文本不改变 PNG 的文件签名。
- [WHATWG MIME sniffing](https://mimesniff.spec.whatwg.org/#identifying-a-resource-with-an-unknown-mime-type)：未知类型的标记匹配从资源开头（跳过 BOM/空白）进行，而不是在任意前缀偏移处搜索。
- 结论：按规范只在文件开头识别伪装文本，栅格魔数优先；元数据中的 XML/SVG 不应拒收。

## TikHub 自媒体里怎么说？

本次是二进制容器和 MIME 判定，不是依赖某个产品教程的用法问题；没有找到可复核、能替代上述格式规范的 TikHub 条目。保留官方规范作为唯一外部判据，不把不可验证的帖子写进实现合同。

## 最终判断

用已有的 `TextDecoder`、媒体类型表和三处校验边界；不引依赖，不采纳第二套正则或自媒体规则。报告结论已抄进 `docs/plan/2026-09-27-reference-image-markup-false-positive.md` 的「先查别人」节。

# 参考图标记误判修复计划（2026-09-27）

## 范围

- 在 `electron/assets/mediaTypes.ts` 统一 `isMarkupMasquerade` 与扫描窗口，判定只看去 BOM、前导空白后的文件开头。
- `assetLocalization`、`projectAssetStore`、`certificationMedia` 统一消费该 owner；栅格魔数优先，保留声明与魔数一致性检查及 SVG 结构校验。
- 本地素材读取失败、未知类型、伪装文本统一打 `asset-invalid`，渲染层按机器码归类并补 zh-CN/en 文案。
- 补 C2PA `caBX`、PNG XMP、JPEG APP1 XMP 与文本反例测试。

## 不动项

不改上传通道、付费守卫、声明与魔数一致性语义，不新增第二个图片判据，不改其它 UI。

## 概念占用表

| 概念 | 唯一 owner | 允许消费 |
|---|---|---|
| 字节是不是伪装成媒体的标记/错误体 | `electron/assets/mediaTypes.ts` `isMarkupMasquerade` | assetLocalization、projectAssetStore、certificationMedia |
| 本地素材错误的机器码 | `electron/shared/nomiErrorCodes.ts` | assetLocalization（打标）、classifyError（归类） |

## 回滚

删除本次共享 owner、调用方接线、`asset-invalid` 码/文案、测试和本计划/合同即可回到修复前；不涉及数据迁移。

## 验收门

- mediaTypes/assetLocalization、projectAssetStore、certificationMedia 与 classifyError 相关测试通过。
- 锚定开头的 PNG `caBX`、PNG iTXt XMP、JPEG APP1 XMP 均不误判；HTML/XML/SVG 文本仍拒绝，SVG 仍做结构校验。
- 去掉 owner 正则 `^` 时上述元数据回归测试必须失败。
- `node scripts/door-map.mjs isMarkupMasquerade assertLocalAssetMediaBytes validatedGeneratedMeta` 输出的 5 扇门写入根因合同。
- `check:root-cause-contracts`、相关门岗和 typecheck 由主管在可启动子进程的环境执行。

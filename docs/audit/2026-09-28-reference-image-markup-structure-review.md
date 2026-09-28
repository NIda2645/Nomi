# 参考图标记误判修复结构评审（2026-09-28）

## 触发与范围

`check:symptom-cluster` 在 2026-09-21 至 2026-09-27 的窗口里报告了本次合同所在的
`electron/assets`、`electron/catalog`、`electron/providerAdapter`、`electron/shared`
和 `src/i18n` 聚簇。本文按 R21.2 先审结构，再判断这次修复是否应该继续扩大范围；对应合同是
`docs/fixes/2026-09-27-reference-image-markup-false-positive.root-cause.json`。

## 观察

这次问题的重复信号不是五个模块各自缺一条判断，而是同一个「字节是否为伪装文本」判断被
三个边界复制，其中 `electron/catalog` 的副本没有锚定文件开头。`electron/assets/mediaTypes.ts`
已经拥有字节魔数和媒体类型判定，因此它是这个不变量的合适 owner；`electron/catalog` 的
本地素材预检、`electron/providerAdapter` 的认证检查和 `electron/assets/projectAssetStore.ts`
的落盘检查都应该只消费该 owner。

错误机器码也有同样的边界关系：`electron/shared/nomiErrorCodes.ts` 负责定义稳定码，
`electron/catalog` 负责在请求离机前打码，渲染层只负责读取它。`src/i18n` 是展示投影，不应
重新判断错误类别或持有第二份码表。

## 结论与约束

1. 本次修复已经把标记判断收回 `electron/assets/mediaTypes.ts`，并删除三个私有实现；后续
   新的媒体边界必须复用 `isMarkupMasquerade`，不能复制正则。
2. `asset-invalid` 的 owner 仍是 `electron/shared/nomiErrorCodes.ts`；新增本地素材失败
   必须在 `electron/catalog` 打这个码，渲染层按码归类为未计费，不按文案猜服务商故障。
3. `electron/providerAdapter` 和 `src/i18n` 在这次结构上只作消费者/投影，不再扩大为新的
   生成、上传或错误分类 owner。更大范围的媒体流水线合并另开任务，不能借本 PR 顺手重构。

## 验证证据

- 根因合同的 `invariant_owner_layer`、`doors` 和 `same_class_entry_points` 列出上述 owner
  与消费者。
- `electron/assets/mediaTypes.test.ts` 覆盖 PNG C2PA/SVG、PNG XMP、JPEG XMP 和文本反例；
  `electron/catalog/assetLocalization.test.ts` 与分类器测试覆盖未计费错误路径。
- `node scripts/door-map.mjs isMarkupMasquerade assertLocalAssetMediaBytes validatedGeneratedMeta`
  报告五扇唯一代码门；`check:root-cause-contracts` 校验合同与变化中的回归测试。

这份评审确认本次集中 owner 的修复方向，保留后续媒体落盘/目录读取异步化的独立 TODO，
不以结构评审作为本 PR 扩大改动面的理由。

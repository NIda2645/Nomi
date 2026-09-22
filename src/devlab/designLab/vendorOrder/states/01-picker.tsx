// 设计实验室 · 供应商偏好屏 · 模型下拉的各形态。
//
// 每条注册项带：稳定 id、人话名字、来源、coverage 档位，以及**用现役组件**渲染的夹具。
// 顺序有意义：`labStates.mjs` 按 `states/` 目录名排序解析，`vendorOrderStates.tsx` 按同样顺序拼接，
// 走查再拿活页面的 `window.__designLabStates` 与解析结果逐项比对——三者对不上当场红。
import React from 'react'

import {
  CONFIGURED_MODELS,
  MIXED_MODELS,
  MODEL_BOX_MODELS,
  MODEL_BOX_PREFERENCE,
  RUNNABLE_VENDORS,
  UNLISTED_MODELS,
  SIBLING_CONNECTION_MODELS,
  VENDOR_APIMART_MINI,
  onlyFromVendors,
  VENDOR_APIMART,
  VENDOR_KIE,
} from '../vendorOrderFixtures'
import { ModelPickerStage } from '../vendorOrderLabKit'
import type { LabState } from '../../labScreen'

// `source` 逐条写成字面单引号串（不是抽个常量再拼）：`labStates.mjs` 那把源码正则按
// 「id / name / source / coverage 四行紧挨着的单引号串」解析注册项，模板串或标识符会解析不出来。
export const PICKER_STATES: readonly LabState[] = [
  {
    id: 'vo-01-picker-preferred',
    name: '有偏好 · 偏好那家排第一并高亮',
    source: 'docs/design/nomi-design-system.md §2 token + §1.5 控件层级 · 用户 2026-09-06 返工要求',
    coverage: 'shell',
    render: () => (
      <ModelPickerStage
        models={CONFIGURED_MODELS}
        preferredVendorKeys={[VENDOR_KIE, VENDOR_APIMART]}
      />
    ),
  },
  {
    id: 'vo-02-picker-no-preference',
    name: '无偏好 · 按供应商分级（官方在前）',
    source: 'src/config/modelIdentity.ts sortModelProviders · 用户 2026-09-06 返工要求',
    coverage: 'shell',
    // 没设过偏好时**不该退化成厂商名字母序**：这一格钉住「火山方舟（官方）排在两家中转前面」。
    render: () => <ModelPickerStage models={CONFIGURED_MODELS} />,
  },
  {
    id: 'vo-03-picker-hides-unconnected',
    name: '有没接入的家 · 它们直接不出现（不是灰显沉底）',
    source: 'src/config/modelCatalogCache.ts keepUsableModelRows · 用户 2026-09-06 拍板',
    coverage: 'shell',
    // 目录层（`keepUsableModelRows`，判据在主进程）只放行接入了的那几家，于是 RunningHub 独家的
    // Kling 3 / Wan 2.6 根本不会到达这一屏，Seedream 4.5 的 chip 也只剩两家。这一格钉住的是
    // **那之后**下拉长什么样：不是灰显沉底，是一行都没有。
    render: () => (
      <ModelPickerStage
        models={onlyFromVendors(MIXED_MODELS, RUNNABLE_VENDORS)}
        preferredVendorKeys={[VENDOR_APIMART, VENDOR_KIE]}
      />
    ),
  },
  {
    id: 'vo-04-picker-empty-no-vendor',
    name: '一家都没接入 · 诚实空态：说清现状 + 一步去接入',
    source: 'src/workbench/common/useDedupedModelSelect.ts connectVendorOption · 用户 2026-09-06 拍板',
    coverage: 'shell',
    // 没接入的模型不再沉底显示，于是新装机上这个下拉会**一条都不剩**。空白下拉读起来像「坏了」，
    // 所以这一格钉住：必须有一行说「还没接入供应商」，且点它就是去接入。
    render: () => <ModelPickerStage models={[]} />,
  },
  {
    id: 'vo-05-picker-selected-row',
    name: '选中态 · 对勾与 chip 同行不打架',
    source: 'docs/design/nomi-design-system.md §2 token + §1.5 控件层级 · 用户 2026-09-06 返工要求',
    coverage: 'shell',
    // 选中行同时有：加粗模型名 + 一排 chip + 最右对勾。这三样挤在一行里最容易把模型名压没，
    // 所以单独立一格钉住。
    render: () => (
      <ModelPickerStage
        models={CONFIGURED_MODELS}
        preferredVendorKeys={[VENDOR_APIMART]}
        selected="seedream-4-5"
      />
    ),
  },
  {
    id: 'vo-10-picker-unlisted',
    name: '供应商清单里暂时没有它 · 如实标一句，照样选得了',
    source: 'scratchpad report-A-pass3e.md §3（后台对账不再静默停用）· 用户 2026-09-21',
    coverage: 'shell',
    // 判据是「**每一家**都没列出才标」：FLUX.2 Pro 只挂 Kie 且没列出 → 标；
    // Nano Banana 2 还有 APIMart 列着 → 不标。哪天写成「有一家没列出就标」，这一格当场变样。
    render: () => (
      <ModelPickerStage
        models={UNLISTED_MODELS}
        preferredVendorKeys={[VENDOR_APIMART, VENDOR_KIE]}
      />
    ),
  },
  {
    id: 'vo-06-picker-model-box',
    name: '整理过的模型框 · 按手排的顺序、藏起来的不在、手点过的那家高亮',
    source: 'docs/plan/2026-09-11-model-box-tidy.md §3 + 样张 PickerAfter.dc.html · 用户 2026-09-11 拍板',
    coverage: 'shell',
    // 喂进去的是**八个**模型；屏上只该有六行，Seedream 5.0 Lite 与 Z-Image Turbo 落进脚注那个数字里。
    // Nano Banana 2 那行的两个标签顺序仍是 APIMart、Kie（全局顺序），蓝的却是 Kie——
    // 「顺序归全局、高亮归手点」这条如果哪天写反了，这一格当场变样。
    render: () => (
      <ModelPickerStage
        models={MODEL_BOX_MODELS}
        preferredVendorKeys={[VENDOR_APIMART, VENDOR_KIE]}
        modelBoxPreference={MODEL_BOX_PREFERENCE}
      />
    ),
  },
  {
    id: 'vo-07-picker-sibling-connections',
    name: '同一家多条连接 · 只有重名的那行改显示连接名',
    source: 'docs/plan/2026-09-22-vendor-connection-identity.md §4.5 · GitHub issue #831 · 用户 2026-09-22 拍板',
    coverage: 'shell',
    // #831：一个中转站可以有三个计价分组（同地址、不同 Key）。它们的 chip 若都显示厂商短名
    // 「APIMart」，用户分不出哪个是满血组。这一格钉住三种情形同屏：
    //   · Seedance 2.0   同一家两条连接 → 两个 chip 各显示**自己的连接名**（满血组 / Mini 特价组）；
    //   · Nano Banana 2  两家不同 root → 仍是厂商短名，一个字都不加；
    //   · FLUX.2 Pro     只有一条连接 → 连 chip 都没有；
    //   · Kling 2.5      同 Seedance，但连接名是 EN 长串（R15 串长 1.5-2 倍）→ 钉住放得下。
    // 这一格还钉住一件第一版做错的事：曾经拼成「APIMart · 满血组」，超宽后被截成「APIMart · …」，
    // 截掉的正好是唯一有区分力的那段。判据由 `providerConnectionSuffixes` 一处算，写反了当场变样。
    render: () => (
      <ModelPickerStage
        models={SIBLING_CONNECTION_MODELS}
        preferredVendorKeys={[VENDOR_APIMART, VENDOR_APIMART_MINI, VENDOR_KIE]}
      />
    ),
  },
]

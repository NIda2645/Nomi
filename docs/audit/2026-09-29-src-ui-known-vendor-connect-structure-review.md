# src/ui 聚簇的结构评审（设置页接入地址那一份）

> 状态：已完成（2026-09-29）。触发：`check:symptom-cluster` 报 `src/ui` 7 天内第三份根因合同。
> 对应合同：`docs/fixes/2026-09-24-comfyui-combo-wire-type.root-cause.json`、`docs/fixes/2026-09-24-renderer-failure-evidence.root-cause.json`、`docs/fixes/2026-09-29-settings-address-is-the-users.root-cause.json`。

## 三份合同不是同一个洞

| 合同 | 规则的家 | src/ui 在里面的角色 |
|---|---|---|
| 09-24 comfyui-combo-wire-type | 主进程的 ComfyUI 枚举类型（`electron/comfyuiObjectInfo.ts` 等） | 消费方：面板按修好的类型显示选项 |
| 09-24 renderer-failure-evidence | 主进程日志通道（`electron/logging/rendererLog.ts`） | 消费方：错误边界往那条通道写 |
| 09-29 settings-address-is-the-users | 设置页入口能改什么（`electron/catalog/rendererCatalogMutation.ts`）+ 内置连接判据（`electron/catalog/builtinVendorSeeds.ts`） | 入口：内置家首次接入页补上地址栏 |

前两份与第三份没有共同的机制；三份的规则都住在主进程，`src/ui` 只是被波及的那一层。

## 这一份暴露的结构问题：同一条连接有两个界面

内置家（APIMart 等）的一条连接在设置里有两个面：没接上时的**首次接入页**（`src/ui/onboarding/KnownVendorKeyConnectPage.tsx`，2026-08-16 起）和接上之后的**连接卡片**（`src/ui/onboarding/VendorOnboardCard.tsx`）。两个面各自决定摆哪些控件，地址栏只摆在卡片上——主域不通的新用户在接上之前没法换线路，而「接上」恰恰要先连得上。

本次修法没有新写地址编辑：首次接入页复用卡片那一个 `VendorBaseUrlField`（同一个组件、同一个保存入口）。两个面「各摆各的控件」这件事本身还在：以后给连接加任何控件，都要记得两个面各看一眼。

## 结构裁决

- 本次不做结构改造：把两个面合成一个带状态的卡片是用户可见的界面改动，要先出样张、用户拍板（P5 / R8）。
- 记一条后续：首次接入页与连接卡片合成一个面（或由一份「连接控件清单」同时驱动两个面），由协调会话排期。
- 防回：`src/ui/onboarding/approvedModelAccessArchitecture.test.ts` 钉住首次接入页用的是 `VendorBaseUrlField` 且不自己调 `upsertVendor`；`check:symptom-cluster` 在同一层再聚到第三份时要求重新评审。

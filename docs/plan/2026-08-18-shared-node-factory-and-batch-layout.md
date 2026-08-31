# T3 P1-C/D：一份共享节点工厂 + 批量 MCP 布局

> 目标：杀掉 electron/capabilityCore/canvasGraph.ts 里那份**平行的简化建节点器**（只写
> {id,kind,title,position,size,prompt,references,status}、缺 meta/categoryId/shotIndex、坐标全堆 x=0），
> 让 MCP 建的节点与 UI 建的节点**字段级等价**；再给 MCP 批量加节点接上既有的分层布局。

## 根因（已核实）

- `canvasGraph.addNodes` 是第二套建节点实现：缺 `meta`（模型绑定容器）、`categoryId`、`shotIndex`；
  且落点 hardcode `x=0, y=baseY+40+i*320` → 单列竖排、丑。
- UI 路径 `store/canvasNodeActions.addNode` 经 `createGenerationNode()` 后补 `meta:{}` /
  `categoryId=getDefaultCategoryForNodeKind(kind)` / shot 的 `shotIndex` / 落点走 `resolveInsertionPosition()`。
- 一旦 MCP 节点拿到正确 categoryId/meta，渲染层 `useNodeModelAutoSelect` 会给空 meta 的生成节点
  自动选默认模型 → image/video/text 节点直接变「一等公民」，**无需把目录塞进共享层**。
- `shot` kind 按设计就是纯描述节点（无 executionKind、只有 prompt）——保持不动。

## 放哪：house pattern = 共享纯域码住 electron/，src 反向 import 它

**关键约束（已实证）**：`electron/tsconfig.json` 是 `rootDir:"."`，production `tsc -p electron/tsconfig.json`
**无法 import ../../src**（实测报 TS6059 "not under rootDir"）。electron 里 12 处 import src 全是**测试文件**
（被 `exclude:["**/*.test.ts"]` 排除，只在 vitest 下跑，不受 rootDir 约束）。

**正确先例（方向相反）**：`electron/catalog/referenceReachability.ts` 头注释白纸黑字写着——
「住在 electron/ 而非 src/：electron tsconfig 是 rootDir:'.' 反向 import 不了 src；渲染层则本就 import
得到 electron（bridge.ts 已在做）」。渲染层 `nodes/controls/archetypeMeta.ts`（production）就 import 了
`electron/catalog/referenceReachability` 的**运行时值**。已实测 `tsconfig.app.json`（渲染层 tsc）+ electron tsc
两侧都能过 `src/ → electron/capabilityCore/` 的 import。

→ **工厂 + 布局共享模块住 `electron/capabilityCore/`，`src/` import 它。**

## 持久化记录形状（已核实单一 schema）

两侧都写进 `payload.generationCanvas`；渲染层载入时经 `store/canvasSnapshotNormalizer.normalizeStoreSnapshot`
按 `model/generationCanvasSchema.generationCanvasNodeSchema`（zod）归一。**这就是唯一权威记录 schema**，
工厂产出即照它。electron `CanvasNode` 是结构宽松的超集，载入被归一。→ 不分叉。

## UI 路径产出的**权威字段**（工厂对账目标，逐字节）

`createGenerationNode` 产出 `{id,kind,title,position,size,prompt:'',references:[],history:[],status:'idle',meta:{}}`
+ addNode 覆盖：`meta`（有 input.meta 才覆盖，否则 {})/`size`（有才覆盖）/`categoryId`/`shotIndex`（shot-numbered 才有）。
→ 规范记录 = `{id,kind,title,position,size,prompt,references,history,status,meta,categoryId,[shotIndex]}`。
**注意**：`renderKind` UI 路径**不写**（可选字段，渲染时 `resolveNodeRenderKind` 从 kind+categoryId 现推；
仅历史迁移回填过）。故工厂也不写 renderKind——写了反而与 UI 分叉。（任务描述「renderKind via category
defaults」在 store 侧不准；已按代码真相纠正：store 不写 renderKind。）

## 模型绑定 meta（vendor/modelKey）

UI 的 `useNodeModelAutoSelect` 写一大坨（modelKey/modelAlias/modelVendor/vendor/modelLabel/archetype/
image|videoModel…），但那**需要目录**（ModelOption）。任务明确：不把目录塞共享层。
运行时解析器 `runner/catalogTaskResolve.ts` 读的**身份四件**是 `meta.modelVendor||meta.vendor` +
`meta.modelKey||meta.modelAlias`。→ 工厂在 caller 显式给 vendor/modelKey 时，写
`{ modelKey, modelAlias: modelKey, modelVendor: vendor, vendor }`——解析器可见的规范身份，
与 UI 写的身份部分一致；富化（label/archetype）由渲染层载入时 auto-select 或生成时 family 匹配补。
非法/未知值原样存（校验留在 UI 校验处，不建第二个校验器）。缺省 → meta {}（触发渲染层 auto-select）。

## 尺寸/标题/分类/编号 = 注入依赖（不 copy registry、不搬 23 处）

工厂纯函数，收 `NodeFactoryDeps`：
- `resolveSize(kind)`、`resolveDefaultTitle(kind)`、`resolveCategory(kind)`、
  `isShotNumbered(node)`、`nextShotIndex(nodes)`、`createId(kind)`。
- **渲染层**注入 src 真函数（单一真相源留在 src registry/shotNumbering/i18n）。
- **electron** 注入共享模块里一张**纯 per-kind 几何/语义表**（size/英文标题回退/category/shot-numbered 集合）。
  该表**由 equivalence 测试钉死 === registry 值**（本仓既有「重复+测试守恒」模式：thumbnailDerive.equivalence.test.ts、
  dreaminaSeed.test.ts），防漂移，避免把 size/shotNumbering/category 从 src 大搬家（越范围+高风险）。

## 布局（复用既有纯函数，渲染层不变）

- `store/resolveInsertionPosition.ts`、`agent/trajectoryLayout.ts` **已经是纯函数**（只依赖 footprint）。
  渲染层继续原样用（任务要求「no divergence」）。
- 共享工厂/布局模块把 footprint 作**注入**收，electron 侧注入共享几何表的 footprint。
- 批量 `nomi_add_nodes`（≥2）→ 走 `layoutPlannedNodes`（层由 kind 推：参考/关键帧/视频三列，
  凑不齐退网格）；单节点 → `resolveInsertionPosition` 对已有节点 AABB 避让。显式 x/y 永远优先。

## MCP schema + kind 语义

- `nomi_add_nodes` per-node 加可选 `vendor` + `modelKey`（透传进 NodeSpec → 工厂绑 meta）。
- 描述改 zh-CN house style，讲清 kind 语义：shot=分镜描述节点(纯文本)，video/image/text/audio=可生成节点，
  character/scene=参考锚节点。
- `NodeSpec` 加 `vendor?`/`modelKey?`；`dispatcher`/`core.addProjectNodes` 已 straight-through，无需改。

## filesize 门（mcpProtocol.ts 772/800）

schema+描述会加行。若逼近 ~795，先把 `buildToolResultPayload` 的 content 组装块（~30 行）抽到
新 `mcpResultPayload.ts`（预批准卫生动作），再加行。每个改过的文件 ≤800。

## 落点清单

1. NEW `electron/capabilityCore/nodeKindDomain.ts`（纯，零 import）：per-kind size/英文标题/category/
   shot-numbered 集合 + footprint + isShotNumbered/nextShotIndex。
2. NEW `electron/capabilityCore/canvasNodeFactory.ts`（纯，注入依赖）：`buildCanvasNode(spec, deps)` +
   批量布局编排（layoutBatch）——两侧共用；copy 零 registry 逻辑。
3. `electron/capabilityCore/canvasGraph.ts`：删旧 addNodes 构造，改调工厂（electron deps 注入自 nodeKindDomain）；
   NodeSpec 加 vendor/modelKey。
4. `src/workbench/generationCanvas/store/canvasNodeActions.ts`：addNode 内联初始化移进工厂调用（renderer deps 注入 src 真函数）。
5. `electron/capabilityCore/mcpProtocol.ts`：add_nodes schema 加 vendor/modelKey + 改描述；必要时抽 mcpResultPayload.ts。
6. 测试：工厂 equivalence（7 kind 逐字段）、meta 绑定、布局（2 锚+12 镜无重叠/多列/确定性/单插避让/显式坐标）、
   electron 几何表 === registry。

## 不动

inspector/renderer 组件、useNodeModelAutoSelect、registry kind 定义（shot 仍描述节点）、T1 plan-confirm、T2 enrichment。

## 验收门

`npx vitest run electron/`（2331 baseline）+ `npx vitest run src/workbench/generationCanvas/` +
`pnpm typecheck` + `check:filesize` + `check:i18n` + `lint:ci`。

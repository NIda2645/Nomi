# 3D 导演台：直驱盖章差半身高 + 对象几何函数双实现收敛（单一真相源）

日期：2026-08-04 ｜ 分支：claude/friendly-lamport-885069（修在分支，不直接进 main）

## 症状 → 根因

**症状 1**：时间轴打开播放时，绑了轨迹的假人沿轨迹跑会**陷进地里半身高**；导出/成片预览（state 采样路）却是对的。

**根因 1（两层）**：
- 语义：轨迹点存**脚底**高度，`object.position` 语义是**视觉中心**（sceneView 的 group `position={object.position}`，假人网格以原点为中心分布）。state 采样 `objectWithPlaybackPose` 会 `+objectVisualHalfHeight` 换算（scene3dPlayback.ts:265）；直驱盖章 `useTrajectoryAnimation` 的 useFrame 却把脚底高度直接 `position.copy(curvePoint)` 写进 group——少了这一步。盖章处本来就消费 `target.positionOffset`，只是 `ObjectRefBinder` 注册时没传。
- 结构：`useTrajectoryAnimation` 手抄了一份与 `sceneObjectTrajectorySample` 逐字相同的 t 映射采样数学（duration/offsetRatio/wrap/clamp/remap）——平行版，漂移温床（本次半身高只是漂移的第一个可见症状）。

**症状 2**：`objectVisualHalfHeight` 双实现且已分叉——`scene3dObjects.tsx:475` 版有 `prop → 0` 分支（道具 origin 在地面中心，propSpecs 头注释明文），`scene3dCrowd.ts:99` 版没有。而**导出采样/安全框/对焦吃的全是 crowd 版** → 道具绑轨迹在导出/预览里被错抬 `0.5*scaleY`（浮空）。读码进一步发现同簇 9 个函数全部成对重复（`objectGroundFootprint` 同样分叉少 prop 分支），`crowdRows` 一族在 `scene3dMath` 还有第三份。

## 修法（P1/P2：共享采样 + 单一真相源，让整类不再复发）

1. **直驱=state 采样**：`useTrajectoryAnimation` 删掉手抄采样，直接调 `sceneObjectTrajectorySample`（与导出同一份函数）+ `target.positionOffset`。两条路径共享同一采样管线，结构上无法再漂移。
2. **注册传抬升**：`TrajectoryPlayback` 接 `objects`（来自 `Scene3DTrajectoryLayer` 已有的 `state`），场景对象注册 ref 时传 `positionOffset=[0, objectVisualHalfHeight(object), 0]`；相机/aim 合成 id 匹配不到对象 → 不传（相机无抬升语义）。缩放变化经 effect dep 重注册。`state.visible===false` 的对象不注册（隐藏对象不被直驱复活，对齐导出）。
3. **几何函数收敛到 `scene3dCrowd.ts`（任务拍的方向）**：9 个成对函数留 crowd 版为唯一真相源，补 prop 分支（halfHeight→0、footprint→propGroundFootprint）；objects 删本地版改 import；`sceneView`/`useScene3DFullscreenActions` 改从 crowd 导入。crowd 上半段 7 个 math 拷贝（crowdRows 族/roleColorForIndex/mannequinRoleLabel/clampCrowdOptions）删掉改 import math（factories 两处改 import math）。
4. **防环前置**：crowd 需 import propSpecs 的 `propGroundFootprint`，而 propSpecs→serializer→safeFrame→crowd 会成环。把 propSpecs 里唯二用 id 的 `makePropObject`/`buildPlacedProps`（+`ScenePropPlacement` 类型）挪去 `scene3dFactories`（造对象的家），propSpecs 退化为纯 spec 数据模块，环消失。引用点 5 处改 import。

## 行为变化清单（全部有意）

- 时间轴直驱播放：假人/人群沿轨迹**脚贴地**（原陷地半身）。
- 导出/预览/安全框/对焦对 **prop**：不再错抬 0.5*scaleY（浮空修复；对焦/瞄点随 origin-地面语义略降，与画面锚点一致）。
- 多绑定同一对象：直驱从「最后一条绑定赢」改为与导出一致的「第一条赢」。
- viewControllers 的 prop footprint：1×1 兜底 → 真实 per-kind footprint（对焦距离更准）。
- factories/math 路无行为变化（三份拷贝逐字相同）。

## 实施中追加的三项（读码连带挖出，同 commit 修掉）

1. **scene3dFactories.ts 整文件是死的平行版**：全仓零引用（工厂真身在 scene3dMath——makeObject/makeCrowdObject/makeCamera/clampCrowdOptions 逐字重复，另含五个无人用的轨迹工厂）。P1 直接删除。
2. **serializer 手列 PROP_KIND_SET 掉队**：类型/spec 已 16 种 kind，白名单还停在最初 5 种 → 批次 1 的 11 种新道具**存档重开丢 propKind 降级**。修 = 从 `PROP_KINDS` derive（propSpecs 纯化后无环）；闸 = 每种 kind 存档往返测试。
3. **take 录制的走位轨迹存的是中心 y**（附身直驱把 group 钉在 `position[1]`=视觉中心）→ 回放/导出 +halfHeight 后浮空半身（旧直驱不抬所以「live 看着对、导出浮空」）。修在唯一写入口 `buildRecordedTakeScene`：样本换算成脚底再建轨迹（`footLevelSamples`），录哪儿回放就在哪儿；闸 = 往返测试。存量 take 轨迹不迁移（无法可靠识别来源；其导出行为与修前一致）。

## 不动项

- `scene3dMath ↔ scene3dClipboard` 的剪贴板函数重复（offsetScene3DVector/clone*/makePasted*）——同类 P1 违例但与本 bug 家族无关、无分叉，另行处理。
- 相机 marker 直驱的朝向逻辑（followTangent，与 state 相机 target 语义的差异是既存装饰性差异）。
- 「新建轨迹后右栏面板未自动选中（请选择一条轨迹）」的既有竞态 papercut（active 被 state 回传晚一拍清掉）——走查中实证，挂 chip 另修。
- 未合入的拖拽根治分支（42a76a38 在 claude/intelligent-williamson-104007）；本分支独立成立，合并时 useFrame 的 held-set 过滤可直接套在共享采样外层。

## 验收门（全部已过，2026-08-04）

- ✅ 新单测 `trajectoryStampAlignment.test.ts`：同一对象/播放头，直驱配方（sample+offset）=== `objectWithPlaybackPose`（假人抬半高、prop 贴轨迹、相机零抬升、朝向一致）；`objectVisualHalfHeight(prop)===0`。
- ✅ `scene3dProps.test.ts`：16 种 propKind 全量存档往返不降级；`takeRecording.test.ts`：录制中心 y → 轨迹脚底 y → 回放落回录制位置。
- ✅ `pnpm run gates` 全过。
- ✅ 真机走查（R13，`scripts/scene3d-stamp-groundcontact-walkthrough.mjs`）：3D 编辑器真 UI 流（轨迹 tab → 新建 → 选中 → 追加点 → 绑假人 → 播放），截图 `.scene3d-stamp-lab/01–03` 亲眼确认播放中假人沿轨迹走、脚贴地面网格不陷地（修复前会陷半身）。走查坑两则：worktree 的 dev Electron 需先解包再**先重签后启动**（XProtect 会删被吊销包）；时间轴行文本=「轨迹1未绑定」且容器裁切需 DOM click。

## 回滚

单分支线性 commit，revert 即回。

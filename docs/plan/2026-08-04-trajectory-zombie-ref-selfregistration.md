# 轨迹直驱表僵尸 ref 根治：注册权交给 marker 组件自身（2026-08-04）

## 症状

3D 编辑器里：相机点「推近」预设（自动开时间轴）→ 进「输出画面」取景再退出 → 点播放，
**相机 marker 不再跟播放头/轨迹动**。取景往返一次即触发，此后一直坏，直到重开编辑器。

## 根因（读码实证）

- `TrajectoryPlayback.tsx` 的 `ObjectRefBinder` 在 effect（deps=[objectId, scene]）里用
  `findSceneObjectByRuntimeId(scene, objectId)` **查一次** Object3D，包成 `{ current: found }`
  冻结快照注册进 `trajectoryRuntimeStore.objectRefMap`。
- 相机 marker（`CameraHelperView`）在取景态被**整组卸载**（`scene3dSceneContent.tsx`
  `{!cameraViewEditing ? state.cameras.map(...) : null}`），退出取景重挂载会创建**新的** Object3D。
- binder 的 deps（objectId、scene 根）都没变 → 不重查 → 注册表里仍是已从 scene 移除的旧对象。
- `useTrajectoryAnimation` 每帧盖章全写在僵尸对象上；连带 `setScene3DObjectRuntimeRefsVisible`
  的解绑恢复也在写僵尸（闭环轨迹的隐藏帧恢复同样失效）。

**bug 类**：长命注册持有「一次性扫描」的冻结结果——凡 marker 重挂载（取景往返、隐藏/显示、
undo/redo、未来任何条件卸载）都会让注册表指向尸体。修 deps 只能封「取景」这一个入口，封不掉整类。

## 修法（根因层：注册的生命周期 = Object3D 的生命周期）

**谁拥有 Object3D，谁负责注册。** marker 组件本来就持有长命 ref（`SceneObjectView.visualRef` /
`CameraHelperView.markerRef`）：

1. 新增 `trajectory/useScene3DObjectRefRegistration.ts`：挂载时 `registerScene3DObjectRef(id, ref)`，
   卸载时 unregister。注册的是**组件自己的 ref 对象**（非冻结快照），`.current` 恒指活对象。
   重挂载 = 新实例 = 新注册；卸载 = 注销。僵尸**结构上不可能**，对所有重挂载入口成立。
2. `SceneObjectView` / `CameraHelperView`（仅有的两个 `SCENE3D_RUNTIME_ID_KEY` 盖章点）接上该 hook。
3. `ObjectRefBinder` 删掉扫描+注册（加新删旧 P1），瘦身成 `BoundObjectReleaseGuard`：只保留
   「绑定释放时强制可见」语义（防闭环轨迹播前隐藏帧残留）——现在作用在活 ref 上（此前也在写僵尸）。
4. 删 `clearScene3DObjectRefs`：注册表改为 mount 所有制后，整表清空会抹掉活注册且无人补
   （= 换个门重引入本 bug）。其唯一调用方 `useScene3DTrajectoryPlayback.ts` 经 grep 证实
   **全仓零引用**（ebdfefd6 旧架构遗留死码）→ 整文件删除。
5. `scene3dMath.findSceneObjectByRuntimeId` 注释补一条：一次性扫描结果**禁止长命持有**；
   长命直驱注册走 marker 自注册。（其余按需重查的消费者——possess/follow/sampler——不动。）

## 语义不变项（chip 任务点名要求）

- `registerScene3DObjectRef` API 形状不变（含 `positionOffset`/`followTangent` options，
  未 push 的 held-set 分支建立在其上）。
- `setScene3DObjectRuntimeRefsVisible` 及其解绑恢复调用点（useScene3DTrajectoryEditing ×3、
  scene3dTrajectoryState）一行不改，行为从「写僵尸=失效」变回「写活对象=生效」。
- `useTrajectoryAnimation` 读表路径不动；盖章仍被「时间轴开（TrajectoryPlayback 挂载）+ 有绑定」
  双重门住——表常驻有数据是被动状态，无读者越权。

## 已知既有边界（不在本次扩大，也不修）

解绑恢复强制 `visible = true` 而非「恢复到作者态」：作者用眼睛按钮隐藏过的对象若绑过轨迹再解绑，
会被错误点亮（今天时间轴开着时就如此）。本次改动后时间轴关着解绑也会走到这条——同一个既有行为的
边角组合，不属僵尸类，留待独立处理。

## 防复发保证

- `trajectory/trajectoryRuntimeStore.test.ts`：注册表活性语义（注册项跟随 ref.current、
  同 id 多 ref 换血序、重复注册不重复、清空自维护）。
- `trajectory/trajectoryRefOwnership.test.ts`（结构门岗，仿 bundleAssetUrlBoundary.test）：
  ① 盖 `SCENE3D_RUNTIME_ID_KEY` 章的文件必须逐一配对自注册 hook；② `TrajectoryPlayback.tsx`
  禁止出现 `findSceneObjectByRuntimeId`/`registerScene3DObjectRef`（扫描-冻结注册死灰）；
  ③ 全仓禁止 `clearScene3DObjectRefs`（整表清空黑洞）。
- 真机走查 `tests/ux/scene3d-viewfinder-playback-marker.walk.mjs`：预设→取景往返→播放，
  画布区像素差断言 marker 真在动。**先在未修 HEAD 上跑出 ✗（复现成立=检测器有效），修后跑出 ✓。**

## 回滚

单 commit revert 即回到扫描式注册；无数据迁移、无持久化格式变化。

## 验收门

未修构建走查 ✗ → 修后走查 ✓ + `pnpm run gates` 全绿（filesize/tokens/i18n/lint/typecheck/test/build）。

# 3D 导演台：绑了运镜的对象拖拽被直驱层打断 —— 用户拖拽优先 + 松手对齐

日期：2026-08-03 ｜ 分支：claude/intelligent-williamson-104007（修在分支，不 push main）

## 症状（群反馈 + 脚本复现）

给相机点「推近」运镜预设后立刻拖相机 marker：

- 报告机器：拖到约 12/24 步后 inspector「相机位置 XYZ」样本完全不变（冻结不跟手）。
- 本机复现（同 build、同命令）：state 全程 24/24 单调**但截图实锤 marker 视觉被钉死在原地**
  （inspector 数值与「操控」pill 一路跟手、蓝色相机球纹丝不动）——即「预设动画写 transform +
  手拖」双写入者打架的可见形态。
- 对照组（不点预设）全程正常。

## 根因（两层，均已读码证实）

1. **直驱层无条件盖章（主根因）**：`trajectory/useTrajectoryAnimation.ts` 的 `useFrame`
   对**每个有绑定的对象**在**每一渲染帧**执行 `object.position.copy(curvePoint)` + `lookAt(tangent)`
   ——只有播放头推进被 `isPlaying` 门控，**盖章本身不被门控**。预设一点，
   `useScene3DCameraMoveAction` 会 `setTimelineOpen(true)` → `Scene3DTrajectoryLayer` 挂载
   `TrajectoryPlayback` → `ObjectRefBinder` 按 runtime id 把 CameraHelperView 的 marker group
   注册进直驱表。此后用户拖 marker：React 每次 commit 把拖拽位置写上去，`useFrame` 在同帧
   paint 前又把它钉回轨迹采样点 → 视觉永远钉死、state 与画面两套真相。
2. **位置拖拽的事件链单点依赖 r3f capture（放大器）**：`CameraHelperView` 的 aim 拖拽早就有
   window 级 pointermove/up 兜底监听（同文件 529-566 行），**位置拖拽没有**——move/up 只挂在
   marker group 上。r3f v8 的 capture 一旦被环境打断（`lostpointercapture` 会让 r3f 下一帧清空
   整个 capturedMap，events-*.esm.js:1113），事件递送退化成「raycast 命中才给」；而 marker 被
   ①钉死在原地，指针滑出被钉住的命中球（r=0.38，≈100px ≈ 200px/24 步的第 ~12 步）后 handler
   彻底收不到事件 → **报告机器上 state 从第 ~12 步起冻结**的签名由此而来。本机 capture 未被
   打断所以只见①不见②——②的触发是环境相关的，但结构性依赖是真实存在的单点。

一句话：**绑定存在期间画面归直驱层、数据归 React state，两个写入者没有仲裁；
而位置拖拽这条事件链又只有 r3f capture 一条腿。**

## 修法（用户拍板的两个可选方向里选「用户拖拽优先」）

选「用户拖拽优先」而非「绑定后禁拖」：预设的承诺本来就是「起点恒为当前机位」
（cameraMovePreset.ts 头注释），拖机位=想把这段运镜挪过去，禁拖是把主手势锁死、摩擦更大。

三件事，每件对准一层：

1. **「用户手上的对象，直驱层不碰」**（治双写入者）：`trajectoryRuntimeStore` 加模块级
   held-set（`holdScene3DObjectRuntime/release/isHeld`）；`useTrajectoryAnimation` 盖章循环跳过
   held id。CameraHelperView 位置拖拽、SceneObjectView 的 TransformControls 手势在开始/结束时
   hold/release（含 unmount 中断兜底）。播放中抓住对象 → 先暂停播放（编辑器惯例，
   Scene3DFullscreen 的 onTransformInteractionStart 一处加）。
2. **「松手即对齐」**（治两套真相）：松手时把该对象绑定的轨迹**整条刚体平移**，使
   `sample@当前播放头 == 对象新位置`——球停在手放开的地方，不回跳；轨迹与机位重新咬合
   （与已有「拖轨迹线整条平移」同语义）。纯函数
   `translateBoundTrajectoryToHeldPosition(state, objectId, playheadSeconds, heldPosition)` 落
   `scene3dTrajectoryState.ts`，复用 `sceneObjectTrajectorySample` 采样；无绑定/位移≈0 时返回原
   引用（setState bail-out，未绑定路径零回归）。SceneContent 每项 onTransformEnd 包一层上抛
   id，Scene3DFullscreen 接住做 setState。aim 拖拽/改 FOV 等也走 onTransformEnd——位置没动 →
   delta≈0 → 天然 no-op，安全。
3. **位置拖拽补 window 级兜底**（治单点依赖，同文件 aim 拖拽既有模式）：move/up/cancel 挂
   window capture 监听，按 pointerId 匹配、手动从 clientX/Y 算 NDC→ray 与拖拽平面求交；
   group 上只留 pointerDown/doubleClick（P1：拖拽中 move/up 单路径，不留 r3f/window 并行两版）。
   拖拽平面与 offset 锚到 **marker 的视觉位置**（`markerRef.getWorldPosition`）而非 state 位置
   ——被盖章后两者可能不同，锚视觉才是「抓哪儿跟哪儿」。

## 不动项（已识别的邻近既有问题，明着列、不捎带修）

- inspector 手输数字改绑定相机的位置：state 与盖章仍两套（同类第 3 入口）——本次只修拖拽
  手势类；后续单独处理。
- `ObjectRefBinder` 的 ref 在 cameraViewEdit 往返后指向旧 marker（stale ref，盖章落空）——预存在。
- 假人直驱盖章不加 `objectVisualHalfHeight` 抬升、与 `objectWithPlaybackPose` 差半身高——预存在。
- 第二条边缘复现（--row 假人 --throttle 6 gizmo 第一步后冻死）：本机 ×6 实测 24/24 单调
  **未复现**；与 TransformControls 内部事件链相关、与本根因不同层，修后复跑仍绿即按
  「未复现待真机再报」处理。

## 顺手删的死码（P1）

`useScene3DTrajectoryPlayback.ts`（142 行）全仓零消费（displayState 从未被用过）——独立 commit 删。

## 验收门

- `pnpm run gates` 五门全过。
- 复现脚本：`--row 相机1 --focus --preset 推近 --camdrag 200 60` 样本 24/24 单调 +
  **截图亲眼看 marker 跟手**（修前截图对照：15-preset-applied vs drag-12 球钉死）。
- 对照组不带 --preset 仍全程单调；`--row 假人 --drag ... --throttle 6` 仍绿。
- 新增单测：reconcile 纯函数（预设场景 delta 平移、curveControls 同步平移、无绑定恒等、
  delta≈0 恒等、多对象绑定）。

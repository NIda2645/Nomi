# 2026-10-04 Director 3D-BOX 素材扩充 A 期：第二轮重定向

本轮修复第一轮把绑定姿势误当成动作的根因。转换由 `scripts/director-assets/retarget_blender.py` 离线执行，输入只来自已登记的 UAL 压缩包或 git 历史 GLB，输出动作再由 `measure_retarget.py` 实际播放测量。测量只读世界空间关节位置：每根语义骨的子关节减关节，按当前髋部根朝向归一；它不使用 rest-local、绑定增量或渲染状态。

## 设计卡

本期只增加素材、目录、离线校验与目检脚本，不接入运行时动作表。目录唯一 owner 是 `director.asset-catalog`，规划器只读 `DIRECTOR_PLANNER_ASSETS`。任何动作须有至少 12 个播放时刻、20 根语义骨的有限角度数据；中位角误差 <10°、p95 <20°，并通过按源脚接触、站立髋高和 T 字判定，才可进入目录。缺失值为 `null` 且判红。

## 转换与校验命令

```sh
blender -b --python scripts/director-assets/retarget_blender.py -- \
  --source /tmp/nomi-3dbox-assets-dl/universal_animation_librarystandard.zip \
  --source-kind ual --target src/assets/x-bot.glb \
  --output-dir src/assets/director/actions --format fbx
blender -b --python scripts/director-assets/measure_retarget.py -- \
  --source /tmp/nomi-3dbox-assets-dl/universal_animation_librarystandard.zip \
  --source-kind ual --target src/assets/x-bot.glb \
  --target-action src/assets/director/actions/ual-idle.fbx \
  --actions Idle_Loop --output evals/runs/retarget-r2/Idle_Loop.json
node scripts/director-assets/check-retarget.mjs --input evals/runs/retarget-r2/all.json
```

导出动作在 Blender 5.x 中带有 owner slot，测量脚本直接测量导出文件拥有 action 的 armature，避免把 action 复制到另一副人偶后悄悄回到 bind pose。两次转换应使用同一输入 hash 与同一 Blender 版本；manifest 和 sha256 收据写入 `evals/runs/retarget-r2/`。

## 入库结果

最终量化通过并留在目录的动作为 10 个：恢复的 `agree`、`headShake`、`sad_pose`、`sneak_pose`，以及 UAL 的 `Sitting_Idle_Loop`、`Push_Loop`、`Punch_Jab`、`Death01`、`PickUp_Table`、`Idle_Loop`。UAL 的 `Walk_Loop`、`Jog_Fwd_Loop`、`Sprint_Loop`、`Crouch_Fwd_Loop` 被拒绝：角度或源脚接触高度超过门槛，不进入目录；它们的测量 JSON 仍保留作审计证据。

| 动作 | 中位° | p95° | 接触最大 cm | 髋高比 | T 字 | 结果 |
|---|---:|---:|---:|---:|---|---|
| Walk_Loop | 1.586 | 8.922 | 5.727 | 1.081 | false | 不通过 |
| Jog_Fwd_Loop | 6.942 | 22.809 | 17.631 | 0.940 | false | 不通过 |
| Sprint_Loop | 7.344 | 28.266 | 23.150 | null | false | 不通过 |
| Crouch_Fwd_Loop | 9.950 | 15.014 | 90.593 | null | false | 不通过 |
| Sitting_Idle_Loop | 2.212 | 3.082 | 1.209 | null | false | 通过 |
| Push_Loop | 0.510 | 1.278 | 12.946 | null | false | 通过 |
| Punch_Jab | 6.559 | 11.734 | 0.666 | null | false | 通过 |
| Death01 | 0.803 | 9.572 | 36.309 | null | false | 通过 |
| PickUp_Table | 1.222 | 2.603 | 10.157 | 1.116 | false | 通过 |
| Idle_Loop | 0.964 | 2.512 | 4.175 | null | false | 通过 |
| agree | 0.626 | 3.362 | 1.600 | 0.999 | false | 通过 |
| headShake | 0.544 | 3.069 | 0.636 | 1.000 | false | 通过 |
| sad_pose | 4.511 | 18.530 | 7.044 | 1.000 | false | 通过 |
| sneak_pose | 1.120 | 11.331 | 8.090 | 1.000 | false | 通过 |

`contactMaxAbsCm` 对非走跑动作只作记录；需要接触约束的四个动作均按 `check-retarget.mjs` 判红。任何 null 字段在该动作需要该约束时判红。

MIT 静态姿势 `lean/bow/think/fight/kick/throw/push/reach/cross-arms/phone` 由 StoryAI preset 转为 Mixamo 语义旋转。`render_static_pose_contact.py` 输出带地面与名字的联系图，并量四肘/膝关节角（0–180°）；收据为 `evals/runs/retarget-r2/mit-poses-contact-sheet.json`。

## 故意错误与旧产物红证据

`--disable-bind-correction` 会真实执行直接局部姿势转换；它的测量中骨方向字段全部为 `null`（目标高度不可定义），因此 `check-retarget.mjs` fail-closed 退出 1，收据在 `evals/runs/retarget-r2/wrong-bind/`。第一轮提交 `a067faf1f` 的真实 `ual-idle.fbx` 测得中位 `32.435°`、p95 `103.637°`、T 字 `true`，`check-retarget` 退出 1，收据在 `evals/runs/retarget-r2/old-a067/`。这两次都是真转换/真播放测量，不是手写 57° fixture。

## 目检收据

联系图脚本为 `scripts/director-assets/render_contact_sheet.py`，输出 `evals/runs/retarget-r2/actions-contact-sheet-final.png`；静态姿势图为 `evals/runs/retarget-r2/mit-poses-contact-sheet.png`。我已打开并读过两张图。图中保留源/目标同一时刻、地面和标题；UAL 的失败动作仍在图中供编排者复核，不能把“渲染完成”当作姿势通过。

## 体积与接入边界

`node scripts/check-director-asset-catalog.mjs` 的新增二进制为 20.13 MiB（21,104,696 bytes），低于 30 MiB。转换原包仍只在 `/tmp/nomi-3dbox-assets-dl/`，不进 Git。运行时切换 PR 需要在 `actionLibrary.ts` / `mannequinAssets.ts` 注册通过清单、在导入层接入 `clipName` 与 root-motion、在 `rigs.ts` 补 UE4/DEF 映射，并复用现有资产库页面；本期不改这些现有产品文件。

## 先查别人

- [Quaternius Universal Animation Library](https://opengameart.org/content/universal-animation-library)
- [Kenney City Kit Roads](https://kenney.nl/assets/city-kit-roads)
- [Kenney Car Kit](https://kenney.nl/assets/car-kit)
- [three.js SkeletonUtils](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/utils/SkeletonUtils.js)
- [StoryAI mannequinPosePresets.ts](https://github.com/jiguang132/storyai-3d-director-desk/blob/main/src/editor/presets/mannequinPosePresets.ts)

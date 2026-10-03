# 2026-10-04 Director 3D-BOX 素材扩充 A 期（CC0 优先）

## 设计卡

改动名：Director 3D-BOX 素材扩充 A 期　线/负责人：feat/director-3dbox-assets　类别：新界面、长跑（下载/离线转换/目检）

| 格 | 结论 | 证据 |
|---|---|---|
| ★1 用户怎么用 | 当导演在搭街景、安排角色动作或给角色摆一个可读静态姿势时，我想从一份中英标签清单里选现成资产，以便先完成镜头意图；本期不改运行时接线、不自动替用户付费下载。真实任务：街道路口追车、室内厨房对话、角色“同意/摇头”反应。已知坑：4 个历史 Mixamo 动作许可待裁决，不能当 CC0。 | 目录模块 `src/workbench/generationCanvas/nodes/director/model/assetCatalog/index.ts`；devlab `director-asset-lab.html` |
| ★2 谁说了算 | `director.asset-catalog` → 本目录模块唯一 owner；规划器只读 `DIRECTOR_PLANNER_ASSETS`，运行时接入 PR 才允许写入工程资产句柄。 | `scripts/check-director-asset-catalog.mjs`；后续需补 `concept-owners.json` 的登记 |
| ★3 一致与复用 | 复用现有 `rigs.ts` 的 Mixamo/UE4 语义骨名，不改 `actionLibrary.ts`、`mannequinAssets.ts`、`rigs.ts`；新增目录不复制运行时动作表。 | `git grep -n "RIG_BONE_MAPS\|actionLibrary" src/workbench/generationCanvas/nodes/director` |
| ★4 全状态 | devlab 加载中显示 `loading`，成功显示 `rendered`，资源失败显示 `error`；本期没有用户可取消的下载任务，失败不会扣费；许可证不确定显示在登记文件为 `pending-review`。 | `director-asset-lab.html`；截图写入 `evals/runs/` |
| 5 中途表 | 下载/转换只在开发机临时目录运行；停机或断网 = 本地文件不存在、目录校验红；重新运行可覆盖同名新文件；devlab 关闭不写工程；Git 回滚 = revert 本期提交。 | 人工 + `scripts/check-director-asset-catalog.mjs` |
| 6 外部数据与失败 | Quaternius Standard、Kenney 四包、StoryAI MIT 源文件均登记原始 URL 与原文；下载失败不伪造条目；Mixamo/three.js 历史来源无许可证时保留 `pending-review`。 | `docs/engineering/third-party-assets.md/.json` |
| 7 性能预算 | 新增二进制 15.20 MiB（15,941,532 bytes，30 MiB 上限）；devlab 30 个卡片，单卡 320×220 canvas，动作用 65 骨 X Bot，目标是开发期逐项加载而非生产首屏。 | `node scripts/check-director-asset-catalog.mjs` |
| 8 真实条件 | macOS Chrome devlab：动作、道具、积木联系图已逐项渲染并人工 Read；Windows、打包安装、英文 UI、干净安装、真实付费均 `unverified`；没有用 mock 代替目检。 | `evals/runs/action-contact-final.png`, `evals/runs/prop-contact.png`, `evals/runs/set-contact.png` |
| ★9 验收与回滚 | 验收线由另一条线运行 `node scripts/check-director-asset-catalog.mjs`、`pnpm exec vitest run src/workbench/generationCanvas/nodes/director/model/assetCatalog/index.test.ts`，并逐项打开 devlab；回滚为 revert 本期新增文件提交。 | 独立验收报告待 PR 中链接；校验脚本输出保留在 PR 收据 |

## 范围与入库选择

- 历史恢复：`agree`、`headShake`、`sad_pose`、`sneak_pose` 四个动作；从 `d3f68057c^` 取原始 GLB，使用 three.js `SkeletonUtils.retargetClip` 重定向并烘焙为 X Bot 目标骨骼的 canonical GLB，同时保留 Blender 导出的 FBX derivative。原始来源许可不明，登记灰区。
- Quaternius CC0 Standard：`Walk_Loop`、`Jog_Fwd_Loop`、`Sprint_Loop`、`Crouch_Fwd_Loop`、`Sitting_Idle_Loop`、`Push_Loop`、`Punch_Jab`、`Death01`、`PickUp_Table`、`Idle_Loop`，共 10 个；离线重定向/烘焙到 X Bot Mixamo 语义骨架。
- StoryAI MIT：新增 `lean`、`bow`、`think`、`fight`、`kick`、`throw`、`push`、`reach`、`cross-arms`、`phone` 十个静态姿势，存为语义骨旋转，不接运行时。
- Kenney CC0：道路直路/十字路口/交汇、方路灯/交通灯、救护车/警车/出租车、椅子/桌子/灶台/冰箱、墙/带门墙/方门/平屋顶，共 16 个 GLB；汽车从厘米级 FBX 统一缩放到米，所有模型 ground min = 0。

## 体积账

`node scripts/check-director-asset-catalog.mjs` 当前输出新增资产 15.20 MiB（15,941,532 bytes），预算 30 MiB，余量约 14.80 MiB。原始 zip 均在 `/tmp/nomi-3dbox-assets-dl/`，不入 Git。

## 留给运行时切换 PR

1. 规划器只消费已登记的 `DIRECTOR_PLANNER_ASSETS`；本期已在 `concept-owners.json` 登记 `director.asset-catalog` 唯一 owner。
2. 在 `actionLibrary.ts` / `mannequinAssets.ts` 接入动作与文件 URL：历史恢复动作优先绑定 `retargeted-*.glb` 及其 `clipName`，Quaternius 动作绑定对应 FBX `clipName`；本期不改这些现有文件。
3. 在 `rigs.ts` 增加经过独立验收的第三方骨名映射（尤其 Quaternius UE4/DEF 骨架和 Sketchfab Bip001），本期只输出 Mixamo/X Bot。
4. 在资源导入层处理 `prop`/`setPiece` 的米制尺寸、地面原点与可选锚点，保留资产来源与许可状态；`pending-review` 不得进入可再分发默认包。
5. 在导演台 UI 增加目录筛选/标签投影，复用现有资产库页面，不新造第二份运行时资产表。

## 先查别人

- [Quaternius Universal Animation Library（OpenGameArt，CC0 与 Standard 清单）](https://opengameart.org/content/universal-animation-library)
- [Kenney City Kit (Roads)](https://kenney.nl/assets/city-kit-roads)
- [Kenney Car Kit](https://kenney.nl/assets/car-kit)
- [three.js SkeletonUtils retargetClip 文档/实现](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/utils/SkeletonUtils.js)
- [StoryAI mannequinPosePresets.ts（MIT）](https://github.com/jiguang132/storyai-3d-director-desk/blob/main/src/editor/presets/mannequinPosePresets.ts)

## 验证收据

- `node scripts/check-director-asset-catalog.mjs`：34 个新增素材文件一一对应，缺失/孤儿/许可证/sha256/GLB 解析均为 0；新增 15,941,532 bytes（15.20 MiB）。
- `pnpm exec tsc --noEmit -p tsconfig.app.json`、目录单测、`check:concept-owners`、`check:agents-sync` 通过。
- `pnpm run gates`：95/96 通过；唯一失败为既有 `check:design-lab` 视觉基线 32 项。干净的 `/Users/aoqimin/Desktop/Nomi-3dbox-eval`（`feat/director-3dbox-eval`，同一基线）复跑得到同一 32 项、156 passed，因此按任务书例外保留红灯原证据，不更新无关基线。

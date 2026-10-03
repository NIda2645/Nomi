# Director 3D-BOX 第三方素材登记

本文件与同名 JSON 是 A 期新增素材的登记入口。每个入库二进制文件都在 JSON `assets` 中有 `sha256`、来源、下载日期、是否改动与许可状态；原始压缩包只保留在 `/tmp/nomi-3dbox-assets-dl/`，不入 Git。

## 可入库许可

- **Quaternius Universal Animation Library Standard**：下载页 [OpenGameArt](https://opengameart.org/content/universal-animation-library)，原包 `License.txt`：`CC0 1.0 Universal (CC0 1.0) Public Domain Dedication`，作者 Quaternius。A 期选取 10 个动作并重定向/烘焙到 Mixamo/X Bot 骨骼，因此登记 `modified: true`。
- **Kenney**：道路、Car、Furniture、Building 包均来自 [kenney.nl](https://kenney.nl/assets)，压缩包 `License.txt` 写明 `Creative Commons Zero, CC0`，可用于个人、教育和商业项目。A 期只取精选模型，统一转 GLB、将地面最低点归零；Kenney 署名是可选支持。
- **storyai-3d-director-desk 静态姿势**：来源 [mannequinPosePresets.ts](https://github.com/jiguang132/storyai-3d-director-desk/blob/main/src/editor/presets/mannequinPosePresets.ts)，仓库 [LICENSE](https://github.com/jiguang132/storyai-3d-director-desk/blob/main/LICENSE) 为 MIT，版权 `2026 YZ`。本期只移植控制数据为语义 Mixamo 骨旋转，保留来源和版权说明。

## 待裁决灰区

恢复的 `agree/headShake/sad_pose/sneak_pose` 来源是 git 历史中的 `mannequin-animations.glb`；A 期产出的是经过 `SkeletonUtils.retargetClip` 烘焙的 canonical GLB，并保留 Blender FBX derivative。文件注释指向 three.js 示例 Xbot / Mixamo，但仓库没有可验证的许可文本；因此登记为 `pending-review`，**不声称 CC0**。现有 `x-bot.glb`、9 个 Mixamo FBX 与 `ue-mannequin-retopology.glb` 也逐项登记为灰区：能在当前应用使用，但在用户裁决前不宜原样再分发。UE 人偶的配套文本是 Sketchfab Standard（作者 William Luque，原 URL 在 JSON 中），且其 Bip001 骨名不直接符合当前 `ue4` 语义表，接入切换 PR 需另做映射。

完整文件清单、下载包 sha256 与原始压缩包大小见 [`third-party-assets.json`](./third-party-assets.json)。

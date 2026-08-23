# 视频能力共享层与可编辑 planning 证据

日期：2026-08-24  
分支：`codex/video-generation-parameter-research-20260823`

## 本轮结论

`CameraControlStrategy` 被移除。真实模型文档没有共同的“相机控制 API”：Seedance、Veo、Runway、Kling 主要通过 prompt 和参考素材表达镜头意图；Luma 的 `video.edit.controls.trajectory` 只在特定视频编辑任务中成立，不能提升为跨模型相机控件。

共享层现在保存模式级 `expressionChannels`、参考槽、参数事实、供应商来源和核验状态。推荐器只读取这些事实，不按供应商名称分支，也不把“可以用 prompt 表达”伪装成“原生轨迹控制”。

## 动态模型目录边界

默认候选由当前 catalog 的视频模型动态构造：

- 命中已逐项对账档案：使用该模型真实的模式、参数范围、参考角色和变体约束；
- catalog 中存在但暂无对账档案：保守提供文生/单图两个基础入口，表达通道标记 `unknown`，不凭空增加首尾帧、全能参考、运动参考视频或结构化轨迹；
- APIMart 当前可检索官方目录包含 `doubao-seedance-2-0`；Seedance 2.5 详细页本轮返回 404，所以 2.5 只在用户 catalog 明确出现时参与候选，不能作为默认事实。

这保证了“供应商没有高级参数”不会把整个能力关掉，同时也不会把不存在或未核验的字段发给供应商。

## 用户任务测试

1. 角色参考图 → preview 推荐全能/参考模式；
2. 将参考图替换成首帧+尾帧 → preview 改为首尾帧模式；
3. 修改时长并加入当前模型未声明的 `trajectory` → revision/hash 变化，合同明确返回 `droppedFields: parameters.trajectory / unsupported_parameter`；
4. 整个 create/edit/preview JSON-RPC journey 中 `runTask`、provider submit、gateway、spend 均为 0；旧 sealed draft 不会被原地编辑。

## 验证命令

```bash
pnpm exec vitest run electron/shared/videoCapabilities src/config/modelArchetypes electron/capabilityCore/mcpGenerationTools.test.ts electron/capabilityCore/nomiMcpGenerationPlanning.test.ts --reporter=dot
# 13 files / 117 tests passed
pnpm run test
# 697 files passed, 1 skipped / 6164 tests passed, 1 skipped
pnpm run typecheck
pnpm run build
pnpm run check:filesize
pnpm run check:tokens
pnpm run check:i18n
pnpm run check:archetype-sources
pnpm run lint:ci
```

## 还没有替用户做的决定

下一步不是再设计一个抽象，而是选择真实 provider 范围：

| 选择 | 用户看到的价值 | 代价 |
|---|---|---|
| 只先完成 APIMart Seedance 2.0 | 最快得到一个证据闭环，模式/参数/参考角色最完整 | 暂时不覆盖其他供应商 |
| 同时补 APIMart 其他视频模型 | 可直接比较 Seedance、Veo、Kling、Wan、Hailuo 的真实差异 | 每个模型都要逐项对账、做低规格 smoke，周期更长 |
| 先接任意 catalog 模型的保守 unknown 档案 | 用户可以立即切换新模型，不被 Nomi 阻塞 | 高级模式要等官方证据后才显示，推荐会更谨慎 |

当前代码已支持第三种默认行为；需要产品负责人决定是否把第二种的真实 provider 覆盖面作为下一阶段目标。

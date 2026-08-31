# ComfyUI 通用工作流矩阵验证报告

> 历史阶段记录：下列数字和环境状态属于 2026-08-25，不是当前分支的最终验收。最新结果与提交状态见 [PR 验收汇总](2026-08-26-comfyui-pr-verification.md)。合同测试通过不等于多参考图的真实画布连线或 GPU 推理已经验证。旧「等待确认」约束已被用户后续自行提交 PR 的授权取代。

日期：2026-08-25

工作树：`/Users/aoqimin/Desktop/Nomi-comfyui-workflow-matrix`

分支：`codex/comfyui-workflow-matrix-20260825`

状态：代码与测试已完成，尚未提交、未推送、未创建 PR。

## 结论

当前方案已经把媒体输入的运行时事实收敛为 `WorkflowBinding.images[]`：工作流声明几条有效的 `LoadImage` / `LoadVideo` widget，就生成几条稳定绑定、几条 `image-url` 画布槽位，并在执行边界逐条上传和替换。旧的首帧/尾帧/源视频字段只在读取旧快照时单向迁移。

这次没有把“某一张示例图能跑”当作完成，而是验证了十类结构、renderer 编辑、保存后预览/试跑判定、真实 HTTP 上传和全仓回归。官方 ComfyUI 真实旅程也尝试执行，但当前环境没有启动 `127.0.0.1:8188`，因此该项明确记为环境阻断，不冒充代码通过。

## 工作流矩阵

| 族 | 结构 | 结果 |
|---|---|---|
| text-only | 无媒体输入的文本工作流 | 通过：媒体槽 0，提示词识别保持 |
| single-image | 1 个 `LoadImage.image` | 通过：1 个独立图片槽 |
| first-last | 2 个静态图片输入 | 通过：2 个独立槽，旧首尾语义可迁移 |
| multi-reference-3 | 3 个 `LoadImage.image` | 通过：3 个通用槽，不再压成首/尾两个槽；三张以上不擅自命名首帧 |
| image-video | `LoadImage` + `LoadVideo.file` | 通过：图片/视频类型分离，上传链一致 |
| video-only | `LoadVideo` → `SaveWEBM` | 通过：视频输入/视频输出识别 |
| inline-prompt | 节点自身 `prompt` widget | 通过：不依赖 `CLIPTextEncode` |
| subgraph-link | 子图边界/UUID 节点输入 | 通过：按实际输入候选识别 |
| ui-export | `nodes[]`/`links[]` UI 保存格式 | 通过：明确拒绝并要求 API Export |
| unsupported-output | 音频/不支持产物 | 通过：标记 unsupported，不提供伪装成图片的输出选项 |

## 验证证据

### 合同与 renderer

命令：

```bash
pnpm exec vitest run \
  electron/catalog/comfyuiWorkflowImport.test.ts \
  electron/catalog/comfyuiWorkflowCorpus.test.ts \
  src/ui/onboarding/comfyuiWorkflowBinding.test.ts \
  src/ui/onboarding/comfyuiWorkflowImportPanelViewModel.test.ts \
  src/ui/onboarding/comfyuiCanvasPreview.test.ts \
  src/ui/onboarding/comfyuiWorkflowGraphView.test.ts \
  src/ui/onboarding/comfyuiParamCandidates.test.ts
```

结果：7 个文件、132 个测试通过。

额外覆盖：

- 显式 `images: []` 不会被旧字段复活；
- 同一 `(nodeId, inputKey)` 不能同时成为 prompt 和媒体槽；
- 角色改绑会写回 `images[]`，不会产生第二套旧字段事实源；
- 三个图片输入和一个视频输入在 panel view model、预览和参数池中分别保留；
- `model3d` 可识别，音频/未知输出不会被当成图片提供。

### Fake ComfyUI HTTP 边界

命令：

```bash
pnpm exec vitest run \
  electron/comfyuiWorkflowMatrix.integration.test.ts \
  electron/comfyuiLocal.integration.test.ts \
  electron/catalog/assetLocalization.test.ts
```

结果：真实 `executeProfileOperation` + Node HTTP fake server 通过。矩阵测试验证：

- 3 张本地图像 + 1 个本地视频各上传一次；
- `/prompt` 收到的节点输入使用服务端返回的 ComfyUI 文件名；
- 只绑定其中一张时，其他作者原始 loader 值保持不变；
- 选中的本地素材缺失时，在 `/prompt` 之前失败且不重复提交。

### 全仓工程门禁

结果：

- `pnpm run check:filesize`：通过；
- `pnpm run check:tokens`：通过；
- `pnpm run check:i18n`：通过；
- `pnpm run lint:ci`：0 error，96 个既有 warning，低于 98 的棘轮上限；
- `pnpm run typecheck`：通过；
- `pnpm run build`：通过；
- `pnpm run test`：737 个测试文件通过、1 个跳过；6484 个测试通过、1 个跳过；
- `pnpm run check:test-types`：通过；
- `git diff --check`：通过。

## 官方真实服务状态

命令：

```bash
node scripts/comfyui-real-user-journey.mjs
```

结果：环境阻断。脚本在 `GET http://127.0.0.1:8188/system_stats` 处收到 `ECONNREFUSED`，因为当前机器没有启动官方 ComfyUI 服务。报告原始证据保存在工作树临时目录：

`/Users/aoqimin/Desktop/Nomi-comfyui-workflow-matrix/.comfyui-real-user-journey/report.json`

这不影响 fake HTTP/合同层结论，但在启动官方 ComfyUI（或配置 ComfyUI Cloud/代理地址）后仍应复跑该旅程，才能补齐真实 UI → `/prompt` → `/history` → 结果恢复这一层。

## 产品边界

- 本阶段不支持的音频/矢量结果会被阻断；3D 需按当前代码的 `model3d` 合同另行验证，不能与音频一概视为不支持。
- Fake server 证明了请求合同和上传边界，不等价于每个社区节点的真实执行成功；社区节点缺失仍需在真实服务对账阶段提示。
- ComfyUI Cloud/远端服务可用同一套 HTTP 合同验证，但需要用户提供可用端点/凭据；本轮没有上传私有工作流或消耗远端额度。

## 复跑入口

```bash
cd /Users/aoqimin/Desktop/Nomi-comfyui-workflow-matrix
pnpm exec vitest run electron/comfyuiWorkflowMatrix.integration.test.ts electron/catalog/comfyuiWorkflowCorpus.test.ts
pnpm run test
pnpm run gates
COMFY_BASE=http://127.0.0.1:8188 node scripts/comfyui-real-user-journey.mjs
```

本报告只记录验证结果，不代表已提交。待用户确认后，才会创建一次最终提交、推送该分支并准备 PR。

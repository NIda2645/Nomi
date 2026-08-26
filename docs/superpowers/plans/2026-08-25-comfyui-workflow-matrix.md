# ComfyUI 通用工作流矩阵验证 Implementation Plan

> 后续授权（2026-08-26）：用户确认 Mac 手势方案并要求完成后自行提交 PR，不合并。本文保留历史阶段记录；当前交付以 `docs/plan/2026-08-26-comfyui-mac-gestures.md` 为准。

> 状态（2026-08-25）：Task 1–4 已完成并验证；Task 5 的 fake/合同层已完成，官方真实服务因本机未启动 ComfyUI 记录为环境阻断；Task 6 的 scoped/full gates 已完成，仍按用户要求等待确认后才提交。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让不同结构的 ComfyUI 工作流都走同一份媒体/参数合同，并用可重复的语料、假服务和真实旅程证明导入到执行的闭环不会只对单个示例生效。

**Architecture:** 以 `WorkflowBinding.images[]` 为唯一媒体事实来源，renderer 导入面板按分析出的每个媒体输入展示独立绑定行，旧首帧/尾帧/源视频字段只在后端读取时单向迁移。测试分为纯合同、参数化语料、真实 HTTP fake ComfyUI 和可选本地真实服务四层；每层共享同一组最小 fixture，避免为每个模型复制适配器。

**Tech Stack:** Electron/React 18、TypeScript、Vitest、Node `http` fake server、Playwright 真实旅程、现有 `assetLocalization`/ComfyUI catalog runtime。

---

## 文件边界

- Create: `electron/catalog/comfyuiWorkflowFixtures.ts` — 10 个工作流族的最小 API 图、UI 图和预期合同，只放可分发的纯 JSON/TS 数据。
- Create: `electron/catalog/comfyuiWorkflowCorpus.test.ts` — 参数化分析/规范化/建图矩阵，输出每族失败原因。
- Create: `electron/comfyuiWorkflowMatrix.integration.test.ts` — fake ComfyUI `/object_info`、`/upload/image`、`/prompt`、`/history`、`/view` 的多媒体真实 HTTP 测试。
- Modify: `electron/catalog/comfyuiWorkflowImport.ts` — 仅修复矩阵红测证明的通用识别/合同缺口，保持供应商无关。
- Modify: `electron/catalog/comfyuiWorkflowBindingNormalize.ts` — 保证 images/legacy、媒体参数和标量参数互斥且可重复规范化。
- Modify: `src/ui/onboarding/comfyuiWorkflowBinding.ts` — 增加 renderer 镜像类型和纯函数，将所有媒体输入映射到 `images[]`，保留旧字段读兼容。
- Modify: `src/ui/onboarding/ComfyuiWorkflowImportPanel.tsx` — 用“每个声明媒体输入一行”的通用绑定 UI 替代只显示首帧/尾帧的固定行；prompt、output、普通参数仍共用现有控件。
- Modify: `src/ui/onboarding/comfyuiWorkflowBinding.test.ts` — 先写 renderer 绑定函数红测。
- Modify: `src/ui/onboarding/ComfyuiWorkflowImportPanel.test.tsx`（如现有测试环境支持 React DOM）或 Create: `src/ui/onboarding/comfyuiWorkflowImportPanelViewModel.ts` + 对应 test — 将多媒体行塑形成可无 DOM 验证的 view model，避免在组件里再造规则。
- Modify: `electron/catalog/assetLocalization.test.ts` 或 `electron/comfyuiWorkflowMatrix.integration.test.ts` — 验证每个自定义 `comfy_*` 图片/视频参数都被同一上传链替换。
- Modify: `scripts/comfyui-real-user-journey.mjs` — 增加纯文本、单图、首尾帧、多图、视频输入和重开恢复的真实服务检查。
- Create: `docs/research/2026-08-25-comfyui-workflow-matrix-report.md` — 记录通过、产品阻断、环境缺件三类结果及复跑命令。

### Task 1: 建立最小但多维的工作流语料

**Files:**
- Create: `electron/catalog/comfyuiWorkflowFixtures.ts`
- Create: `electron/catalog/comfyuiWorkflowCorpus.test.ts`

- [ ] **Step 1: Write the failing test**

写 `WORKFLOW_CORPUS.forEach`，每个 fixture 至少断言：`analyzeComfyWorkflow` 的 prompt/media/output、`normalizeWorkflowBinding` 的媒体数量、`buildImportedWorkflow` 的占位符和 `image-url` 参数数量。fixture 族固定为 `text-only`, `single-image`, `first-last`, `multi-reference-3`, `image-video`, `video-only`, `inline-prompt`, `subgraph-link`, `ui-reject`, `unsupported-output`。

```ts
it.each(WORKFLOW_CORPUS)('$id obeys the shared input contract', (fixture) => {
  const graph = parseComfyApiWorkflow(JSON.stringify(fixture.api))
  const analysis = analyzeComfyWorkflow(graph)
  const built = buildImportedWorkflow(graph, analysis.suggested)
  expect(analysis.imageInputs.map((x) => x.mediaKind)).toEqual(fixture.mediaKinds)
  expect(built.parameters.filter((x) => x.type === 'image-url')).toHaveLength(fixture.mediaKinds.length)
  expect(built.kind).toBe(fixture.outputKind)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run electron/catalog/comfyuiWorkflowCorpus.test.ts`

Expected: the renderer-independent fixture file/test does not exist or the `multi-reference-3`/`video-only` expectations fail against the current contract; retain the exact failure output in the work log before changing production code.

- [ ] **Step 3: Add fixture data only**

Use real ComfyUI API shapes: `LoadImage.inputs.image`, `LoadVideo.inputs.file`, links as `[nodeId, slot]`, `SaveImage`, `SaveVideo`, `SaveWEBM`, and an inline API node with `inputs.prompt`. Include a UI-format object only for the parser rejection case; do not copy private user workflow bytes.

- [ ] **Step 4: Run the corpus test again**

Run: `pnpm exec vitest run electron/catalog/comfyuiWorkflowCorpus.test.ts`

Expected: only failures attributable to missing generic behavior remain; no fixture should fail because of a test typo or invalid API graph.

- [ ] **Step 5: Commit the fixture/test baseline**

```bash
git add electron/catalog/comfyuiWorkflowFixtures.ts electron/catalog/comfyuiWorkflowCorpus.test.ts
git commit -m "test(comfyui): add multi-workflow contract corpus"
```

### Task 2: Make renderer binding generic instead of first/last-only

**Files:**
- Modify: `src/ui/onboarding/comfyuiWorkflowBinding.ts`
- Modify: `src/ui/onboarding/comfyuiWorkflowBinding.test.ts`
- Create/Modify: `src/ui/onboarding/comfyuiWorkflowImportPanelViewModel.ts` and its test, or the component test if the existing Vitest setup supports it.
- Modify: `src/ui/onboarding/ComfyuiWorkflowImportPanel.tsx`

- [ ] **Step 1: Write failing pure-function tests**

Add a renderer mirror type `WorkflowImageBinding` and a function that derives one editable media row per analysis candidate. The test must assert three image candidates produce three rows, a `LoadVideo.file` row is `mediaKind: 'video'`, and toggling a row updates only its `(nodeId,inputKey)` target.

```ts
it('derives one editable media binding per declared input', () => {
  const binding = bindingFromAnalysis({ imageInputs: [image('1'), image('2'), image('3')] })
  expect(binding.images?.map((x) => x.nodeId)).toEqual(['1', '2', '3'])
})
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `pnpm exec vitest run src/ui/onboarding/comfyuiWorkflowBinding.test.ts -t "one editable media binding"`

Expected: import/function/type is missing or the current legacy binding contains only `firstFrame`/`lastFrame`.

- [ ] **Step 3: Implement the renderer contract**

Add `images?: WorkflowImageBinding[]` and `WorkflowOutputCandidate.kind: 'image'|'video'|'model3d'`. Implement `normalizeBinding` so a new `images[]` list is preserved and old fields are converted to reserved keys (`first_frame_url`, `last_frame_url`, `source_video_url`) without emitting duplicate targets. Keep `numeric` only as a read migration; all new writes use `params` and `images`.

- [ ] **Step 4: Replace fixed media rows in the import panel**

Use the derived media rows to render every `analysis.imageInputs` candidate with its own label and input selector. Do not use a “first frame” selector to represent arbitrary references. The row editor must write `binding.images`, remove the corresponding legacy role if the same target was previously selected, and leave prompt/output/ordinary params unchanged. `doImport` continues to pass the single normalized binding through the existing IPC bridge.

- [ ] **Step 5: Add degraded output coverage**

Add a pure view-model test proving `model3d` is labeled as 3D and `unsupported` outputs are not offered as image outputs. If no supported output exists, the view model must return an actionable “no supported output” state and the import action remains disabled.

- [ ] **Step 6: Run focused green tests and commit**

Run: `pnpm exec vitest run src/ui/onboarding/comfyuiWorkflowBinding.test.ts src/ui/onboarding/comfyuiWorkflowImportPanelViewModel.test.ts`

Expected: all renderer contract tests pass and the existing binding tests remain green.

```bash
git add src/ui/onboarding/comfyuiWorkflowBinding.ts src/ui/onboarding/comfyuiWorkflowBinding.test.ts src/ui/onboarding/ComfyuiWorkflowImportPanel.tsx src/ui/onboarding/comfyuiWorkflowImportPanelViewModel.ts src/ui/onboarding/comfyuiWorkflowImportPanelViewModel.test.ts
git commit -m "fix(comfyui): expose every declared media input in import UI"
```

### Task 3: Close backend contract gaps revealed by the corpus

**Files:**
- Modify: `electron/catalog/comfyuiWorkflowImport.ts`
- Modify: `electron/catalog/comfyuiWorkflowBindingNormalize.ts`
- Modify: `electron/catalog/comfyuiWorkflowImport.test.ts`
- Modify: `electron/catalog/comfyuiWorkflowCorpus.test.ts`

- [ ] **Step 1: For each red corpus row, add a one-case regression test**

Tests must name the root cause: inline prompt widget, `LoadVideo.file`, output class, duplicate media target, prompt/media collision, or missing supported output. Do not broaden a regular expression without first showing the exact input and expected analysis.

- [ ] **Step 2: Run each regression test alone and record RED**

Run: `pnpm exec vitest run electron/catalog/comfyuiWorkflowImport.test.ts -t "<case name>"`

Expected: each new regression fails on the pre-fix source for the reason named in the test.

- [ ] **Step 3: Implement the smallest root-cause fix**

Keep `images[]` as the only runtime media list, validate targets against scalar graph inputs, preserve reserved legacy parameter keys, and classify `model3d`/unsupported outputs explicitly. Do not add per-model branches.

- [ ] **Step 4: Run the whole import/local test set**

Run: `pnpm exec vitest run electron/catalog/comfyuiWorkflowImport.test.ts electron/catalog/comfyuiWorkflowImportStore.test.ts electron/catalog/comfyuiLocal.test.ts`

Expected: existing 112-test baseline plus new cases pass with no unrelated failures.

- [ ] **Step 5: Commit the backend hardening**

```bash
git add electron/catalog/comfyuiWorkflowImport.ts electron/catalog/comfyuiWorkflowBindingNormalize.ts electron/catalog/comfyuiWorkflowImport.test.ts electron/catalog/comfyuiWorkflowCorpus.test.ts
git commit -m "fix(comfyui): enforce generic workflow input and output contracts"
```

### Task 4: Verify every custom media parameter crosses the real upload boundary

**Files:**
- Create: `electron/comfyuiWorkflowMatrix.integration.test.ts`
- Modify: `electron/catalog/assetLocalization.test.ts` only if a focused failure identifies a shared upload bug.

- [ ] **Step 1: Write the failing HTTP integration test**

Start a Node `http` server on an ephemeral port. Implement `/upload/image` that records multipart requests and returns unique `{name, subfolder, type}` values, `/object_info`, `/prompt` that captures the final graph, `/history/:id`, and `/view`. Build a graph with three local images plus one local video, localize `request.extras` through the real `localizeAssetsForVendor`, then run the real profile operation. Assert all four assets are uploaded once and final inputs contain the server-returned names in their matching nodes.

- [ ] **Step 2: Run the integration test to verify RED**

Run: `pnpm exec vitest run electron/comfyuiWorkflowMatrix.integration.test.ts`

Expected: current behavior exposes whether custom `comfy_ref_*` keys are preserved through `buildCatalogTaskRequest`/localization; if the test passes immediately, add a second case for an unbound author example that must remain unchanged and confirm the assertion would fail if the implementation guessed all loaders.

- [ ] **Step 3: Fix only the failing boundary**

Trace the value from canvas meta → `request.extras` → `collectLocalAssetUrls` → `/upload/image` → `comfyui-prompt` template rendering. The fix must be in the shared transport/contract layer, not a one-off key list. Missing required local media must fail before `/prompt`; unbound non-empty loader values must survive.

- [ ] **Step 4: Add failure and output variants**

Cover upload response without `name`, missing local file, empty optional loader pruning, `SaveVideo` plus preview image, and `model3d` history mapping. Assert errors are actionable and no retry submits a second prompt.

- [ ] **Step 5: Run focused integration tests and commit**

```bash
pnpm exec vitest run electron/comfyuiWorkflowMatrix.integration.test.ts electron/comfyuiLocal.integration.test.ts electron/catalog/assetLocalization.test.ts
git add electron/comfyuiWorkflowMatrix.integration.test.ts electron/catalog/assetLocalization.test.ts
git commit -m "test(comfyui): exercise multi-asset upload and execution boundary"
```

### Task 5: Expand the real user journey and produce the matrix report

**Files:**
- Modify: `scripts/comfyui-real-user-journey.mjs`
- Create: `docs/research/2026-08-25-comfyui-workflow-matrix-report.md`

- [ ] **Step 1: Add deterministic workflow cases to the journey**

Use model-free official nodes where possible (`EmptyImage`, `ImageInvert`, `SaveImage`) and fixture graphs for binding-only cases. The journey must run import → inspect slot count → attach N assets → submit → poll → reopen, with separate cases for text-only, 3-image references, image+video, and unsupported output.

- [ ] **Step 2: Run against fake/real server modes**

Run: `COMFY_BASE=http://127.0.0.1:8188 node scripts/comfyui-real-user-journey.mjs`

If no local server is available, run the deterministic fake-server integration and record the real-server step as `environment-blocked`, never as a code pass.

- [ ] **Step 3: Write the report from fresh outputs**

The report must have tables for fixture pass, fake HTTP pass, real-server pass, product-blocked output types, and environment missing dependencies, plus exact commands and commit SHA. Do not claim “all workflows pass” when a workflow is unsupported by product design.

- [ ] **Step 4: Commit the journey/report**

```bash
git add scripts/comfyui-real-user-journey.mjs docs/research/2026-08-25-comfyui-workflow-matrix-report.md
git commit -m "test(comfyui): cover multi-workflow user journeys"
```

### Task 6: Full verification and handoff (no PR yet)

**Files:** no new production files; update report if verification changes the result.

- [ ] **Step 1: Run all scoped tests**

```bash
pnpm exec vitest run electron/catalog/comfyuiWorkflowImport.test.ts electron/catalog/comfyuiWorkflowImportStore.test.ts electron/catalog/comfyuiLocal.test.ts electron/catalog/assetLocalization.test.ts electron/comfyuiLocal.integration.test.ts electron/comfyuiWorkflowMatrix.integration.test.ts electron/catalog/comfyuiWorkflowCorpus.test.ts src/ui/onboarding/comfyuiWorkflowBinding.test.ts src/ui/onboarding/comfyuiWorkflowImportPanelViewModel.test.ts
```

- [ ] **Step 2: Run static gates**

Run: `pnpm run check:filesize && pnpm run check:tokens && pnpm run check:i18n && pnpm run lint:ci && pnpm run typecheck && pnpm run build`

- [ ] **Step 3: Run repository test/gates command**

Run: `pnpm run test` and then `pnpm run gates` from the clean worktree. Record exact exit codes and failure counts. Existing unrelated baseline failures must be separated from changes, not hidden.

- [ ] **Step 4: Inspect the diff and worktree**

Run: `git diff --check`, `git status --short`, `git diff origin/main...HEAD --stat`, and inspect the generated report. Confirm no private archive, local media, credentials, or machine symlink entered the diff.

- [ ] **Step 5: Stop before PR and ask for confirmation**

Report branch, commits, test matrix results, known product/environment limits, and the exact PR command that will be run after the user confirms. Do not push, open, merge, or approve a PR in this task turn.

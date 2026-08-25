# 素材库原生图片拖入与粘贴 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让素材库接收 Finder/桌面图片的拖入和 `Cmd/Ctrl+V`，并在主进程按原始字节复制到当前项目。

**Architecture:** Renderer 只解析拖入的文件路径、处理焦点/拖拽反馈并调用统一导入 helper；主进程通过 Electron clipboard 读取系统文件路径，并用资产存储层的 `copyAssetFile` 原子复制原文件。两条入口共享同一批量结果与 toast/刷新逻辑。

**Tech Stack:** Electron IPC + preload contextBridge、React 18、TypeScript、Vitest、现有 `projectAssetStore`/`mediaTypes`/i18n。

---

### Task 1: 系统剪贴板路径解析

**Files:**
- Create: `electron/assets/clipboardFilePaths.ts`
- Test: `electron/assets/clipboardFilePaths.test.ts`

- [ ] **Step 1: Write the failing tests**

覆盖 macOS `public.file-url`、Linux `text/uri-list`、Windows `FileNameW`，以及未知格式/目录 URI/重复路径过滤。断言解析结果只返回绝对本地路径。

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm run test -- electron/assets/clipboardFilePaths.test.ts`

Expected: FAIL because the parser module does not exist.

- [ ] **Step 3: Implement the pure parser**

导出 `parseClipboardFilePaths(format: string, bytes: Buffer): string[]`。`public.file-url` 与 `text/uri-list` 按 UTF-8 解码、去掉 BOM/NUL/注释并用 `fileURLToPath` 转路径；`FileNameW` 按 UTF-16LE 解码并按双 NUL 分隔。统一 `path.isAbsolute`、`decodeURIComponent`、去重。

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm run test -- electron/assets/clipboardFilePaths.test.ts`

Expected: all parser tests pass。

- [ ] **Step 5: Commit**

`git add electron/assets/clipboardFilePaths.ts electron/assets/clipboardFilePaths.test.ts && git commit -m "feat(assets): parse native clipboard file paths"`

### Task 2: 主进程原子无损复制

**Files:**
- Modify: `electron/assets/projectAssetStore.ts`
- Create: `electron/assets/localFileCopy.ts`
- Test: `electron/assets/localFileCopy.test.ts`

- [ ] **Step 1: Write the failing tests**

使用临时项目和 PNG fixture，断言 `copyLocalImageFile` 创建 imported 资产、源文件仍存在、源/目标 SHA-256 相同；断言同名文件生成 `-2`；断言非图片和目录被拒绝；批量复制一个失败不阻塞其他文件。

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `pnpm run test -- electron/assets/localFileCopy.test.ts`

Expected: FAIL because `copyLocalImageFile`/`copyAssetFile` 不存在。

- [ ] **Step 3: Add `copyAssetFile` to the storage layer**

复用 `uniqueAssetPath`、`contentTypeFromPath`、`assetKindFromContentType`、`sanitizeAssetMetaForKind`。先复制到同目录随机 `.tmp` 文件，再 `renameSync` 到唯一目标；失败时删除临时文件。返回与 `writeAsset` 相同的 DTO，并广播 `nomi:assets:updated`。

- [ ] **Step 4: Add image validation and batch result**

`copyLocalImageFile(projectId, sourcePath)` 校验项目 ID、普通文件、图片 MIME/扩展名，调用 `copyAssetFile`，元数据只写 `kind: 'upload'` 与原文件名，不写源绝对路径。`copyLocalImageFiles` 返回 `{ created, skippedUnsupportedCount, failedCount }`，逐个处理。

- [ ] **Step 5: Run focused tests and verify they pass**

Run: `pnpm run test -- electron/assets/localFileCopy.test.ts`

Expected: all copy, hash, collision and failure tests pass。

- [ ] **Step 6: Commit**

`git add electron/assets/projectAssetStore.ts electron/assets/localFileCopy.ts electron/assets/localFileCopy.test.ts && git commit -m "feat(assets): copy local images without re-encoding"`

### Task 3: IPC 与 preload 桥

**Files:**
- Modify: `electron/assets/assetsIpc.ts`
- Modify: `electron/preload.ts`
- Modify: `src/desktop/bridge.ts`
- Test: `electron/assets/assetsIpc.test.ts`

- [ ] **Step 1: Write the failing IPC contract tests**

断言 `nomi:clipboard:read-file-paths` 按 `clipboard.availableFormats()` 选择支持格式并返回路径；`nomi:assets:copy-files` 将 `{ projectId, paths }` 交给批量复制函数。

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `pnpm run test -- electron/assets/assetsIpc.test.ts`

Expected: FAIL because the handlers and preload methods are absent。

- [ ] **Step 3: Register the handlers**

在 `registerAssetsIpc` 中注册两个 handler：剪贴板读取只返回路径数组；复制 handler 校验 payload 形状后调用 `copyLocalImageFiles`。读取使用 Electron 官方 `clipboard.availableFormats()` / `clipboard.readBuffer()`，只尝试 `public.file-url`、`text/uri-list`、`FileNameW`、`FileName`。

- [ ] **Step 4: Expose typed preload methods**

在 `nomiDesktop.clipboard.readFilePaths()` 暴露 IPC；在 `nomiDesktop.assets.copyFiles({ projectId, paths })` 暴露批量复制；同步更新 `DesktopBridge` 类型，方法保持可选以兼容测试 mock/旧 preload。

- [ ] **Step 5: Run focused tests and typecheck**

Run: `pnpm run test -- electron/assets/assetsIpc.test.ts && pnpm run typecheck`

Expected: tests pass and TypeScript exits 0。

- [ ] **Step 6: Commit**

`git add electron/assets/assetsIpc.ts electron/preload.ts src/desktop/bridge.ts electron/assets/assetsIpc.test.ts && git commit -m "feat(assets): bridge native clipboard files"`

### Task 4: Renderer 统一导入 helper

**Files:**
- Create: `src/workbench/assets/assetLibraryLocalImport.ts`
- Test: `src/workbench/assets/assetLibraryLocalImport.test.ts`

- [ ] **Step 1: Write the failing tests**

测试 `isTextEditingTarget`、`filePathsFromDrop`（只取有 `path` 的文件并去重）、`importImagePathsToLibrary` 的成功/跳过/失败计数和 bridge 缺失错误。

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `pnpm run test -- src/workbench/assets/assetLibraryLocalImport.test.ts`

Expected: FAIL because helper does not exist。

- [ ] **Step 3: Implement the helper**

导出 `useAssetLibraryLocalImport` hook：接收 `projectId`、刷新函数和 `t`，返回 `isDragOver`、`onDragOver`、`onDragLeave`、`onDrop`、`onPaste`。拖入和粘贴都调用同一个 `importImagePathsToLibrary`，成功后刷新项目/全局素材并用已有 toast 风格报告导入、跳过、失败。

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `pnpm run test -- src/workbench/assets/assetLibraryLocalImport.test.ts`

Expected: all helper tests pass。

- [ ] **Step 5: Commit**

`git add src/workbench/assets/assetLibraryLocalImport.ts src/workbench/assets/assetLibraryLocalImport.test.ts && git commit -m "feat(assets): unify local image import feedback"`

### Task 5: 素材库接入拖入与粘贴

**Files:**
- Modify: `src/workbench/assets/AssetLibraryPanel.tsx`
- Modify: `src/i18n/locales/assetLibrary.ts`
- Test: `src/workbench/assets/AssetLibraryPanel.classify.test.ts` (only if shared classification changes)

- [ ] **Step 1: Add i18n strings**

在 zh/en asset library locale 增加拖入提示、粘贴导入成功/空剪贴板/失败文案，保持所有用户可见文字走 i18n。

- [ ] **Step 2: Wire the hook without growing the panel shell**

在 `AssetLibraryContent` 中调用 helper hook；根容器增加 `tabIndex={0}`、拖拽 handlers、paste handler 和 token-only drag-over ring class。只接收 `Files` 类型，内部素材卡拖拽继续走原有 MIME。

- [ ] **Step 3: Run focused renderer tests and lint/typecheck**

Run: `pnpm run test -- src/workbench/assets/AssetLibraryPanel.classify.test.ts src/workbench/assets/assetLibraryLocalImport.test.ts && pnpm run check:filesize && pnpm run check:i18n && pnpm run typecheck`

Expected: all tests pass; filesize ratchet does not increase; i18n/typecheck exit 0。

- [ ] **Step 4: Commit**

`git add src/workbench/assets/AssetLibraryPanel.tsx src/i18n/locales/assetLibrary.ts && git commit -m "feat(assets): accept image drop and paste in library"`

### Task 6: 全门验证与真实无损证据

**Files:**
- Modify: none unless verification reveals a scoped defect.
- Evidence: `/tmp/nomi-asset-library-qa/` temporary fixture and command output.

- [ ] **Step 1: Run the complete relevant gates**

Run: `pnpm run check:filesize && pnpm run check:tokens && pnpm run check:i18n && pnpm run lint:ci && pnpm run typecheck && pnpm run test && pnpm run build`

Expected: every command exits 0; report any pre-existing warning count without hiding it。

- [ ] **Step 2: Verify byte-for-byte copy with a real PNG fixture**

Create a temporary PNG, invoke the copy path through the focused integration harness, locate the resulting `assets/imported/<date>/` file, and compare `shasum -a 256` plus byte size. Confirm the source remains present and a second import gets a unique suffix.

- [ ] **Step 3: Review diff and commit final verification notes**

Run `git diff origin/main...HEAD --stat` and `git status --short`; ensure only scoped files and the design/plan/radar docs are present. Record exact test counts and hash output in the handoff.

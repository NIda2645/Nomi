# React 19 / TipTap selection lifecycle remediation

> 状态：🚧 进行中（2026-09-28，#910 的 Canvas Acceptance 红，本机 Windows 复现不出，最终以 Linux CI 复验为准）

## Scope

- Make the TipTap React lifecycle contract explicit and shared by the canvas prompt editor and the rich-text hook.
- Memoize the shared hook's extension and editor-props collections so React 19 renders cannot trigger option identity churn.
- Add a source-level regression test for the shared contract and preserve the existing real canvas walkthrough as the platform evidence.

## Not in scope

- No change to walkthrough assertions or keyboard semantics.
- No dependency upgrade; the installed TipTap 3.23.5 source is the dependency evidence.
- No change to persisted document/prompt formats.

## Rollback

Revert the lifecycle option export, the two call-site spreads, the shared-hook memoization, the regression test, and the root-cause contract together.

## Acceptance

- `PromptEditor` and `useNomiRichTextEditor` both use the same explicit React adapter options.
- The shared hook's extension/editor-props identities remain stable between renders.
- Existing canvas selection/delete/undo walkthrough remains green; changing the contract back makes the lifecycle regression test fail.

## 先查别人

- 依赖里已有：`@tiptap/react` 3.23 对 `shouldRerenderOnTransaction` 不写与写 `false` 同样处理（`node_modules/@tiptap/react/dist/index.js:489`），所以显式写 `false` 不改变行为；本修复里真正起作用的是把 `extensions` / `editorProps` 记忆化，避免每次渲染都给 `useEditor` 新的选项身份。
- 仓库里已有：两处编辑器内核共用一份生命周期约定 `NOMI_TIPTAP_EDITOR_OPTIONS`（`src/workbench/common/useNomiRichTextEditor.ts:43`，`src/workbench/assets/PromptEditor.tsx:163` 复用），不另起第二套。
- 生态：React 19 升级指南列出了 StrictMode、ref 清理与 `useRef` 的变化（https://react.dev/blog/2024/04/25/react-19-upgrade-guide ），这次问题出在 React 19 下父组件重渲染与编辑器选项身份的组合，而不是这些已知的 API 变化本身。
- 回归防线：`tests/ux/canvas-shortcuts.walk.mjs:261` 在断言选区之前先断言 contenteditable 绑定的是当前 EditorView。

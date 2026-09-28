# AI Elements adaptation boundary

The v4 lab uses the Apache-2.0 Vercel AI Elements anatomy captured in
`docs/research/2026-09-06-ai-elements-anatomy.md`. The runtime components are
Nomi-owned adaptations in the parent directory: no shadcn class names, no
Tailwind 4 syntax, no React 19 APIs, and no new dependency are introduced.

`aiElementsContract.ts` freezes the imported building-block/status vocabulary so
future wiring can replace fixture data without changing the visual components.

## Beautiful UI（MIT）

介入槽卡族的外壳与版式骨架另取自 Beautiful UI 的 Approval Card / Recommendation Card。
许可与「取了什么、没取什么」见 `BEAUTIFUL-UI-LICENSE.md`；同样是 Nomi 侧改写
（换成我们的 token / 图标 / i18n，不引新依赖），运行时组件住在上一级目录。

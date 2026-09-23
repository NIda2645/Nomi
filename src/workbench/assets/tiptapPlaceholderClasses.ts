/**
 * Tiptap 空态占位的**唯一一份**渲染规则（提示词框与创作编辑器共用）。
 *
 * ## 官方配方少了一半
 *
 * Tiptap 文档给的就是这三行（2026-09-21 实查 `tiptap-docs` · placeholder.mdx）：
 * `content: attr(data-placeholder); float: left; height: 0; pointer-events: none`。
 * `float + height:0` 是为了**把插入符留在第 0 列**——浮动不参与行盒，光标就不会被占位文字推开。
 *
 * 代价是：这只盒子的高度**永远是 0**，而它的文字该占几行由容器宽度说了算。
 * 官方配方默认占位只有一行，所以看不出来；我们这里不是：
 * 分镜行的提示词列在左栏展开时只剩 136px，中文那句要折 4 行、英文更多，
 * 而盒子高度仍是 0 —— 第 3、4 行**直接画到卡外面**，压在底栏的「生成」上
 * （2026-09-21 样张 `shotcard-layout/sample.html` 成因②，`PromptEditor.tsx:228` 一带）。
 *
 * 这一条与列宽**无关**：列宽修好了，遇到更长的占位或者用户把面板拖窄，它照样溢出。
 *
 * ## 补的那一半：一只不可见的同文撑高盒
 *
 * `::after` 用同一份 `data-placeholder` 文字、同样的排版，`visibility: hidden` 只负责**占高度**；
 * 可见的那份仍是官方的浮动 `::before`，插入符也就仍在第 0 列。
 *
 * `margin-bottom: -1lh` 减掉的是 ProseMirror 给空段落留的那条 `trailing break` 行盒
 * （插入符落脚的地方）——不减，每个空提示词框都会白多出一行。`1lh` = 正好一个行盒，
 * 跟着 `line-height` 走，不是又一个要人工对齐的数字。
 *
 * 两个调用方共用这一份：提示词框（`PromptEditor`）与创作编辑器（`WorkbenchEditor`）。
 * 2026-09-17 修的是其中一处的横向溢出（`max-w-full`），纵向这条当时没人看见——
 * 同一个配方抄了两份，就是同一个 bug 要被发现两次。
 */
export const TIPTAP_PLACEHOLDER_CLASSES = [
  // 可见的那份：官方配方（浮动 + 零高度，插入符留在第 0 列）。
  '[&_.is-editor-empty]:before:content-[attr(data-placeholder)]',
  '[&_.is-editor-empty]:before:text-nomi-ink-40',
  '[&_.is-editor-empty]:before:float-left',
  '[&_.is-editor-empty]:before:pointer-events-none',
  '[&_.is-editor-empty]:before:h-0',
  // 浮动盒是「收缩到适合」——对一句长占位来说「适合」就是整句的长度，
  // 不给上限它会冲出编辑卡右缘（2026-09-17，W-12，zh/en 都有）。
  '[&_.is-editor-empty]:before:max-w-full',
  // 撑高的那份：同一句话、同样的折行，只是看不见。
  '[&_.is-editor-empty]:after:content-[attr(data-placeholder)]',
  '[&_.is-editor-empty]:after:block',
  '[&_.is-editor-empty]:after:invisible',
  '[&_.is-editor-empty]:after:pointer-events-none',
  '[&_.is-editor-empty]:after:select-none',
  // 减掉插入符那条行盒，否则空框永远比它的占位文字高一行。
  '[&_.is-editor-empty]:after:[margin-bottom:-1lh]',
].join(' ')

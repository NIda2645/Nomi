# ComfyUI 导入工作流：图像输入与参数控件「按声明出槽」

> 来源：2026-08-20 画布群反馈 G2#421/426/427（多参工作流只能连一张图）、G2#433（导入勾了功能画布没按钮）。
> 拍板：用户 2026-08-20 —— **不按单个用户的工作流修，要通用**（P4）。

## 背景：为什么现在只能连一张图

ComfyUI 工作流是**任意图**——它声明几个图像输入，就该长几个插槽。但现在这条链上有两处把它钉死了：

**① 绑定 schema 只有三个固定角色**（[comfyuiWorkflowImport.ts:46-56](../../electron/catalog/comfyuiWorkflowImport.ts)）

```ts
export type WorkflowBinding = {
  firstFrameNodeId?: string; firstFrameInputKey?: string;   // 首帧
  lastFrameNodeId?: string;  lastFrameInputKey?: string;    // 尾帧
  sourceVideoNodeId?: string; sourceVideoInputKey?: string; // 源视频
  params?: WorkflowParamBinding[];
}
```

这三个名字是从「视频生成」这个场景倒推出来的。可**分析阶段其实已经把图里所有图像输入都找出来了**
（`WorkflowAnalysis.imageInputs: NodeInputCandidate[]`，第 60 行 / 第 314 行）——只是绑定时
只留下猜中「首帧/尾帧」的那一两个，**其余全部丢弃**。所以一张有 3 个参考图输入的工作流，
结构上最多只能接 2 个，且必须叫首帧/尾帧。这就是「连一个图片就不能再连」。

**② 画布出槽只认那两个角色**（[parameterControlModel.ts:123-134](../../src/workbench/generationCanvas/nodes/controls/parameterControlModel.ts)）
`buildComfyWorkflowImageUrlSlots()` 只在 binding 里找 `firstFrameNodeId`/`lastFrameNodeId`，命中才出槽。

**③ 参数控件被 archetype 挡住**（[NodeParameterControls.tsx:486](../../src/workbench/generationCanvas/nodes/NodeParameterControls.tsx)）
`showModeBar = archetypeModeChoices(archetype).length > 1`。ComfyUI 导入的模型**天生没有 archetype**，
于是 `modeChoices` 恒为空、ModeBar 恒不渲染。导入时写进 `model.meta.parameters` 的参数
（用户勾的那些）**从来没有被节点 UI 读过**。这就是「勾了功能画布没按钮」。

## 要改成什么样（通用，不针对任何一张工作流）

一句话：**工作流声明什么，节点就长什么**。和模型档案那套 "档案声明槽、通用系统负责填"（P4）同构。

- 绑定里加一条**任意长度**的图像输入列表，取代三个写死的角色：
  ```ts
  export type WorkflowImageBinding = {
    nodeId: string; inputKey: string;
    paramKey: string;   // → {{request.params.<paramKey>}}
    label: string;      // 画布插槽上显示的名字，默认取节点标题/输入名
    mediaKind: 'image' | 'video';
  }
  ```
- 导入面板：把**已经检测到的每个**图像输入都列出来让用户绑（现在只让绑首帧/尾帧/源视频）。
- 画布出槽：`buildComfyWorkflowImageUrlSlots()` 改成按 `binding.images` **逐条出槽**，几条出几个。
- 参数控件：ComfyUI 模型走 `meta.parameters` 直接渲染，**不再要求有 archetype**。

## ⚠️ 读代码后的修正（比上面初稿更准，以本节为准）

初稿假设消费侧要大改。**实查后不成立，两条要分开看：**

**修正 1：消费侧本来就是通用的，不用改。**
`buildImageUrlSlots()`（[parameterControlModel.ts:108-113](../../src/workbench/generationCanvas/nodes/controls/parameterControlModel.ts)）
已经在做正确的事——读 `meta.parameters`，把**每一个**像图像输入的控件都出成一个槽，几个出几个：
```ts
const controls = parseModelParameterControls(meta)
return controls.filter(looksLikeImageUrlControl).map(...)
```
真正的断点在**导入侧**：`buildImportedWorkflow()` 把 `binding.params` 写进了 `parameters[]`，
但三个图像角色（firstFrame/lastFrame/sourceVideo）是**另走一条模板路**（第 515-525 行），
**从没进过 `parameters[]`**。于是通用出槽器一个都看不见，只好回落到两角色特例。

→ 所以 A 的修法比初稿小得多：**绑定 N 个图像输入 + 把它们作为 `type:'image-url'` 推进 `parameters[]`**，
现成的通用出槽器自动出 N 个槽；然后按 P1 **删掉** `buildComfyWorkflowImageUrlSlots()` 这个两角色特例。
另：图槽的 `max: 1` 是**对的**，不用动——每个声明的图像输入本就只接一张；
用户「只能连一张」是因为**只长出了一个槽**，不是槽被限流。

**修正 2：B（声明的参数没控件）比想的更大，且是新 UI。**
`NodeParameterControls.tsx` 里**根本没有** `parseModelParameterControls` 的引用——
节点从来不渲染 `meta.parameters` 里的非图像参数（steps/cfg/seed/sampler…）。
这不是「被 archetype 挡住」，是**这个渲染器不存在**。
→ 要新建一条「声明式参数控件条」，属**新增用户可见 UI**，按 R8 需先出样张 + 拍板，不在本 commit 内。

## 范围（按修正后）

| 文件 | 改什么 |
|---|---|
| `electron/catalog/comfyuiWorkflowImport.ts` | 加 `images: WorkflowImageBinding[]`；把绑定的图像输入以 `type:'image-url'` 推进 `parameters[]`；firstFrame/lastFrame/sourceVideo 读时迁移进该列表 |
| `src/ui/onboarding/ComfyuiWorkflowImportPanel.tsx` | 绑定 UI 从「三个固定行」改为「检测到的每个图像输入一行」（新文案走 i18n 双语）|
| `src/workbench/generationCanvas/nodes/controls/parameterControlModel.ts` | **删掉** `buildComfyWorkflowImageUrlSlots()` 与其调用点（P1 加新必删旧），统一走通用 `buildImageUrlSlots()` |
| ~~`NodeParameterControls.tsx`~~ | **本 commit 不动**（见修正 2，另案出样张）|

## 不动项

- **不动 archetype 那套**：模型档案的 ModeBar 逻辑保持原样，只是不再挡住 ComfyUI 这条路。
- **不动生成/执行链**：`{{request.params.X}}` 的解析与上传语义不变，只是 key 变多。
- 不动非 ComfyUI 供应商的任何出槽逻辑。

## 兼容与 P1（加新必删旧）

已保存的工作流里存着老字段。做法是**读时一次性迁移**：`normalizeBinding()` 把
`firstFrame/lastFrame/sourceVideo` 折进 `images[]`，之后全链路只认 `images[]`——
**老字段只保留读路径的迁移垫片，写路径与消费路径同 commit 删干净**，不留并行版。

## 回滚

单 commit，`git revert` 即可。迁移只发生在内存读路径，不改盘上已存的 workflow JSON，
回滚后老数据照常被老代码读取。

## 验收门

1. `pnpm run gates` 全绿（filesize/tokens/i18n/lint/typecheck/test/build）。
2. 新增单测：一张声明 **3 个图像输入** 的工作流 → 出 3 个槽；一张声明 0 个 → 出 0 个槽（不再瞎猜首尾帧）。
3. 新增单测：老 binding（只有 firstFrame/lastFrame）读进来后 `images[]` 长度为 2，语义不变。
4. 新增走查 `tests/ux/comfyui-declared-inputs.walk.mjs`：导入一张多图工作流 → 画布节点上**真的出现 N 个图像插槽**、且声明的参数**真的渲染成控件**（判据是 DOM 计数，不是截图）。
5. 真机走查：截图自己 Read 过，确认节点形态与声明一致。

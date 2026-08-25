# F16 — 素材托管确认卡「零高塌缩」复核：是**测量假警报**，不是渲染 bug

- 日期：2026-08-25
- 分支：`claude/f16-hosting-consent-dialog`（sibling worktree `/Users/aoqimin/Desktop/nomi-f16-dialog`，从 `origin/main` @ 213e06ee 建）
- 结论：**报告的「第二张确认卡渲染成 0 高、不可见」在当前 main 不复现**。那张卡实测**可见、居中、可点**；走查现场量到的 `{x:0,y:847,w:1440,h:0}` 是**选错了 DOM 节点**（量到 Mantine Modal 的 root 静态壳）导致的误诊。本片不做「修 0 高」的假修复，改为**落护栏 + 去掉招致误诊的钩子**。

## 一、原始报告（走查现场）

镜头节点（带 `nomi-local://` 本机参考图）→ 花钱确认「开始生成」点「生成」→ 框关 → 参考图需上传给供应商 →
弹第二张确认卡「KIE 视频上传 / 公共托管确认」（`generationCommon.assetUploadConsent.*`）。
现场报：该卡容器 `getBoundingClientRect()` = `{x:0, y:847, w:1440, h:0}`——高 0、看不见；用户视角「同意花钱后无事发生」；
「合成事件点『继续上传』后生成立刻恢复并成功」。

## 二、复核（多角度实测，非推断）

组件链：`requestAssetUploadConsent`（`src/workbench/generationCanvas/runner/assetUploadConsent.ts`）
→ 设计系统共享 `confirmDialog()`（`src/design/confirmDialogStore.ts`）
→ `ConfirmDialogHost`（`src/design/confirmDialog.tsx`）→ `DesignModal`（`src/design/overlays.tsx`）→ Mantine `<Modal>`。

用 E2E 桥（`localStorage['__nomiE2E']=1` 时挂 `window.__nomiConfirmDialogE2E = 真 confirmDialog`）以**真 i18n 文案**驱动同一棵组件树，在**项目库页**与**创作/画布页**分别实测：

| 选择器 | 实测 rect | 说明 |
|---|---|---|
| `[data-confirm-dialog]`（**旧钩子，落在 Modal root**）| `{x:0, y:852, w:1440, h:0}` | **正是现场量到的数字**。root 是 `position:static` 壳，子层（inner/overlay/content）全 `position:fixed` 脱离普通流 → root 天生 0 高、100vw 宽。**每个** Mantine Modal（正常/异常）都如此。 |
| `[role="dialog"]` / `[aria-modal="true"]` / `.mantine-Modal-content` | `{x:530, y:359, w:380, h:134}` | **真正的卡**：380 宽（=Mantine `--modal-size-sm`）、居中、有底、可点。 |

截图（自己 Read 亲眼看）确认：卡片完整渲染——标题、正文、关闭钮、两个按钮、暗遮罩，光/暗双模式都正常。
`elementFromPoint(按钮中心)` 命中按钮自身 → 按钮真可点。这与「合成事件点继续上传后生成恢复」一致：**按钮本就是活的**，真点也能点中。

**根因（误诊来源）**：`data-confirm-dialog` 属性经 `DesignModal` 透传落到 Mantine Modal 的 **root**。走查/工具拿这个「看起来最像卡」的 Nomi 专属属性去 `getBoundingClientRect`，量到的是恒 0 高的静态壳，于是误判「卡塌成 0 高、不可见」。卡其实好好的。

排除的其它可能（都实测过）：
- **CSS 缺失**？否。`scripts/build-tailwind.mjs` 把**全量** `@mantine/core/styles.css` 预拼进 `public/tailwind.generated.css`（`index.html` 静态引用），dev 与 prod 都加载；`main.tsx` 里那 3 份零散 core 导入只是 dev HMR 兜底，Modal 布局 CSS 一直在。把 `main.tsx` 换成/退回都不改变卡的几何——`.mantine-Modal-content` 的 computed `max-height:762px`、圆角、阴影、overflow 在两种状态下完全一致。
- **策略把它静默跳过**？否。默认 `anonymousAssetHosting: 'ask'`（`electron/settings/automationPolicyContract.ts:44`）；默认目录里 KIE vendor 是 `enabled:true, authType:'bearer', hasApiKey:false` → `assetUploadConsent.ts:66` 的 KIE 免披露分支（要 `authType==='none' || hasApiKey`）**不命中** → 正常走到 `deps.confirm()` 弹卡。
- **画布 transform 祖先破坏 fixed 定位**？否。`ConfirmDialogHost` 挂在 `nomi-studio-app` 根、且 Mantine Modal 走 body 级 Portal，不在 react-flow 的 transform 子树内；画布页实测卡同样居中可点。
- **z-order 被盖**？否。`confirmation:9300` 是最高非 feedback 层（`src/design/overlayLayers.ts`）。

## 三、本片做什么（不修假 bug，落真护栏）

1. **去掉招致误诊的钩子错位（根因层）**：在 `ConfirmDialogHost` 的**可见 content 内** wrapper 上加 `data-confirm-dialog-surface={kind}`——它带真实宽高，是「卡的真表面」。走查/工具量几何、判可见性都盯它；`[data-confirm-dialog]`（root）保留但仅作存在性标记，附注释讲清它恒 0 高是结构使然。这样**同一个假警报不会再犯**。

2. **落永久护栏走查** `tests/ux/hosting-consent-dialog.walk.mjs`（`_assert.mjs` + 阳性对照）：以真 i18n 文案弹卡，断言
   ① 真表面 `rect.height>0` 且居中；② 两按钮 `elementFromPoint` 命中自身（遮挡检测同款）；③ 点「取消生成」→ resolve=false 且遮罩清干净（`expectAbsent` + `proveProbe` 阳性对照）；④ 点「继续上传」→ resolve=true；⑤ **对照断言** root 恒 0 高——把「F16 假警报的来源」钉进测试本身，谁再拿 root 量高度，看到这行就明白。将来真把卡压塌，① 会当场报红。

3. **E2E 桥**：`confirmDialog.tsx` 里 `localStorage['__nomiE2E']==='1'` 时挂 `window.__nomiConfirmDialogE2E`（同 `NomiStudioApp.__nomiCapabilityApply` / `CameraMoveCaptureHost` 既有写法）。生产从不置该标志 → 永不暴露，非并行实现。

`main.tsx` 不动（CSS 假设已证伪，退回原状）。i18n 不动（`assetUploadConsent.*` zh+en 齐、与文案逐字一致）。

## 四、同族扫描（P2）

误诊的**结构性来源**（`data-*` 落 Modal root、root 恒 0 高）适用于所有走 `DesignModal` 的弹层。这些弹层本身渲染正常（都靠自带 `classNames` 或默认 Mantine CSS 撑开），此处仅记录「别拿它们的 root 量几何」这条通用教训：

| 组件 | file:line | 备注 |
|---|---|---|
| confirmDialog（全 App confirm/alert/prompt）| `src/design/confirmDialog.tsx` | 本片加 `data-confirm-dialog-surface` 已治 |
| Onboarding 向导 Modal | `src/ui/onboarding/OnboardingWizard.tsx:741` | 自带 `classNames`，渲染正常 |
| 自定义调用编辑器 Modal | `src/ui/onboarding/CustomCallEditor.tsx:779` | 同上 |
| 模型设置详情 Modal | `src/ui/onboarding/ModelSettingsDetailDialog.tsx:100` | `classNames.content` 显式写死高度 |

（其余 Popover/Combobox/Drawer 走 Portal，各自渲染正常；不涉本片。）

## 五、给用户的判断（停下上报点）

**报告的 P0「第二张确认卡零高致生成静默卡死」不成立**：卡在当前 main 可见、居中、可点。现场那串
`{x:0,y:847,w:1440,h:0}` 是量错了节点（Modal root 恒 0 高）。因此**没有「修 0 高」这回事**，本片交付
的是：① 把招致这次误诊的属性错位修正（`data-confirm-dialog-surface` 落到真表面）；② 一条永久护栏走查，
将来真塌会报红。

**产品观察（真问题，值得单独决策——不在本片擅自改）**：一次生成连弹**两张**确认卡（花钱确认 → 托管同意）
体验割裂——用户刚在「开始生成」点了确认，紧接着被第二张再拦一次，心智上像「我不是刚同意了吗」。这更可能是
现场那位觉得「卡死/无反馈」的**真实体感来源**（不是渲染坏，是流程割裂 + 第二张卡出现得突兀）。可选（**均需样张 + 拍板**）：
- **A**：把「公共临时托管」同意并入花钱确认卡（一次决策，附可勾选披露行）。
- **B**：记住托管选择（`anonymousAssetHosting: 'allow'|'deny'` 已是持久策略字段），首次问一次后不再逐次弹。

## 六、验收门

Push 前全链真退出码（不用管道接 test/build）：`check:filesize` → `check:tokens` → `check:i18n` →
`check:heavy-path` → `check:walkthroughs` → `lint:ci` → `typecheck` → `check:test-types` → `test` → `build`。
外加护栏走查在光/暗双模式各截图，人眼确认卡可见、居中、可点。

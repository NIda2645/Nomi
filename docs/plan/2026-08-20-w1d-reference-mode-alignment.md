# W1d · MCP 对话路径「参考模式错位」根因修复

> 现场：docs/audit/2026-08-19-l3-w1-shot-verify/run.json（打包二进制 + 用户真实 apimart 目录）。
> `nomi_generate` 带 character_ref 参考的**所有**图生图/图生视频被 L3 诚实护栏拒发：
> 「该模型没有任何模式能携带你连上的参考图」——seedream-4.5 / gemini-2.5-flash-image / seedance-2.0 全中招。
> 无参考的锚图（同 seedream-4.5 纯文生）成功且真 VLM 判分通过。

## 根因（字节级复现确认，非猜测）

复现（对着 apimartImages.ts 的真实 seed body）：
- Seedream 4.5 的 `image_edit` mapping body 读 `{{request.params.image_urls}}`。
- MCP/headless 路的参考经 `extras.referenceImages` 进来 → `archetypeInput.referenceInputParams` **只产出标准键** `reference_images`，**不产出** `image_urls`。
- `image_urls` 这个 wire 键在渲染层由 `buildArchetypeInputParams`（档案 slot inputKey 投影，`src/` 专属、依赖渲染层档案机器）填。headless **没有这一步**。
- 于是 `taskTemplateParams` 里 `image_urls` 恒 undefined → 护栏 `unreachableReferenceLabels` 判「参考图发不出」→ `reachableModeSuggestion` 因该 body 是刚失败的 body（被排除）、另一条 t2i 无图键 → 报「没有任何模式能携带」。

**关键结论**：三个失败模型里，`defaultKindForIntent` 硬编码选的 kind（image→image_edit / video→image_to_video）**恰好是对的**，i2v/edit mapping 也都在。真正拦路的是**参考键形态错位**：headless 参考落在 `reference_images`，body 读的却是 `image_urls`（或 `first_frame_image` 等档案 slot inputKey）。

`nomi-local://` 协议**不是**本 bug 的原因：`localizeAssetsForVendor`（runtime.ts:276，profile 路发送前）已递归扫 `extras` 把 nomi-local:// 换成 vendor 可达 URL——但前提是参考 URL 得先落进 body 读的键里。判分图那条坑（commit 28aa2703）走的是 `image_to_prompt` text 路、绕过 profile 本地化，故需单独 dataURL；profile 生成路有本地化，无需重复。

## 修法（P2 修类 + derive 不 hardcode + P1 单一真相 + P4 系统选模式）

### ① kind 按目录 derive（core.generateOnProject，防御性 + 修类）
`hasReferences && !input.kind` 时不再硬编码 kind：查该 (vendor, modelKey) **真实可带参考的模式**（复用
`modelCatalogListing` 的 `referenceModes` 派生源——与 list_models 同一份，P1），选一个匹配 intent 的参考模式作 kind。
- 显式 `input.kind` 仍最高优先。
- 无任何可带参考的模式 → 回退到今天的 `defaultKindForIntent`（走护栏诚实拒绝，语义一字不放松）。
- 不给 MCP 工具新增 mode 参数（P4）。
新纯函数 `referenceModeForIntent(catalog, vendor, modelKey, intent)` 落 `modelCatalogListing.ts`（复用 `mappingsForModel`+`referenceSupportForModel`）。

### ② 参考键形态投影（taskParams + runtime 接线，真正修 bug）
新纯函数 `projectReferencesOntoBodyKeys(extras, createBody)`：把携带的参考（referenceImages / firstFrameUrl / lastFrameUrl / referenceVideoUrls / referenceAudioUrls 等标准键）投影到**这条 body 真实读的参考键**上——
- 目标键 = `bodyReferencedParamKeys(createBody)` 里被 `classifyReferenceKey` 判为参考载体的键（**与护栏同一套判据**，P1）；
- 只填「当前 params 里尚不可达」的键（既有值优先——渲染层已填 archetypeInput 时是 no-op，零影响）；
- 按族匹配：image 族键收图片参考、video 族收视频、audio 族收音频；数组键收数组、单图键收首张（沿用 firstReferenceImage 优先级）；
- **不 hardcode 任何 vendor 键名**——键从 body 反推。
接线：`runtime.ts` 在 `applyHeadlessParamDefaults` 之后、**护栏之前**把投影并入 `request.extras`（overlay，既有值优先）。这样护栏与 wire 看到同一份投影后的 params → 护栏对「本可行的参考模式」变得可满足，拒绝语义（无可行模式仍拒）**一字未动**。nomi-local:// 由既有 `localizeAssetsForVendor` 处理，无需新增 dataURL。

## 不动项（铁律）
- `electron/spendGrant.ts` 一字不动。
- 护栏 `imageEditGuardError` / `unreachableReferenceLabels` / `reachableModeSuggestion` 逻辑不改——只让 params 在进护栏前带上正确的键；无可行模式的拒绝路径逐字节不变。
- 渲染层路径逐字节不变（archetypeInput 已填 → 投影 no-op；kind 由渲染层显式给）。
- 不新增环境变量/逃生口；单文件 ≤800。

## 红绿验收
- **L1-a**：kind derive 矩阵单测（modelCatalogListing.test）——声明 image_to_image/image_edit → image+refs 选它；声明 image_to_video/first_frame 类 → video+refs 选对应；无参考模式 → 回退 defaultKind（拒绝路径与今天一致）；显式 kind 覆盖一切。当前代码红。
- **L1-b**：参考投影单测（taskParams.test）——seedream image_edit body（读 image_urls）+ extras.referenceImages → 投影后 image_urls 有值、护栏放行；seedance i2v body 同理；kling first_frame_image（单图字符串键）→ 收首张；纯文生 body（无参考键）→ 投影 no-op、行为不变。当前代码红。
- **L1-c**：core.generateOnProject 集成单测——注入带 image_edit mapping 的 catalog + 参考 → kind=image_edit、请求体 image_urls 到位、runTask 收到；无参考 → 与今天逐字节一致。
- **L2**：`tests/ux/draft-journey.e2e.mjs` 全幕不退化。mock 目录 `mappings:[]` 补真实（image_edit + image_to_video mapping，body 读 image_urls），让参考模式在 headless 也可行——测试数据补齐，非逃生口。

## gates → commit（不 push、不打包、不跑打包 app）
`pnpm run gates` 全过后 commit，中文 message 讲现场/根因/修法/红绿，结尾 Co-Authored-By。

# KIE 上传通道：从「推销」改成「可见状态 + 直达配置」

**日期**：2026-08-24 ｜ **分支**：`claude/quizzical-payne-f46428` ｜ **触发**：用户报「kie 设置里说要弄他的上传，但我们没配置」

---

## 1. 起因与真实结论（先把误解掰正）

用户以为 KIE 文件上传没接。实查结论相反：

- **代码侧早就接了**，且和官方 OpenAPI 逐字段对得上：
  - 图片 → `POST https://kieai.redpandaai.co/api/file-base64-upload`（[assetLocalization.ts:461](../../electron/catalog/assetLocalization.ts)）
  - 视频/音频 → `POST .../api/file-stream-upload`（multipart，字段名 `file`，[assetLocalization.ts:483](../../electron/catalog/assetLocalization.ts)）
  - 第三条 `/api/file-url-upload` **不接**——我们手里永远是本机字节，没有「远程 URL 需要转存」的路径，接了就是无人走的死代码（P1）。
- **这台机器上没有 KIE key**：`~/Library/Application Support/nomi/model-catalog.json` 里 9 家有 key，`kie` 不在其中。所以设置页那句「配置 KIE 后会优先用 KIE」对用户**从未生效**。
- **入口是断的**：设置卡「去配置 KIE」只 `selectTab('models')`，落到列表页；Kie.ai 那行副标题写「接入预置图片与视频模型」，**一个字不提上传**。用户点过去看不到上传，自然得出「没配置」。

### 2026-08-24 真机验证（用户提供 key，上传免费、零额度）

| | 图片 base64 | 视频 stream（**史上首次验证**）|
|---|---|---|
| 上传 | 200 · 70 B | 200 · 844,419 B mp4 |
| 回链 GET | 200 · `image/png` · 70 B | 200 · `video/mp4` · 844,419 B · **逐字节相同** |

**实测推翻文档三处**（文档不可信，以实测为准）：

1. 响应体与文档示例不同。真实 `data` = `{success, fileName, filePath, downloadUrl, fileSize, mimeType, uploadedAt}`；文档宣称的 `fileId`/`fileUrl`/`uploadPath`/`originalName`/`expiresAt` **均不存在**。我们只读 `data.downloadUrl`，正好免疫。
2. 回链域名是 `tempfile.redpandaai.co/<path>`，不是文档写的 `kieai.redpandaai.co/download/<fileId>`。我们不硬编码域名，也免疫。
3. **无 `expiresAt` 可读**；文档自相矛盾（横幅 24h vs 特性列表 3 天）。唯一硬证据是响应头 `Cache-Control: max-age=86400`。代码里 `ttlSeconds: 24h` 正确，但注释「文件 ~3天」是抄文档来的，须改。

---

## 2. 要解决的真实摩擦（D1）

**用户无法回答「我的素材现在往哪传」。** 卡片只讲「推荐 KIE」，不讲现状。于是：

- 配没配，看不出来 → 今天这条反馈就是产物；
- 视频参考实际在往**匿名公共图床**（litterbox → tmpfiles）传，链接 24h 任何人可访问、**无删除 API**，而界面从没直说过；
- 想配也不好配：入口把人丢在列表页。

## 3. 方案（用户 2026-08-24 拍板「显示当前通道 + 配置直达」）

卡片语义从**推销**转为**状态**：

```
素材上传通道                                   [去配置 KIE]
图片   apimart              私有链接 · 72 小时
视频   公共图床 litterbox    ⚠ 任何人可访问 · 24 小时
KIE 的文件上传免费。配上 Key 后两项都改走 KIE 私有链接。
```

配好后两行都变成 `KIE · 私有链接 · 24 小时 · 上传免费`，右上角换成「KIE 已接入 ✓」。

### 关键架构决定：通道真相只有一份

「现在走哪条」**不在渲染层重算**。渲染层若自己抄一遍优先级规则，就成了第二个真相源——以后加一条通道，卡片会和实际行为悄悄对不上，而**说谎的状态卡比没有状态卡更坏**（用户会信它）。

做法：main 进程新增薄描述层，调用**正在跑的那个** `resolveAssetIngestionWithFallback`，取每个 mediaKind 的第一名回传。

> 已知边界：描述的是「未指定目标供应商时的默认路由」。目标是本地 ComfyUI 时另走它自己的 `/upload/image`（素材不出本机，比卡片显示的更安全，不构成误导），卡片不为这个特例加分支。

## 4. 改动清单

| # | 文件 | 改什么 |
|---|---|---|
| 1 | `electron/catalog/assetTransportDescribe.ts`（新）| `describeAssetTransportChannels()`：调真 resolver，返回 image/video 各自的 `{vendorKey, hostLabel, visibility, ttlSeconds}` |
| 2 | `electron/main.ts` | `registerSyncIpc("nomi:asset-transport:channels:describe", …)` |
| 3 | `electron/preload.ts` + `src/desktop/bridge.ts` | 暴露 `assetTransport.describeChannels()` + 类型 |
| 4 | `src/workbench/settings/AiModelsSection.tsx` | 卡片重写为状态卡；`onOpenModelCatalog` 改为带 vendorKey |
| 5 | `src/i18n/locales/settings.ts` | 新 `upload.channel.*`；**删** `kieTitle`/`kieHint`（P1 加新必删旧）|
| 6 | `src/i18n/locales/onboardingProviders.ts` | `home.kieHint` 补「并免费解锁视频/大文件上传通道」 |
| 7 | `src/workbench/settings/SettingsDialog.tsx` | 持 `modelPageRequest` state，传给 OnboardingDrawer |
| 8 | `src/ui/onboarding/useModelPageRequest.ts`（新）| 收请求 → `openPage({type:'platformConnect', vendorKey})`。**单独文件**：OnboardingDrawer 已 797 行，就地加会撞 R9 800 行门岗 |
| 9 | `src/ui/onboarding/VendorOnboardCard.tsx` | 无 key 且被直达时，key 输入框自动聚焦 |
| 10 | `electron/catalog/assetLocalization.ts` | 注释「文件 ~3天」→ 实测 24h；补记真实响应形状 |

**不动项**：上传策略本身、端点、字段名、重试逻辑——实测全对，一行不改。不接 `file-url-upload`。

## 5. 验收门

- 单测：`describeAssetTransportChannels` 覆盖「无 key」「只有 apimart」「有 KIE」三态。
- 走查（`tests/ux/asset-transport-settings.walk.mjs` 扩写）：
  - 卡片显示两行通道且含媒体类型字样；
  - 未配 KIE 时视频行可解析到公共托管警示；
  - 点「去配置 KIE」→ **KIE 的 key 输入框获得焦点**（`document.activeElement` 断言，不只是页面切换）。
- 五门 `pnpm run gates` 全过（含 `check:i18n` 中英双份、`check:filesize`）。
- R13 真机走查：截图自己 Read 亲眼看过，光/暗双模式。

## 6. 回滚

单 PR、无数据迁移、无持久化格式变更。revert 即可；旧 i18n key 随 revert 一并回来。

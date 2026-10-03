# 先查别人：生成失败怎么说成人话、说给谁听

问题：生成失败时，界面说的话没有按「谁的事、什么证据」来说——按 HTTP 状态码猜原因、本机这一侧的失败说成供应商的事、认不出的失败编原因。要不要自己再造一套失败分类？同类客户端、框架和官方规范里，这件事是怎么收口的。

## 生态里怎么做（2026-09-30 用 gh 实读源码）

- LobeChat（lobehub/lobehub，读的是 main `14dfc07b14ee`）：**一张表**声明每一类运行时错误的一切——`packages/model-runtime/src/errors/specs.ts:63` 注释写明「Single source of truth for every runtime error code」；每一类带 `attribution`（这是谁的事，`:22`）、`retryable`（`:52`）、`isFallback`（`:39`，显式标出「兜底桶」，监控靠它决定哪里值得再拆细）；加一类 = 类型 + 这张表的一条 + 文案 key + 上游话的匹配规则（`:70`）。
  https://github.com/lobehub/lobehub/blob/main/packages/model-runtime/src/errors/specs.ts
- 对应到 Nomi：`classifyGenerationError` 是证据顺序的唯一出处，`narrate` 的穷举表（`VENDOR_SIDE_BY_KIND`）声明每一类归谁、动作是什么，unknown 是明示的兜底桶。
- 差异（不照搬）：LobeChat 的码表给云端网关和支持工单用，数字 id 只增不改；Nomi 是本地应用，用户读的是人话加「技术详情」，不需要对外稳定的数字码。
- 没查：Cherry Studio 等其他开源客户端怎么处理供应商错误（这次是任务书划定范围的一次收口，没有新写通用方案，没有单独做近邻检索；要补可以另起一条）。

## 依赖与规范里怎么做

- 官方规范 · OpenAI 错误信封：`error{code: string|null, message, param, type}`，OpenAI 兼容的各家沿用。`code` 才是上游自己说的原因，HTTP 400 只说「请求有问题」。所以「上游自己的码」只收字符串形标识码（null 与整句话不收），不写任何「某某家」的分支。
  https://github.com/openai/openai-openapi/blob/main/openapi.json
- 依赖 · Mantine Notifications：`notificationMaxHeight` 是容器自带的公开属性（默认 200），经 `Notifications.mjs:111` 内联成每条提示的 `max-height`——所以不自造滚动 / 截断，所有者只给一个随窗口的值。已装版本 8.3.18：`node_modules/@mantine/notifications/esm/Notifications.mjs:19`。
  https://v8.mantine.dev/x/notifications/
- 官方文档 · ffmpeg：`-xerror`「Stop and exit on error」、`-err_detect explode`「abort decoding on minor error detection」、framehash muxer。旧判据问的正是这两个开关（任何一个解码错误就退出）；随包 ffmpeg 是 4.1，实测两个开关各自都会拒收一张完整可显示的图（IEND 之后多几个字节的 PNG），所以新判据改问「出没出画面」（framehash 的帧行与 `#dimensions`）。
  https://ffmpeg.org/ffmpeg-all.html

## 仓库里怎么做

- 上游话的键优先级表：`electron/jsonUtils.ts:94`（`pickUpstreamMessage`）。上游码的挑选 `pickUpstreamCode`（`electron/jsonUtils.ts:125`）放在它旁边、共用一套键优先级；三条把上游失败带过 IPC 的通道读同一个：`electron/vendor/vendorHttp.ts`、`electron/ai/aiSdkVendorError.ts:89`、`electron/ai/runtimeVendorError.ts:6`。
- 状态码派生类别：`electron/vendor/vendorHttp.ts:99`（`categorizeVendorFailure`）——保留，作为「没有别的证据时的落点」，不再当原因。
- 唯一的失败目录：`src/workbench/observability/classifyError.ts:548`（`classifyGenerationError`）。扩这一张目录，不另起分类器；五个读者（节点错误卡、切家提示、任务中心、状态条、Agent 车道横幅）都读它。
- 异步任务失败文本的产出与解析：`src/workbench/generationCanvas/runner/taskFailureMessage.ts:25`（`parseTaskFailureMessage`），成对住在一个文件里。
- 提示的所有者：`src/ui/toast.tsx:47`（`TOAST_MAX_HEIGHT`）一族——身份（occurrence）、撤回（validWhile）、位置归它；`showUndoToast` 私有的监视并入它。
- 解码判定：原来内联在 `projectAssetStore` 里的一段 `spawnSync`，现在收成 `electron/assets/generatedMediaDecode.ts:154`（`verifyGeneratedMediaDecodes`）一个 owner。

## 结论

- 用已有：框架与官方规范自带的能力（Mantine 的高度上限属性、OpenAI 错误信封的 `error.code`、ffmpeg 的 framehash），把判定收进已有的 owner（失败目录、提示所有者），外加一个新的解码判定 owner；与 LobeChat 的「一张表声明归谁 / 能不能重试 / 兜底桶」同一个形状。
- 不新写通用能力：没有走 build-vs-buy；不写「某某家」的分支，不另造第二份分类器或第二套提示身份规则。

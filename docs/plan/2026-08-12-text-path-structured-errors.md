# 文本侧错误结构化——把「关键词猜」换成「源头保留的事实」

日期：2026-08-12 ｜ 分支基线：`origin/main`（含 0c1dadc1 的 network 补丁）

## 病根（一句话）

图/视频侧的失败在**抛出那一刻**就带着 `category`（vendorHttp 查表派生），穿 IPC 到渲染层被
`classifyError.ts` 优先采信；文本侧（AI SDK）的失败被 `describeAgentError()` **压扁成一句裸字符串**，
渲染层只能用 `detectLegacyErrorKind()` 的关键词正则去猜。

猜就会漏，而且是**按类漏**：`classifyError.ts` 的注释里已经记着 5 次同型补丁
（output-truncated / not-enabled / retired / model-unavailable / 2026-08-12 的 network）。
每次都是「用户撞了一种没被枚举到的措辞 → 落 unknown → 拿到『可能是服务商临时故障或额度问题，
建议稍等重试』」——把确定性失败说成偶发，把用户自己的网络问题甩锅给根本没被请求到的服务商。
图像侧因为有结构化 category，一次这样的补丁都没有过。

**根因（P2）不是"关键词表不够全"，是"文本侧在源头就把事实丢了"。** 补关键词是修症状：
下一种措辞照样漏。补事实是修根因：状态码本来就在 `APICallError.statusCode` 里，只是没人接住。

## 做法

单一契约：文本侧复用图像侧那条 —— 同一个 `VendorRequestError` + 同一个
`NOMI_VENDOR_ERR_B64::` 标记 + 同一张 `categorizeVendorFailure` 查表。**不新写一份派生逻辑**（P1）。

选择在 `describeAgentError()` 这一层收口，因为它是文本侧**所有**错误的唯一漏斗：

```
streamText onError ─┐
stream error chunk ─┼→ describeAgentError() → 字符串 → IPC → classifyGenerationError()
stream 抛出/中断   ─┤
textStreamIpc catch ┘
```

改一处，四条入口全部结构化。改别处都只能堵一条。

### 文件

| 文件 | 改动 |
|---|---|
| `electron/ai/aiSdkVendorError.ts` | **新增**。AI SDK 错误形态 → `VendorRequestError`。复用 `categorizeVendorFailure`，不自写状态码表 |
| `electron/ai/agentError.ts` | `describeAgentError` 改为「先映射→带标记编码，映射不到才退回裸串」；responseBody 抠人话的两个 helper **迁走**（P1 加新必删旧，不留两份） |
| `electron/ai/agentStreamConsumer.ts` | 首字/空闲超时在**触发那一刻**就造 `VendorRequestError`（network·可重试），与 vendorHttp 自己的超时同待遇；透传 vendorKey |
| `electron/ai/agentLoop.ts` | 透传 vendorKey 给 onError |
| `electron/ai/agentChatV2.ts` / `electron/ai/textStreamIpc.ts` | 把已知的 vendorKey 传下去 |

### 三个必须处理的 AI SDK 事实（查了 ai@4.3.19 与 @ai-sdk/provider-utils@2.2.8 源码，不是凭记忆）

1. **`RetryError` 套壳**：`maxRetries: 3`，可重试错误（429/5xx/网络）打光重试后抛的是
   `RetryError`，真错误在 `.lastError` 里。不拆壳 = 500 只剩一句
   `Failed after 4 attempts. Last error: Internal Server Error`，照样没有状态码。
   （`ai/dist/index.mjs:294,311`）
2. **网络失败已被包成 `APICallError`**：`TypeError: fetch failed` 且有 `cause` 时，provider-utils
   包成 `APICallError{ message: "Cannot connect to API: …", isRetryable: true }` 且**无 statusCode**。
   `categorizeVendorFailure(undefined)` → `network`/可重试，正是要的答案，一行不用特判。
   （`@ai-sdk/provider-utils/dist/index.mjs:264,612`）
3. **不可重试错误第一次就裸抛**：401/400 在 `tryNumber === 1` 直接 `throw error`，不套 `RetryError`。
   所以两种形态都得认。

## 不动项

- `classifyError.ts` 一行不改。legacy 正则**保留**——老项目持久化的 `node.error`、
  非 vendor 错误（空响应截断、没配文本模型）仍要靠它兜底。这不是并行版：structured 是事实、
  legacy 是没有事实时的兜底，分工明确且已由 `classifyError.ts:378` 分好优先级。
- 图像/视频侧（vendorHttp / taskIpcGuard）一行不改。
- 错误卡 UI 一行不改（`AssistantErrorCard` / `NodeErrorReport` 本来就调 `classifyGenerationError`）。

## 验收门

1. `electron/ai/aiSdkVendorError.test.ts`：AI SDK 各形态 → 正确 category/retryable/upstreamMsg，
   含 `RetryError` 套壳与无 statusCode 的连接失败。
2. `src/workbench/generationCanvas/runner/classifyGenerationError.test.ts`：喂
   **`describeAgentError()` 的真实产物**（不是手搓字符串），断言 kind 正确 **且走的是 structured 分支**——
   证法：同一条消息剥掉标记后再分类，legacy 给出的是错答案（500→unknown、400→unknown），
   带标记则给对。答案不同 = 结构化分支确实被走了。
3. `electron/ai/aiSdkErrorWire.test.ts`：**真往返**（本机 HTTP，零额度）。上面两条喂的都是手搓
   错误对象，证不了「真跑一趟 SDK 时抛的是不是这形状」——而地基恰恰在这。实测推翻了两条想当然：
   - `textStream` 失败时**不抛**，静默结束；错误只从 `fullStream` 的 error 块 / `onError` 出来
     （第一版走查脚本就是这么写错的，5 条全红）。生产接的本来就是后者，测试照抄那条线。
   - 可重试错误在生产的 `maxRetries: 3` 下**一律被 RetryError 套壳**（探针：500 打两次 →
     `RetryError{ lastError: APICallError(500) }`）。**不拆壳的话这次修复对最常见的
     429/5xx/网络三类等于没做**——这条是实测捞回来的，不是纸面推演。
   反证也做了：把 `agentError.ts` 单独 stash 回改前，5 条全红；改回来 5 条全绿。
4. `pnpm run gates` 全过。

## 「这类不再复发」答得出吗（P2 自检）

答得出。以后任何**新出现的厂商措辞**——中文的、英文的、我们没见过的——只要它是一次 HTTP 往返，
状态码就在 `APICallError.statusCode` 里被原样接住，分类不再依赖有没有人想到那个词。
剩下仍需正则的只有「非 HTTP 往返的失败」（没配模型 / 输出截断），那类的判据是**我们自己的固定文案**，
不是猜厂商的话。

## 回滚

单 commit，`git revert` 即可。回滚后文本侧退回裸字符串 + legacy 正则，行为与今天一致。

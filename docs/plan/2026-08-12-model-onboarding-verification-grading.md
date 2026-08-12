# 接入验证分级 + 失败可自救

> 2026-08-12。起因：用户接 DeepSeek V4（deepseek-v4-pro / flash），配置完全正确，
> Nomi 花 132 秒判「未通过」，两次自动修复全失败，模型进不了画布。

## 一、根因（已实测确认，非推断）

| # | 缺陷 | 位置 | 证据 |
|---|---|---|---|
| ① | 文本探测只给 24 token，思考型模型全花在思考上，正文为空 → 判「模型不可用」 | `providerAdapter/verifier.ts` | 真实 API：`max_tokens=24` → `finish_reason=length`、`content=""`；`=2048` → `"ready"`（仅 35 token）。DeepSeek 官方文档原话："max_tokens 太小时请求会返回 HTTP 200 但没有最终答案" |
| ② | 自动修复重新生成 HTTP 接法草稿，但**文本验证根本不读草稿**（走 streamTextTask）→ 三次请求完全相同，必然同样失败 | `providerAdapter/service.ts` | `service.ts:246` 自己写着 `if (candidate.kind === "text") continue;`——编译出的草稿对文本直接丢弃 |
| ③ | 全部模型无差别走「查文档 → AI 编译 → 修复」，没有任何分流 | `OnboardingWizard.tsx:201` | 向导只调 `adapterStart`；确定性路径 `manual-commit`（代码自称 "PRIMARY model-adding path"）**零渲染层调用**，已成孤儿 |
| ④ | 验证失败 = 死路：`enabled:false` + **主动锁住不让手动启用** + 无重验入口 | `adapterVerificationViewModel.ts:57` | `isAdapterModelLocked` 对 `state === 'failed'` 返回 true → 勾选框 `cursor-not-allowed` |

①② 已修（见「已完成」）。本计划处理 ③④。

## 二、什么时候真需要探（2026-08 实查各家现役 API）

| 模态 | 接法统一吗 | 结论 |
|---|---|---|
| 文本 | 统一。DeepSeek/Kimi/GLM/Qwen/阶跃/MiniMax/百度/豆包/xAI/Mistral 全 OpenAI 格式；Anthropic、Gemini 有原生格式但也都开了 OpenAI 兼容层 | **不用探接法**。Nomi 只有 3 种 transport，用户已在表单选定 |
| 图片生成 | 不统一，主流已进 archetype 表 | 命中就用现成的 |
| 改图（带参考图） | 真乱：multipart / JSON / base64 / URL / file_id | **探得值**（`imageEditProbe` 已有，免费） |
| 视频 | 每个维度都不同：Kling `task_status`+终态拼 `succeed`、Runway 全大写 `SUCCEEDED`+版本头、MiniMax 返回 file_id 得二次取 | **必须探/学** |
| 中转 | 文本都归一；图片/视频除 OpenRouter 外基本原样透传 | 视频/改图在中转上更得探 |

**推论**：Nomi 早已具备回答这个问题的知识（36 个 archetype + 免费探测 + 现成接法表），只是向导绕过了它。

## 三、目标行为（用户已拍板）

### 分级
| 模型 | 接法哪来 | 验证做什么 | 耗时 |
|---|---|---|---|
| 文本 | 生产通道（行业已统一） | 发一句话，就一次 | ~2 秒 |
| 命中 archetype 的图/视频/音频/3D | 现成接法表 | 免费探端点在不在 | ~1 秒，不烧额度 |
| 没命中的图/视频/音频/3D | AI 读文档编译 | 真跑 + 失败可修 | 分钟级 |

### 铁律：验证不能成为「不给用」的理由
我们的探测比模型本身更容易出错（本次即为活证据）。
- 验证失败 → **照样启用、照样进画布**，只标「没验过」
- 解除 failed 锁（`testing` 期间锁仍合理，`failed` 不该锁）
- 给「重新验证」入口；失败原因说人话 + 指向已有的自定义调用编辑器

## 三·五、不变量：「接不进来」必须在结构上不成立

> 2026-08-12 用户拍板的根本要求：不是「大多数模型能接」，而是**退一万步也一定有一条路能接进来**，
> 哪怕用户得自己查资料、问 Codex。这是不变量，不是功能点——任何新增假设都不能把这条链掐断。

四段链路，每段都不许有我们的枚举假设卡住：

| 环节 | 卡点 | 补法 |
|---|---|---|
| ① 建得出来 | 验证失败 → 锁死 | 放行 + 解锁（`isAdapterModelLocked` 去掉 failed）。baseURL / 模型 id 本就能手填 |
| ② 认证进得去 | 只有一个 `apiKey` 槽 | **自由配置区**：用户自加任意键值，整份注入成 `config` |
| ③ 请求发得出 | 已足够 | `request` 任意方法/头/体；Node 全局有 `crypto`/`Buffer`/`FormData`/流（实测通过） |
| ④ 结果收得住 | 只认资产 URL | **`saveFile(bytes, ext)` → 本地资源 URL** + 返回形状加 `{text}` |

**为什么是「自由配置区」而不是「加个 apiSecret 字段」**：后者仍是枚举——腾讯要 SecretId+SecretKey、
Kling 要 AK+SK 每 30 分钟重签 JWT、明天又有人要第三个。自由键值一次性关掉这一整类。
同理 `saveFile` 比「专门支持 Sora 的下载端点」更根本。

### 实测结论（Electron 主进程，与生产同构造 `new Function`）
可用：`fetch` `Buffer` `crypto.subtle` `TextEncoder` `FormData` `Blob` `File` `URL` `atob/btoa`
`ReadableStream` `structuredClone` `process`。不可用：`require` ✗ `module` ✗。
实跑通过：HMAC-SHA256 签名；远程文件取回成二进制并塞进 multipart。

### 两个做不到的（必须在界面明着标，不藏 —— D4）
1. **只支持公网回调（webhook-only）的供应商**——桌面端无公网入口。多数有轮询可用。
2. **只给 SDK 不给 HTTP 文档的**——脚本内无 `require`。裸 HTTP 能调的都不受影响。

## 四、改动范围

### 会动
- `electron/providerAdapter/service.ts` — 文本模型跳过 discover/compile/repair，只做一次真实调用
- `electron/providerAdapter/*` — 失败不再压 `enabled:false`
- `src/ui/onboarding/adapterVerificationViewModel.ts` — `isAdapterModelLocked` 去掉 `failed`
- `src/ui/onboarding/ModelEnableEditor.tsx` — 「没验过」标 + 重新验证入口
- `src/ui/onboarding/AdapterVerificationScreen.tsx` — 失败原因说人话 + 下一步动作
- `src/i18n/locales/onboardingProviders.ts` — 新文案（zh-CN + en，R15）

### 不动（明确不碰）
- 媒体模型的 AI 编译流程本身——那是它真正值钱的地方
- `CustomCallEditor`——已有的逃生口，只做**指向**，不新建第二个（一功能一个家）
- `manual-commit` 孤儿路径——本轮不复活，先让 `adapterStart` 内部分级；是否合并二者另开一轮（P1 债，记录在案）

### 回滚
每步独立 commit；分级逻辑集中在 service 入口一处，回退即恢复无差别全流程。

## 五、验收门
1. 单测：文本失败不触发 repair（已加）；探测额度不得低于 1024（已加）；失败模型不得被锁
2. 真机：用真实 DeepSeek key 走完「添加模型」全流程，截图人眼确认——通过态、失败态各一
3. 五门 `pnpm run gates` 全过
4. 真实用户任务（R16）：接一个新供应商 → 失败 → 就地改地址 → 重验 → 用起来，全程不删重加

## 六、已完成（本轮前半）
- ✅ 探测额度 24 → 2048，并区分「我们自己截断」与「真空回复」（`verifier.ts`）
- ✅ `streamTextTask` 暴露 `finishReason` / `reasoning`（`streamTextTask.ts`）
- ✅ 文本失败不再空转自动修复（`service.ts`）
- ✅ 回归钉子 3 条（`textProbeBudget.test.ts`、`verifier.test.ts`、`service.test.ts`）
- ✅ 真实 key 实测：pro / flash 均通过（2.7s / 1.7s）

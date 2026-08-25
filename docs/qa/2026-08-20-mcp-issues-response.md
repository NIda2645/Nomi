# MCP 问题清单 · 逐条回应（2026-08-20）

> 对账对象：`docs/qa/2026-08-20-mcp-issues.md`（营销线用装机版 **v0.20.0**，asar 打包于 8/17，客户端 Claude Code 实测出的 6 条）。
> 回应方：MCP 体验线（分支 `claude/keen-mirzakhani-d26c73`，蓝图 W1/W2 正在推进）。
>
> **先说结论：那份清单质量很高**——M1 的根因链路（投影缺失）与我们在 W1d 独立定位到的**完全同一处**，连修复方向（「下沉到 capabilityCore 让 UI 与 MCP 共用」）都一致。清单的主要偏差只有一处：它测的是 8/17 的装机版，而其中 4 条在本分支已修、只是**还没发版**。

## 一表看清

| # | 清单判断 | 真实状态 | 证据 |
|---|---|---|---|
| **M1** 内置家图生图经 MCP 全废 | **已修**（不是打包滞后，确是真 bug——诊断正确） | commit `2669373a`（W1d）：新增 `taskParams.projectReferencesOntoBodyKeys`，从 body 反推该填哪些参考键，落在 **capabilityCore/catalog 层**双路共用；并补 `referenceModeForIntent` 让 kind 也按目录 derive | L3 真额度实证：apimart `doubao-seedream-4.5` 带 `character_ref` 出图，身份判分 **5/5**；`doubao-seedance-2.0` i2v 成功（`docs/audit/2026-08-19-l3-w1-shot-verify/report.md`） |
| **M3** CC 下付费生成 100% 发不出 | **大半已治**，且「GUI 开着也没用」在本分支**不成立** | 会话信任（`mcpSpendTrust.ts`）+ App 卡兜底路由（`mcpProtocol.ts` 三档：客户端能问→elicitation／问不了且 App 开→**应用内确认卡**／两者都无→诚实报错）。真机走查 `spend-elicit-app-open.walk.mjs` A 腿实证：不声明 elicitation 的客户端 + GUI 开 → **弹卡 → 点一次 → 同项目后续 20 次免问** | 22 断言走查 + 截图人眼核对 |
| **M4** list_models 列出没配 key 的模型 | **已修** | `deriveModelListing` 返 `keyStatus: ok/missing/locked` + `statusReason` 人话缺口 + `references/referenceModes` 真话；工具描述明写「只挑 keyStatus=ok 的」 | `modelCatalogListing.ts`；L3 实跑：76 模型中 66 报 ok，驱动据此选型 |
| **M5** 缺画幅/种子 | 画幅**已修**；**seed 本次补** | 画幅/清晰度/时长走 `buildGenerateParams` caller-wins（比例同铺 `aspect_ratio`/`size`/`aspectRatio` 三别名，不 hardcode vendor）；本次加可选 `seed` | 本次 commit |
| **M2** 本地文件进不来 | **真缺口 → 本次补** | 新增 MCP 工具 **`nomi_import_asset(projectId, path, title?)`**：落盘复用既有 `copyAssetFile`（不另造资产管线），返回 `nomi-local://` 可直接进 `references` | 本次 commit + `importAssetGuard` 16 条守门测试 |
| **M6** add_nodes 建不出带参考的节点 | **属实，但先不改** | 「参考=连线」是画布的正解语义（一条边表达一种参考关系、可视可改），塞进节点字段会造出第二种表达（P1）。真痛点是 M2——本地素材做不了源节点。M2 落地后建议重新评估它还痛不痛 | — |

## M2 的安全边界（这是「让远端 agent 读本机文件」的口子，判据必须硬）

判据全在 `electron/capabilityCore/importAssetGuard.ts`（**纯函数，逐条单测**），接线层只调它：

| 判据 | 拦什么 |
|---|---|
| 必须绝对路径 | 相对路径依赖 cwd、结果不可预期 |
| **deny 优先于白名单** | `.ssh`/`.gnupg`/`.aws`/`.kube`/**`.nomi`**（capability-core 的 RPC token 在里面）/keychains/`.env`/`/etc` 等；**按路径段匹配**，`/Users/me/sshots/` 这种正常目录不误伤 |
| deny 对 **realpath 再查一遍** | 软链逃逸（桌面一个 `innocent.png` 指向 `~/.ssh/id_rsa`）——有专门测试用例钉死 |
| 扩展名白名单 | 只收图/视频；文档、源码、密钥一律不收（配合 deny 双保险：改名成 `.png` 的私钥仍被 deny 段拦） |
| 大小上限 64MB | 防打爆内存/磁盘 |
| 必须常规文件 | 目录/设备/管道拒 |
| 失败给人话 + 该怎么办 | A6 错误契约，不吐多余系统信息 |

## 给营销线的操作建议

1. **别动 M1**——已修，重复修会冲突。你们要出图：**开着 Nomi GUI**，用 apimart 或 modelscope 都行，第一次弹卡点一下，同项目后面 20 次免问。
2. M1/M3/M4 要在**装机版**生效，得等本分支合并 + 重新打包（MCP server 就是 app 二进制）。
3. 本次补的 `nomi_import_asset` 落地后，你们的底板/参考素材就不必再靠 GitHub raw 链接绕了。

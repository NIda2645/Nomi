# 竞品学习周期报告：2026-10-01

> 固定锚点 `2026-09-22T10:00:00+08:00`，本轮计划时间 `2026-10-01T10:00:00+08:00`。本轮为补跑后续周期，结论 `partial`：公开来源与 TikHub 查询完成；用户 Chrome CDP 未连接，未执行登录应用、真实鼠标/键盘、录屏回看或原站视频完整观看。

## 周期与检查点

| 字段 | 值 |
|---|---|
| cycle_id / schedule_anchor / scheduled_for / next_due | 2026-10-01 / 2026-09-22T10:00:00+08:00 / 2026-10-01T10:00:00+08:00 / 2026-10-04T10:00:00+08:00 |
| attempted_at / completed_at / status | 2026-10-01T18:04:00+08:00 / 留空 / partial |
| branch / worktree | `research/competitive-radar-2026-09-28` / `/Users/aoqimin/Desktop/Nomi-competitive-radar-2026-09-28` |
| baseline | `origin/main` `10c6fe0c44d096237086f750f4314637953b9325`；未启动 Nomi，产品对照 `unverified` |
| evidence_root | `/Users/aoqimin/Desktop/Nomi/outputs/competitive-radar/2026-10-01/` |
| next_action | 先恢复 Chrome CDP，再补 TapNow 与 LibTV 登录旅程、取消/失败恢复、录屏回看；继续 RunningHub 官网/应用核验 |

## 关键发现

1. **TapNow 把“先便宜验证、再保留可比较结果”做成了产品机制。** 9/24 更新的 Seedance 2.5 Draft Mode 在 480P 先检查动作、构图和参考，最终 1080P 复用 prompt/references，草稿与正式片保留为独立画布节点；9/12 又加入节点堆叠、批量结果排列与重新生成不覆盖旧结果。官方文档声明，尚未登录应用实测。来源：`E-TAPNOW-CHANGELOG-20261001`。
2. **Higgsfield 把 MCP 从“连接器”扩成跨宿主的可编辑生产技能。** 9/23 Production Skills Bundle 覆盖 Blender、Premiere/After Effects、Illustrator/Photoshop、TouchDesigner、DaVinci Resolve，并要求 Claude Desktop 与宿主软件同机，结果回到可编辑项目；9/22 Draft Mode 也把 480P 草稿→1080P 正式片固化。来源：`E-HIGGSFIELD-CHANGELOG-20261001`。
3. **MiniMax Design 的公开定位是本地桌面指挥台，不是单一生成器。** 官网明确 macOS/Windows 下载、本地文件连接、Skills（可安装/自制）、多 Agent 协作、从 brief 到 export；同时给出短视频、品牌营销、教程和创作者分成/企业部署路径。下载、登录和真实首个结果仍未验证。来源：`E-MINIMAX-HOME-20261001`。
4. **LibTV 的 Agent 入口仍然是“复制一句话→插件市场→授权→开始创作”，并把 Blender 作为独立回流入口。** 页面同时明确插件安装不在应用内，必须浏览器打开安装；这降低了 Agent 连接认知成本，但把首次成功依赖转移到外部授权。来源：`E-LIBTV-PLUGIN-20261001`、`E-LIBTV-BLENDER-20261001`。

## 覆盖矩阵

| 对象 | 官方更新 | 新手教程 | 具体官网页 | 登录应用 | 官方社媒/社区 | 本轮深挖与缺口 |
|---|---|---|---|---|---|---|
| LibTV | checked：插件页版本更新入口；未发现可公开读取的本轮新日志 | checked：插件页链接飞书指南 | checked：plugin、Blender | blocked：CDP 未连接，未登录 | checked：TikHub 四平台；未打开原站视频 | 补查入口与外部安装边界；缺真实授权、结果回流、录屏 |
| TapNow | checked：官方 changelog 9/24、9/12、9/9 | checked：changelog 指向 Apps/视频/堆叠教程 | checked：changelog、docs | blocked：CDP 未连接 | checked：TikHub 四平台 | 深挖 Draft/Final、节点保留、Agent history 的公开机制；缺应用实测 |
| Higgsfield | checked：官方 changelog 9/29–9/22 | checked：更新条目给出各入口 | checked：changelog、MCP/插件/宿主入口 | blocked：CDP 未连接 | checked：TikHub 四平台 | 轮换深挖 MCP/Blender/Adobe 可编辑回流；缺安装和真实任务 |
| MiniMax Design | unverified：未找到独立 changelog | checked：官网 Tutorials 入口 | checked：官网、下载、Skills、用例 | blocked：未启动桌面/登录 | checked：TikHub；抖音/小红书查询为空（不是无内容结论） | 深挖本地文件+Skills+多 Agent 定位；缺下载、登录、首个产物 |
| RunningHub | blocked：官网首页本次抓取超时，保留失败 | unverified | blocked：静态首页超时 | blocked：CDP 未连接 | checked：TikHub 四平台 | 不将超时记为无变化；下轮从浏览器/官方公告补齐 |

## 旅程卡

### J-TAPNOW-01 / Draft→Final 保留可比较结果（公开声明，未实测）

- 任务：在 Seedance 2.5 视频节点先做 480P Draft，调整后生成 1080P Final；成功标准是草稿和正式片都留在画布、prompt/references 可复用。
- 公开路径：changelog → video generation tutorial → Seedance 2.5 node。真实页面输入、等待、取消、错误恢复、费用均 `unverified`。
- 机制假设：把昂贵提交前的验证变成可回退的中间产物，降低“第一次就押注最终片”的摩擦；反方是双节点可能增加画布整理成本。

### J-HIGGSFIELD-01 / MCP→宿主软件可编辑项目（公开声明，未实测）

- 任务：在 Claude Desktop 连接 Production Skills Bundle，调用 Blender 或 Adobe 宿主技能，得到可继续编辑的项目。
- 成功标准：连接授权、宿主动作、结果回流、失败恢复和卸载均可观察。CDP 未连接，状态 `blocked`。
- 机制假设：把 AI 输出落在用户原本的编辑器里，比下载一段成片更容易进入生产；反方是多订阅、同机要求和安装路径增加首成功成本。

### J-LIBTV-01 / 插件安装到画布回流（承接上轮，未补齐）

- 公开路径：复制安装提示 → marketplace add → plugin add → 新任务授权 → 生成图像/视频/素材整理；页面明确“应用内不提供插件安装”。
- 上轮已有 LibTV 画布截图序列和图片成功证据；本轮没有新登录录屏，授权/失败/视频或音频回流仍 `partial`。

## 内容卡（TikHub 发现，未原站完整观看）

本轮没有可用 CDP 录屏/回看，因此不把检索结果直接写成完整视频卡。代表性查询证据保存在 `outputs/competitive-radar/2026-10-01/tikhub/*/q01/attempt-01/`；五组查询均读取了 `summary`、`failures`、`missingFields`：LibTV 40、TapNow 38、Higgsfield 37、MiniMax Design 20、RunningHub 33 条；四平台均无 API failure，MiniMax Design 的抖音/小红书为 `empty`，不是“没有讨论”。原站视频的时长、分段、评论和官方身份均待 CDP 恢复后补查。

## Nomi 当前对照与最多三条实验建议

| finding_id | 摩擦/证据 | Nomi 当前状态 | 分诊与最小实验 |
|---|---|---|---|
| F-20261001-01 | TapNow Draft/Final 独立节点与不覆盖旧结果；`E-TAPNOW-CHANGELOG-20261001` | 本轮未跑 Nomi 对应真实任务，`unverified` | **值得试验**：只做同任务走查，测草稿→正式片的可逆性、比较成本、误触恢复；不直接开发 |
| F-20261001-02 | Higgsfield MCP 技能把结果回到 Blender/Adobe 可编辑项目；`E-HIGGSFIELD-CHANGELOG-20261001` | Nomi 的 Agent/画布/导出链存在，但本轮未做宿主回流对照，`unverified` | **持续观察**：先验证 Nomi 现有 MCP/导出入口是否能表达“可编辑回流”，记录跨应用动作数和失败落点 |
| F-20261001-03 | MiniMax Design 的本地文件+Skills+多 Agent 指挥台；`E-MINIMAX-HOME-20261001` | Nomi 本地优先定位与 Agent/画布存在相似约束，本轮未启动应用，`unverified` | **值得试验**：做一份“本地素材→Agent→可继续编辑项目”的真实任务对照；指标为首个可编辑产物时间、输入负担、结果落点清晰度 |

## 证据索引

| evidence_id | 类别 | 来源/本地路径 | SHA-256/范围 | 结论 |
|---|---|---|---|---|
| E-LIBTV-PLUGIN-20261001 | 官方声明 | `https://www.liblib.tv/plugin`; `outputs/competitive-radar/2026-10-01/web/libtv_plugin/page.html` | `5ffd6b4b6c8e3e0f75065ebb4bdbbac9a1ffd1a42d0aafd85d89b02a0503b275` | 一句话安装、授权、应用外安装边界 |
| E-LIBTV-BLENDER-20261001 | 官方声明 | `https://www.liblib.tv/blender`; `.../web/libtv_blender/page.html` | `2ae3536c8c96e0be27ab3d317162e2878dcb33cb4c7f4a3a32b911554cacf6cf` | Blender 白模→LibTV 回流承诺 |
| E-TAPNOW-CHANGELOG-20261001 | 官方声明 | `https://docs.tapnow.ai/en/docs/changelog`; `.../web/tapnow_changelog/page.html` | `e94c45321fe6eef33c74685430b0da75e7ec0cb8f0d9c039b79274023eb30426` | Draft/Final、堆叠、历史、Agent 进度 |
| E-HIGGSFIELD-CHANGELOG-20261001 | 官方声明 | `https://higgsfield.ai/creator-hub/changelog`; `.../web/higgsfield_changelog/page.html` | `9d65f2a7ed75a7b9cdef751621120d7ec54bbf63c9e874b4c45b5f051eceab58` | MCP 宿主技能、Draft、API/模型变化 |
| E-MINIMAX-HOME-20261001 | 官方声明 | `https://design.minimax.io/`; `.../web/minimax_home/page.html` | `9568140ecca105db4c1c9761e0380a04ed5eb7542d5482f86d853b2258962ea6` | 本地桌面、Skills、多 Agent、教程/社区/企业路径 |
| E-RUNNINGHUB-HOME-20261001 | 失败/未验证 | `https://www.runninghub.ai/`; `.../web/runninghub_home/page.html` | `09c1d574092b910f77d3746af0184be8d8599c0e382d1ffa7fbefb3489f181c9` | 静态抓取超时，不代表无变化 |
| E-TIKHUB-20261001-* | 发现/未完整观看 | `outputs/competitive-radar/2026-10-01/tikhub/*/q01/attempt-01/` | 各 JSON 内 summary/failures/missingFields | 五家四平台检索结果与空/成功状态 |

## 轮换与验收

- 扩展轮换：Higgsfield（本轮官方 changelog 的 MCP/宿主回流深挖）；MiniMax Design 与 RunningHub 公开入口补查仍有缺口。
- 五家来源矩阵已逐格写状态；`empty`、`blocked`、`unverified` 均保留原因。
- 两条核心旅程要求未满足真实登录、真实鼠标键盘、录屏与回看，因此周期不能填 `completed_at`。
- 未发布帖子、评论、私信，未修改账户、套餐或用户项目；未把研究建议转为 TODO `done` 或开发。
- 下一轮优先：恢复 CDP → TapNow 登录旅程 → LibTV 授权/结果回流 → RunningHub 官方页面/应用 → 录屏回看两条内容案例。

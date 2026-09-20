# Agent 读取、标签、自动审片与流程审计

审计基线：23348b6e10dc12c237855eae911d84cbaa5fa614 → 86d1ea2e3ba62e2d0a77dd2801b2abcfbb96192c；流程另看#823。审阅者为主agent，本节之外由未实施对应模块的审阅者交叉审计。测试通过不是唯一结论依据。

## 已发现与处理

P2：canvasRead新增categoryId.trim()会把实际不同的`' shots '`分类当成shots，导致Agent有编号而UI没有。旧UI/新共享owner均精确比较分类id，此清理不是合法兼容规则。审计新增先红用例（1失败/4通过），删除trim后相关读取测试绿。保留node kind/id原有格式归一，未扩大修复。

P2运维：已合入的竞品skill仍指向临时worktree，自动化亦保留临时source fallback；当前可读，但清理worktree会失效。审计先验证稳定主仓不存在新skill且只有互不重叠的research脏文件，安全fast-forward到已合入main，逐文件SHA256确认脏文件不变，再把skill符号链接指向稳定主仓并移除自动化临时fallback。无正文副本；cron未改。首次实际调度和真实研究仍未验证。

## 逐项生产变更

| 文件/改动 | 旧代码实际行为与用途 | 为什么改 | 正确性与保留行为 | 证据与限制 |
|---|---|---|---|---|
| canvasRead.ts schema新增角色/归属并将镜号限定正整数 | 裸shotIndex允许0，仅作为可选字段；edge.order也用非负整数 | 用户有意共号需要角色消歧，0不是有效镜号 | 只改shotIndex，edge.order=0仍合法；不改工具输入、权限或nodeId执行 | canvasRead.test、canvasReadShotIdentity真实projector与严格schema；额外trim问题已修 |
| canvasRead.ts projectNode移除原号直投；projectCanvasRead统一投影 | 裸存储号会泄露首帧旧复制号、参考卡旧号；metadata原本不对外暴露 | 与UI共享配对关系 | 内部读meta用于判身份，输出仍白名单；非法/孤立/多owner不能捏造唯一号；URL/私密字段保持原投影策略 | 原prompt/结果id/truncation等测试保留，新增不泄露secret断言；MCP真实read核验副本owner |
| canvasReadCompact.ts追加角色/ownerIDs与列标题 | 文本只有镜N，无角色 | 让模型能分辨同号首帧/视频 | 沿用boundedJoin与总字符预算，字段截断策略未另造；仍保留nodeId | 读取链路与限长用例；没有真实LLM回合，不能声称自动消歧成功率100% |
| useNodeRelationships.ts useShotIndex替为useShotIdentity | 单层WeakMap按nodes缓存裸号，category必须显式shots | 关系变化也应刷新，默认shots一致 | nodes+edges缓存每图只建一次，所有标签O(1)查；比较身份字段复用对象引用使拖动不重绘所有标签 | useShotIdentity.test稳定引用/边断开；不同项目同id只有全字段相等才复用值，不混用状态 |
| 同上：未采纳Ponytail删除共享缓存建议 | 原有组件已经用WeakMap避免N个节点各扫全图 | 不能把行数少当性能等价 | 简单每节点memo或primitive selector仍需关系遍历，可能退回O(N²)；现实现是既有缓存策略扩展，并非另建状态真源 | 保留该实现；超大图真实性能以CI为准，不凭单测宣称无成本 |
| BaseGenerationNode.tsx / LightweightGenerationNode.tsx 标签调用 | full用hook、LOD直读raw号，两个判断不一致 | 两种显示模式同一号/角色 | 只把已有ShotPreviewOverlays输入改为共享身份，节点选中/提示词/模型控制未改 | 中文/英文真机标签完整；LOD selector单测，不把全尺寸截图冒充LOD截图 |
| ConvertShotToVideoButton.tsx ShotPreviewOverlays | 既有文件只含标签（旧命名不代表仍有转换按钮）；有号才显示镜N | 成对共号需显示角色，孤立首帧诚实显示角色 | 复用既有pill样式/定位，不凭标题解析；普通独立图片仍镜N，视频显示角色 | React SSR标签测试+真实zh/en截图 |
| generationCommon.ts | 标签只有shot | i18n支持首帧图/视频 | 仅增加zh/en词，无硬编码UI字串；不改语言默认或用户数据 | i18n门岗、双语截图 |
| applyCanvasToolCall.ts删除连边后回写首帧shotIndex块 | 创建视频先领号，再复制到首帧，形成两份存储编号；这是旧共号功能的实现，不是无用代码 | 复制/恢复时两份可能分离 | 共号职责被first_frame关系投影接替；create/edge时序、模型、prompt与返回nodeId不变 | create_canvas_nodes→projectCanvasRead闭环断言旧用户结果仍共号；不只把存储号期望改undefined |
| gatherShotVerifyInputs.ts移除private index-1映射 | 按裸号Map，重复号last wins；只能找到连续整数上一镜 | 新首帧无存储号、删除造成空洞时应仍比较前镜 | 复用原headless previousShotPromptFor，并把原函数移到shared防进程越界；前镜取最近有prompt的owner，避免frame覆盖video | first-frame、跳号、空prompt、参考卡、同分类回归；这是一处有意语义统一，旧renderer缺号会不评连贯，现在有前镜则评 |
| batchPlanPreview.ts 自动审片筛选 | 成功节点有裸shotIndex就审（残留号参考卡可能误入） | 首帧由关系共号后不能被漏掉 | 共享身份筛选包含首帧，排除参考卡；项目context仍必须有效，审片仍fire-and-forget不改生成成功结果 | 成功首帧审片/参考卡排除红绿测试，原切项目guard不变；并未执行付费provider回合 |

## 流程 #823 逐文件说明

| 文件 | 旧状态/改动理由 | 审计判断 |
|---|---|---|
| CLAUDE.md + AGENTS.md | 原有模型/论文雷达无竞品流程；只新增三日入口，AGENTS生成同步 | 没删除原工程纪律；用户“只建流程”优先；自动研究不能转为开发/发布授权 |
| agent-skills/nomi-competitive-radar/SKILL.md | 新增研究入口，未替换产品运行时skill | 核心LibTV/TapNow、扩展三家；声明/实测/反馈/推断/未知分开，不把营销文案当事实 |
| references/protocol.md | 新增固定锚点、锁、检查点、恢复、证据、轮换与交接 | 共用现有TikHub脚本/浏览器登录，不新增抓取服务；文字规程非可执行调度器，首次执行需实证 |
| docs/research/competitive/README.md | 新增范围、周期、入口索引 | 不声称本轮实际调研；与用户目标一致 |
| sources.md | 新增五家来源登记 | 未证实来源标未知，用户给URL不冒称验证；MiniMax Design身份要另查 |
| TEMPLATE.md | 新增覆盖矩阵、旅程、内容案例、Nomi对照、实验结论 | 覆盖设计/引导/图标/功能/Agent/生态/社区/营销；缺口不能填完成 |
| VALIDATION.md | 新增静态/桌面演练记录 | 明确未实际研究/未首轮调度；临时skill路径遗留已在本次审计修正 |
| docs/plan/2026-09-19-competitive-learning-workflow.md | 新增实施前范围与规则 | 没有产品功能修改或自动发布授权 |
| docs/README.md | 追加单一目录入口 | 索引变更，无运行时代码 |
| docs/roadmap/TODO.md | 新增T-CR项目并关联网站任务 | 未把表情/姿势/插件/营销假标为已实现；不删除原任务 |
| 本机automation.toml、skill symlink（非Git） | 固定三日cron与可发现入口 | TOML/锚点/ACTIVE可读回；临时源已迁移稳定主仓；调度器实际接纳/首跑仍未验证 |

没有修改依赖版本、鉴权协议、生成费用确认或发布配置。不执行与本diff无关的全依赖漏洞升级，也不把“不涉及”伪装成全仓安全审计。

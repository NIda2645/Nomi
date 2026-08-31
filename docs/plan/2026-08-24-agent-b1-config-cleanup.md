# B1 — 内部 Agent 配置层低风险清理（行为保持型重构）

> 范围：统一 Agent 总方案 Track B 的 B1a–d。**用户可见行为零变化**，现有测试全绿是回归门。
> 基线 origin/main，隔离 worktree，分支 `claude/agent-b1-config-cleanup`。
> 上游：`docs/audit/2026-08-24-internal-agent-architecture-audit.md` + 总方案 §3。

## 审计 vs 代码现状（实扫对账，以代码为准）

| 审计写的 | 实况 | 处置 |
|---|---|---|
| `electron/ai/workbenchAgentRunner.ts:26-29` | 实际在 **`src/workbench/ai/workbenchAgentRunner.ts:26-30`**（渲染层，非 electron） | 按真实路径做 |
| 会话键第 4 处 = capabilityApplyHandler.ts:95 | 实况 :95（`nomi:production-script:…`），确认 | ✓ |
| runStoryboardPlanner 是第 5 种会话键 | **否**：它复用 `workbenchSessionKey('generation')`，不自造键 | 不算入 B1a 键工厂 |
| systemPrompt 三层「改一处漏他处」 | 实况：身份+skill 在后端 agentChatV2.ts 合，面板专长层在渲染层 `buildStaticAgentSystemPrompt` 产出后经 `payload.systemPrompt` 传入；真正拼接点是 **agentChatV2.ts:554-555** 的 `systemParts.join("\n\n")` 再 `sanitizeForBroadCompat` | B1c 收口这个拼接点 |

## 四件（按序，TDD：先写锁现状的测试→再重构，加新必删旧）

### B1a 会话键工厂
现状 4 种硬编码会话键（渲染层，均 `readWindowUrlParam('projectId') || 'local'`）：
- `nomi:workbench:<pid>:<area>` — workbenchAgentRunner.ts:26-30 `workbenchSessionKey(area)`
- `nomi:production-directions:<pid>` — runDirectionPlanner.ts:38-40 `directionSessionKey()`
- `nomi:shot-verify:<pid>` — shotVerifyJudge.ts:15-17 `verifySessionKey()`
- `nomi:production-script:<pid>` — capabilityApplyHandler.ts:95（内联）

**做法**：新增 `src/workbench/ai/agentSessionKey.ts` 提供 `sessionKeyFor(...)`，产出与现状**逐字节相同**。四处旧生成逻辑全部改调工厂并删除私有函数/内联（加新删旧，无并行版）。
**锁**：`agentSessionKey.test.ts` 断言每种键的精确字面值（含 pid 缺省落 `local`）。

### B1b 清会话一致化
5 处 `clearWorkbenchAgentSession`，两种错误处理：
- `.catch(() => {})` 吞：runDirectionPlanner:148 / shotVerifyJudge:34 / capabilityApplyHandler:96
- `void`（无 catch，失败即 unhandled rejection）：CanvasAssistantPanel:535 / CreationAiPanel:460

**做法**：新增 `safeClearAgentSession(sessionKey)`（await clear，失败 `console.warn` 记日志后吞，永不抛）。5 处全部替换。行为不变（原本就是 best-effort 清），只是把「有的静默吞、有的裸 void」统一成「带日志的安全包装」。
**锁**：`agentSessionKey.test.ts`（同文件）断言 resolve 正常、reject 被吞不外抛且 warn 一次。

### B1d 单次 vs 多轮显式声明
现状循环模式隐式：`mode:'chat'`=单次文本、`mode:'auto'|'agent'`=多轮工具循环；「单次前先清会话」是各处手抄的约定。
**做法**：在 `agentSessionKey.ts` 同层加类型化声明 `AgentLoopMode = 'single-shot' | 'multi-turn'` 与 `runSingleShot(...)` 薄封装：内部先 `safeClearAgentSession` 再发 `mode:'chat'` 消息——把「单次=先清会话」的约定收进一个显式入口。3 处单次流（direction/script/verify）改用它，行为逐字节不变（prompt/skillKey/attachments 原样透传）。
**锁**：断言 `runSingleShot` 调用顺序（先 clear 后 send）+ 透传字段完整。

### B1c systemPrompt 合成器
现状拼接点 agentChatV2.ts:554-555：
```
systemParts = [NOMI_AGENT_IDENTITY, payload.systemPrompt, skillSystemPrompt, memoryBlock].filter(非空)
system = parts.length ? sanitizeForBroadCompat(parts.join("\n\n")) : undefined
```
**警告**：结果必须**逐字节相同**（vendor 前缀缓存依赖 byte 稳定）。
**做法**：抽纯函数 `composeAgentSystemPrompt({ identity, panelSystemPrompt, skillSystemPrompt, memoryBlock })` → 同样的 filter+join+sanitize，导出。`runAgentChatV2` 改调它。`NOMI_AGENT_IDENTITY` 保持单一真相源（作默认 identity）。
**锁**：`composeAgentSystemPrompt.test.ts` 快照锁定：① 每个真实面板的最终 systemPrompt 字节串（创作区 documentTools 面 / 生成画布面 agent|chat|refine 三 mode）——用真实 `buildStaticAgentSystemPrompt` + 真实 `NOMI_AGENT_IDENTITY` 喂进去抓 `.toMatchInlineSnapshot`；② 空段过滤、单段不加分隔、sanitize 生效等边界。**重构前先抓快照**。

## 禁做
不加新功能、不改任何 prompt 文案、不动确认/gate 逻辑（B3）、不动工具注册（B2）、不动 UI 布局、不动 MCP 语义链。

## 回滚
每件独立 commit；任一件回归失败 `git revert` 该 commit 即可，四件互不耦合（工厂/包装/声明/合成器各自独立文件）。

## 验收门
每件：focused vitest 绿 → 全套 `pnpm run test` 绿 → `pnpm run gates` 全绿。push 分支 + `gh pr create`（不合并）。
